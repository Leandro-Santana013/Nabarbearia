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
            let role = match user.roles[0] { Role::Owner => "owner", Role::Admin => "admin", Role::SuperAdmin => "super_admin", Role::Client => "client", Role::Barber => "barber" };
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
    async fn add_service(&self, name: &str, price_cents: i64, active: bool) -> String {
        let id = new_id();
        let (service_id, business, name) = (id.clone(), self.owner.business_id.clone(), name.to_owned());
        self.db.with_conn(move |c| -> Result<(), Error> {
            c.execute("INSERT INTO services(id,business_id,name,price_cents,duration_minutes,active,created_at_utc,updated_at_utc) VALUES (?1,?2,?3,?4,30,?5,?6,?6)", params![service_id, business, name, price_cents, active as i64, utc_text(Utc::now())])?;
            Ok(())
        }).await.unwrap();
        id
    }
    async fn service_rule(&self, service_id: &str, basis_points: i64) {
        let (business, service_id) = (self.owner.business_id.clone(), service_id.to_owned());
        self.db.with_conn(move |c| -> Result<(), Error> {
            c.execute("INSERT INTO commission_rules(id,business_id,service_id,rule_type,amount,created_at_utc,updated_at_utc) VALUES (?1,?2,?3,'percent',?4,?5,?5)", params![new_id(), business, service_id, basis_points, utc_text(Utc::now())])?;
            Ok(())
        }).await.unwrap();
    }
    async fn ints(&self, sql: &str) -> Vec<i64> {
        let sql = sql.to_owned();
        self.db.with_conn(move |c| -> Result<_, Error> {
            let mut statement = c.prepare(&sql)?;
            let values = statement.query_map([], |row| row.get::<_, i64>(0))?.collect::<Result<Vec<_>, _>>()?;
            Ok(values)
        }).await.unwrap()
    }
    async fn texts(&self, sql: &str) -> Vec<Option<String>> {
        let sql = sql.to_owned();
        self.db.with_conn(move |c| -> Result<_, Error> {
            let mut statement = c.prepare(&sql)?;
            let values = statement.query_map([], |row| row.get::<_, Option<String>>(0))?.collect::<Result<Vec<_>, _>>()?;
            Ok(values)
        }).await.unwrap()
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
            "appointment_services",
            "appointment_corrections",
            "commission_adjustments",
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
async fn owner_can_edit_confirmed_appointment_service_date_time_and_barber() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let item = f.reserve(0).await;
    let replacement_service = new_id();
    let service_id = replacement_service.clone();
    let business = f.owner.business_id.clone();
    f.db
        .with_conn(move |c| -> Result<(), Error> {
            c.execute(
                "INSERT INTO services(id,business_id,name,price_cents,duration_minutes,active,created_at_utc,updated_at_utc)
                 VALUES (?1,?2,'Corte e barba',8500,60,1,?3,?3)",
                params![service_id, business, utc_text(Utc::now())],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let edited_start = f.starts + Duration::hours(3);

    let updated = edit_appointment(
        &f.db,
        f.owner.clone(),
        item.id.clone(),
        AppointmentEdit {
            service_id: replacement_service.clone(),
            barber_id: f.other_barber.id.clone(),
            starts_at: edited_start,
        },
    )
    .await
    .unwrap();

    assert_eq!(updated.service_id, replacement_service);
    assert_eq!(updated.barber_user_id, f.other_barber.id);
    assert_eq!(updated.starts_at, edited_start);
    assert_eq!(updated.ends_at, edited_start + Duration::minutes(60));
    assert_eq!((updated.price_cents, updated.duration_minutes), (8500, 60));
    assert_eq!(updated.client_user_id, item.client_user_id);
    assert_eq!(updated.status, AppointmentStatus::Confirmed);
}

#[tokio::test]
async fn appointment_edit_conflict_or_started_service_leaves_database_unchanged() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let item = f.reserve(0).await;
    let occupied = f.reserve(1).await;
    edit_appointment(
        &f.db,
        f.owner.clone(),
        occupied.id.clone(),
        AppointmentEdit {
            service_id: f.service.clone(),
            barber_id: f.other_barber.id.clone(),
            starts_at: item.starts_at,
        },
    )
    .await
    .unwrap();
    let before = snapshot(&f.db).await;
    rejected(
        edit_appointment(
            &f.db,
            f.owner.clone(),
            item.id.clone(),
            AppointmentEdit {
                service_id: f.service.clone(),
                barber_id: f.other_barber.id.clone(),
                starts_at: item.starts_at,
            },
        )
        .await,
        "SLOT_UNAVAILABLE",
    );
    assert_eq!(before, snapshot(&f.db).await);

    start(&f.db, f.other_barber.clone(), occupied.id.clone())
        .await
        .unwrap();
    rejected(
        edit_appointment(
            &f.db,
            f.owner.clone(),
            occupied.id.clone(),
            AppointmentEdit {
                service_id: f.service.clone(),
                barber_id: f.other_barber.id.clone(),
                starts_at: f.starts + Duration::hours(4),
            },
        )
        .await,
        "INVALID_TRANSITION",
    );
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

fn checkout(extras: &[&String], payment: &str, total: i64) -> Checkout {
    Checkout {
        extra_service_ids: extras.iter().map(|id| (*id).clone()).collect(),
        payment_method: payment.into(),
        expected_total_cents: total,
        notes: String::new(),
    }
}

#[tokio::test]
async fn checkout_with_extras_posts_one_revenue_and_commission_per_service() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await; // 50% geral
    let barba = f.add_service("Barba", 3000, true).await;
    let sobrancelha = f.add_service("Sobrancelha", 1500, true).await;
    f.service_rule(&barba, 2000).await; // 20% específico da barba
    let item = f.reserve(0).await;
    start(&f.db, f.barber.clone(), item.id.clone()).await.unwrap();

    let completed = complete_with_checkout(
        &f.db,
        f.owner.clone(),
        item.id.clone(),
        checkout(&[&barba, &sobrancelha], "pix", 9500),
    )
    .await
    .unwrap();
    assert_eq!(completed.status, AppointmentStatus::Completed);
    // 5000 agendados + 3000 + 1500: o valor original entra uma única vez.
    assert_eq!(completed.price_cents, 9500);
    // 50% de 5000 + 20% de 3000 + 50% de 1500.
    assert_eq!(completed.commission_cents, Some(2500 + 600 + 750));
    let id = &item.id;
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='revenue'")).await, vec![9500]);
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='commission'")).await, vec![3850]);
    assert_eq!(f.ints(&format!("SELECT price_cents FROM appointment_services WHERE appointment_id='{id}' ORDER BY position")).await, vec![5000, 3000, 1500]);
    assert_eq!(f.ints(&format!("SELECT commission_cents FROM appointment_services WHERE appointment_id='{id}' ORDER BY position")).await, vec![2500, 600, 750]);
    assert_eq!(f.ints(&format!("SELECT is_original FROM appointment_services WHERE appointment_id='{id}' ORDER BY position")).await, vec![1, 0, 0]);
    assert_eq!(f.texts(&format!("SELECT paid_payment_method FROM appointments WHERE id='{id}'")).await, vec![Some("pix".into())]);
    assert_eq!(f.texts(&format!("SELECT rule_id FROM commission_snapshots WHERE appointment_id='{id}'")).await, vec![None]);

    let from = f.starts - Duration::days(1);
    let to = f.starts + Duration::days(1);
    let summary = crate::commissions::owner_summary(&f.db, f.owner.clone(), from, to).await.unwrap();
    assert_eq!(summary["revenue_cents"], 9500);
    assert_eq!(summary["commission_cents"], 3850);

    // Conclusão repetida, por qualquer caminho, não gera receita nem comissão duplicadas.
    let before = snapshot(&f.db).await;
    rejected(
        complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[&barba, &sobrancelha], "pix", 9500)).await,
        "ALREADY_COMPLETED",
    );
    rejected(
        complete(&f.db, f.owner.clone(), item.id.clone(), String::new()).await,
        "INVALID_TRANSITION",
    );
    assert_eq!(before, snapshot(&f.db).await);

    // Leitura do fechamento gravado mesmo depois de o catálogo mudar.
    f.sql("UPDATE services SET price_cents = 99999;").await;
    let view = checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap();
    assert!(view.recorded);
    assert_eq!(view.total_cents, 9500);
    assert_eq!(view.lines.iter().map(|line| line.price_cents).collect::<Vec<_>>(), vec![5000, 3000, 1500]);
    assert_eq!(view.paid_payment_method.as_deref(), Some("pix"));
    assert_eq!(before, snapshot(&f.db).await);
}

