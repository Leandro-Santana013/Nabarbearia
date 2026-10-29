use super::{Error, require_owner, utc_text};
use crate::{
    db::Db,
    models::{AuthUser, RevenueReport, Role},
};
use chrono::{DateTime, Utc};
use rusqlite::params;
use serde_json::{Value, json};

/// Production follows appointment start dates; the payable balance is all-time.
pub async fn owner_summary(
    db: &Db,
    actor: AuthUser,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<Value, Error> {
    require_owner(&actor)?;
    let business = actor.business_id;
    let from = utc_text(from);
    let to = utc_text(to);
    db.with_conn(move |connection| {
        let snapshot = connection.transaction()?;
        let result = read_owner_summary(&snapshot, &business, &from, &to)?;
        snapshot.commit()?;
        Ok(result)
    })
    .await
}

fn read_owner_summary(
    connection: &rusqlite::Connection,
    business: &str,
    from: &str,
    to: &str,
) -> Result<Value, Error> {
    let totals: (i64,i64,i64,i64,i64,i64) = connection.query_row(
            "SELECT COALESCE(SUM(CASE WHEN a.status='completed' THEN a.price_cents ELSE 0 END),0), COUNT(*), COALESCE(SUM(a.status='completed'),0), COALESCE(SUM(a.status='no_show'),0), COALESCE(SUM(CASE WHEN a.status='completed' AND c.status='posted' THEN c.amount_cents ELSE 0 END),0), COALESCE(SUM(a.status='completed' AND (c.status IS NULL OR c.status <> 'posted')),0) FROM appointments a LEFT JOIN commission_snapshots c ON c.business_id=a.business_id AND c.appointment_id=a.id WHERE a.business_id=?1 AND a.starts_at_utc>=?2 AND a.starts_at_utc<?3 AND a.status<>'cancelled'",
            params![business,from,to], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)))?;
    let payable = super::storage::payable_commissions(connection, business, None)?;
    let outstanding: i64 = payable.iter().map(|item| item.amount_cents).sum();
    let mut team_query = connection.prepare("SELECT u.id,u.display_name,u.email,p.photo_url,p.active FROM users u JOIN barber_profiles p ON p.business_id=u.business_id AND p.user_id=u.id WHERE u.business_id=?1 ORDER BY u.display_name")?;
    let team_base = team_query
        .query_map(params![business], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, bool>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut team = Vec::new();
    for (id, name, email, photo, active) in team_base {
        let (count,revenue):(i64,i64) = connection.query_row("SELECT COUNT(*),COALESCE(SUM(price_cents),0) FROM appointments WHERE business_id=?1 AND barber_user_id=?2 AND starts_at_utc>=?3 AND starts_at_utc<?4 AND status='completed'",params![business,id,from,to],|r|Ok((r.get(0)?,r.get(1)?)))?;
        let balance: i64 = payable
            .iter()
            .filter(|item| item.barber_id == id)
            .map(|item| item.amount_cents)
            .sum();
        team.push(json!({"id":id,"name":name,"email":email,"photo_url":photo,"active":active,"completed_count":count,"revenue_cents":revenue,"outstanding_cents":balance}));
    }
    let mut rules_query=connection.prepare("SELECT id,barber_user_id,service_id,rule_type,amount,valid_from_utc,valid_until_utc FROM commission_rules WHERE business_id=?1 AND active=1 ORDER BY priority DESC,created_at_utc DESC")?;
    let rules=rules_query.query_map(params![business],|r|Ok(json!({"id":r.get::<_,String>(0)?,"barber_id":r.get::<_,Option<String>>(1)?,"service_id":r.get::<_,Option<String>>(2)?,"rule_type":r.get::<_,String>(3)?,"amount":r.get::<_,i64>(4)?,"valid_from":r.get::<_,Option<String>>(5)?,"valid_until":r.get::<_,Option<String>>(6)?})))?.collect::<Result<Vec<_>,_>>()?;
    let mut payments_query=connection.prepare("SELECT COALESCE(NULLIF(payment_method,''),'Não informado'),COUNT(*),SUM(price_cents) FROM appointments WHERE business_id=?1 AND status='completed' AND starts_at_utc>=?2 AND starts_at_utc<?3 GROUP BY payment_method")?;
    let payments=payments_query.query_map(params![business,from,to],|r|Ok(json!({"method":r.get::<_,String>(0)?,"count":r.get::<_,i64>(1)?,"amount_cents":r.get::<_,i64>(2)?})))?.collect::<Result<Vec<_>,_>>()?;
    let mut payouts_query=connection.prepare("SELECT p.id,u.display_name,p.amount_cents,p.created_at_utc FROM commission_payouts p JOIN users u ON u.business_id=p.business_id AND u.id=p.barber_user_id WHERE p.business_id=?1 AND p.created_at_utc>=?2 AND p.created_at_utc<?3 ORDER BY p.created_at_utc DESC LIMIT 100")?;
    let payouts=payouts_query.query_map(params![business,from,to],|r|Ok(json!({"id":r.get::<_,String>(0)?,"barber_name":r.get::<_,String>(1)?,"amount_cents":r.get::<_,i64>(2)?,"created_at":r.get::<_,String>(3)?})))?.collect::<Result<Vec<_>,_>>()?;
    Ok(
        json!({"revenue_cents":totals.0,"total_count":totals.1,"completed_count":totals.2,"no_show_count":totals.3,"commission_cents":totals.4,"commission_pending_count":totals.5,"outstanding_cents":outstanding,"retained_cents":totals.0-totals.4,"team":team,"rules":rules,"payments":payments,"payouts":payouts}),
    )
}

