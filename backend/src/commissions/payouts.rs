use super::{Error, Payout, new_id, require_owner, utc_text};
use crate::{
    db::{Db, insert_audit},
    models::AuthUser,
};
use chrono::Utc;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde_json::{Value, json};

/// Register an already performed payment of the entire current eligible balance.
pub async fn record_payout(db: &Db, actor: AuthUser, command: Payout) -> Result<Value, Error> {
    require_owner(&actor)?;
    let business = actor.business_id;
    let actor = actor.id;
    let barber = command.barber_id;
    let key = command.idempotency_key;
    db.with_conn(move |connection| -> Result<_, Error> {
        let tx = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let existing = tx.query_row(
            "SELECT id,barber_user_id,amount_cents FROM commission_payouts WHERE business_id=?1 AND idempotency_key=?2",
            params![business, key],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)),
        ).optional()?;
        if let Some((id, existing_barber, amount)) = existing {
            if existing_barber != barber || amount != command.expected_amount_cents {
                return Err(Error::conflict("IDEMPOTENCY_KEY_REUSED", "Chave utilizada em outro repasse."));
            }
            return Ok(json!({"id":id, "amount_cents":amount}));
        }
        let items = super::storage::payable_commissions(&tx, &business, Some(&barber))?;
        let amount: i64 = items.iter().map(|item| item.amount_cents).sum();
        if amount <= 0 || amount != command.expected_amount_cents {
            return Err(Error::conflict("BALANCE_CHANGED", "O saldo mudou. Atualize a equipe antes de registrar o repasse."));
        }
        let id = new_id();
        let now = utc_text(Utc::now());
        tx.execute(
            "INSERT INTO commission_payouts(id,business_id,barber_user_id,amount_cents,idempotency_key,created_by_user_id,created_at_utc) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![id, business, barber, amount, key, actor, now],
        )?;
        for item in items {
            tx.execute(
                "INSERT INTO commission_payout_items(business_id,appointment_id,payout_id) VALUES (?1,?2,?3)",
                params![business, item.appointment_id, id],
            )?;
        }
        insert_audit(&tx, &business, Some(&actor), "commission.payout_recorded", "commission_payout", &id, "{}")?;
        tx.commit()?;
        Ok(json!({"id":id,"amount_cents":amount}))
    }).await
}