#[tokio::test]
async fn checkout_with_only_the_booked_service_keeps_price_and_records_payment() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await;
    let item = f.reserve(0).await;
    // O preço agendado é preservado mesmo que o catálogo tenha mudado depois da reserva.
    f.sql("UPDATE services SET price_cents = 7000;").await;
    let before = snapshot(&f.db).await;
    let view = checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap();
    assert!(!view.recorded);
    assert_eq!((view.lines.len(), view.total_cents), (1, 5000));
    assert_eq!(before, snapshot(&f.db).await, "abrir o modal não grava nada");

    let completed = complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[], "cash", 5000))
        .await
        .unwrap();
    assert_eq!((completed.price_cents, completed.commission_cents), (5000, Some(2500)));
    let id = &item.id;
    assert_eq!(f.texts(&format!("SELECT paid_payment_method FROM appointments WHERE id='{id}'")).await, vec![Some("cash".into())]);
    assert_eq!(f.texts(&format!("SELECT payment_method FROM appointments WHERE id='{id}'")).await, vec![None], "o pagamento previsto não é alterado");
    assert_eq!(f.ints(&format!("SELECT COUNT(*) FROM financial_entries WHERE appointment_id='{id}' AND kind='revenue'")).await, vec![1]);
}

#[tokio::test]
async fn checkout_rejections_leave_the_database_unchanged() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await;
    let barba = f.add_service("Barba", 3000, true).await;
    let inactive = f.add_service("Antigo", 1000, false).await;
    let item = f.reserve(0).await;
    let cancelled = f.reserve(2).await;
    let missed = f.reserve(4).await;
    cancel(&f.db, f.owner.clone(), cancelled.id.clone(), String::new()).await.unwrap();
    no_show(&f.db, f.owner.clone(), missed.id.clone()).await.unwrap();
    let admin = AuthUser { roles: vec![Role::Admin], ..f.owner.clone() };
    let before = snapshot(&f.db).await;

    // Outro barbeiro não conclui nem consulta atendimentos que não são da sua agenda.
    rejected(complete_with_checkout(&f.db, f.other_barber.clone(), item.id.clone(), checkout(&[], "pix", 5000)).await, "FORBIDDEN");
    rejected(checkout_summary(&f.db, f.other_barber.clone(), item.id.clone()).await, "FORBIDDEN");
    rejected(checkout_summary(&f.db, f.client.clone(), item.id.clone()).await, "FORBIDDEN");
    rejected(complete_with_checkout(&f.db, admin.clone(), item.id.clone(), checkout(&[], "pix", 5000)).await, "FORBIDDEN");
    rejected(checkout_summary(&f.db, admin, item.id.clone()).await, "FORBIDDEN");
    rejected(complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[], "cheque", 5000)).await, "INVALID_PAYMENT");
    rejected(complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[&barba, &barba], "pix", 11000)).await, "DUPLICATE_SERVICE");
    rejected(complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[&f.service], "pix", 10000)).await, "DUPLICATE_SERVICE");
    rejected(complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[&inactive], "pix", 6000)).await, "SERVICE_NOT_FOUND");
    rejected(complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[&barba], "pix", 7000)).await, "TOTAL_CHANGED");
    rejected(complete_with_checkout(&f.db, f.owner.clone(), cancelled.id.clone(), checkout(&[], "pix", 5000)).await, "APPOINTMENT_CANCELLED");
    rejected(complete_with_checkout(&f.db, f.owner.clone(), missed.id.clone(), checkout(&[], "pix", 5000)).await, "APPOINTMENT_NO_SHOW");
    assert_eq!(before, snapshot(&f.db).await);

    // Falha no lançamento da comissão desfaz serviços, pagamento, preço e conclusão juntos.
    f.sql("CREATE TRIGGER fail_commission BEFORE INSERT ON financial_entries WHEN NEW.kind='commission' BEGIN SELECT RAISE(ABORT,'injected commission failure'); END;").await;
    assert!(matches!(
        complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[&barba], "pix", 8000)).await,
        Err(Error::Sqlite(_))
    ));
    f.sql("DROP TRIGGER fail_commission;").await;
    assert_eq!(before, snapshot(&f.db).await);
}

