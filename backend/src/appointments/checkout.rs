//! Fechamento de atendimento pela gestão: serviços efetivamente realizados,
//! preços congelados, pagamento recebido e conclusão em uma única transação.
use super::{
    Error,
    storage::{get_appointment, new_id, utc_text},
    transitions::finish_completion,
};
use crate::{
    db::Db,
    models::{AppointmentResponse, AppointmentStatus, AuthUser, Role},
};
use chrono::Utc;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::Serialize;
use std::collections::HashSet;

pub(super) const PAYMENT_METHODS: [&str; 4] = ["pix", "cash", "debit_card", "credit_card"];
const MAX_EXTRA_SERVICES: usize = 20;

pub struct Checkout {
    pub extra_service_ids: Vec<String>,
    pub payment_method: String,
    /// Total exibido na confirmação. Se os preços mudarem antes do envio, nada é gravado.
    pub expected_total_cents: i64,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CheckoutLine {
    pub service_id: String,
    pub service_name: String,
    pub price_cents: i64,
    pub is_original: bool,
}

#[derive(Debug, Serialize)]
pub struct CheckoutSummary {
    pub appointment_id: String,
    pub status: AppointmentStatus,
    pub execution_started: bool,
    /// true quando os serviços vêm do fechamento gravado; false quando ainda
    /// representam apenas o serviço agendado.
    pub recorded: bool,
    pub lines: Vec<CheckoutLine>,
    pub total_cents: i64,
    pub paid_payment_method: Option<String>,
    pub paid_at: Option<String>,
    pub completed_at: Option<String>,
    /// Quem registrou o fechamento (barbeiro ou gestão).
    pub closed_by_name: Option<String>,
    /// Versão para evitar que uma correção sobrescreva outra feita ao mesmo tempo.
    pub version: i64,
    /// Somente o superadministrador corrige atendimentos concluídos.
    pub can_correct: bool,
    /// Histórico de correções; visível apenas para o superadministrador.
    pub corrections: Vec<super::correction::CorrectionRecord>,
}

/// Mesma regra de negócio para todos os canais; muda apenas quem pode agir:
/// o superadministrador gerencia qualquer atendimento da barbearia e o
/// barbeiro (inclusive o dono no modo híbrido) apenas os da própria agenda.
pub(super) fn require_manager(
    actor: &AuthUser,
    appointment: &AppointmentResponse,
) -> Result<(), Error> {
    let own_agenda = actor.roles.contains(&Role::Barber) && appointment.barber_user_id == actor.id;
    if actor.is_super_admin() || own_agenda {
        Ok(())
    } else {
        Err(Error::forbidden())
    }
}

pub(super) fn recorded_lines(
    connection: &rusqlite::Connection,
    business_id: &str,
    appointment_id: &str,
) -> rusqlite::Result<Vec<CheckoutLine>> {
    let mut query = connection.prepare(
        "SELECT service_id, service_name, price_cents, is_original FROM appointment_services
         WHERE business_id = ?1 AND appointment_id = ?2 ORDER BY position",
    )?;
    query
        .query_map(params![business_id, appointment_id], |row| {
            Ok(CheckoutLine {
                service_id: row.get(0)?,
                service_name: row.get(1)?,
                price_cents: row.get(2)?,
                is_original: row.get::<_, i64>(3)? != 0,
            })
        })?
        .collect()
}

pub(super) fn original_line(current: &AppointmentResponse) -> CheckoutLine {
    // O serviço agendado mantém o preço gravado no agendamento, não o preço atual do catálogo.
    CheckoutLine {
        service_id: current.service_id.clone(),
        service_name: current
            .service_name
            .clone()
            .unwrap_or_else(|| "Serviço agendado".into()),
        price_cents: current.price_cents,
        is_original: true,
    }
}

/// Leitura pura para o modal: abrir um atendimento nunca grava nada.
pub async fn summary(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
) -> Result<CheckoutSummary, Error> {
    let business_id = actor.business_id.clone();
    db.with_conn(move |connection| -> Result<_, Error> {
        let current = get_appointment(connection, &business_id, &appointment_id)?;
        require_manager(&actor, &current)?;
        let (paid_payment_method, paid_at, completed_at, version, closed_by_name): (Option<String>, Option<String>, Option<String>, i64, Option<String>) = connection.query_row(
            "SELECT a.paid_payment_method, a.paid_at_utc, a.completed_at_utc, a.version, closer.display_name
             FROM appointments a
             LEFT JOIN users closer ON closer.business_id = a.business_id
                 AND closer.id = COALESCE(a.paid_by_user_id,
                     (SELECT e.completed_by_user_id FROM service_executions e WHERE e.business_id = a.business_id AND e.appointment_id = a.id))
             WHERE a.business_id = ?1 AND a.id = ?2",
            params![business_id, appointment_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )?;
        let can_correct = actor.is_super_admin();
        let corrections = if can_correct {
            super::correction::history(connection, &business_id, &appointment_id)?
        } else {
            Vec::new()
        };
        let stored = recorded_lines(connection, &business_id, &appointment_id)?;
        let recorded = !stored.is_empty();
        let lines = if recorded { stored } else { vec![original_line(&current)] };
        // Para atendimentos concluídos, o total é o valor final gravado no atendimento.
        let total_cents = if current.status == AppointmentStatus::Completed {
            current.price_cents
        } else {
            lines.iter().map(|line| line.price_cents).sum()
        };
        Ok(CheckoutSummary {
            appointment_id: current.id,
            status: current.status,
            execution_started: current.execution_started,
            recorded,
            lines,
            total_cents,
            paid_payment_method,
            paid_at,
            completed_at,
            closed_by_name,
            version,
            can_correct: can_correct && current.status == AppointmentStatus::Completed,
            corrections,
        })
    })
    .await
}

pub async fn complete_with_checkout(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
    checkout: Checkout,
) -> Result<AppointmentResponse, Error> {
    let Checkout {
        extra_service_ids,
        payment_method,
        expected_total_cents,
        notes,
    } = checkout;
    if !PAYMENT_METHODS.contains(&payment_method.as_str()) {
        return Err(Error::bad_request(
            "INVALID_PAYMENT",
            "Payment method is invalid",
        ));
    }
    if extra_service_ids.len() > MAX_EXTRA_SERVICES {
        return Err(Error::bad_request(
            "INVALID_SERVICES",
            "Too many additional services",
        ));
    }
    let distinct = {
        let mut seen = HashSet::new();
        extra_service_ids.iter().all(|id| seen.insert(id.as_str()))
    };
    if !distinct {
        return Err(Error::bad_request(
            "DUPLICATE_SERVICE",
            "A service was added more than once",
        ));
    }
    let business_id = actor.business_id.clone();
    let actor_id = actor.id.clone();
    db.with_conn(move |connection| -> Result<_, Error> {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current = get_appointment(&transaction, &business_id, &appointment_id)?;
        require_manager(&actor, &current)?;
        match current.status {
            AppointmentStatus::Confirmed => {}
            AppointmentStatus::Completed => {
                return Err(Error::conflict("ALREADY_COMPLETED", "Appointment is already completed"));
            }
            AppointmentStatus::Cancelled => {
                return Err(Error::conflict("APPOINTMENT_CANCELLED", "A cancelled appointment cannot be completed"));
            }
            AppointmentStatus::NoShow => {
                return Err(Error::conflict("APPOINTMENT_NO_SHOW", "A no-show appointment cannot be completed"));
            }
        }
        if extra_service_ids.contains(&current.service_id) {
            return Err(Error::bad_request(
                "DUPLICATE_SERVICE",
                "The booked service is already included",
            ));
        }
        let mut lines = vec![original_line(&current)];
        for service_id in &extra_service_ids {
            let (name, price_cents): (String, i64) = transaction
                .query_row(
                    "SELECT name, price_cents FROM services WHERE business_id = ?1 AND id = ?2 AND active = 1",
                    params![business_id, service_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| Error::not_found("SERVICE_NOT_FOUND", "Service was not found"))?;
            lines.push(CheckoutLine {
                service_id: service_id.clone(),
                service_name: name,
                price_cents,
                is_original: false,
            });
        }
        let total_cents: i64 = lines.iter().map(|line| line.price_cents).sum();
        if total_cents > 100_000_000 {
            return Err(Error::bad_request("INVALID_SERVICES", "Total is too large"));
        }
        if total_cents != expected_total_cents {
            return Err(Error::conflict(
                "TOTAL_CHANGED",
                "Prices changed before the confirmation was sent",
            ));
        }
        let now = utc_text(Utc::now());
        for (position, line) in lines.iter().enumerate() {
            transaction.execute(
                "INSERT INTO appointment_services(id, business_id, appointment_id, service_id, service_name, price_cents,
                 position, is_original, created_by_user_id, created_at_utc)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    new_id(), business_id, appointment_id, line.service_id, line.service_name, line.price_cents,
                    position as i64, line.is_original as i64, actor_id, now
                ],
            )?;
        }
        // O valor do atendimento passa a ser o total cobrado; a receita é lançada uma única vez sobre ele.
        transaction.execute(
            "UPDATE appointments SET price_cents = ?1, paid_payment_method = ?2, paid_at_utc = ?3, paid_by_user_id = ?4
             WHERE business_id = ?5 AND id = ?6 AND status = 'confirmed'",
            params![total_cents, payment_method, now, actor_id, business_id, appointment_id],
        )?;
        let metadata = serde_json::json!({
            "original_price_cents": current.price_cents,
            "total_cents": total_cents,
            "payment_method": payment_method,
            "extra_service_ids": extra_service_ids,
        })
        .to_string();
        let completed = finish_completion(&transaction, &business_id, &appointment_id, &actor_id, &notes, &metadata)?;
        transaction.commit()?;
        Ok(completed)
    })
    .await
}
