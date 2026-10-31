use chrono::{DateTime, Duration, Utc};
use rusqlite::params;

use super::{
    storage::{get_appointment, new_id, utc_text},
    *,
};
use crate::{
    db::Db,
    models::{AppointmentStatus, AuthUser, Role},
};

struct Fixture {
    db: Db,
    owner: AuthUser,
    client: AuthUser,
    other_client: AuthUser,
    barber: AuthUser,
    other_barber: AuthUser,
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
        display_name: "Test User".into(),
        roles: vec![role],
    };
    let owner = user(Role::Owner);
    let client = user(Role::Client);
    let other_client = user(Role::Client);
    let barber = user(Role::Barber);
    let other_barber = user(Role::Barber);
    let users = [
        owner.clone(),
        client.clone(),
        other_client.clone(),
        barber.clone(),
        other_barber.clone(),
    ];
    let service = new_id();
    let service_id = service.clone();
    db.with_conn(move |c| -> Result<(), Error> {
        let now = utc_text(Utc::now());
        c.execute("INSERT INTO businesses(id,name,timezone,created_at_utc,updated_at_utc) VALUES (?1,'Test Shop','America/Sao_Paulo',?2,?2)", params![business,now])?;
        for user in users {
            c.execute("INSERT INTO users(id,business_id,email,password_hash,display_name,created_at_utc,updated_at_utc) VALUES (?1,?2,?3,?4,?5,?6,?6)", params![user.id,business,user.email,"!disabled-test-identity-without-login!",user.display_name,now])?;
            let role = match user.roles[0] { Role::Owner => "owner", Role::Client => "client", Role::Barber => "barber" };
            c.execute("INSERT INTO user_roles(business_id,user_id,role,created_at_utc) VALUES (?1,?2,?3,?4)",params![business,user.id,role,now])?;
            if user.roles.contains(&Role::Barber) {
                c.execute("INSERT INTO barber_profiles(business_id,user_id,created_at_utc,updated_at_utc) VALUES (?1,?2,?3,?3)",params![business,user.id,now])?;
                for weekday in 0..7 {
                    c.execute("INSERT INTO weekly_schedules(id,business_id,barber_user_id,weekday,start_minute,end_minute,created_at_utc) VALUES (?1,?2,?3,?4,0,1439,?5)",params![new_id(),business,user.id,weekday,now])?;
                }
            }
        }
        c.execute("INSERT INTO services(id,business_id,name,price_cents,duration_minutes,created_at_utc,updated_at_utc) VALUES (?1,?2,'Corte',5000,30,?3,?3)",params![service_id,business,now])?;
        Ok(())
    }).await.unwrap();
    let starts = (Utc::now().date_naive() + Duration::days(1))
        .and_hms_opt(12, 0, 0)
        .unwrap()
        .and_utc();
    Fixture {
        db,
        owner,
        client,
        other_client,
        barber,
        other_barber,
        service,
        starts,
    }
}

