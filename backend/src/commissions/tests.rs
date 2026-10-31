use super::{
    Error, Payout, Rule, create_rule, earnings, new_id, owner_summary, record_payout, utc_text,
};
use crate::{
    appointments,
    db::Db,
    models::{AppointmentResponse, AuthUser, CommissionRuleType, Role},
};
use chrono::{DateTime, Duration, Utc};
use rusqlite::params;
use serde_json::Value;

struct Fixture {
    db: Db,
    owner: AuthUser,
    barber: AuthUser,
    other_barber: AuthUser,
    client: AuthUser,
    service: String,
    starts: DateTime<Utc>,
}

async fn fixture(db: Db) -> Fixture {
    let business = new_id();
    let user = |role| AuthUser {
        phone: String::new(),
        id: new_id(),
        business_id: business.clone(),
        email: format!("{}@test.invalid", new_id()),
        display_name: "Finance Test".into(),
        roles: vec![role],
    };
    let owner = user(Role::Owner);
    let barber = user(Role::Barber);
    let other_barber = user(Role::Barber);
    let client = user(Role::Client);
    let users = [
        owner.clone(),
        barber.clone(),
        other_barber.clone(),
        client.clone(),
    ];
    let service = new_id();
    let service_id = service.clone();
    db.with_conn(move |c| -> Result<(), Error> {
        let now = utc_text(Utc::now());
        c.execute("INSERT INTO businesses(id,name,timezone,created_at_utc,updated_at_utc) VALUES (?1,'Finance Shop','America/Sao_Paulo',?2,?2)",params![business,now])?;
        for u in users {
            c.execute("INSERT INTO users(id,business_id,email,password_hash,display_name,created_at_utc,updated_at_utc) VALUES (?1,?2,?3,'!disabled-test-identity-without-login!',?4,?5,?5)",params![u.id,business,u.email,u.display_name,now])?;
            let role = match u.roles[0] { Role::Owner=>"owner", Role::Barber=>"barber", Role::Client=>"client" };
            c.execute("INSERT INTO user_roles(business_id,user_id,role,created_at_utc) VALUES (?1,?2,?3,?4)",params![business,u.id,role,now])?;
            if u.roles.contains(&Role::Barber) {
                c.execute("INSERT INTO barber_profiles(business_id,user_id,created_at_utc,updated_at_utc) VALUES (?1,?2,?3,?3)",params![business,u.id,now])?;
                for day in 0..7 {
                    c.execute("INSERT INTO weekly_schedules(id,business_id,barber_user_id,weekday,start_minute,end_minute,created_at_utc) VALUES (?1,?2,?3,?4,0,1439,?5)",params![new_id(),business,u.id,day,now])?;
                }
            }
        }
        c.execute("INSERT INTO services(id,business_id,name,price_cents,duration_minutes,created_at_utc,updated_at_utc) VALUES (?1,?2,'Corte',5001,30,?3,?3)",params![service_id,business,now])?;
        Ok(())
    }).await.unwrap();
    Fixture {
        db,
        owner,
        barber,
        other_barber,
        client,
        service,
        starts: (Utc::now().date_naive() + Duration::days(1))
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_utc(),
    }
}

impl Fixture {
    fn rule(&self, amount: i64) -> Rule {
        Rule {
            barber_id: None,
            service_id: None,
            rule_type: CommissionRuleType::Fixed,
            amount,
            priority: 0,
            valid_from: None,
            valid_until: None,
        }
    }
    async fn add(&self, rule: Rule) {
        create_rule(&self.db, self.owner.clone(), rule)
            .await
            .unwrap();
    }
    async fn complete_for(&self, hour: i64, barber: &AuthUser) -> AppointmentResponse {
        let appointment = appointments::create(
            &self.db,
            self.client.clone(),
            appointments::Booking {
                barber_id: barber.id.clone(),
                service_id: self.service.clone(),
                starts_at: self.starts + Duration::hours(hour),
                idempotency: appointments::Idempotency {
                    key: format!("financial-test-{}", new_id()),
                    request_hash: crate::security::hash_token(&format!("{hour}")),
                },
            },
        )
        .await
        .unwrap();
        appointments::complete(&self.db, self.owner.clone(), appointment.id, String::new())
            .await
            .unwrap()
    }
    async fn complete(&self, hour: i64) -> AppointmentResponse {
        self.complete_for(hour, &self.barber).await
    }
    fn payout(&self, amount: i64, key: &str) -> Payout {
        Payout {
            barber_id: self.barber.id.clone(),
            expected_amount_cents: amount,
            idempotency_key: format!("financial-payout-{key}"),
        }
    }
    async fn pay(&self, amount: i64, key: &str) -> Result<Value, Error> {
        record_payout(&self.db, self.owner.clone(), self.payout(amount, key)).await
    }
    async fn summary(&self) -> Value {
        owner_summary(
            &self.db,
            self.owner.clone(),
            self.starts - Duration::days(1),
            self.starts + Duration::days(2),
        )
        .await
        .unwrap()
    }
    async fn sql(&self, sql: &str) {
        let sql = sql.to_owned();
        self.db
            .with_conn(move |c| -> Result<(), Error> {
                c.execute_batch(&sql)?;
                Ok(())
            })
            .await
            .unwrap();
    }
}

