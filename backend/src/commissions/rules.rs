use super::{Error, Rule, Settlement, new_id, require_owner, settle_commission, utc_text};
use crate::{
    db::{Db, insert_audit},
    models::AuthUser,
};
use chrono::Utc;
use rusqlite::{TransactionBehavior, params};

/// Replace an equivalent active rule and regularize missing commissions atomically.
/// Posted history is deliberately never selected for recalculation.
pub async fn create_rule(db: &Db, actor: AuthUser, rule: Rule) -> Result<(), Error> {
    require_owner(&actor)?;
    Rule::validate_values(rule.rule_type, rule.amount, rule.priority)?;
    if rule
        .valid_until
        .is_some_and(|end| rule.valid_from.is_some_and(|start| end <= start))
    {
        return Err(Error::bad_request(
            "INVALID_COMMISSION_RULE",
            "Commission validity interval is invalid",
        ));
    }
    let business_id = actor.business_id;
    let actor_id = actor.id;
    let rule_id = new_id();
    let barber_id = rule.barber_id;
    let service_id = rule.service_id;
    let priority = rule.priority;
    let rule_type = rule.rule_type.as_str();
    let valid_from = rule.valid_from.map(utc_text);
    let valid_until = rule.valid_until.map(utc_text);
    db.with_conn(move |connection| -> Result<_, Error> {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if let Some(ref barber_id) = barber_id {
            let exists: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM barber_profiles p JOIN users u ON u.id=p.user_id AND u.business_id=p.business_id
                 WHERE p.business_id=?1 AND p.user_id=?2 AND p.active=1 AND u.active=1)",
                params![business_id, barber_id], |row| row.get(0))?;
            if !exists {
                return Err(Error::not_found("BARBER_NOT_FOUND", "Barber was not found"));
            }
        }
        if let Some(ref service_id) = service_id {
            let exists: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM services WHERE business_id=?1 AND id=?2)",
                params![business_id, service_id], |row| row.get(0))?;
            if !exists {
                return Err(Error::not_found("SERVICE_NOT_FOUND", "Service was not found"));
            }
        }
        let now = utc_text(Utc::now());
        transaction.execute(
            "UPDATE commission_rules SET active=0, updated_at_utc=?1 WHERE business_id=?2 AND barber_user_id IS ?3 AND service_id IS ?4 AND priority=?5 AND valid_from_utc IS ?6 AND valid_until_utc IS ?7 AND active=1",
            params![now,business_id,barber_id,service_id,priority,valid_from,valid_until],
        )?;
        transaction.execute(
            "INSERT INTO commission_rules(id, business_id, barber_user_id, service_id, rule_type, amount, priority, valid_from_utc, valid_until_utc, created_at_utc, updated_at_utc)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![rule_id,business_id,barber_id,service_id,rule_type,rule.amount,priority,valid_from,valid_until,now],
        )?;
        insert_audit(&transaction, &business_id, Some(&actor_id), "commission_rule.created", "commission_rule", &rule_id, "{}")?;
        let pending = {
            let mut query = transaction.prepare(
                "SELECT a.business_id,a.id,a.barber_user_id,a.service_id,a.starts_at_utc,a.price_cents
                 FROM commission_snapshots c JOIN appointments a ON a.business_id=c.business_id AND a.id=c.appointment_id
                 WHERE c.business_id=?1 AND c.status='pending_configuration'",
            )?;
            query.query_map(params![business_id], |row| Ok(Settlement {
                business_id: row.get(0)?, id: row.get(1)?, barber_user_id: row.get(2)?,
                service_id: row.get(3)?, starts_at: row.get(4)?, price_cents: row.get(5)?,
            }))?.collect::<Result<Vec<_>, _>>()?
        };
        for appointment in pending {
            settle_commission(&transaction, &appointment, &now)?;
        }
        transaction.commit()?;
        Ok(())
    }).await
}