#[tokio::test]
async fn checkout_without_rule_for_an_extra_waits_and_regularizes_per_service() {
    let f = fixture(Db::in_memory().unwrap()).await;
    let barba = f.add_service("Barba", 3000, true).await;
    f.service_rule(&f.service, 4000).await; // regra só para o corte
    let item = f.reserve(0).await;
    let completed = complete_with_checkout(&f.db, f.owner.clone(), item.id.clone(), checkout(&[&barba], "credit_card", 8000))
        .await
        .unwrap();
    // A barba não tem regra: a comissão inteira fica pendente, nunca parcial.
    assert_eq!((completed.price_cents, completed.commission_cents), (8000, None));
    let id = &item.id;
    assert_eq!(f.texts(&format!("SELECT status FROM commission_snapshots WHERE appointment_id='{id}'")).await, vec![Some("pending_configuration".into())]);
    crate::commissions::create_rule(
        &f.db,
        f.owner.clone(),
        crate::commissions::Rule {
            barber_id: None,
            service_id: Some(barba.clone()),
            rule_type: crate::models::CommissionRuleType::Percent,
            amount: 5000,
            priority: 0,
            valid_from: None,
            valid_until: None,
        },
    )
    .await
    .unwrap();
    // 40% de 5000 + 50% de 3000.
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM commission_snapshots WHERE appointment_id='{id}' AND status='posted'")).await, vec![3500]);
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='commission' AND status='posted'")).await, vec![3500]);
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='revenue'")).await, vec![8000]);
}