async fn snapshot(db: &Db) -> Vec<Vec<Vec<String>>> {
    db.with_conn(|c| -> Result<_, Error> {
        let mut result = Vec::new();
        for table in [
            "appointments",
            "appointment_history",
            "service_executions",
            "commission_rules",
            "commission_snapshots",
            "financial_entries",
            "commission_payouts",
            "commission_payout_items",
            "audit_log",
        ] {
            let mut q = c.prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))?;
            let count = q.column_count();
            result.push(
                q.query_map([], |r| {
                    (0..count)
                        .map(|i| r.get_ref(i).map(|v| format!("{v:?}")))
                        .collect::<Result<Vec<_>, _>>()
                })?
                .collect::<Result<Vec<_>, _>>()?,
            );
        }
        Ok(result)
    })
    .await
    .unwrap()
}

fn rejected<T>(result: Result<T, Error>, expected: &str) {
    assert!(
        matches!(result,Err(Error::Rejected { code,.. }) if code==expected),
        "expected {expected}"
    );
}

#[tokio::test]
async fn specificity_precedes_priority_and_barber_precedes_service() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let mut general = f.rule(100);
    general.priority = 1000;
    f.add(general).await;
    assert_eq!(f.complete(0).await.commission_cents, Some(100));
    let mut service = f.rule(200);
    service.service_id = Some(f.service.clone());
    service.priority = 1000;
    f.add(service).await;
    assert_eq!(f.complete(1).await.commission_cents, Some(200));
    let mut barber = f.rule(300);
    barber.barber_id = Some(f.barber.id.clone());
    barber.priority = -1000;
    f.add(barber).await;
    assert_eq!(f.complete(2).await.commission_cents, Some(300));
    let mut both = f.rule(400);
    both.barber_id = Some(f.barber.id.clone());
    both.service_id = Some(f.service.clone());
    both.priority = -1000;
    f.add(both).await;
    assert_eq!(f.complete(3).await.commission_cents, Some(400));
    assert_eq!(
        f.complete_for(4, &f.other_barber).await.commission_cents,
        Some(200)
    );
}

#[tokio::test]
async fn priority_then_creation_time_break_ties_and_equivalent_rules_are_replaced() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.add(f.rule(100)).await;
    let mut higher = f.rule(200);
    higher.priority = 1;
    f.add(higher).await;
    assert_eq!(f.complete(0).await.commission_cents, Some(200));
    // Same specificity/priority, overlapping but non-equivalent validity intervals.
    f.sql("UPDATE commission_rules SET created_at_utc='2000-01-01T00:00:00Z'")
        .await;
    let mut newer = f.rule(300);
    newer.priority = 1;
    newer.valid_from = Some(f.starts);
    f.add(newer).await;
    assert_eq!(f.complete(1).await.commission_cents, Some(300));
    let mut replacement = f.rule(400);
    replacement.priority = 1;
    replacement.valid_from = Some(f.starts);
    f.add(replacement).await;
    assert_eq!(f.complete(2).await.commission_cents, Some(400));
    let summary = f.summary().await;
    assert_eq!(summary["rules"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn percent_rounding_fixed_above_price_and_zero_keep_current_cent_policy() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let mut percent = f.rule(5000);
    percent.rule_type = CommissionRuleType::Percent;
    f.add(percent).await;
    assert_eq!(f.complete(0).await.commission_cents, Some(2501));
    f.add(f.rule(10000)).await;
    assert_eq!(f.complete(1).await.commission_cents, Some(10000));
    f.add(f.rule(0)).await;
    assert_eq!(f.complete(2).await.commission_cents, Some(0));
    assert_eq!(f.summary().await["outstanding_cents"], 12501);
}

#[tokio::test]
async fn validity_uses_historical_start_inclusive_from_exclusive_until() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.add(f.rule(100)).await;
    let mut scoped = f.rule(200);
    scoped.priority = 1;
    scoped.valid_from = Some(f.starts + Duration::hours(1));
    scoped.valid_until = Some(f.starts + Duration::hours(2));
    f.add(scoped).await;
    assert_eq!(f.complete(0).await.commission_cents, Some(100));
    assert_eq!(f.complete(1).await.commission_cents, Some(200));
    assert_eq!(f.complete(2).await.commission_cents, Some(100));
}

