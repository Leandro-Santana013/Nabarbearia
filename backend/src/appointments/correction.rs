//! Correção administrativa de atendimentos concluídos. Não cria atendimento nem
//! executa a conclusão de novo: substitui as linhas realizadas, ajusta a receita
//! única do atendimento, trata a comissão (recalcula ou lança ajuste se já foi
//! repassada) e grava um histórico somente de inclusão, tudo em uma transação.
use super::{
    Error,
    checkout::{CheckoutLine, PAYMENT_METHODS, original_line, recorded_lines},
    storage::{get_appointment, new_id, utc_text},
};
use crate::{
    commissions::{CorrectionCommission, recalculate_after_correction},
    db::{Db, insert_audit},
    models::{AppointmentStatus, AuthUser},
};
use chrono::Utc;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashSet;

const MAX_LINES: usize = 21;

pub struct CorrectionLine {
    pub service_id: String,
    pub price_cents: i64,
}

pub struct Correction {
    pub lines: Vec<CorrectionLine>,
    pub payment_method: String,
    pub reason: String,
    /// Versão lida ao abrir o modal; se outra pessoa corrigiu antes, nada é gravado.
    pub expected_version: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CorrectionRecord {
    pub id: String,
    pub actor_name: String,
    pub created_at: String,
    pub reason: String,
    pub previous_total_cents: i64,
    pub new_total_cents: i64,
    pub previous_payment_method: Option<String>,
    pub new_payment_method: String,
    pub previous_services: Value,
    pub new_services: Value,
    pub added_services: Value,
    pub removed_services: Value,
    pub previous_commission_cents: Option<i64>,
    pub new_commission_cents: Option<i64>,
    pub commission_treatment: String,
}

pub(super) fn history(
    connection: &rusqlite::Connection,
    business_id: &str,
    appointment_id: &str,
) -> rusqlite::Result<Vec<CorrectionRecord>> {
    let mut query = connection.prepare(
        "SELECT c.id, u.display_name, c.created_at_utc, c.reason, c.previous_total_cents, c.new_total_cents,
                c.previous_payment_method, c.new_payment_method, c.previous_services_json, c.new_services_json,
                c.added_services_json, c.removed_services_json, c.previous_commission_cents, c.new_commission_cents,
                c.commission_treatment
         FROM appointment_corrections c
         JOIN users u ON u.business_id = c.business_id AND u.id = c.actor_user_id
         WHERE c.business_id = ?1 AND c.appointment_id = ?2
         ORDER BY c.created_at_utc DESC, c.rowid DESC",
    )?;
    let parse = |text: String| serde_json::from_str::<Value>(&text).unwrap_or(Value::Null);
    query
        .query_map(params![business_id, appointment_id], |row| {
            Ok(CorrectionRecord {
                id: row.get(0)?,
                actor_name: row.get(1)?,
                created_at: row.get(2)?,
                reason: row.get(3)?,
                previous_total_cents: row.get(4)?,
                new_total_cents: row.get(5)?,
                previous_payment_method: row.get(6)?,
                new_payment_method: row.get(7)?,
                previous_services: parse(row.get(8)?),
                new_services: parse(row.get(9)?),
                added_services: parse(row.get(10)?),
                removed_services: parse(row.get(11)?),
                previous_commission_cents: row.get(12)?,
                new_commission_cents: row.get(13)?,
                commission_treatment: row.get(14)?,
            })
        })?
        .collect()
}

fn validate(correction: &Correction) -> Result<String, Error> {
    let reason = correction.reason.trim().to_string();
    if !(5..=500).contains(&reason.chars().count()) {
        return Err(Error::bad_request(
            "INVALID_REASON",
            "A correction reason is required",
        ));
    }
    if !PAYMENT_METHODS.contains(&correction.payment_method.as_str()) {
        return Err(Error::bad_request(
            "INVALID_PAYMENT",
            "Payment method is invalid",
        ));
    }
    if correction.lines.is_empty() || correction.lines.len() > MAX_LINES {
        return Err(Error::bad_request(
            "INVALID_SERVICES",
            "Inform between one and 21 services",
        ));
    }
    let mut seen = HashSet::new();
    for line in &correction.lines {
        if !seen.insert(line.service_id.as_str()) {
            return Err(Error::bad_request(
                "DUPLICATE_SERVICE",
                "A service was added more than once",
            ));
        }
        if !(0..=100_000_000).contains(&line.price_cents) {
            return Err(Error::bad_request(
                "INVALID_PRICE",
                "Service price is invalid",
            ));
        }
    }
    Ok(reason)
}

fn lines_json(lines: &[CheckoutLine]) -> Value {
    Value::Array(
        lines
            .iter()
            .map(|line| json!({"service_id": line.service_id, "service_name": line.service_name, "price_cents": line.price_cents}))
            .collect(),
    )
}

pub async fn correct(
    db: &Db,
    actor: AuthUser,
    appointment_id: String,
    correction: Correction,
) -> Result<(), Error> {
    // Somente o superadministrador corrige; barbeiros apenas consultam o próprio fechamento.
    if !actor.is_super_admin() {
        return Err(Error::forbidden());
    }
    let reason = validate(&correction)?;
    let business_id = actor.business_id;
    let actor_id = actor.id;
    db.with_conn(move |connection| -> Result<_, Error> {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current = get_appointment(&transaction, &business_id, &appointment_id)?;
        if current.status != AppointmentStatus::Completed {
            return Err(Error::conflict("NOT_COMPLETED", "Only completed appointments can be corrected"));
        }
        let (version, previous_payment): (i64, Option<String>) = transaction.query_row(
            "SELECT version, paid_payment_method FROM appointments WHERE business_id = ?1 AND id = ?2",
            params![business_id, appointment_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if version != correction.expected_version {
            return Err(Error::conflict("APPOINTMENT_CHANGED", "The appointment was changed by someone else"));
        }
        let stored = recorded_lines(&transaction, &business_id, &appointment_id)?;
        let previous = if stored.is_empty() { vec![original_line(&current)] } else { stored };
        let previous_total = current.price_cents;

        let mut next = Vec::with_capacity(correction.lines.len());
        for line in &correction.lines {
            // Serviços que já estavam no fechamento mantêm o nome registrado; novos vêm do catálogo ativo.
            let name = match previous.iter().find(|item| item.service_id == line.service_id) {
                Some(item) => item.service_name.clone(),
                None => transaction
                    .query_row(
                        "SELECT name FROM services WHERE business_id = ?1 AND id = ?2 AND active = 1",
                        params![business_id, line.service_id],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()?
                    .ok_or_else(|| Error::not_found("SERVICE_NOT_FOUND", "Service was not found"))?,
            };
            next.push(CheckoutLine {
                service_id: line.service_id.clone(),
                service_name: name,
                price_cents: line.price_cents,
                is_original: line.service_id == current.service_id,
            });
        }
        let new_total: i64 = next.iter().map(|line| line.price_cents).sum();
        if new_total > 100_000_000 {
            return Err(Error::bad_request("INVALID_PRICE", "Total is too large"));
        }
        let same_lines = previous.len() == next.len()
            && previous.iter().zip(&next).all(|(a, b)| a.service_id == b.service_id && a.price_cents == b.price_cents);
        if same_lines && previous_payment.as_deref() == Some(correction.payment_method.as_str()) {
            return Err(Error::bad_request("NO_CHANGES", "Nothing was changed"));
        }

        let now = utc_text(Utc::now());
        transaction.execute(
            "DELETE FROM appointment_services WHERE business_id = ?1 AND appointment_id = ?2",
            params![business_id, appointment_id],
        )?;
        for (position, line) in next.iter().enumerate() {
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
        let changed = transaction.execute(
            "UPDATE appointments SET price_cents = ?1, paid_payment_method = ?2, updated_at_utc = ?3, version = version + 1
             WHERE business_id = ?4 AND id = ?5 AND status = 'completed' AND version = ?6",
            params![new_total, correction.payment_method, now, business_id, appointment_id, version],
        )?;
        if changed != 1 {
            return Err(Error::conflict("APPOINTMENT_CHANGED", "The appointment was changed by someone else"));
        }
        // A receita continua sendo um único lançamento: o valor é corrigido, nunca duplicado.
        let revenue = transaction.execute(
            "UPDATE financial_entries SET amount_cents = ?1 WHERE business_id = ?2 AND appointment_id = ?3 AND kind = 'revenue'",
            params![new_total, business_id, appointment_id],
        )?;
        if revenue != 1 {
            return Err(Error::Internal);
        }

        let correction_id = new_id();
        let updated = get_appointment(&transaction, &business_id, &appointment_id)?;
        let commission: CorrectionCommission =
            recalculate_after_correction(&transaction, &(&updated).into(), &correction_id, &now)?.ok_or_else(|| {
                Error::conflict(
                    "COMMISSION_RULE_MISSING",
                    "A paid commission cannot be adjusted while a service has no commission rule",
                )
            })?;
        let (previous_commission, new_commission) = commission.amounts();

        let previous_ids: Vec<&str> = previous.iter().map(|line| line.service_id.as_str()).collect();
        let next_ids: Vec<&str> = next.iter().map(|line| line.service_id.as_str()).collect();
        let added: Vec<CheckoutLine> = next.iter().filter(|line| !previous_ids.contains(&line.service_id.as_str())).cloned().collect();
        let removed: Vec<CheckoutLine> = previous.iter().filter(|line| !next_ids.contains(&line.service_id.as_str())).cloned().collect();
        transaction.execute(
            "INSERT INTO appointment_corrections(id, business_id, appointment_id, actor_user_id, reason,
             previous_total_cents, new_total_cents, previous_payment_method, new_payment_method,
             previous_services_json, new_services_json, added_services_json, removed_services_json,
             previous_commission_cents, new_commission_cents, commission_treatment, created_at_utc)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
            params![
                correction_id, business_id, appointment_id, actor_id, reason,
                previous_total, new_total, previous_payment, correction.payment_method,
                lines_json(&previous).to_string(), lines_json(&next).to_string(),
                lines_json(&added).to_string(), lines_json(&removed).to_string(),
                previous_commission, new_commission, commission.treatment(), now
            ],
        )?;
        insert_audit(
            &transaction,
            &business_id,
            Some(&actor_id),
            "appointment.corrected",
            "appointment",
            &appointment_id,
            &json!({"correction_id": correction_id, "previous_total_cents": previous_total, "new_total_cents": new_total}).to_string(),
        )?;
        transaction.commit()?;
        Ok(())
    })
    .await
}