#[tokio::test]
async fn barber_closes_own_appointment_with_the_same_rules_as_the_owner() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await; // 50% geral
    let barba = f.add_service("Barba", 3000, true).await;
    let sobrancelha = f.add_service("Sobrancelha", 1500, true).await;
    f.service_rule(&barba, 2000).await;
    let item = f.reserve(0).await;
    start(&f.db, f.barber.clone(), item.id.clone()).await.unwrap();

    // Abrir o modal de finalização não altera nada: o atendimento continua em andamento.
    let before = snapshot(&f.db).await;
    let view = checkout_summary(&f.db, f.barber.clone(), item.id.clone()).await.unwrap();
    assert_eq!((view.status, view.execution_started, view.recorded), (AppointmentStatus::Confirmed, true, false));
    assert_eq!(before, snapshot(&f.db).await);

    // Sem pagamento válido nada é gravado (o pagamento obrigatório é validado antes da transação).
    rejected(complete_with_checkout(&f.db, f.barber.clone(), item.id.clone(), checkout(&[&barba], "", 8000)).await, "INVALID_PAYMENT");
    assert_eq!(before, snapshot(&f.db).await);

    let completed = complete_with_checkout(
        &f.db,
        f.barber.clone(),
        item.id.clone(),
        checkout(&[&barba, &sobrancelha], "debit_card", 9500),
    )
    .await
    .unwrap();
    assert_eq!(completed.status, AppointmentStatus::Completed);
    // Mesmo cálculo do painel: 5000 + 3000 + 1500 e comissão por serviço.
    assert_eq!((completed.price_cents, completed.commission_cents), (9500, Some(2500 + 600 + 750)));
    let id = &item.id;
    assert_eq!(f.texts(&format!("SELECT paid_payment_method FROM appointments WHERE id='{id}'")).await, vec![Some("debit_card".into())]);
    assert_eq!(f.texts(&format!("SELECT paid_by_user_id FROM appointments WHERE id='{id}'")).await, vec![Some(f.barber.id.clone())]);
    assert_eq!(f.ints(&format!("SELECT COUNT(*) FROM financial_entries WHERE appointment_id='{id}' AND kind='revenue'")).await, vec![1]);

    // Requisição repetida do barbeiro não conclui de novo.
    let after = snapshot(&f.db).await;
    rejected(
        complete_with_checkout(&f.db, f.barber.clone(), item.id.clone(), checkout(&[&barba, &sobrancelha], "debit_card", 9500)).await,
        "ALREADY_COMPLETED",
    );
    assert_eq!(after, snapshot(&f.db).await);

    // O barbeiro consulta o fechamento em modo leitura, e o dono vê o mesmo registro.
    let mine = checkout_summary(&f.db, f.barber.clone(), item.id.clone()).await.unwrap();
    let owner_view = checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap();
    assert!(mine.recorded && mine.completed_at.is_some());
    assert_eq!(mine.lines, owner_view.lines);
    assert_eq!((mine.total_cents, mine.paid_payment_method.as_deref()), (9500, Some("debit_card")));
}