#[tokio::test]
async fn missing_configuration_regularizes_once_and_preserves_posted_history_and_price() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let first = f.complete(0).await;
    assert_eq!(first.commission_cents, None);
    assert_eq!(f.summary().await["commission_pending_count"], 1);
    assert_eq!(f.summary().await["outstanding_cents"], 0);
    let before = snapshot(&f.db).await;
    rejected(f.pay(1, "pending").await, "BALANCE_CHANGED");
    assert_eq!(before, snapshot(&f.db).await);
    let mut other = f.rule(500);
    other.barber_id = Some(f.other_barber.id.clone());
    f.add(other).await;
    let mut expired = f.rule(600);
    expired.valid_until = Some(f.starts);
    f.add(expired).await;
    assert_eq!(f.summary().await["commission_pending_count"], 1);
    f.sql("UPDATE services SET price_cents=9000").await;
    let mut percent = f.rule(5000);
    percent.rule_type = CommissionRuleType::Percent;
    f.add(percent).await;
    let summary = f.summary().await;
    assert_eq!(summary["commission_pending_count"], 0);
    assert_eq!(summary["commission_cents"], 2501);
    f.add(f.rule(8000)).await;
    assert_eq!(f.summary().await["commission_cents"], 2501);
    let before_retry = snapshot(&f.db).await;
    f.db.with_conn(move |c| -> Result<(), Error> {
        let tx = c.transaction()?;
        super::settle_commission(&tx, &(&first).into(), &utc_text(Utc::now()))?;
        tx.commit()?;
        Ok(())
    })
    .await
    .unwrap();
    assert_eq!(before_retry, snapshot(&f.db).await);
    let report = earnings(&f.db, f.barber.clone(), None, None).await.unwrap();
    assert_eq!(report.revenue_cents, 5001);
    assert_eq!(report.commission_cents, 2501);
    assert_eq!(report.commission_pending_count, 0);
    let after = snapshot(&f.db).await;
    assert_eq!(after[4].len(), 1);
    assert_eq!(after[5].len(), 2);
}

#[tokio::test]
async fn regularization_failure_rolls_back_rule_replacement_and_every_pending_item() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.complete(0).await;
    f.complete(1).await;
    // This rule matches neither pending appointment and must survive failed regularization.
    let mut rule = f.rule(100);
    rule.valid_from = Some(f.starts + Duration::days(2));
    f.add(rule).await;
    let before = snapshot(&f.db).await;
    f.sql("CREATE TRIGGER fail_second_regularization BEFORE UPDATE ON commission_snapshots WHEN (SELECT COUNT(*) FROM commission_snapshots WHERE status='posted')=1 BEGIN SELECT RAISE(ABORT,'injected regularization failure'); END;").await;
    assert!(
        create_rule(&f.db, f.owner.clone(), f.rule(200))
            .await
            .is_err()
    );
    assert_eq!(before, snapshot(&f.db).await);
    f.sql("DROP TRIGGER fail_second_regularization").await;
    f.add(f.rule(200)).await;
    assert_eq!(f.summary().await["outstanding_cents"], 400);
    let before_replacement = snapshot(&f.db).await;
    f.sql("CREATE TRIGGER fail_rule_audit BEFORE INSERT ON audit_log WHEN NEW.action='commission_rule.created' BEGIN SELECT RAISE(ABORT,'injected rule audit failure'); END;").await;
    assert!(
        create_rule(&f.db, f.owner.clone(), f.rule(300))
            .await
            .is_err()
    );
    assert_eq!(before_replacement, snapshot(&f.db).await);
    f.sql("DROP TRIGGER fail_rule_audit").await;
}

