// The caller owns the transaction. Never commit settlement independently.
use super::{Settlement, new_id};
use rusqlite::{OptionalExtension, params};

pub(crate) fn settle_commission(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
    now: &str,
) -> rusqlite::Result<()> {
    let posted: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM commission_snapshots WHERE business_id=?1 AND appointment_id=?2 AND status='posted')", params![current.business_id,current.id], |row| row.get(0))?;
    if posted {
        return Ok(());
    }
    let rule: Option<(String, String, i64)> = transaction
        .query_row(
            "SELECT id, rule_type, amount FROM commission_rules
             WHERE business_id = ?1 AND active = 1
               AND (barber_user_id IS NULL OR barber_user_id = ?2)
               AND (service_id IS NULL OR service_id = ?3)
               AND (valid_from_utc IS NULL OR valid_from_utc <= ?4)
               AND (valid_until_utc IS NULL OR valid_until_utc > ?4)
             ORDER BY (barber_user_id IS NOT NULL) DESC, (service_id IS NOT NULL) DESC, priority DESC, created_at_utc DESC
             LIMIT 1",
            params![current.business_id, current.barber_user_id, current.service_id, current.starts_at],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    match rule {
        Some((rule_id, rule_type, rule_amount)) => {
            let commission_cents = if rule_type == "percent" {
                (current.price_cents * rule_amount + 5_000) / 10_000
            } else {
                rule_amount
            };
            transaction.execute(
        "INSERT INTO commission_snapshots(business_id, appointment_id, barber_user_id, rule_id, rule_type, rule_amount,
         base_cents, amount_cents, status, created_at_utc)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'posted', ?9) ON CONFLICT(business_id, appointment_id) DO UPDATE SET rule_id=excluded.rule_id, rule_type=excluded.rule_type, rule_amount=excluded.rule_amount, amount_cents=excluded.amount_cents, status='posted', error_code=NULL",
        params![current.business_id, current.id, current.barber_user_id, rule_id, rule_type, rule_amount, current.price_cents, commission_cents, now],
            )?;
            transaction.execute(
        "INSERT INTO financial_entries(id, business_id, appointment_id, kind, amount_cents, status, created_at_utc)
         VALUES (?1, ?2, ?3, 'commission', ?4, 'posted', ?5) ON CONFLICT(business_id, appointment_id, kind) DO UPDATE SET amount_cents=excluded.amount_cents, status='posted'",
        params![new_id(), current.business_id, current.id, commission_cents, now],
            )?;
        }
        None => {
            let exists: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM commission_snapshots WHERE business_id=?1 AND appointment_id=?2)", params![current.business_id,current.id], |row| row.get(0))?;
            if exists {
                return Ok(());
            }
            transaction.execute(
        "INSERT INTO commission_snapshots(business_id, appointment_id, barber_user_id, base_cents, status, error_code, created_at_utc)
         VALUES (?1, ?2, ?3, ?4, 'pending_configuration', 'COMMISSION_RULE_MISSING', ?5)",
        params![current.business_id, current.id, current.barber_user_id, current.price_cents, now],
            )?;
            transaction.execute(
        "INSERT INTO financial_entries(id, business_id, appointment_id, kind, amount_cents, status, created_at_utc)
         VALUES (?1, ?2, ?3, 'commission', NULL, 'pending_configuration', ?4)",
        params![new_id(), current.business_id, current.id, now],
            )?;
        }
    }
    Ok(())
}
