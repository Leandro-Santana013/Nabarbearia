use crate::handlers::{
    router,
    tests::{cookie, request_json, test_state},
};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::{Value, json};
use tower::ServiceExt;

const PASSWORD: &str = "TestPassword123!";
const BOOTSTRAP: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

async fn fixture() -> (crate::AppState, axum::Router, String, Value) {
    let state = test_state();
    let app = router(state.clone());
    let (_, headers, owner) = request_json(&app, "POST", "/api/v1/setup/owner", json!({
        "business_name":"Account Test", "timezone":"America/Sao_Paulo", "email":"owner@account.test",
        "password":PASSWORD, "display_name":"Owner"
    }), None, None, Some(BOOTSTRAP)).await;
    (state, app, cookie(&headers), owner)
}

fn profile(email: &str) -> Value {
    json!({"display_name":"Nome atualizado", "email":email, "phone":"13999998888"})
}

#[tokio::test]
async fn client_and_barber_can_update_only_their_own_account() {
    let (state, app, owner_cookie, owner) = fixture().await;
    let (_, _, barber) = request_json(
        &app,
        "POST",
        "/api/v1/admin/barbers",
        json!({
            "email":"barber@account.test","password":PASSWORD,"display_name":"Barber"
        }),
        Some(&owner_cookie),
        owner["csrf_token"].as_str(),
        None,
    )
    .await;
    let (_, _, rule) = request_json(
        &app,
        "POST",
        "/api/v1/admin/commission-rules",
        json!({
            "barber_user_id":barber["id"],"rule_type":"percent","amount":5000
        }),
        Some(&owner_cookie),
        owner["csrf_token"].as_str(),
        None,
    )
    .await;
    assert!(!rule.is_null());
    for (email, login_path, role) in [
        ("client@account.test", "/api/v1/auth/register", "client"),
        ("barber@account.test", "/api/v1/auth/staff/login", "barber"),
    ] {
        let mut payload = json!({"email":email,"password":PASSWORD});
        if role == "client" {
            payload["display_name"] = json!("Client");
        }
        let (status, headers, auth) =
            request_json(&app, "POST", login_path, payload, None, None, None).await;
        assert_eq!(status, StatusCode::OK);
        let auth_cookie = cookie(&headers);
        let csrf = auth["csrf_token"].as_str();
        let (status, _, saved) = request_json(
            &app,
            "PATCH",
            "/api/v1/account",
            profile(email),
            Some(&auth_cookie),
            csrf,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(saved["id"], auth["user"]["id"]);
        assert_eq!(saved["roles"], json!([role]));
        assert_eq!(saved["phone"], "13999998888");
        // Commission, roles and the target identity are not accepted by this endpoint.
        for (field, value) in [
            ("commission", json!(100)),
            ("amount", json!(9999)),
            ("roles", json!(["owner"])),
            ("user_id", owner["user"]["id"].clone()),
            ("business_id", json!("other")),
        ] {
            let mut malicious = profile(email);
            malicious[field] = value;
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("PATCH")
                        .uri("/api/v1/account")
                        .header("content-type", "application/json")
                        .header("origin", "http://127.0.0.1:5173")
                        .header("cookie", &auth_cookie)
                        .header("x-csrf-token", csrf.unwrap())
                        .body(Body::from(malicious.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        }
        let (status, _, _) = request_json(
            &app,
            "POST",
            "/api/v1/admin/commission-rules",
            json!({
                "barber_user_id":barber["id"],"rule_type":"percent","amount":9999
            }),
            Some(&auth_cookie),
            csrf,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        let (_, _, restored) = request_json(
            &app,
            "GET",
            "/api/v1/auth/session",
            json!({}),
            Some(&auth_cookie),
            None,
            None,
        )
        .await;
        assert_eq!(restored["user"]["display_name"], "Nome atualizado");
        assert_eq!(restored["user"]["phone"], "13999998888");
    }
    state
        .db
        .with_conn(|connection| -> Result<(), crate::error::AppError> {
            assert_eq!(
                connection.query_row("SELECT amount FROM commission_rules", [], |r| r
                    .get::<_, i64>(0))?,
                5000
            );
            assert_eq!(
                connection.query_row(
                    "SELECT display_name FROM users WHERE email='owner@account.test'",
                    [],
                    |r| r.get::<_, String>(0)
                )?,
                "Owner"
            );
            Ok(())
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn credential_changes_require_password_and_revoke_other_sessions() {
    let (_, app, _, _) = fixture().await;
    let (_, headers, auth) = request_json(
        &app,
        "POST",
        "/api/v1/auth/register",
        json!({
            "email":"client@account.test","password":PASSWORD,"display_name":"Client"
        }),
        None,
        None,
        None,
    )
    .await;
    let auth_cookie = cookie(&headers);
    let csrf = auth["csrf_token"].as_str();
    let (_, other_headers, _) = request_json(
        &app,
        "POST",
        "/api/v1/auth/login",
        json!({"email":"client@account.test","password":PASSWORD}),
        None,
        None,
        None,
    )
    .await;
    let mut update = profile("new@account.test");
    let (status, _, error) = request_json(
        &app,
        "PATCH",
        "/api/v1/account",
        update.clone(),
        Some(&auth_cookie),
        csrf,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(error["code"], "CURRENT_PASSWORD_REQUIRED");
    update["current_password"] = json!("incorrect-password");
    let (status, _, error) = request_json(
        &app,
        "PATCH",
        "/api/v1/account",
        update.clone(),
        Some(&auth_cookie),
        csrf,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(error["code"], "INCORRECT_PASSWORD");
    update["current_password"] = json!(PASSWORD);
    update["new_password"] = json!("NewPassword123456!");
    let (status, _, saved) = request_json(
        &app,
        "PATCH",
        "/api/v1/account",
        update,
        Some(&auth_cookie),
        csrf,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(saved["email"], "new@account.test");
    let (status, _, _) = request_json(
        &app,
        "GET",
        "/api/v1/auth/session",
        json!({}),
        Some(&cookie(&other_headers)),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, _) = request_json(
        &app,
        "GET",
        "/api/v1/auth/session",
        json!({}),
        Some(&auth_cookie),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    for (email, password, expected) in [
        ("client@account.test", PASSWORD, StatusCode::UNAUTHORIZED),
        ("new@account.test", PASSWORD, StatusCode::UNAUTHORIZED),
        ("new@account.test", "NewPassword123456!", StatusCode::OK),
    ] {
        let (status, _, body) = request_json(
            &app,
            "POST",
            "/api/v1/auth/login",
            json!({"email":email,"password":password}),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(status, expected);
        if expected == StatusCode::OK {
            assert_eq!(body["user"]["phone"], "13999998888");
        }
    }
}

#[tokio::test]
async fn account_rejects_invalid_data_csrf_and_duplicate_email_atomically() {
    let (state, app, auth_cookie, auth) = fixture().await;
    let csrf = auth["csrf_token"].as_str();
    for (auth_header, csrf_header, status) in [
        (None, None, StatusCode::UNAUTHORIZED),
        (Some(auth_cookie.as_str()), None, StatusCode::FORBIDDEN),
    ] {
        assert_eq!(
            request_json(
                &app,
                "PATCH",
                "/api/v1/account",
                profile("owner@account.test"),
                auth_header,
                csrf_header,
                None
            )
            .await
            .0,
            status
        );
    }
    request_json(
        &app,
        "POST",
        "/api/v1/auth/register",
        json!({"email":"taken@account.test","password":PASSWORD,"display_name":"Other"}),
        None,
        None,
        None,
    )
    .await;
    for (field, value, code) in [
        ("phone", json!("abc"), "INVALID_PHONE"),
        ("display_name", json!("x"), "INVALID_NAME"),
        ("email", json!("bad"), "INVALID_EMAIL"),
        ("new_password", json!("short"), "INVALID_PASSWORD"),
    ] {
        let mut update = profile("owner@account.test");
        update[field] = value;
        let (status, _, error) = request_json(
            &app,
            "PATCH",
            "/api/v1/account",
            update,
            Some(&auth_cookie),
            csrf,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(error["code"], code);
    }
    let mut duplicate = profile("taken@account.test");
    duplicate["current_password"] = json!(PASSWORD);
    assert_eq!(
        request_json(
            &app,
            "PATCH",
            "/api/v1/account",
            duplicate,
            Some(&auth_cookie),
            csrf,
            None
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    state.db.with_conn(|connection| -> Result<(),crate::error::AppError> {
        connection.execute_batch("CREATE TRIGGER reject_account_audit BEFORE INSERT ON audit_log WHEN NEW.action='account.updated' BEGIN SELECT RAISE(ABORT,'test failure'); END;")?;
        Ok(())
    }).await.unwrap();
    assert_eq!(
        request_json(
            &app,
            "PATCH",
            "/api/v1/account",
            profile("owner@account.test"),
            Some(&auth_cookie),
            csrf,
            None
        )
        .await
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    let (_, _, restored) = request_json(
        &app,
        "GET",
        "/api/v1/auth/session",
        json!({}),
        Some(&auth_cookie),
        None,
        None,
    )
    .await;
    assert_eq!(restored["user"]["display_name"], "Owner");
    assert_eq!(restored["user"]["phone"], "");
}