#[tokio::test]
async fn every_received_payment_method_is_accepted() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await;
    for (hour, payment) in [(0, "pix"), (2, "cash"), (4, "debit_card"), (6, "credit_card")] {
        let item = f.reserve(hour).await;
        let completed = complete_with_checkout(&f.db, f.barber.clone(), item.id.clone(), checkout(&[], payment, 5000))
            .await
            .unwrap();
        assert_eq!((completed.price_cents, completed.commission_cents), (5000, Some(2500)));
        let id = &item.id;
        assert_eq!(f.texts(&format!("SELECT paid_payment_method FROM appointments WHERE id='{id}'")).await, vec![Some(payment.into())]);
    }
}

fn fix(lines: &[(&String, i64)], payment: &str, reason: &str, version: i64) -> Correction {
    Correction {
        lines: lines
            .iter()
            .map(|(id, price)| CorrectionLine { service_id: (*id).clone(), price_cents: *price })
            .collect(),
        payment_method: payment.into(),
        reason: reason.into(),
        expected_version: version,
    }
}

async fn try_sql(db: &Db, sql: &str) -> bool {
    let sql = sql.to_owned();
    db.with_conn(move |c| -> Result<(), Error> {
        c.execute_batch(&sql)?;
        Ok(())
    })
    .await
    .is_ok()
}

