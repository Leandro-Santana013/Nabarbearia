use super::Error;
use crate::models::{AppointmentResponse, AppointmentStatus};
use chrono::{DateTime, Datelike, SecondsFormat, Timelike, Utc};
use chrono_tz::Tz;
use rusqlite::{OptionalExtension, params};
use std::str::FromStr;
use uuid::Uuid;

pub(super) fn new_id() -> String {
    Uuid::now_v7().to_string()
}

pub(super) fn utc_text(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Secs, true)
}

pub(crate) fn ensure_active_barber(
    connection: &rusqlite::Connection,
    business_id: &str,
    barber_id: &str,
) -> Result<(), Error> {
    let exists: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM barber_profiles p JOIN users u ON u.id = p.user_id AND u.business_id = p.business_id
         WHERE p.business_id = ?1 AND p.user_id = ?2 AND p.active = 1 AND u.active = 1)",
        params![business_id, barber_id],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(Error::not_found("BARBER_NOT_FOUND", "Barber was not found"));
    }
    Ok(())
}

pub(crate) fn appointment_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<AppointmentResponse> {
    let status = row.get::<_, String>(7)?;
    let status = AppointmentStatus::from_db(&status).ok_or(rusqlite::Error::InvalidQuery)?;
    Ok(AppointmentResponse {
        id: row.get(0)?,
        business_id: row.get(1)?,
        client_user_id: row.get(2)?,
        barber_user_id: row.get(3)?,
        service_id: row.get(4)?,
        starts_at: row.get(5)?,
        ends_at: row.get(6)?,
        status,
        price_cents: row.get(8)?,
        duration_minutes: row.get(9)?,
        client_display_name: row.get(10)?,
        barber_display_name: row.get(11)?,
        service_name: row.get(12)?,
        rating: row.get(13)?,
        client_phone: row.get(14)?,
        payment_method: row.get(15)?,
        client_note: row.get(16)?,
        execution_started: row.get(17)?,
        commission_cents: row.get(18)?,
    })
}

pub(crate) fn get_appointment(
    connection: &rusqlite::Connection,
    business_id: &str,
    appointment_id: &str,
) -> Result<AppointmentResponse, Error> {
    connection
        .query_row(
            "SELECT a.id, a.business_id, a.client_user_id, a.barber_user_id, a.service_id, a.starts_at_utc, a.ends_at_utc, a.status, a.price_cents, a.duration_minutes,
                    client.display_name, barber.display_name, service.name,
                    (SELECT r.score FROM ratings r WHERE r.business_id = a.business_id AND r.appointment_id = a.id),
                    a.client_phone, a.payment_method, a.client_note,
                    EXISTS(SELECT 1 FROM service_executions e WHERE e.business_id=a.business_id AND e.appointment_id=a.id),
                    (SELECT c.amount_cents FROM commission_snapshots c WHERE c.business_id=a.business_id AND c.appointment_id=a.id AND c.status='posted')
             FROM appointments a
             JOIN users client ON client.business_id = a.business_id AND client.id = a.client_user_id
             JOIN users barber ON barber.business_id = a.business_id AND barber.id = a.barber_user_id
             JOIN services service ON service.business_id = a.business_id AND service.id = a.service_id
             WHERE a.business_id = ?1 AND a.id = ?2",
            params![business_id, appointment_id],
            appointment_from_row,
        )
        .optional()?
        .ok_or_else(|| Error::not_found("APPOINTMENT_NOT_FOUND", "Appointment was not found"))
}

pub(super) fn ensure_slot_available(
    connection: &rusqlite::Connection,
    business_id: &str,
    barber_id: &str,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    excluded_appointment_id: Option<&str>,
) -> Result<(), Error> {
    if ends_at <= starts_at {
        return Err(Error::bad_request(
            "INVALID_APPOINTMENT",
            "Appointment interval is invalid",
        ));
    }
    ensure_active_barber(connection, business_id, barber_id)?;
    let timezone: String = connection.query_row(
        "SELECT timezone FROM businesses WHERE id = ?1 AND active = 1",
        params![business_id],
        |row| row.get(0),
    )?;
    let timezone = Tz::from_str(&timezone).map_err(|_| Error::Internal)?;
    let local_start = starts_at.with_timezone(&timezone);
    let local_end = ends_at.with_timezone(&timezone);
    if local_start.date_naive() != local_end.date_naive()
        || local_start.weekday() != local_end.weekday()
    {
        return Err(Error::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is not within a working interval",
        ));
    }
    let start_minute = i64::from(local_start.hour()) * 60 + i64::from(local_start.minute());
    let end_minute = i64::from(local_end.hour()) * 60 + i64::from(local_end.minute());
    let weekday = i64::from(local_start.weekday().num_days_from_sunday());
    let in_schedule: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM weekly_schedules
         WHERE business_id = ?1 AND barber_user_id = ?2 AND weekday = ?3 AND active = 1
           AND start_minute <= ?4 AND end_minute >= ?5)",
        params![business_id, barber_id, weekday, start_minute, end_minute],
        |row| row.get(0),
    )?;
    if in_schedule == 0 {
        return Err(Error::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is not within a working interval",
        ));
    }
    let starts_text = utc_text(starts_at);
    let ends_text = utc_text(ends_at);
    let blocked: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM availability_blocks
         WHERE business_id = ?1 AND barber_user_id = ?2 AND active = 1
           AND starts_at_utc < ?3 AND ends_at_utc > ?4)",
        params![business_id, barber_id, ends_text, starts_text],
        |row| row.get(0),
    )?;
    if blocked != 0 {
        return Err(Error::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is blocked",
        ));
    }
    let conflict: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM appointments
         WHERE business_id = ?1 AND barber_user_id = ?2 AND status = 'confirmed'
           AND starts_at_utc < ?3 AND ends_at_utc > ?4
           AND (?5 IS NULL OR id <> ?5))",
        params![
            business_id,
            barber_id,
            ends_text,
            starts_text,
            excluded_appointment_id
        ],
        |row| row.get(0),
    )?;
    if conflict != 0 {
        return Err(Error::conflict(
            "SLOT_UNAVAILABLE",
            "Requested slot is no longer available",
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(super) fn insert_history(
    connection: &rusqlite::Connection,
    business_id: &str,
    appointment_id: &str,
    actor_user_id: Option<&str>,
    event_type: &str,
    from_status: Option<&str>,
    to_status: Option<&str>,
    from_starts_at: Option<&str>,
    to_starts_at: Option<&str>,
    reason: &str,
) -> Result<(), Error> {
    connection.execute(
        "INSERT INTO appointment_history(id, business_id, appointment_id, actor_user_id, event_type, from_status, to_status,
         from_starts_at_utc, to_starts_at_utc, reason, payload_json, created_at_utc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '{}', ?11)",
        params![
            new_id(), business_id, appointment_id, actor_user_id, event_type, from_status, to_status,
            from_starts_at, to_starts_at, reason, utc_text(Utc::now()),
        ],
    )?;
    Ok(())
}
