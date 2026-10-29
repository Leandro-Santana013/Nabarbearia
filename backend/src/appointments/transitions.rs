use super::{
    Error,
    storage::{ensure_slot_available, get_appointment, insert_history, new_id, utc_text},
};
use crate::{
    db::{Db, insert_audit},
    models::{AppointmentResponse, AppointmentStatus, AuthUser, Role},
};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use rusqlite::{TransactionBehavior, params};

pub async fn cancel(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
    reason: String,
) -> Result<AppointmentResponse, Error> {
    let business_id = actor.business_id.clone();
    let actor_id = actor.id.clone();
    let actor_is_owner = actor.roles.contains(&Role::Owner);
    let actor_is_client = actor.roles.contains(&Role::Client);
    db
        .with_conn(move |connection| -> Result<_, Error> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_client && current.client_user_id == actor_id)) {
                return Err(Error::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(Error::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be cancelled"));
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "UPDATE appointments SET status = 'cancelled', cancellation_reason = ?1, cancelled_at_utc = ?2,
                 updated_at_utc = ?2, version = version + 1 WHERE business_id = ?3 AND id = ?4 AND status = 'confirmed'",
                params![reason, now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "cancelled",
                Some("confirmed"),
                Some("cancelled"),
                None,
                None,
                &reason,
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.cancelled", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(AppointmentResponse { status: AppointmentStatus::Cancelled, ..current })
        })
        .await
}

pub async fn start(db: &Db, actor: AuthUser, appointment_id: String) -> Result<(), Error> {
    let business_id = actor.business_id.clone();
    let actor_id = actor.id.clone();
    let actor_is_owner = actor.roles.contains(&Role::Owner);
    let actor_is_barber = actor.roles.contains(&Role::Barber);
    db.with_conn(move |connection| -> Result<_, Error> {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let appointment = get_appointment(&transaction, &business_id, &appointment_id)?;
        if !(actor_is_owner || (actor_is_barber && appointment.barber_user_id == actor_id)) {
            return Err(Error::forbidden());
        }
        if appointment.status != AppointmentStatus::Confirmed {
            return Err(Error::conflict(
                "INVALID_TRANSITION",
                "Only a confirmed appointment can start",
            ));
        }
        let created = transaction.execute(
            "INSERT INTO service_executions(business_id, appointment_id, started_at_utc, notes)
                 VALUES (?1, ?2, ?3, '') ON CONFLICT(business_id, appointment_id) DO NOTHING",
            params![business_id, appointment_id, utc_text(Utc::now())],
        )?;
        if created != 0 {
            insert_audit(
                &transaction,
                &business_id,
                Some(&actor_id),
                "service_execution.started",
                "appointment",
                &appointment_id,
                "{}",
            )?;
        }
        transaction.commit()?;
        Ok(())
    })
    .await
}

pub async fn complete(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
    notes: String,
) -> Result<AppointmentResponse, Error> {
    let business_id = actor.business_id.clone();
    let actor_id = actor.id.clone();
    let actor_is_owner = actor.roles.contains(&Role::Owner);
    let actor_is_barber = actor.roles.contains(&Role::Barber);
    db
        .with_conn(move |connection| -> Result<_, Error> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_barber && current.barber_user_id == actor_id)) {
                return Err(Error::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(Error::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be completed"));
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "INSERT INTO service_executions(business_id, appointment_id, started_at_utc, notes)
                 VALUES (?1, ?2, ?3, '') ON CONFLICT(business_id, appointment_id) DO NOTHING",
                params![business_id, appointment_id, now],
            )?;
            transaction.execute(
                "UPDATE service_executions SET completed_at_utc = ?1, notes = ?2, completed_by_user_id = ?3
                 WHERE business_id = ?4 AND appointment_id = ?5 AND completed_at_utc IS NULL",
                params![now, notes, actor_id, business_id, appointment_id],
            )?;
            transaction.execute(
                "UPDATE appointments SET status = 'completed', completed_at_utc = ?1, updated_at_utc = ?1, version = version + 1
                 WHERE business_id = ?2 AND id = ?3 AND status = 'confirmed'",
                params![now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "completed",
                Some("confirmed"),
                Some("completed"),
                None,
                None,
                "",
            )?;
            transaction.execute(
                "INSERT INTO financial_entries(id, business_id, appointment_id, kind, amount_cents, status, created_at_utc)
                 VALUES (?1, ?2, ?3, 'revenue', ?4, 'posted', ?5)",
                params![new_id(), business_id, appointment_id, current.price_cents, now],
            )?;
            crate::commissions::settle_commission(&transaction, &(&current).into(), &now)?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.completed", "appointment", &appointment_id, "{}")?;
            let completed = get_appointment(&transaction, &business_id, &appointment_id)?;
            transaction.commit()?;
            Ok(completed)
        })
        .await
}

pub async fn no_show(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
) -> Result<AppointmentResponse, Error> {
    let business_id = actor.business_id.clone();
    let actor_id = actor.id.clone();
    let actor_is_owner = actor.roles.contains(&Role::Owner);
    let actor_is_barber = actor.roles.contains(&Role::Barber);
    db
        .with_conn(move |connection| -> Result<_, Error> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_barber && current.barber_user_id == actor_id)) {
                return Err(Error::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(Error::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be marked no-show"));
            }
            let started: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM service_executions WHERE business_id = ?1 AND appointment_id = ?2)",
                params![business_id, appointment_id],
                |row| row.get(0),
            )?;
            if started != 0 {
                return Err(Error::conflict("INVALID_TRANSITION", "An appointment in execution cannot be marked no-show"));
            }
            let now = utc_text(Utc::now());
            transaction.execute(
                "UPDATE appointments SET status = 'no_show', updated_at_utc = ?1, version = version + 1
                 WHERE business_id = ?2 AND id = ?3 AND status = 'confirmed'",
                params![now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "no_show",
                Some("confirmed"),
                Some("no_show"),
                None,
                None,
                "",
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.no_show", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(AppointmentResponse { status: AppointmentStatus::NoShow, ..current })
        })
        .await
}

