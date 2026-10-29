use super::{
    Booking, Error, Idempotency, ReceptionBooking, require_future,
    storage::{ensure_slot_available, insert_history, new_id, utc_text},
};
use crate::{
    db::{Db, insert_audit},
    models::{AppointmentResponse, AppointmentStatus, AuthUser, Role},
    security::constant_time_eq,
};
use chrono::{Duration as ChronoDuration, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};

pub async fn create(
    db: &Db,
    actor: AuthUser,
    command: Booking,
) -> Result<AppointmentResponse, Error> {
    if !actor.roles.contains(&Role::Client) {
        return Err(Error::forbidden());
    }
    let Booking {
        barber_id,
        service_id,
        starts_at,
        idempotency:
            Idempotency {
                key: idempotency_key,
                request_hash,
            },
    } = command;
    require_future(starts_at)?;
    let business_id = actor.business_id;
    let client_id = actor.id;
    let starts_text = utc_text(starts_at);
    db
        .with_conn(move |connection| -> Result<_, Error> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if let Some((stored_hash, response_json)) = transaction
                .query_row(
                    "SELECT request_hash, response_json FROM idempotency_keys
                     WHERE business_id = ?1 AND user_id = ?2 AND endpoint = 'POST /appointments' AND idem_key = ?3",
                    params![business_id, client_id, idempotency_key],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()?
            {
                if !constant_time_eq(&stored_hash, &request_hash) {
                    return Err(Error::conflict("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with another request"));
                }
                let response = serde_json::from_str(&response_json).map_err(|_| Error::Internal)?;
                return Ok(response);
            }
            let (price_cents, duration_minutes): (i64, i64) = transaction
                .query_row(
                    "SELECT price_cents, duration_minutes FROM services WHERE business_id = ?1 AND id = ?2 AND active = 1",
                    params![business_id, service_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| Error::not_found("SERVICE_NOT_FOUND", "Service was not found"))?;
            let ends_at = starts_at + ChronoDuration::minutes(duration_minutes);
            ensure_slot_available(&transaction, &business_id, &barber_id, starts_at, ends_at, None)?;
            let appointment_id = new_id();
            let now = utc_text(Utc::now());
            let ends_text = utc_text(ends_at);
            transaction.execute(
                "INSERT INTO appointments(id, business_id, client_user_id, barber_user_id, service_id, starts_at_utc, ends_at_utc,
                  status, price_cents, duration_minutes, source, created_by_user_id, created_at_utc, updated_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'confirmed', ?8, ?9, 'web', ?3, ?10, ?10)",
                params![appointment_id, business_id, client_id, barber_id, service_id, starts_text, ends_text, price_cents, duration_minutes, now],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&client_id),
                "created",
                None,
                Some("confirmed"),
                None,
                Some(&starts_text),
                "",
            )?;
            insert_audit(&transaction, &business_id, Some(&client_id), "appointment.created", "appointment", &appointment_id, "{}")?;
            let response = AppointmentResponse {
                id: appointment_id.clone(),
                business_id: business_id.clone(),
                client_user_id: client_id.clone(),
                barber_user_id: barber_id.clone(),
                service_id: service_id.clone(),
                starts_at,
                ends_at,
                status: AppointmentStatus::Confirmed,
                price_cents,
                duration_minutes,
                client_display_name: None,
                barber_display_name: None,
                service_name: None,
                rating: None,
                client_phone: None, payment_method: None, client_note: None, execution_started: false,
                commission_cents: None,
            };
            let response_json = serde_json::to_string(&response).map_err(|_| Error::Internal)?;
            transaction.execute(
                "INSERT INTO idempotency_keys(business_id, user_id, endpoint, idem_key, request_hash, response_json, response_status, appointment_id, created_at_utc)
                 VALUES (?1, ?2, 'POST /appointments', ?3, ?4, ?5, 201, ?6, ?7)",
                params![business_id, client_id, idempotency_key, request_hash, response_json, appointment_id, now],
            )?;
            transaction.commit()?;
            Ok(response)
        })
        .await
}