#[tokio::test]
async fn correction_of_unpaid_closing_updates_revenue_commission_and_history() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await; // 50% geral
    let barba = f.add_service("Barba", 3000, true).await;
    let sobrancelha = f.add_service("Sobrancelha", 1500, true).await;
    f.service_rule(&barba, 2000).await;
    let item = f.reserve(0).await;
    complete_with_checkout(&f.db, f.barber.clone(), item.id.clone(), checkout(&[&barba, &sobrancelha], "pix", 9500))
        .await
        .unwrap();
    let view = checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap();
    assert!(view.can_correct && view.corrections.is_empty());
    let barber_view = checkout_summary(&f.db, f.barber.clone(), item.id.clone()).await.unwrap();
    assert!(!barber_view.can_correct);

    let before = snapshot(&f.db).await;
    let reason = "Sobrancelha registrada por engano";
    let keep = [(&f.service, 5000), (&barba, 3000)];
    let admin = AuthUser { roles: vec![Role::Admin], ..f.owner.clone() };
    rejected(correct_closing(&f.db, f.barber.clone(), item.id.clone(), fix(&keep, "cash", reason, view.version)).await, "FORBIDDEN");
    rejected(correct_closing(&f.db, admin, item.id.clone(), fix(&keep, "cash", reason, view.version)).await, "FORBIDDEN");
    rejected(correct_closing(&f.db, f.owner.clone(), item.id.clone(), fix(&keep, "cash", "  ", view.version)).await, "INVALID_REASON");
    rejected(correct_closing(&f.db, f.owner.clone(), item.id.clone(), fix(&[(&barba, 3000), (&barba, 3000)], "cash", reason, view.version)).await, "DUPLICATE_SERVICE");
    rejected(correct_closing(&f.db, f.owner.clone(), item.id.clone(), fix(&keep, "cash", reason, view.version - 1)).await, "APPOINTMENT_CHANGED");
    let open = f.reserve(2).await;
    rejected(correct_closing(&f.db, f.owner.clone(), open.id.clone(), fix(&keep, "cash", reason, 1)).await, "NOT_COMPLETED");
    assert_eq!(before, snapshot(&f.db).await);

    correct_closing(&f.db, f.owner.clone(), item.id.clone(), fix(&keep, "cash", reason, view.version))
        .await
        .unwrap();
    let id = &item.id;
    let loaded = f.load(id).await;
    assert_eq!((loaded.price_cents, loaded.status), (8000, AppointmentStatus::Completed));
    // 50% de 5000 + 20% de 3000: comissão ainda não repassada é recalculada.
    assert_eq!(loaded.commission_cents, Some(3100));
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='revenue'")).await, vec![8000]);
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='commission'")).await, vec![3100]);
    assert_eq!(f.ints(&format!("SELECT price_cents FROM appointment_services WHERE appointment_id='{id}' ORDER BY position")).await, vec![5000, 3000]);
    assert_eq!(f.ints(&format!("SELECT COUNT(*) FROM appointment_history WHERE appointment_id='{id}' AND event_type='completed'")).await, vec![1], "a correção não conclui de novo");

    let after = checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap();
    assert_eq!((after.total_cents, after.paid_payment_method.as_deref()), (8000, Some("cash")));
    assert_eq!(after.corrections.len(), 1);
    let record = &after.corrections[0];
    assert_eq!((record.previous_total_cents, record.new_total_cents), (9500, 8000));
    assert_eq!((record.previous_payment_method.as_deref(), record.new_payment_method.as_str()), (Some("pix"), "cash"));
    assert_eq!((record.previous_commission_cents, record.new_commission_cents), (Some(3850), Some(3100)));
    assert_eq!(record.commission_treatment, "recalculated");
    assert_eq!(record.removed_services[0]["service_name"], "Sobrancelha");
    assert_eq!(record.reason, reason);
    assert!(barber_view.corrections.is_empty());

    let from = f.starts - Duration::days(1);
    let to = f.starts + Duration::days(1);
    let summary = crate::commissions::owner_summary(&f.db, f.owner.clone(), from, to).await.unwrap();
    assert_eq!((summary["revenue_cents"].as_i64(), summary["commission_cents"].as_i64()), (Some(8000), Some(3100)));

    // A versão antiga não sobrescreve a correção feita; sem diferença nada é gravado.
    rejected(correct_closing(&f.db, f.owner.clone(), item.id.clone(), fix(&[(&f.service, 5000)], "cash", reason, view.version)).await, "APPOINTMENT_CHANGED");
    rejected(correct_closing(&f.db, f.owner.clone(), item.id.clone(), fix(&keep, "cash", reason, after.version)).await, "NO_CHANGES");

    // O histórico é somente de inclusão: nem a interface nem SQL direto apagam ou alteram.
    assert!(!try_sql(&f.db, "DELETE FROM appointment_corrections;").await);
    assert!(!try_sql(&f.db, "UPDATE appointment_corrections SET reason = 'alterado';").await);
    assert_eq!(checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap().corrections.len(), 1);
}

