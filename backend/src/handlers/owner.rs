use super::*;

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
    let from = utc_text(from.unwrap());
    let to = utc_text(to.unwrap());
    let business = context.user.business_id;
    let result = state.db.with_conn(move |connection| -> Result<_, AppError> {
        let totals: (i64,i64,i64,i64,i64,i64) = connection.query_row(
            "SELECT COALESCE(SUM(CASE WHEN a.status='completed' THEN a.price_cents ELSE 0 END),0), COUNT(*), COALESCE(SUM(a.status='completed'),0), COALESCE(SUM(a.status='no_show'),0), COALESCE(SUM(CASE WHEN a.status='completed' AND c.status='posted' THEN c.amount_cents ELSE 0 END),0), COALESCE(SUM(a.status='completed' AND (c.status IS NULL OR c.status <> 'posted')),0) FROM appointments a LEFT JOIN commission_snapshots c ON c.business_id=a.business_id AND c.appointment_id=a.id WHERE a.business_id=?1 AND a.starts_at_utc>=?2 AND a.starts_at_utc<?3 AND a.status<>'cancelled'",
            params![business,from,to], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)))?;
        let outstanding: i64 = connection.query_row("SELECT COALESCE(SUM(c.amount_cents),0) FROM commission_snapshots c WHERE c.business_id=?1 AND c.status='posted' AND NOT EXISTS(SELECT 1 FROM commission_payout_items p WHERE p.business_id=c.business_id AND p.appointment_id=c.appointment_id)",params![business],|r|r.get(0))?;
        let mut team_query = connection.prepare("SELECT u.id,u.display_name,u.email,p.photo_url,p.active FROM users u JOIN barber_profiles p ON p.business_id=u.business_id AND p.user_id=u.id WHERE u.business_id=?1 ORDER BY u.display_name")?;
        let team_base = team_query.query_map(params![business],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?,r.get::<_,bool>(4)?)))?.collect::<Result<Vec<_>,_>>()?;
        let mut team = Vec::new();
        for (id,name,email,photo,active) in team_base {
            let (count,revenue):(i64,i64) = connection.query_row("SELECT COUNT(*),COALESCE(SUM(price_cents),0) FROM appointments WHERE business_id=?1 AND barber_user_id=?2 AND starts_at_utc>=?3 AND starts_at_utc<?4 AND status='completed'",params![business,id,from,to],|r|Ok((r.get(0)?,r.get(1)?)))?;
            let balance:i64 = connection.query_row("SELECT COALESCE(SUM(c.amount_cents),0) FROM commission_snapshots c WHERE c.business_id=?1 AND c.barber_user_id=?2 AND c.status='posted' AND NOT EXISTS(SELECT 1 FROM commission_payout_items p WHERE p.business_id=c.business_id AND p.appointment_id=c.appointment_id)",params![business,id],|r|r.get(0))?;
            team.push(json!({"id":id,"name":name,"email":email,"photo_url":photo,"active":active,"completed_count":count,"revenue_cents":revenue,"outstanding_cents":balance}));
        }
        let mut rules_query=connection.prepare("SELECT id,barber_user_id,service_id,rule_type,amount,valid_from_utc,valid_until_utc FROM commission_rules WHERE business_id=?1 AND active=1 ORDER BY priority DESC,created_at_utc DESC")?;
        let rules=rules_query.query_map(params![business],|r|Ok(json!({"id":r.get::<_,String>(0)?,"barber_id":r.get::<_,Option<String>>(1)?,"service_id":r.get::<_,Option<String>>(2)?,"rule_type":r.get::<_,String>(3)?,"amount":r.get::<_,i64>(4)?,"valid_from":r.get::<_,Option<String>>(5)?,"valid_until":r.get::<_,Option<String>>(6)?})))?.collect::<Result<Vec<_>,_>>()?;
        let mut payments_query=connection.prepare("SELECT COALESCE(NULLIF(payment_method,''),'Não informado'),COUNT(*),SUM(price_cents) FROM appointments WHERE business_id=?1 AND status='completed' AND starts_at_utc>=?2 AND starts_at_utc<?3 GROUP BY payment_method")?;
        let payments=payments_query.query_map(params![business,from,to],|r|Ok(json!({"method":r.get::<_,String>(0)?,"count":r.get::<_,i64>(1)?,"amount_cents":r.get::<_,i64>(2)?})))?.collect::<Result<Vec<_>,_>>()?;
        let mut payouts_query=connection.prepare("SELECT p.id,u.display_name,p.amount_cents,p.created_at_utc FROM commission_payouts p JOIN users u ON u.business_id=p.business_id AND u.id=p.barber_user_id WHERE p.business_id=?1 AND p.created_at_utc>=?2 AND p.created_at_utc<?3 ORDER BY p.created_at_utc DESC LIMIT 100")?;
        let payouts=payouts_query.query_map(params![business,from,to],|r|Ok(json!({"id":r.get::<_,String>(0)?,"barber_name":r.get::<_,String>(1)?,"amount_cents":r.get::<_,i64>(2)?,"created_at":r.get::<_,String>(3)?})))?.collect::<Result<Vec<_>,_>>()?;
        Ok(json!({"revenue_cents":totals.0,"total_count":totals.1,"completed_count":totals.2,"no_show_count":totals.3,"commission_cents":totals.4,"commission_pending_count":totals.5,"outstanding_cents":outstanding,"retained_cents":totals.0-totals.4,"team":team,"rules":rules,"payments":payments,"payouts":payouts}))
    }).await?;
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
    let business = context.user.business_id;
    let actor = context.user.id;
    let result=state.db.with_conn(move |connection| -> Result<_,AppError> {
        let tx=connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if let Some((id,existing_barber,amount))=tx.query_row("SELECT id,barber_user_id,amount_cents FROM commission_payouts WHERE business_id=?1 AND idempotency_key=?2",params![business,key],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,i64>(2)?))).optional()? {
            if existing_barber!=barber || amount!=request.expected_amount_cents { return Err(AppError::conflict("IDEMPOTENCY_KEY_REUSED","Chave utilizada em outro repasse.")); }
            return Ok(json!({"id":id,"amount_cents":amount}));
        }
        let items={let mut q=tx.prepare("SELECT c.appointment_id,c.amount_cents FROM commission_snapshots c WHERE c.business_id=?1 AND c.barber_user_id=?2 AND c.status='posted' AND NOT EXISTS(SELECT 1 FROM commission_payout_items p WHERE p.business_id=c.business_id AND p.appointment_id=c.appointment_id)")?;q.query_map(params![business,barber],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?)))?.collect::<Result<Vec<_>,_>>()?};
        let amount: i64=items.iter().map(|(_,amount)|*amount).sum();
        if amount<=0 || amount!=request.expected_amount_cents {return Err(AppError::conflict("BALANCE_CHANGED","O saldo mudou. Atualize a equipe antes de registrar o repasse."));}
        let id=new_id(); let now=utc_text(Utc::now());
        tx.execute("INSERT INTO commission_payouts(id,business_id,barber_user_id,amount_cents,idempotency_key,created_by_user_id,created_at_utc) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![id,business,barber,amount,key,actor,now])?;
        for (appointment,_) in items {tx.execute("INSERT INTO commission_payout_items(business_id,appointment_id,payout_id) VALUES (?1,?2,?3)",params![business,appointment,id])?;}
        insert_audit(&tx,&business,Some(&actor),"commission.payout_recorded","commission_payout",&id,"{}")?;tx.commit()?;
        Ok(json!({"id":id,"amount_cents":amount}))
    }).await?;
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
    let business = context.user.business_id;
    let actor = context.user.id;
    state.db.with_conn(move |connection|->Result<_,AppError>{let tx=connection.transaction_with_behavior(TransactionBehavior::Immediate)?;let now=utc_text(Utc::now());let mut previous=Vec::new();
        for change in &request.changes {
            let appointment=get_appointment(&tx,&business,&change.id)?;
            if appointment.status!=AppointmentStatus::Confirmed || appointment.execution_started {return Err(AppError::conflict("INVALID_TRANSITION","Selecione apenas agendamentos confirmados e não iniciados."));}
            previous.push(appointment);
        }
        // Release the selected slots only inside this transaction; any conflict rolls back the entire batch.
        for item in &previous {tx.execute("UPDATE appointments SET status='cancelled' WHERE business_id=?1 AND id=?2",params![business,item.id])?;}
        for (change,item) in request.changes.iter().zip(previous.iter()) {
            if request.action=="cancel" {
                tx.execute("UPDATE appointments SET cancellation_reason='Cancelado pela gestão em lote',cancelled_at_utc=?1,updated_at_utc=?1,version=version+1 WHERE business_id=?2 AND id=?3",params![now,business,item.id])?;
                insert_history(&tx,&business,&item.id,Some(&actor),"cancelled",Some("confirmed"),Some("cancelled"),None,None,"Cancelado pela gestão em lote")?;
            } else {
                let starts=parse_input_utc(change.starts_at.as_deref().ok_or_else(||AppError::bad_request("INVALID_BATCH","Informe a nova data e hora."))?)?;
                if starts<=Utc::now(){return Err(AppError::bad_request("INVALID_APPOINTMENT","Escolha um horário futuro."));}
                let barber=change.barber_user_id.as_deref().unwrap_or(&item.barber_user_id);valid_id(barber)?;
                let ends=starts+ChronoDuration::minutes(item.duration_minutes);
                ensure_slot_available(&tx,&business,barber,starts,ends,Some(&item.id))?;
                tx.execute("UPDATE appointments SET status='confirmed',barber_user_id=?1,starts_at_utc=?2,ends_at_utc=?3,updated_at_utc=?4,version=version+1 WHERE business_id=?5 AND id=?6",params![barber,utc_text(starts),utc_text(ends),now,business,item.id])?;
                insert_history(&tx,&business,&item.id,Some(&actor),"rescheduled",Some("confirmed"),Some("confirmed"),Some(&utc_text(item.starts_at)),Some(&utc_text(starts)),"Remanejado pela gestão")?;
            }
            insert_audit(&tx,&business,Some(&actor),"appointment.bulk_updated","appointment",&item.id,"{}")?;
        }
        tx.commit()?;Ok(())}).await?;
    Ok(Json(MessageResponse {
        message: "Agenda atualizada",
    }))
}