pub async fn create_reception(
    db: &Db,
    actor: AuthUser,
    command: ReceptionBooking,
) -> Result<AppointmentResponse, Error> {
    let ReceptionBooking {
        booking:
            Booking {
                barber_id,
                service_id,
                starts_at,
                idempotency:
                    Idempotency {
                        key: idempotency_key,
                        request_hash,
                    },
            },
        client_id,
        client_name,
        client_phone,
        payment_method,
        client_note,
    } = command;
    let walk_in = client_name.is_some();
    if !actor.roles.contains(&Role::Owner)
        && !(walk_in && actor.roles.contains(&Role::Barber) && barber_id == actor.id)
    {
        return Err(Error::forbidden());
    }
    require_future(starts_at)?;
    let business_id = actor.business_id;
    let actor_id = actor.id;
    let starts_text = utc_text(starts_at);
    db
        .with_conn(move |connection| -> Result<_, Error> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            if let Some((stored_hash, response_json)) = transaction
                .query_row(
                    "SELECT request_hash, response_json FROM idempotency_keys
                     WHERE business_id = ?1 AND user_id = ?2 AND endpoint = 'POST /admin/appointments' AND idem_key = ?3",
                    params![business_id, actor_id, idempotency_key],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()?
            {
                if !constant_time_eq(&stored_hash, &request_hash) {
                    return Err(Error::conflict(
                        "IDEMPOTENCY_KEY_REUSED",
                        "Idempotency-Key was already used with another request",
                    ));
                }
                return serde_json::from_str(&response_json).map_err(|_| Error::Internal);
            }
            if let Some(name) = &client_name {
                // Reception-only identity, inactive and unable to authenticate. No invented customer credentials.
                transaction.execute("INSERT INTO users(id,business_id,email,password_hash,display_name,active,created_at_utc,updated_at_utc) VALUES (?1,?2,?3,?4,?5,0,?6,?6)", params![client_id,business_id,format!("{client_id}@walk-in.invalid"),"!disabled-walk-in-identity-no-login!",name,utc_text(Utc::now())])?;
                transaction.execute("INSERT INTO user_roles(business_id,user_id,role,created_at_utc) VALUES (?1,?2,'client',?3)", params![business_id,client_id,utc_text(Utc::now())])?;
            }
            let client_exists: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id AND r.business_id = u.business_id
                 WHERE u.business_id = ?1 AND u.id = ?2 AND u.active = 1 AND r.role = 'client')",
                params![business_id, client_id],
                |row| row.get(0),
            )?;
            if client_exists == 0 && !walk_in {
                return Err(Error::not_found("CLIENT_NOT_FOUND", "Client was not found"));
            }
            let (price_cents, duration_minutes): (i64, i64) = transaction
                .query_row(
                    "SELECT price_cents, duration_minutes FROM services WHERE business_id = ?1 AND id = ?2 AND active = 1",
                    params![business_id, service_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| Error::not_found("SERVICE_NOT_FOUND", "Service was not found"))?;
            let ends_at = starts_at + ChronoDuration::minutes(duration_minutes);
            ensure_slot_available(&transaction, &business_id, &barber_id, starts_at, ends_at, None)?;
            let appointment_id = new_id();
            let now = utc_text(Utc::now());
            let ends_text = utc_text(ends_at);
            transaction.execute(
                "INSERT INTO appointments(id, business_id, client_user_id, barber_user_id, service_id, starts_at_utc, ends_at_utc,
                  status, price_cents, duration_minutes, source, created_by_user_id, created_at_utc, updated_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'confirmed', ?8, ?9, 'owner', ?10, ?11, ?11)",
                params![appointment_id, business_id, client_id, barber_id, service_id, starts_text, ends_text, price_cents, duration_minutes, actor_id, now],
            )?;
            transaction.execute("UPDATE appointments SET client_phone=?1,payment_method=?2,client_note=?3 WHERE business_id=?4 AND id=?5",params![client_phone,payment_method,client_note,business_id,appointment_id])?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "created",
                None,
                Some("confirmed"),
                None,
                Some(&starts_text),
                "",
            )?;
            insert_audit(
                &transaction,
                &business_id,
                Some(&actor_id),
                "appointment.created_by_owner",
                "appointment",
                &appointment_id,
                "{}",
            )?;
            let response = AppointmentResponse {
                id: appointment_id.clone(),
                business_id: business_id.clone(),
                client_user_id: client_id.clone(),
                barber_user_id: barber_id.clone(),
                service_id: service_id.clone(),
                starts_at,
                ends_at,
                status: AppointmentStatus::Confirmed,
                price_cents,
                duration_minutes,
                client_display_name: None,
                barber_display_name: None,
                service_name: None,
                rating: None,
                client_phone: None, payment_method: None, client_note: None, execution_started: false,
                commission_cents: None,
            };
            let response_json = serde_json::to_string(&response).map_err(|_| Error::Internal)?;
            transaction.execute(
                "INSERT INTO idempotency_keys(business_id, user_id, endpoint, idem_key, request_hash, response_json, response_status, appointment_id, created_at_utc)
                 VALUES (?1, ?2, 'POST /admin/appointments', ?3, ?4, ?5, 201, ?6, ?7)",
                params![business_id, actor_id, idempotency_key, request_hash, response_json, appointment_id, now],
            )?;
            transaction.commit()?;
            Ok(response)
        })
        .await
}