/// Earnings follow completion dates and include paid commissions as production.
/// Owners see the business; barbers see only their own completed work.
pub async fn earnings(
    db: &Db,
    actor: AuthUser,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> Result<RevenueReport, Error> {
    let barber_user_id = if actor.roles.contains(&Role::Owner) {
        None
    } else if actor.roles.contains(&Role::Barber) {
        Some(actor.id)
    } else {
        return Err(Error::forbidden());
    };
    let business_id = actor.business_id;
    let from = from.map(utc_text);
    let to = to.map(utc_text);
    db.with_conn(move |connection| {
        let snapshot = connection.transaction()?;
        let report = read_earnings(&snapshot, &business_id, from, to, barber_user_id)?;
        snapshot.commit()?;
        Ok(report)
    })
    .await
}

fn read_earnings(
    connection: &rusqlite::Connection,
    business_id: &str,
    from: Option<String>,
    to: Option<String>,
    barber_user_id: Option<String>,
) -> Result<RevenueReport, Error> {
    let completed_count: i64 = connection.query_row(
                "SELECT COUNT(*) FROM appointments WHERE business_id = ?1 AND status = 'completed'
                 AND (?2 IS NULL OR completed_at_utc >= ?2) AND (?3 IS NULL OR completed_at_utc < ?3)
                 AND (?4 IS NULL OR barber_user_id = ?4)",
                params![business_id, from, to, barber_user_id],
                |row| row.get(0),
            )?;
    let revenue_cents: i64 = connection.query_row(
                "SELECT COALESCE(SUM(f.amount_cents), 0) FROM financial_entries f
                 JOIN appointments a ON a.id = f.appointment_id AND a.business_id = f.business_id
                 WHERE f.business_id = ?1 AND f.kind = 'revenue' AND f.status = 'posted' AND a.status = 'completed'
                   AND (?2 IS NULL OR a.completed_at_utc >= ?2) AND (?3 IS NULL OR a.completed_at_utc < ?3)
                   AND (?4 IS NULL OR a.barber_user_id = ?4)",
                params![business_id, from, to, barber_user_id],
                |row| row.get(0),
            )?;
    let commission_cents: i64 = connection.query_row(
                "SELECT COALESCE(SUM(f.amount_cents), 0) FROM financial_entries f
                 JOIN appointments a ON a.id = f.appointment_id AND a.business_id = f.business_id
                 WHERE f.business_id = ?1 AND f.kind = 'commission' AND f.status = 'posted' AND a.status = 'completed'
                   AND (?2 IS NULL OR a.completed_at_utc >= ?2) AND (?3 IS NULL OR a.completed_at_utc < ?3)
                   AND (?4 IS NULL OR a.barber_user_id = ?4)",
                params![business_id, from, to, barber_user_id],
                |row| row.get(0),
            )?;
    let commission_pending_count: i64 = connection.query_row(
                "SELECT COUNT(*) FROM commission_snapshots c
                 JOIN appointments a ON a.id = c.appointment_id AND a.business_id = c.business_id
                 WHERE c.business_id = ?1 AND c.status = 'pending_configuration' AND a.status = 'completed'
                   AND (?2 IS NULL OR a.completed_at_utc >= ?2) AND (?3 IS NULL OR a.completed_at_utc < ?3)
                   AND (?4 IS NULL OR a.barber_user_id = ?4)",
                params![business_id, from, to, barber_user_id],
                |row| row.get(0),
            )?;
    Ok(RevenueReport {
        completed_count,
        revenue_cents,
        commission_cents,
        commission_pending_count,
    })
}
