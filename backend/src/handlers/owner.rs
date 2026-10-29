use super::{
    authenticate, idempotency_key, parse_input_utc, require_mutation, require_role, required_text,
    utc_text, valid_id,
};
use crate::{
    AppState, appointments,
    db::insert_audit,
    error::{ApiResult, AppError},
    models::{DateRangeQuery, MessageResponse, Role, ServiceResponse},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{Duration as ChronoDuration, Utc};
use rusqlite::{TransactionBehavior, params};
use std::collections::HashSet;

pub(super) async fn services(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Vec<ServiceResponse>>> {
    let context = authenticate(&state, &headers).await?;
    require_role(&context, Role::Owner)?;
    let business = context.user.business_id;
    let result = state.db.with_conn(move |connection| -> Result<_, AppError> {
        let mut statement = connection.prepare("SELECT id,name,description,category,price_cents,duration_minutes,active FROM services WHERE business_id=?1 ORDER BY category,name")?;
        let items = statement.query_map(params![business], |row| Ok(ServiceResponse { id:row.get(0)?,name:row.get(1)?,description:row.get(2)?,category:row.get(3)?,price_cents:row.get(4)?,duration_minutes:row.get(5)?,active:row.get::<_,i64>(6)? != 0 }))?.collect::<Result<Vec<_>,_>>()?;
        Ok(items)
    }).await?;
    Ok(Json(result))
}

pub(super) async fn summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DateRangeQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let context = authenticate(&state, &headers).await?;
    require_role(&context, Role::Owner)?;
    let from = query.from.as_deref().map(parse_input_utc).transpose()?;
    let to = query.to.as_deref().map(parse_input_utc).transpose()?;
    if from.is_none()
        || to.is_none()
        || to <= from
        || to.unwrap() - from.unwrap() > ChronoDuration::days(366)
    {
        return Err(AppError::bad_request(
            "INVALID_RANGE",
            "Selecione um período de até 366 dias.",
        ));
    }
    let result =
        crate::commissions::owner_summary(&state.db, context.user, from.unwrap(), to.unwrap())
            .await?;
    Ok(Json(result))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PayoutRequest {
    barber_user_id: String,
    expected_amount_cents: i64,
}
pub(super) async fn payout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PayoutRequest>,
) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let barber = valid_id(&request.barber_user_id)?;
    let key = idempotency_key(&headers)?;
    let result = crate::commissions::record_payout(
        &state.db,
        context.user,
        crate::commissions::Payout {
            barber_id: barber,
            expected_amount_cents: request.expected_amount_cents,
            idempotency_key: key,
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(result)))
}

pub(super) async fn enable_hybrid(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<MessageResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let business = context.user.business_id;
    let actor = context.user.id;
    state.db.with_conn(move |connection|->Result<_,AppError>{let tx=connection.transaction_with_behavior(TransactionBehavior::Immediate)?;let now=utc_text(Utc::now());
        tx.execute("INSERT OR IGNORE INTO user_roles(business_id,user_id,role,created_at_utc) VALUES (?1,?2,'barber',?3)",params![business,actor,now])?;
        tx.execute("INSERT INTO barber_profiles(business_id,user_id,active,created_at_utc,updated_at_utc) VALUES (?1,?2,1,?3,?3) ON CONFLICT(business_id,user_id) DO UPDATE SET active=1,updated_at_utc=excluded.updated_at_utc",params![business,actor,now])?;
        insert_audit(&tx,&business,Some(&actor),"owner.hybrid_enabled","user",&actor,"{}")?;tx.commit()?;Ok(())}).await?;
    Ok(Json(MessageResponse {
        message: "Agenda pessoal ativada",
    }))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct BarberEdit {
    display_name: String,
    photo_url: Option<String>,
    active: bool,
}
pub(super) async fn edit_barber(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<BarberEdit>,
) -> ApiResult<Json<MessageResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    let barber = valid_id(&id)?;
    let name = required_text(
        &request.display_name,
        2,
        120,
        "INVALID_NAME",
        "Nome inválido",
    )?;
    let photo = request.photo_url.filter(|p| !p.trim().is_empty());
    if photo
        .as_ref()
        .is_some_and(|p| p.len() > 1000 || !p.starts_with("https://"))
    {
        return Err(AppError::bad_request(
            "INVALID_PHOTO_URL",
            "A foto deve usar HTTPS.",
        ));
    }
    let business = context.user.business_id;
    let actor = context.user.id;
    state.db.with_conn(move |connection|->Result<_,AppError>{let tx=connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let changed=tx.execute("UPDATE barber_profiles SET photo_url=?1,active=?2,updated_at_utc=?3 WHERE business_id=?4 AND user_id=?5",params![photo,request.active,utc_text(Utc::now()),business,barber])?;
        if changed!=1 {return Err(AppError::not_found("BARBER_NOT_FOUND","Profissional não encontrado."));}
        tx.execute("UPDATE users SET display_name=?1,updated_at_utc=?2 WHERE business_id=?3 AND id=?4",params![name,utc_text(Utc::now()),business,barber])?;
        insert_audit(&tx,&business,Some(&actor),"barber.updated","user",&barber,"{}")?;tx.commit()?;Ok(())}).await?;
    Ok(Json(MessageResponse {
        message: "Profissional atualizado",
    }))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct AgendaChange {
    id: String,
    starts_at: Option<String>,
    barber_user_id: Option<String>,
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct BulkRequest {
    action: String,
    changes: Vec<AgendaChange>,
}
pub(super) async fn bulk_agenda(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BulkRequest>,
) -> ApiResult<Json<MessageResponse>> {
    let context = authenticate(&state, &headers).await?;
    require_mutation(&state, &headers, &context)?;
    require_role(&context, Role::Owner)?;
    if !["cancel", "move"].contains(&request.action.as_str())
        || request.changes.is_empty()
        || request.changes.len() > 100
    {
        return Err(AppError::bad_request(
            "INVALID_BATCH",
            "Selecione de 1 a 100 agendamentos.",
        ));
    }
    let mut seen = HashSet::new();
    for change in &request.changes {
        valid_id(&change.id)?;
        if !seen.insert(change.id.clone()) {
            return Err(AppError::bad_request(
                "INVALID_BATCH",
                "Agendamento repetido.",
            ));
        }
    }
    let action = if request.action == "cancel" {
        appointments::BatchAction::Cancel
    } else {
        appointments::BatchAction::Move
    };
    let changes = request
        .changes
        .into_iter()
        .map(|change| {
            let starts_at = if matches!(action, appointments::BatchAction::Move) {
                change
                    .starts_at
                    .as_deref()
                    .map(parse_input_utc)
                    .transpose()?
            } else {
                None
            };
            let barber_id = if matches!(action, appointments::BatchAction::Move) {
                change.barber_user_id.as_deref().map(valid_id).transpose()?
            } else {
                None
            };
            Ok(appointments::AgendaChange {
                id: change.id,
                starts_at,
                barber_id,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    appointments::change_agenda(&state.db, context.user, action, changes).await?;
    Ok(Json(MessageResponse {
        message: "Agenda atualizada",
    }))
}