impl Fixture {
    fn booking(&self, hour: i64, key: &str) -> Booking {
        Booking {
            barber_id: self.barber.id.clone(),
            service_id: self.service.clone(),
            starts_at: self.starts + Duration::hours(hour),
            idempotency: Idempotency {
                key: format!("test-appointment-{key}"),
                request_hash: crate::security::hash_token(&format!("booking-at-{hour}")),
            },
        }
    }
    async fn reserve(&self, hour: i64) -> crate::models::AppointmentResponse {
        create(&self.db, self.client.clone(), self.booking(hour, &new_id()))
            .await
            .unwrap()
    }
    async fn load(&self, id: &str) -> crate::models::AppointmentResponse {
        let business = self.owner.business_id.clone();
        let id = id.to_owned();
        self.db
            .with_conn(move |c| get_appointment(c, &business, &id))
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
    async fn rule(&self) {
        let business = self.owner.business_id.clone();
        self.db.with_conn(move |c| -> Result<(), Error> {
            c.execute("INSERT INTO commission_rules(id,business_id,rule_type,amount,created_at_utc,updated_at_utc) VALUES (?1,?2,'percent',5000,?3,?3)", params![new_id(), business, utc_text(Utc::now())])?;
            Ok(())
        }).await.unwrap();
    }
    fn change(&self, id: &str, hour: i64) -> AgendaChange {
        AgendaChange {
            id: id.into(),
            starts_at: Some(self.starts + Duration::hours(hour)),
            barber_id: None,
        }
    }
}

/// Compare all durable effects, including rows written before an injected failure.
async fn snapshot(db: &Db) -> Vec<Vec<Vec<String>>> {
    db.with_conn(|c| -> Result<_, Error> {
        let mut tables = Vec::new();
        for table in [
            "appointments",
            "appointment_history",
            "audit_log",
            "service_executions",
            "financial_entries",
            "commission_snapshots",
            "idempotency_keys",
            "users",
            "user_roles",
        ] {
            let mut statement = c.prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))?;
            let count = statement.column_count();
            tables.push(
                statement
                    .query_map([], |row| {
                        (0..count)
                            .map(|i| row.get_ref(i).map(|value| format!("{value:?}")))
                            .collect::<Result<Vec<_>, _>>()
                    })?
                    .collect::<Result<Vec<_>, _>>()?,
            );
        }
        Ok(tables)
    })
    .await
    .unwrap()
}

fn rejected<T>(result: Result<T, Error>, expected: &str) {
    assert!(
        matches!(result, Err(Error::Rejected { code, .. }) if code == expected),
        "expected {expected}"
    );
}

#[tokio::test]
async fn independent_sqlite_connections_serialize_competing_reservations() {
    let directory = std::env::temp_dir().join(format!("na-agenda-concurrent-{}", new_id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("test.db");
    {
        let f = fixture(Db::open(&path).unwrap()).await;
        let second = Db::open(&path).unwrap();
        let (first, second) = tokio::join!(
            create(&f.db, f.client.clone(), f.booking(0, "concurrent-first")),
            create(
                &second,
                f.other_client.clone(),
                f.booking(0, "concurrent-second")
            )
        );
        assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
        rejected(
            if first.is_err() { first } else { second },
            "SLOT_UNAVAILABLE",
        );
        let data = snapshot(&f.db).await;
        for rows in &data[..3] {
            assert_eq!(rows.len(), 1);
        }
        assert_eq!(data[6].len(), 1);
    }
    std::fs::remove_dir_all(&directory).unwrap();
}

#[tokio::test]
async fn retries_return_one_booking_and_reused_key_rejects_a_changed_intention() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let (first, retry) = tokio::join!(
        create(&f.db, f.client.clone(), f.booking(0, "same-intention")),
        create(&f.db, f.client.clone(), f.booking(0, "same-intention"))
    );
    assert_eq!(first.unwrap().id, retry.unwrap().id);
    let before = snapshot(&f.db).await;
    rejected(
        create(&f.db, f.client.clone(), f.booking(1, "same-intention")).await,
        "IDEMPOTENCY_KEY_REUSED",
    );
    assert_eq!(before, snapshot(&f.db).await);
    // Keys belong to an actor, not the whole business.
    create(
        &f.db,
        f.other_client.clone(),
        f.booking(1, "same-intention"),
    )
    .await
    .unwrap();
    assert_eq!(snapshot(&f.db).await[0].len(), 2);
}

#[tokio::test]
async fn reception_retry_and_audit_failure_do_not_duplicate_walk_in_identities() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let reception = || ReceptionBooking {
        booking: f.booking(0, "walk-in-intention"),
        client_id: new_id(),
        client_name: Some("Cliente avulso".into()),
        client_phone: "13999999999".into(),
        payment_method: Some("Pix".into()),
        client_note: "Recepção".into(),
    };
    let before = snapshot(&f.db).await;
    f.sql("CREATE TRIGGER fail_creation BEFORE INSERT ON audit_log WHEN NEW.action='appointment.created_by_owner' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;").await;
    assert!(matches!(
        create_reception(&f.db, f.barber.clone(), reception()).await,
        Err(Error::Sqlite(_))
    ));
    assert_eq!(before, snapshot(&f.db).await);
    f.sql("DROP TRIGGER fail_creation;").await;
    let first = create_reception(&f.db, f.barber.clone(), reception())
        .await
        .unwrap();
    let retry = create_reception(&f.db, f.barber.clone(), reception())
        .await
        .unwrap();
    assert_eq!(first.id, retry.id);
    let data = snapshot(&f.db).await;
    assert_eq!(data[0].len(), 1);
    assert_eq!(data[7].len(), before[7].len() + 1);
    let saved = f.load(&first.id).await;
    assert_eq!(saved.client_phone.as_deref(), Some("13999999999"));
    assert_eq!(saved.payment_method.as_deref(), Some("Pix"));
    assert_eq!(saved.client_note.as_deref(), Some("Recepção"));
}