#[tokio::test]
async fn changed_balance_and_reused_keys_do_not_pay_twice_or_consume_new_earnings() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.add(f.rule(200)).await;
    f.complete(0).await;
    f.complete(1).await;
    let before = snapshot(&f.db).await;
    rejected(f.pay(200, "stale").await, "BALANCE_CHANGED");
    assert_eq!(before, snapshot(&f.db).await);
    let paid = f.pay(400, "successful").await.unwrap();
    let after = snapshot(&f.db).await;
    assert_eq!(paid, f.pay(400, "successful").await.unwrap());
    rejected(f.pay(400, "another").await, "BALANCE_CHANGED");
    rejected(f.pay(200, "successful").await, "IDEMPOTENCY_KEY_REUSED");
    let mut changed = f.payout(400, "successful");
    changed.barber_id = f.other_barber.id.clone();
    rejected(
        record_payout(&f.db, f.owner.clone(), changed).await,
        "IDEMPOTENCY_KEY_REUSED",
    );
    assert_eq!(after, snapshot(&f.db).await);
    f.complete(2).await;
    assert_eq!(paid, f.pay(400, "successful").await.unwrap());
    assert_eq!(f.summary().await["outstanding_cents"], 200);
    f.pay(200, "next").await.unwrap();
    assert_eq!(f.summary().await["outstanding_cents"], 0);
}

#[tokio::test]
async fn payout_failure_rolls_back_header_items_and_audit_before_retry() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.add(f.rule(200)).await;
    f.complete(0).await;
    f.complete(1).await;
    let before = snapshot(&f.db).await;
    for (trigger, ddl) in [
        (
            "fail_item",
            "CREATE TRIGGER fail_item BEFORE INSERT ON commission_payout_items WHEN (SELECT COUNT(*) FROM commission_payout_items)=1 BEGIN SELECT RAISE(ABORT,'injected item failure'); END;",
        ),
        (
            "fail_audit",
            "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log WHEN NEW.action='commission.payout_recorded' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;",
        ),
    ] {
        f.sql(ddl).await;
        assert!(f.pay(400, "rollback").await.is_err());
        assert_eq!(before, snapshot(&f.db).await);
        f.sql(&format!("DROP TRIGGER {trigger}")).await;
    }
    f.pay(400, "rollback").await.unwrap();
    let after = snapshot(&f.db).await;
    assert_eq!(after[6].len(), 1);
    assert_eq!(after[7].len(), 2);
}

