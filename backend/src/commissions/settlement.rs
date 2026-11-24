// The caller owns the transaction. Never commit settlement independently.
use super::{Settlement, new_id};
use rusqlite::{OptionalExtension, params};

type MatchedRule = (String, String, i64);

/// Most specific active rule valid at the appointment start.
fn find_rule(
    transaction: &rusqlite::Transaction<'_>,
    business_id: &str,
    barber_user_id: &str,
    service_id: &str,
    starts_at: &str,
) -> rusqlite::Result<Option<MatchedRule>> {
    transaction
        .query_row(
            "SELECT id, rule_type, amount FROM commission_rules
             WHERE business_id = ?1 AND active = 1
               AND (barber_user_id IS NULL OR barber_user_id = ?2)
               AND (service_id IS NULL OR service_id = ?3)
               AND (valid_from_utc IS NULL OR valid_from_utc <= ?4)
               AND (valid_until_utc IS NULL OR valid_until_utc > ?4)
             ORDER BY (barber_user_id IS NOT NULL) DESC, (service_id IS NOT NULL) DESC, priority DESC, created_at_utc DESC
             LIMIT 1",
            params![business_id, barber_user_id, service_id, starts_at],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
}

/// Percent amounts are basis points rounded half up; fixed amounts are cents.
fn commission_for(rule_type: &str, rule_amount: i64, price_cents: i64) -> i64 {
    if rule_type == "percent" {
        (price_cents * rule_amount + 5_000) / 10_000
    } else {
        rule_amount
    }
}

fn post(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
    rule: (Option<&str>, Option<&str>, Option<i64>),
    commission_cents: i64,
    now: &str,
) -> rusqlite::Result<()> {
    let (rule_id, rule_type, rule_amount) = rule;
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
    Ok(())
}

fn mark_pending(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
    now: &str,
) -> rusqlite::Result<()> {
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
    Ok(())
}

/// Posts the commission once. An appointment closed with several services is
/// settled line by line, so each service follows its own rule; otherwise the
/// single booked service and price are used exactly as before.
pub(crate) fn settle_commission(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
    now: &str,
) -> rusqlite::Result<()> {
    let posted: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM commission_snapshots WHERE business_id=?1 AND appointment_id=?2 AND status='posted')", params![current.business_id,current.id], |row| row.get(0))?;
    if posted {
        return Ok(());
    }
    let lines = load_lines(transaction, current)?;
    if lines.is_empty() {
        return match find_rule(
            transaction,
            &current.business_id,
            &current.barber_user_id,
            &current.service_id,
            &current.starts_at,
        )? {
            Some((rule_id, rule_type, rule_amount)) => {
                let commission_cents = commission_for(&rule_type, rule_amount, current.price_cents);
                post(
                    transaction,
                    current,
                    (
                        Some(rule_id.as_str()),
                        Some(rule_type.as_str()),
                        Some(rule_amount),
                    ),
                    commission_cents,
                    now,
                )
            }
            None => mark_pending(transaction, current, now),
        };
    }
    // One unconfigured service keeps the whole commission pending, never partially paid.
    let Some(matched) = match_lines(transaction, current, &lines)? else {
        return mark_pending(transaction, current, now);
    };
    let total = write_line_commissions(transaction, current, &matched)?;
    post(transaction, current, shared_rule(&matched), total, now)
}

type MatchedLine = (String, MatchedRule, i64);

fn load_lines(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
) -> rusqlite::Result<Vec<(String, String, i64)>> {
    let mut query = transaction.prepare(
        "SELECT id, service_id, price_cents FROM appointment_services
         WHERE business_id = ?1 AND appointment_id = ?2 ORDER BY position",
    )?;
    query
        .query_map(params![current.business_id, current.id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .collect()
}

/// Rule and commission for every line, or None when any service has no rule.
fn match_lines(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
    lines: &[(String, String, i64)],
) -> rusqlite::Result<Option<Vec<MatchedLine>>> {
    let mut matched = Vec::with_capacity(lines.len());
    for (line_id, service_id, price_cents) in lines {
        match find_rule(
            transaction,
            &current.business_id,
            &current.barber_user_id,
            service_id,
            &current.starts_at,
        )? {
            Some(rule) => {
                let cents = commission_for(&rule.1, rule.2, *price_cents);
                matched.push((line_id.clone(), rule, cents));
            }
            None => return Ok(None),
        }
    }
    Ok(Some(matched))
}

fn write_line_commissions(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
    matched: &[MatchedLine],
) -> rusqlite::Result<i64> {
    let mut total = 0_i64;
    for (line_id, (rule_id, _, _), cents) in matched {
        transaction.execute(
            "UPDATE appointment_services SET commission_rule_id = ?1, commission_cents = ?2
             WHERE business_id = ?3 AND id = ?4",
            params![rule_id, cents, current.business_id, line_id],
        )?;
        total += cents;
    }
    Ok(total)
}

/// One rule for every line is recorded on the snapshot; mixed rules live per line.
fn shared_rule(matched: &[MatchedLine]) -> (Option<&str>, Option<&str>, Option<i64>) {
    let first = &matched[0].1;
    if matched.iter().all(|(_, rule, _)| rule.0 == first.0) {
        (
            Some(first.0.as_str()),
            Some(first.1.as_str()),
            Some(first.2),
        )
    } else {
        (None, None, None)
    }
}

/// Como a comissão foi tratada numa correção administrativa.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CorrectionCommission {
    /// Ainda não repassada: snapshot e lançamento atualizados.
    Recalculated {
        previous: Option<i64>,
        new: i64,
    },
    /// Já repassada: o registro pago fica intacto e a diferença vira um ajuste.
    Adjusted {
        previous: i64,
        new: i64,
    },
    /// Algum serviço sem regra: comissão não repassada volta a aguardar configuração.
    Pending {
        previous: Option<i64>,
    },
    Unchanged {
        amount: Option<i64>,
    },
}

impl CorrectionCommission {
    pub(crate) fn treatment(self) -> &'static str {
        match self {
            Self::Recalculated { .. } => "recalculated",
            Self::Adjusted { .. } => "adjustment",
            Self::Pending { .. } => "pending",
            Self::Unchanged { .. } => "unchanged",
        }
    }
    pub(crate) fn amounts(self) -> (Option<i64>, Option<i64>) {
        match self {
            Self::Recalculated { previous, new } => (previous, Some(new)),
            Self::Adjusted { previous, new } => (Some(previous), Some(new)),
            Self::Pending { previous } => (previous, None),
            Self::Unchanged { amount } => (amount, amount),
        }
    }
}

