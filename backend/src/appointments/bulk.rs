use std::collections::HashSet;

use chrono::{DateTime, Duration, Utc};
use rusqlite::{TransactionBehavior, params};

use super::{
    Error,
    storage::{ensure_slot_available, get_appointment, insert_history, utc_text},
};
use crate::{
    db::{Db, insert_audit},
    models::{AppointmentStatus, AuthUser, Role},
};

#[derive(Clone, Copy)]
pub enum BatchAction {
    Cancel,
    Move,
}

pub struct AgendaChange {
    pub id: String,
    pub starts_at: Option<DateTime<Utc>>,
    pub barber_id: Option<String>,
}

/// Slots are temporarily released only within this transaction, allowing swaps.
/// A later failure rolls back every item, its history and its audit records.
pub async fn change_agenda(
    db: &Db,
    actor: AuthUser,
    action: BatchAction,
    changes: Vec<AgendaChange>,
) -> Result<(), Error> {
    if !actor.roles.contains(&Role::Owner) {
        return Err(Error::forbidden());
    }
    if changes.is_empty() || changes.len() > 100 {
        return Err(Error::bad_request(
            "INVALID_BATCH",
            "Selecione de 1 a 100 agendamentos.",
        ));
    }
    let mut seen = HashSet::new();
    for change in &changes {
        if !seen.insert(&change.id) {
            return Err(Error::bad_request("INVALID_BATCH", "Agendamento repetido."));
        }
    }
    let business = actor.business_id;
    let actor = actor.id;
    db.with_conn(move |connection| -> Result<_, Error> {
        let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let now = utc_text(Utc::now());
        let mut previous = Vec::new();
        for change in &changes {
            let appointment = get_appointment(&tx, &business, &change.id)?;
            if appointment.status != AppointmentStatus::Confirmed || appointment.execution_started {
                return Err(Error::conflict("INVALID_TRANSITION", "Selecione apenas agendamentos confirmados e não iniciados."));
            }
            previous.push(appointment);
        }
        for item in &previous {
            tx.execute("UPDATE appointments SET status='cancelled' WHERE business_id=?1 AND id=?2", params![business, item.id])?;
        }
        for (change, item) in changes.iter().zip(&previous) {
            match action {
                BatchAction::Cancel => {
                    tx.execute("UPDATE appointments SET cancellation_reason='Cancelado pela gestão em lote',cancelled_at_utc=?1,updated_at_utc=?1,version=version+1 WHERE business_id=?2 AND id=?3",params![now,business,item.id])?;
                    insert_history(&tx,&business,&item.id,Some(&actor),"cancelled",Some("confirmed"),Some("cancelled"),None,None,"Cancelado pela gestão em lote")?;
                }
                BatchAction::Move => {
                    let starts = change.starts_at.ok_or_else(|| Error::bad_request("INVALID_BATCH", "Informe a nova data e hora."))?;
                    if starts <= Utc::now() { return Err(Error::bad_request("INVALID_APPOINTMENT", "Escolha um horário futuro.")); }
                    let barber = change.barber_id.as_deref().unwrap_or(&item.barber_user_id);
                    let ends = starts + Duration::minutes(item.duration_minutes);
                    ensure_slot_available(&tx, &business, barber, starts, ends, Some(&item.id))?;
                    tx.execute("UPDATE appointments SET status='confirmed',barber_user_id=?1,starts_at_utc=?2,ends_at_utc=?3,updated_at_utc=?4,version=version+1 WHERE business_id=?5 AND id=?6", params![barber,utc_text(starts),utc_text(ends),now,business,item.id])?;
                    insert_history(&tx,&business,&item.id,Some(&actor),"rescheduled",Some("confirmed"),Some("confirmed"),Some(&utc_text(item.starts_at)),Some(&utc_text(starts)),"Remanejado pela gestão")?;
                }
            }
            insert_audit(&tx, &business, Some(&actor), "appointment.bulk_updated", "appointment", &item.id, "{}")?;
        }
        tx.commit()?;
        Ok(())
    }).await
}