#[tokio::test]
async fn commands_enforce_identity_role_and_business_scope() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let foreign = fixture(f.db.clone()).await;
    let item = f.reserve(0).await;
    let before = snapshot(&f.db).await;
    rejected(
        create(&f.db, f.barber.clone(), f.booking(1, "denied")).await,
        "FORBIDDEN",
    );
    rejected(
        cancel(
            &f.db,
            f.other_client.clone(),
            item.id.clone(),
            String::new(),
        )
        .await,
        "FORBIDDEN",
    );
    rejected(
        reschedule(
            &f.db,
            f.other_client.clone(),
            item.id.clone(),
            f.starts + Duration::hours(1),
        )
        .await,
        "FORBIDDEN",
    );
    rejected(
        start(&f.db, f.client.clone(), item.id.clone()).await,
        "FORBIDDEN",
    );
    rejected(
        start(&f.db, f.other_barber.clone(), item.id.clone()).await,
        "FORBIDDEN",
    );
    rejected(
        complete(
            &f.db,
            f.other_barber.clone(),
            item.id.clone(),
            String::new(),
        )
        .await,
        "FORBIDDEN",
    );
    rejected(
        no_show(&f.db, f.other_barber.clone(), item.id.clone()).await,
        "FORBIDDEN",
    );
    rejected(
        update_details(
            &f.db,
            f.other_barber.clone(),
            item.id.clone(),
            Details {
                phone: String::new(),
                payment: None,
                note: String::new(),
            },
        )
        .await,
        "FORBIDDEN",
    );
    rejected(
        change_agenda(
            &f.db,
            f.barber.clone(),
            BatchAction::Cancel,
            vec![f.change(&item.id, 0)],
        )
        .await,
        "FORBIDDEN",
    );
    rejected(
        cancel(&f.db, foreign.owner.clone(), item.id.clone(), String::new()).await,
        "APPOINTMENT_NOT_FOUND",
    );
    rejected(
        change_agenda(
            &f.db,
            foreign.owner.clone(),
            BatchAction::Cancel,
            vec![f.change(&item.id, 0)],
        )
        .await,
        "APPOINTMENT_NOT_FOUND",
    );
    rejected(
        create(
            &f.db,
            foreign.client.clone(),
            f.booking(1, "foreign-service"),
        )
        .await,
        "SERVICE_NOT_FOUND",
    );
    let mut command = foreign.booking(1, "foreign-barber");
    command.barber_id = f.barber.id.clone();
    rejected(
        create(&f.db, foreign.client.clone(), command).await,
        "BARBER_NOT_FOUND",
    );
    let mut reception = ReceptionBooking {
        booking: f.booking(1, "foreign-client"),
        client_id: foreign.client.id.clone(),
        client_name: None,
        client_phone: String::new(),
        payment_method: None,
        client_note: String::new(),
    };
    rejected(
        create_reception(&f.db, f.owner.clone(), reception).await,
        "CLIENT_NOT_FOUND",
    );
    reception = ReceptionBooking {
        booking: f.booking(1, "barber-as-owner"),
        client_id: f.client.id.clone(),
        client_name: None,
        client_phone: String::new(),
        payment_method: None,
        client_note: String::new(),
    };
    rejected(
        create_reception(&f.db, f.barber.clone(), reception).await,
        "FORBIDDEN",
    );
    assert_eq!(before, snapshot(&f.db).await);
}