/// Recalcula a comissão depois que as linhas e o preço do atendimento foram
/// corrigidos. Retorna None quando a comissão já foi repassada e algum serviço
/// não tem regra: nesse caso não há como calcular o ajuste e a correção deve ser
/// recusada. O chamador é dono da transação e registra a correção com o mesmo id.
pub(crate) fn recalculate_after_correction(
    transaction: &rusqlite::Transaction<'_>,
    current: &Settlement,
    correction_id: &str,
    now: &str,
) -> rusqlite::Result<Option<CorrectionCommission>> {
    let snapshot: Option<(String, Option<i64>)> = transaction
        .query_row(
            "SELECT status, amount_cents FROM commission_snapshots WHERE business_id = ?1 AND appointment_id = ?2",
            params![current.business_id, current.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let paid: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM commission_payout_items WHERE business_id = ?1 AND appointment_id = ?2)",
        params![current.business_id, current.id],
        |row| row.get(0),
    )?;
    let lines = load_lines(transaction, current)?;
    let matched = match_lines(transaction, current, &lines)?;
    if paid {
        let Some(matched) = matched else {
            return Ok(None);
        };
        let adjustments: i64 = transaction.query_row(
            "SELECT COALESCE(SUM(amount_cents), 0) FROM commission_adjustments WHERE business_id = ?1 AND appointment_id = ?2",
            params![current.business_id, current.id],
            |row| row.get(0),
        )?;
        let previous = snapshot.and_then(|(_, amount)| amount).unwrap_or(0) + adjustments;
        let new = write_line_commissions(transaction, current, &matched)?;
        let delta = new - previous;
        if delta == 0 {
            return Ok(Some(CorrectionCommission::Unchanged {
                amount: Some(previous),
            }));
        }
        transaction.execute(
            "INSERT INTO commission_adjustments(id, business_id, appointment_id, barber_user_id, correction_id, amount_cents, created_at_utc)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![new_id(), current.business_id, current.id, current.barber_user_id, correction_id, delta, now],
        )?;
        return Ok(Some(CorrectionCommission::Adjusted { previous, new }));
    }
    let previous = snapshot
        .as_ref()
        .filter(|(status, _)| status == "posted")
        .and_then(|(_, amount)| *amount);
    let Some(matched) = matched else {
        transaction.execute(
            "UPDATE appointment_services SET commission_rule_id = NULL, commission_cents = NULL
             WHERE business_id = ?1 AND appointment_id = ?2",
            params![current.business_id, current.id],
        )?;
        if snapshot.is_some() {
            transaction.execute(
                "UPDATE commission_snapshots SET status = 'pending_configuration', error_code = 'COMMISSION_RULE_MISSING',
                 rule_id = NULL, rule_type = NULL, rule_amount = NULL, amount_cents = NULL, base_cents = ?1
                 WHERE business_id = ?2 AND appointment_id = ?3",
                params![current.price_cents, current.business_id, current.id],
            )?;
            transaction.execute(
                "UPDATE financial_entries SET amount_cents = NULL, status = 'pending_configuration'
                 WHERE business_id = ?1 AND appointment_id = ?2 AND kind = 'commission'",
                params![current.business_id, current.id],
            )?;
        } else {
            mark_pending(transaction, current, now)?;
        }
        return Ok(Some(CorrectionCommission::Pending { previous }));
    };
    let new = write_line_commissions(transaction, current, &matched)?;
    post(transaction, current, shared_rule(&matched), new, now)?;
    transaction.execute(
        "UPDATE commission_snapshots SET base_cents = ?1 WHERE business_id = ?2 AND appointment_id = ?3",
        params![current.price_cents, current.business_id, current.id],
    )?;
    Ok(Some(if previous == Some(new) {
        CorrectionCommission::Unchanged { amount: Some(new) }
    } else {
        CorrectionCommission::Recalculated { previous, new }
    }))
}