#[tokio::test]
async fn correction_of_paid_commission_creates_a_traceable_adjustment() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await; // 50% geral
    let barba = f.add_service("Barba", 3000, true).await;
    let item = f.reserve(0).await;
    complete_with_checkout(&f.db, f.barber.clone(), item.id.clone(), checkout(&[&barba], "pix", 8000))
        .await
        .unwrap();
    let payout = |amount: i64, key: &str| crate::commissions::Payout {
        barber_id: f.barber.id.clone(),
        expected_amount_cents: amount,
        idempotency_key: key.into(),
    };
    crate::commissions::record_payout(&f.db, f.owner.clone(), payout(4000, "payout-before-correction")).await.unwrap();

    let version = checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap().version;
    correct_closing(&f.db, f.owner.clone(), item.id.clone(), fix(&[(&f.service, 5000)], "pix", "Barba não foi realizada", version))
        .await
        .unwrap();
    let id = &item.id;
    // O registro já repassado não muda: a diferença vira um ajuste rastreável.
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM commission_snapshots WHERE appointment_id='{id}'")).await, vec![4000]);
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM commission_adjustments WHERE appointment_id='{id}'")).await, vec![-1500]);
    assert_eq!(f.load(id).await.commission_cents, Some(2500));
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='revenue'")).await, vec![5000]);
    let record = &checkout_summary(&f.db, f.owner.clone(), item.id.clone()).await.unwrap().corrections[0];
    assert_eq!((record.commission_treatment.as_str(), record.previous_commission_cents, record.new_commission_cents), ("adjustment", Some(4000), Some(2500)));
    let from = f.starts - Duration::days(1);
    let to = f.starts + Duration::days(1);
    let summary = crate::commissions::owner_summary(&f.db, f.owner.clone(), from, to).await.unwrap();
    assert_eq!((summary["commission_cents"].as_i64(), summary["outstanding_cents"].as_i64()), (Some(2500), Some(-1500)));

    // O próximo repasse desconta o ajuste e o quita junto.
    let next = f.reserve(2).await;
    complete(&f.db, f.barber.clone(), next.id.clone(), String::new()).await.unwrap();
    crate::commissions::record_payout(&f.db, f.owner.clone(), payout(1000, "payout-after-correction")).await.unwrap();
    assert_eq!(f.ints(&format!("SELECT COUNT(*) FROM commission_adjustments WHERE appointment_id='{id}' AND payout_id IS NOT NULL")).await, vec![1]);
    let summary = crate::commissions::owner_summary(&f.db, f.owner.clone(), from, to).await.unwrap();
    assert_eq!(summary["outstanding_cents"].as_i64(), Some(0));
    assert!(!try_sql(&f.db, "UPDATE commission_adjustments SET amount_cents = 1;").await);
    assert!(!try_sql(&f.db, "DELETE FROM commission_adjustments;").await);
}