#[tokio::test]
async fn independent_connections_serialize_retries_and_competing_payout_keys() {
    let directory = std::env::temp_dir().join(format!("na-finance-{}", new_id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("test.db");
    {
        let f = fixture(Db::open(&path).unwrap()).await;
        let second = Db::open(&path).unwrap();
        f.add(f.rule(200)).await;
        f.complete(0).await;
        let (a, b) = tokio::join!(
            f.pay(200, "same"),
            record_payout(&second, f.owner.clone(), f.payout(200, "same"))
        );
        assert_eq!(a.unwrap(), b.unwrap());
        f.complete(1).await;
        let (a, b) = tokio::join!(
            f.pay(200, "first"),
            record_payout(&second, f.owner.clone(), f.payout(200, "second"))
        );
        assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
        rejected(if a.is_err() { a } else { b }, "BALANCE_CHANGED");
        let state = snapshot(&f.db).await;
        assert_eq!(state[6].len(), 2);
        assert_eq!(state[7].len(), 2);
    }
    std::fs::remove_dir_all(&directory).unwrap();
}

#[tokio::test]
async fn permissions_and_business_boundaries_cover_rules_payouts_and_projections() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let other = fixture(f.db.clone()).await;
    let before = snapshot(&f.db).await;
    for actor in [f.client.clone(), f.barber.clone()] {
        rejected(
            create_rule(&f.db, actor.clone(), f.rule(200)).await,
            "FORBIDDEN",
        );
        rejected(
            record_payout(&f.db, actor.clone(), f.payout(200, "denied")).await,
            "FORBIDDEN",
        );
        rejected(
            owner_summary(&f.db, actor, f.starts, f.starts + Duration::days(1)).await,
            "FORBIDDEN",
        );
    }
    rejected(
        earnings(&f.db, f.client.clone(), None, None).await,
        "FORBIDDEN",
    );
    let mut rule = f.rule(200);
    rule.barber_id = Some(other.barber.id.clone());
    rejected(
        create_rule(&f.db, f.owner.clone(), rule).await,
        "BARBER_NOT_FOUND",
    );
    let mut rule = f.rule(200);
    rule.service_id = Some(other.service.clone());
    rejected(
        create_rule(&f.db, f.owner.clone(), rule).await,
        "SERVICE_NOT_FOUND",
    );
    assert_eq!(before, snapshot(&f.db).await);
    f.add(f.rule(200)).await;
    f.complete(0).await;
    rejected(
        record_payout(&f.db, other.owner.clone(), f.payout(200, "foreign")).await,
        "BALANCE_CHANGED",
    );
    assert_eq!(other.summary().await["outstanding_cents"], 0);
    assert_eq!(
        earnings(&f.db, other.barber.clone(), None, None)
            .await
            .unwrap()
            .commission_cents,
        0
    );
    other.add(other.rule(300)).await;
    other.complete(0).await;
    f.pay(200, "shared-key").await.unwrap();
    other.pay(300, "shared-key").await.unwrap();
    assert_eq!(f.summary().await["commission_cents"], 200);
    assert_eq!(other.summary().await["commission_cents"], 300);
}

#[tokio::test]
async fn production_period_earnings_period_and_accumulated_balance_keep_distinct_meanings() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.add(f.rule(200)).await;
    f.complete(0).await;
    f.complete_for(1, &f.other_barber).await;
    let agenda = owner_summary(
        &f.db,
        f.owner.clone(),
        f.starts,
        f.starts + Duration::days(1),
    )
    .await
    .unwrap();
    assert_eq!(agenda["commission_cents"], 400);
    assert_eq!(agenda["retained_cents"], 9602);
    let no_completions = earnings(
        &f.db,
        f.barber.clone(),
        Some(f.starts),
        Some(f.starts + Duration::days(1)),
    )
    .await
    .unwrap();
    assert_eq!(no_completions.completed_count, 0);
    let outside = owner_summary(
        &f.db,
        f.owner.clone(),
        f.starts + Duration::days(2),
        f.starts + Duration::days(3),
    )
    .await
    .unwrap();
    assert_eq!(outside["revenue_cents"], 0);
    assert_eq!(outside["outstanding_cents"], 400);
    let team = outside["team"].as_array().unwrap();
    assert_eq!(
        team.iter().find(|u| u["id"] == f.barber.id).unwrap()["outstanding_cents"],
        200
    );
    f.pay(200, "own-barber").await.unwrap();
    assert_eq!(f.summary().await["commission_cents"], 400);
    assert_eq!(f.summary().await["outstanding_cents"], 200);
    assert_eq!(
        earnings(&f.db, f.barber.clone(), None, None)
            .await
            .unwrap()
            .commission_cents,
        200
    );
    assert_eq!(
        earnings(&f.db, f.owner.clone(), None, None)
            .await
            .unwrap()
            .commission_cents,
        400
    );
}

#[tokio::test]
async fn invalid_rules_and_inactive_barbers_leave_no_partial_writes() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let before = snapshot(&f.db).await;
    for amount in [-1, 100_000_001] {
        rejected(
            create_rule(&f.db, f.owner.clone(), f.rule(amount)).await,
            "INVALID_COMMISSION_RULE",
        );
    }
    let mut rule = f.rule(10001);
    rule.rule_type = CommissionRuleType::Percent;
    rejected(
        create_rule(&f.db, f.owner.clone(), rule).await,
        "INVALID_COMMISSION_RULE",
    );
    let mut rule = f.rule(200);
    rule.priority = 1001;
    rejected(
        create_rule(&f.db, f.owner.clone(), rule).await,
        "INVALID_COMMISSION_RULE",
    );
    let mut rule = f.rule(200);
    rule.valid_from = Some(f.starts);
    rule.valid_until = Some(f.starts);
    rejected(
        create_rule(&f.db, f.owner.clone(), rule).await,
        "INVALID_COMMISSION_RULE",
    );
    assert_eq!(before, snapshot(&f.db).await);
    f.sql("UPDATE barber_profiles SET active=0").await;
    let mut rule = f.rule(200);
    rule.barber_id = Some(f.barber.id.clone());
    rejected(
        create_rule(&f.db, f.owner.clone(), rule).await,
        "BARBER_NOT_FOUND",
    );
    assert_eq!(before, snapshot(&f.db).await);
}
