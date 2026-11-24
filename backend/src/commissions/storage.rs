use rusqlite::{Connection, params};

pub(super) struct PayableCommission {
    pub appointment_id: String,
    pub barber_id: String,
    pub amount_cents: i64,
    /// Ajuste de correção administrativa ainda não repassado (pode ser negativo).
    pub adjustment_id: Option<String>,
}

/// Eligibility is shared by displayed balances and the payment transaction.
/// Pending configuration and commissions already linked to a payout are excluded.
/// Open correction adjustments of already paid commissions are part of the balance.
pub(super) fn payable_commissions(
    connection: &Connection,
    business_id: &str,
    barber_id: Option<&str>,
) -> rusqlite::Result<Vec<PayableCommission>> {
    let mut query = connection.prepare(
        "SELECT c.appointment_id,c.barber_user_id,c.amount_cents,NULL FROM commission_snapshots c
         WHERE c.business_id=?1 AND (?2 IS NULL OR c.barber_user_id=?2) AND c.status='posted'
         AND NOT EXISTS(SELECT 1 FROM commission_payout_items p
                        WHERE p.business_id=c.business_id AND p.appointment_id=c.appointment_id)
         UNION ALL
         SELECT j.appointment_id,j.barber_user_id,j.amount_cents,j.id FROM commission_adjustments j
         WHERE j.business_id=?1 AND (?2 IS NULL OR j.barber_user_id=?2) AND j.payout_id IS NULL",
    )?;
    query
        .query_map(params![business_id, barber_id], |row| {
            Ok(PayableCommission {
                appointment_id: row.get(0)?,
                barber_id: row.get(1)?,
                amount_cents: row.get(2)?,
                adjustment_id: row.get(3)?,
            })
        })?
        .collect()
}