#[tokio::test]
async fn correction_without_rule_waits_when_unpaid_and_is_refused_when_paid() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.service_rule(&f.service, 5000).await; // só o corte tem regra
    let barba = f.add_service("Barba", 3000, true).await;
    let unpaid = f.reserve(0).await;
    complete(&f.db, f.barber.clone(), unpaid.id.clone(), String::new()).await.unwrap();
    let version = checkout_summary(&f.db, f.owner.clone(), unpaid.id.clone()).await.unwrap().version;
    correct_closing(&f.db, f.owner.clone(), unpaid.id.clone(), fix(&[(&f.service, 5000), (&barba, 3000)], "cash", "Barba esquecida no fechamento", version))
        .await
        .unwrap();
    let id = &unpaid.id;
    assert_eq!(f.texts(&format!("SELECT status FROM commission_snapshots WHERE appointment_id='{id}'")).await, vec![Some("pending_configuration".into())]);
    assert_eq!(f.texts(&format!("SELECT status FROM financial_entries WHERE appointment_id='{id}' AND kind='commission'")).await, vec![Some("pending_configuration".into())]);
    assert_eq!(f.ints(&format!("SELECT amount_cents FROM financial_entries WHERE appointment_id='{id}' AND kind='revenue'")).await, vec![8000]);
    crate::commissions::create_rule(
        &f.db,
        f.owner.clone(),
        crate::commissions::Rule {
            barber_id: None,
            service_id: Some(barba.clone()),
            rule_type: crate::models::CommissionRuleType::Percent,
            amount: 2000,
            priority: 0,
            valid_from: None,
            valid_until: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(f.load(id).await.commission_cents, Some(2500 + 600));

    let paid = f.reserve(2).await;
    let other = f.add_service("Hidratação", 2000, true).await;
    complete(&f.db, f.barber.clone(), paid.id.clone(), String::new()).await.unwrap();
    crate::commissions::record_payout(
        &f.db,
        f.owner.clone(),
        // Quita o atendimento regularizado (2500 + 600) e o novo (2500).
        crate::commissions::Payout { barber_id: f.barber.id.clone(), expected_amount_cents: 5600, idempotency_key: "payout-paid-without-rule".into() },
    )
    .await
    .unwrap();
    let before = snapshot(&f.db).await;
    let version = checkout_summary(&f.db, f.owner.clone(), paid.id.clone()).await.unwrap().version;
    rejected(
        correct_closing(&f.db, f.owner.clone(), paid.id.clone(), fix(&[(&f.service, 5000), (&other, 2000)], "cash", "Hidratação esquecida", version)).await,
        "COMMISSION_RULE_MISSING",
    );
    assert_eq!(before, snapshot(&f.db).await);
}

#[tokio::test]
async fn financial_summary_covers_any_interval_including_the_whole_last_day() {
    let f = fixture(Db::in_memory().unwrap()).await;
    f.rule().await; // 50% geral
    // f.starts = 09:00 em Brasília. +14h = 23:00 do mesmo dia local.
    let day1 = f.reserve(0).await;
    let day2 = f.reserve(24).await;
    let day2_missed = f.reserve(26).await;
    let day3_late = f.reserve(48 + 14).await;
    let day4 = f.reserve(72).await;
    complete_with_checkout(&f.db, f.barber.clone(), day1.id.clone(), checkout(&[], "pix", 5000)).await.unwrap();
    complete(&f.db, f.barber.clone(), day2.id.clone(), String::new()).await.unwrap(); // sem pagamento registrado
    no_show(&f.db, f.barber.clone(), day2_missed.id.clone()).await.unwrap();
    complete_with_checkout(&f.db, f.barber.clone(), day4.id.clone(), checkout(&[], "pix", 5000)).await.unwrap();
    // Repasse antes do último atendimento do intervalo: dia 1, dia 2 e dia 4 ficam pagos.
    crate::commissions::record_payout(
        &f.db,
        f.owner.clone(),
        crate::commissions::Payout { barber_id: f.barber.id.clone(), expected_amount_cents: 7500, idempotency_key: "payout-range-test-1".into() },
    )
    .await
    .unwrap();
    complete_with_checkout(&f.db, f.barber.clone(), day3_late.id.clone(), checkout(&[], "cash", 5000)).await.unwrap();

    // Do dia 1 às 00:00 de Brasília até o início do dia 4: inclui o dia 3 inteiro.
    let from = f.starts.date_naive().and_hms_opt(3, 0, 0).unwrap().and_utc();
    let to = from + Duration::days(3);
    let summary = crate::commissions::owner_summary(&f.db, f.owner.clone(), from, to).await.unwrap();
    assert_eq!(summary["revenue_cents"], 15000);
    assert_eq!((summary["completed_count"].as_i64(), summary["no_show_count"].as_i64(), summary["total_count"].as_i64()), (Some(3), Some(1), Some(4)));
    assert_eq!(summary["commission_cents"], 7500);
    assert_eq!((summary["commission_paid_cents"].as_i64(), summary["commission_unpaid_cents"].as_i64()), (Some(5000), Some(2500)));
    assert_eq!(summary["retained_cents"], 7500);
    assert_eq!(summary["payments"], serde_json::json!([
        {"method": "cash", "count": 1, "amount_cents": 5000},
        {"method": "not_recorded", "count": 1, "amount_cents": 5000},
        {"method": "pix", "count": 1, "amount_cents": 5000},
    ]));
    assert_eq!(summary["planned_payments"], serde_json::json!([{"method": "Não informado", "count": 1, "amount_cents": 5000}]));

    // Um único dia (data inicial igual à final) inclui o atendimento das 23:00.
    let single = crate::commissions::owner_summary(&f.db, f.owner.clone(), from + Duration::days(2), to).await.unwrap();
    assert_eq!((single["revenue_cents"].as_i64(), single["completed_count"].as_i64()), (Some(5000), Some(1)));

    // Período sem movimentação devolve zeros e listas vazias.
    let empty = crate::commissions::owner_summary(&f.db, f.owner.clone(), from + Duration::days(30), from + Duration::days(31)).await.unwrap();
    assert_eq!((empty["revenue_cents"].as_i64(), empty["commission_cents"].as_i64()), (Some(0), Some(0)));
    assert_eq!(empty["payments"], serde_json::json!([]));
}