pub struct Details {
    pub phone: String,
    pub payment: Option<String>,
    pub note: String,
}
pub async fn update_details(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
    details: Details,
) -> Result<(), Error> {
    let Details {
        phone,
        payment,
        note,
    } = details;
    let business_id = actor.business_id.clone();
    let actor_id = actor.id.clone();
    let owner = actor.roles.contains(&Role::Owner);
    let barber = actor.roles.contains(&Role::Barber);
    db.with_conn(move |connection| -> Result<_, Error> {
        let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let appointment = get_appointment(&tx, &business_id, &appointment_id)?;
        if !(owner || (barber && appointment.barber_user_id == actor_id)) { return Err(Error::forbidden()); }
        tx.execute("UPDATE appointments SET client_phone=?1, payment_method=?2, client_note=?3, updated_at_utc=?4, version=version+1 WHERE business_id=?5 AND id=?6", params![phone,payment,note,utc_text(Utc::now()),business_id,appointment_id])?;
        insert_audit(&tx,&business_id,Some(&actor_id),"appointment.details_updated","appointment",&appointment_id,"{}")?;
        tx.commit()?; Ok(())
    }).await
}

pub async fn reschedule(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
    starts_at: DateTime<Utc>,
) -> Result<AppointmentResponse, Error> {
    super::require_future(starts_at)?;
    let actor_is_owner = actor.roles.contains(&Role::Owner);
    let actor_is_client = actor.roles.contains(&Role::Client);
    let business_id = actor.business_id;
    let actor_id = actor.id;
    db
        .with_conn(move |connection| -> Result<_, Error> {
            let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let current = get_appointment(&transaction, &business_id, &appointment_id)?;
            if !(actor_is_owner || (actor_is_client && current.client_user_id == actor_id)) {
                return Err(Error::forbidden());
            }
            if current.status != AppointmentStatus::Confirmed {
                return Err(Error::conflict("INVALID_TRANSITION", "Only a confirmed appointment can be rescheduled"));
            }
            if current.starts_at == starts_at {
                return Ok(current);
            }
            let execution_exists: i64 = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM service_executions WHERE business_id = ?1 AND appointment_id = ?2)",
                params![business_id, appointment_id],
                |row| row.get(0),
            )?;
            if execution_exists != 0 {
                return Err(Error::conflict("INVALID_TRANSITION", "An appointment in execution cannot be rescheduled"));
            }
            let ends_at = starts_at + ChronoDuration::minutes(current.duration_minutes);
            ensure_slot_available(&transaction, &business_id, &current.barber_user_id, starts_at, ends_at, Some(&appointment_id))?;
            let starts_text = utc_text(starts_at);
            let ends_text = utc_text(ends_at);
            let now = utc_text(Utc::now());
            transaction.execute(
                "UPDATE appointments SET starts_at_utc = ?1, ends_at_utc = ?2, version = version + 1, updated_at_utc = ?3
                 WHERE business_id = ?4 AND id = ?5 AND status = 'confirmed'",
                params![starts_text, ends_text, now, business_id, appointment_id],
            )?;
            insert_history(
                &transaction,
                &business_id,
                &appointment_id,
                Some(&actor_id),
                "rescheduled",
                Some("confirmed"),
                Some("confirmed"),
                Some(&utc_text(current.starts_at)),
                Some(&starts_text),
                "",
            )?;
            insert_audit(&transaction, &business_id, Some(&actor_id), "appointment.rescheduled", "appointment", &appointment_id, "{}")?;
            transaction.commit()?;
            Ok(AppointmentResponse { starts_at, ends_at, ..current })
        })
        .await
}