#[tokio::test]
async fn rescheduling_and_completion_keep_historical_price_duration_and_commission() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await;
    let item = f.reserve(0).await;
    f.sql("UPDATE services SET price_cents=9000,duration_minutes=60;")
        .await;
    let moved = reschedule(
        &f.db,
        f.client.clone(),
        item.id.clone(),
        f.starts + Duration::hours(1),
    )
    .await
    .unwrap();
    assert_eq!((moved.price_cents, moved.duration_minutes), (5000, 30));
    assert_eq!(moved.ends_at - moved.starts_at, Duration::minutes(30));
    let before = snapshot(&f.db).await;
    reschedule(&f.db, f.client.clone(), item.id.clone(), moved.starts_at)
        .await
        .unwrap();
    assert_eq!(before, snapshot(&f.db).await);
    let completed = complete(&f.db, f.barber.clone(), item.id.clone(), "Feito".into())
        .await
        .unwrap();
    assert_eq!(completed.status, AppointmentStatus::Completed);
    assert_eq!(completed.commission_cents, Some(2500));
    let before = snapshot(&f.db).await;
    rejected(
        complete(&f.db, f.owner.clone(), item.id.clone(), String::new()).await,
        "INVALID_TRANSITION",
    );
    rejected(
        cancel(&f.db, f.client.clone(), item.id.clone(), String::new()).await,
        "INVALID_TRANSITION",
    );
    rejected(
        start(&f.db, f.barber.clone(), item.id.clone()).await,
        "INVALID_TRANSITION",
    );
    assert_eq!(before, snapshot(&f.db).await);
    let fresh = f.reserve(2).await;
    assert_eq!((fresh.price_cents, fresh.duration_minutes), (9000, 60));
}

#[tokio::test]
async fn started_execution_blocks_move_and_no_show_and_start_retry_has_no_side_effects() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let item = f.reserve(0).await;
    start(&f.db, f.barber.clone(), item.id.clone())
        .await
        .unwrap();
    let before = snapshot(&f.db).await;
    start(&f.db, f.barber.clone(), item.id.clone())
        .await
        .unwrap();
    rejected(
        reschedule(
            &f.db,
            f.owner.clone(),
            item.id.clone(),
            f.starts + Duration::hours(1),
        )
        .await,
        "INVALID_TRANSITION",
    );
    rejected(
        no_show(&f.db, f.owner.clone(), item.id.clone()).await,
        "INVALID_TRANSITION",
    );
    rejected(
        change_agenda(
            &f.db,
            f.owner.clone(),
            BatchAction::Cancel,
            vec![f.change(&item.id, 0)],
        )
        .await,
        "INVALID_TRANSITION",
    );
    assert_eq!(before, snapshot(&f.db).await);
    complete(&f.db, f.barber.clone(), item.id.clone(), String::new())
        .await
        .unwrap();
}

#[tokio::test]
async fn batch_conflict_after_first_move_rolls_back_all_durable_effects() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let a = f.reserve(0).await;
    let b = f.reserve(1).await;
    let before = snapshot(&f.db).await;
    rejected(
        change_agenda(
            &f.db,
            f.owner.clone(),
            BatchAction::Move,
            vec![f.change(&a.id, 2), f.change(&b.id, 2)],
        )
        .await,
        "SLOT_UNAVAILABLE",
    );
    assert_eq!(before, snapshot(&f.db).await);
    // Swaps need all selected slots released under the same transaction.
    f.sql("UPDATE services SET price_cents=9000,duration_minutes=60;")
        .await;
    change_agenda(
        &f.db,
        f.owner.clone(),
        BatchAction::Move,
        vec![f.change(&a.id, 1), f.change(&b.id, 0)],
    )
    .await
    .unwrap();
    let moved = f.load(&a.id).await;
    assert_eq!(moved.starts_at, b.starts_at);
    assert_eq!((moved.price_cents, moved.duration_minutes), (5000, 30));
    assert_eq!(f.load(&b.id).await.starts_at, a.starts_at);
}

#[tokio::test]
async fn batch_cancellation_audit_failure_on_second_item_restores_first_item_too() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let a = f.reserve(0).await;
    let b = f.reserve(1).await;
    let before = snapshot(&f.db).await;
    f.sql(&format!("CREATE TRIGGER fail_second_audit BEFORE INSERT ON audit_log WHEN NEW.entity_id='{}' AND NEW.action='appointment.bulk_updated' BEGIN SELECT RAISE(ABORT,'injected second audit failure'); END;",b.id)).await;
    assert!(matches!(
        change_agenda(
            &f.db,
            f.owner.clone(),
            BatchAction::Cancel,
            vec![f.change(&a.id, 0), f.change(&b.id, 0)]
        )
        .await,
        Err(Error::Sqlite(_))
    ));
    assert_eq!(before, snapshot(&f.db).await);
    f.sql("DROP TRIGGER fail_second_audit;").await;
    change_agenda(
        &f.db,
        f.owner.clone(),
        BatchAction::Cancel,
        vec![f.change(&a.id, 0), f.change(&b.id, 0)],
    )
    .await
    .unwrap();
    assert_eq!(f.load(&a.id).await.status, AppointmentStatus::Cancelled);
    assert_eq!(f.load(&b.id).await.status, AppointmentStatus::Cancelled);
}

#[tokio::test]
async fn commission_write_failure_rolls_back_execution_history_revenue_and_completion() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await;
    let item = f.reserve(0).await;
    let before = snapshot(&f.db).await;
    // Fail after the commission snapshot, revenue and history have been inserted.
    f.sql("CREATE TRIGGER fail_commission BEFORE INSERT ON financial_entries WHEN NEW.kind='commission' BEGIN SELECT RAISE(ABORT,'injected commission failure'); END;").await;
    assert!(matches!(
        complete(&f.db, f.barber.clone(), item.id.clone(), "Feito".into()).await,
        Err(Error::Sqlite(_))
    ));
    assert_eq!(before, snapshot(&f.db).await);
    f.sql("DROP TRIGGER fail_commission;").await;
    assert_eq!(
        complete(&f.db, f.barber.clone(), item.id.clone(), "Feito".into())
            .await
            .unwrap()
            .commission_cents,
        Some(2500)
    );
}

#[tokio::test]
async fn cancellation_no_show_details_and_invalid_batch_preserve_transition_contracts() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let a = f.reserve(0).await;
    let b = f.reserve(1).await;
    update_details(
        &f.db,
        f.barber.clone(),
        a.id.clone(),
        Details {
            phone: "13999999999".into(),
            payment: Some("Pix".into()),
            note: "Detalhes".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(f.load(&a.id).await.client_note.as_deref(), Some("Detalhes"));
    assert_eq!(
        cancel(&f.db, f.client.clone(), a.id.clone(), "Motivo".into())
            .await
            .unwrap()
            .status,
        AppointmentStatus::Cancelled
    );
    assert_eq!(
        no_show(&f.db, f.barber.clone(), b.id.clone())
            .await
            .unwrap()
            .status,
        AppointmentStatus::NoShow
    );
    let before = snapshot(&f.db).await;
    rejected(
        no_show(&f.db, f.barber.clone(), b.id.clone()).await,
        "INVALID_TRANSITION",
    );
    rejected(
        reschedule(
            &f.db,
            f.client.clone(),
            a.id.clone(),
            f.starts + Duration::hours(2),
        )
        .await,
        "INVALID_TRANSITION",
    );
    rejected(
        change_agenda(&f.db, f.owner.clone(), BatchAction::Cancel, vec![]).await,
        "INVALID_BATCH",
    );
    rejected(
        change_agenda(
            &f.db,
            f.owner.clone(),
            BatchAction::Cancel,
            vec![f.change(&a.id, 0), f.change(&a.id, 0)],
        )
        .await,
        "INVALID_BATCH",
    );
    assert_eq!(before, snapshot(&f.db).await);
}
