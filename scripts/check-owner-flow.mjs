import { createFlowTest } from './test-support/flow-test.mjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const test = createFlowTest('owner')
const { root, temp, origin, token, password, until, request, send, evaluate, runtimeErrors } = test
try {
  await test.startBackend()
  const setup = await request(
    "/setup/owner",
    {
      business_name: "NA Teste",
      timezone: "America/Sao_Paulo",
      email: "owner@client-flow.test",
      password,
      display_name: "Proprietário Teste",
    },
    null,
    { "X-Bootstrap-Token": token },
  );
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf_token };
  const service = (
    await request(
      "/admin/services",
      {
        name: "(COMBO 2) Corte + Barba",
        description: "Corte de cabelo + barba com toalha quente.",
        category: "COMBOS",
        price_cents: 9000,
        duration_minutes: 60,
        active: true,
      },
      owner,
    )
  ).body;
  const barber = (
    await request(
      "/admin/barbers",
      { display_name: "Sorriso", email: "barber@client-flow.test", password },
      owner,
    )
  ).body;
  for (let weekday = 1; weekday <= 6; weekday++)
    await request(
      "/admin/schedules",
      {
        barber_user_id: barber.id,
        weekday,
        start_minute: 600,
        end_minute: 1200,
      },
      owner,
    );
  const client = (
    await request("/auth/register", {
      email: "client@client-flow.test",
      password,
      display_name: "Cliente Integração",
    })
  ).body;

  await test.startBrowser()
  const text = async () =>
    (await evaluate("document.body.innerText")).replace(/\u00a0/g, " ");
  const waitText = (value) =>
    until(async () => (await text()).includes(value), value);
  const click = async (label) => {
    await until(
      () =>
        evaluate(
          `Boolean([...document.querySelectorAll('button, [role=menuitem]')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}))`,
        ),
      `botão ${label}`,
    );
    await evaluate(
      `[...document.querySelectorAll('button, [role=menuitem]')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}).click()`,
    );
  };
  const clickSelector = async (selector) => {
    await until(
      () =>
        evaluate(
          `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
        ),
      selector,
    );
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  };
  const navigate = async (path) => {
    await send("Page.navigate", { url: `${origin}${path}` });
  };
  const appointments = () =>
    evaluate("fetch('/api/v1/appointments').then(r=>r.json())");
  const fill = (selector, value) =>
    evaluate(
      `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate("/painel");
  await waitText("Bem-vindo de volta!");
  await fill('input[name="email"]', "owner@client-flow.test");
  await fill('input[name="password"]', password);
  await click("Entrar");
  await waitText("Painel de Gestão — NA Barbearia");
  assert.equal(await evaluate("location.pathname"), "/gestao/financeiro");
  await waitText("Resumo por forma de pagamento prevista");
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  const formField = async (label, value) =>
    evaluate(
      `(()=>{const label=[...document.querySelectorAll('[role=dialog] label')].find(el=>el.firstChild?.textContent.trim()===${JSON.stringify(label)});const input=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  await click("Serviços");
  await waitText("Catálogo de Serviços & Preços (1)");
  await click("Editar serviço");
  await waitText("Preço (R$)");
  await formField("Preço (R$)", "100");
  await formField("Duração (min)", "30");
  await clickSelector("[role=dialog] input[type=checkbox]");
  await click("Salvar");
  await waitText("Alterações salvas.");
  assert.equal((await request("/public/services")).body.length, 0);
  await click("Editar serviço");
  await waitText("Preço (R$)");
  await clickSelector("[role=dialog] input[type=checkbox]");
  await click("Salvar");
  await waitText("Alterações salvas.");
  assert.equal((await request("/public/services")).body[0].price_cents, 10000);
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  const date = day.toISOString().slice(0, 10);
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);
  const created = [];
  for (const time of ["10:00", "11:00", "12:00"])
    created.push(
      (
        await request(
          "/admin/appointments",
          {
            client_user_id: client.user.id,
            barber_user_id: barber.id,
            service_id: service.id,
            starts_at: new Date(`${date}T${time}:00-03:00`).toISOString(),
          },
          owner,
          { "Idempotency-Key": `owner-test-${time.replace(":", "-")}-booking` },
        )
      ).body,
    );
  await request(
    `/appointments/${created[0].id}/complete`,
    { notes: "" },
    owner,
  );
  const range = {
    from: `${date.slice(0, 7)}-01T03:00:00Z`,
    to: new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1, 3),
    ).toISOString(),
  };
  await click("Equipe");
  await waitText("Equipe (1 profissionais)");
  await click("Comissão");
  await waitText("Comissão por barbeiro e serviço");
  await formField("Comissão (%)", "50");
  await click("Salvar regra de comissão");
  await waitText("R$ 50,00");
  let summary = (
    await request(`/admin/summary?${new URLSearchParams(range)}`, null, owner)
  ).body;
  assert.equal(summary.commission_pending_count, 0);
  assert.equal(summary.outstanding_cents, 5000);
  await click("Registrar repasse");
  await waitText("Confirmar repasse realizado");
  await click("Confirmar repasse realizado");
  await waitText("Repasse registrado.");
  summary = (
    await request(`/admin/summary?${new URLSearchParams(range)}`, null, owner)
  ).body;
  assert.equal(summary.outstanding_cents, 0);
  // Production follows the scheduled appointment date; payouts follow the date
  // they were recorded. Include today even if tomorrow's fixture is next month.
  const payoutRange = {
    from: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T00:00:00Z`,
    to: range.to,
  };
  const payoutSummary = (
    await request(`/admin/summary?${new URLSearchParams(payoutRange)}`, null, owner)
  ).body;
  assert.equal(payoutSummary.payouts.length, 1);
  assert.equal(payoutSummary.payouts[0].amount_cents, 5000);
  await click("Novo barbeiro");
  await waitText("Senha inicial");
  await formField("Nome", "Barbeiro Novo");
  await formField("E-mail de acesso", "new@owner-flow.test");
  await formField("Senha inicial", password);
  await click("Salvar");
  await waitText("Equipe (2 profissionais)");
  const selectOption = async (label, option) => {
    await evaluate(
      `(()=>{const trigger=[...document.querySelectorAll('button[aria-labelledby]')].find(el=>document.getElementById(el.getAttribute('aria-labelledby'))?.textContent===${JSON.stringify(label)});trigger.click();})()`,
    );
    await until(
      () =>
        evaluate(
          `[...document.querySelectorAll('[role=option]')].some(el=>el.textContent.trim()===${JSON.stringify(option)})`,
        ),
      `opção ${option}`,
    );
    await evaluate(
      `[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim()===${JSON.stringify(option)}).click()`,
    );
  };
  const rowAction = (name, label) =>
    evaluate(
      `(()=>{const row=[...document.querySelectorAll('tbody tr')].find(el=>el.textContent.includes(${JSON.stringify(name)}));[...row.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)}).click();})()`,
    );
  await rowAction("Barbeiro Novo", "Editar");
  await waitText("Foto (URL HTTPS, opcional)");
  await formField("Nome", "Barbeiro Atualizado");
  await click("Salvar");
  await waitText("Barbeiro Atualizado");
  await rowAction("Barbeiro Atualizado", "Escala");
  await waitText("Dia da semana");
  await selectOption("Dia da semana", "Quarta");
  await click("Salvar");
  await waitText("Alterações salvas.");

  console.log(
    "OK: login abre gestão; catálogo ativa/inativa com preço e duração reais; comissão e repasse persistem; barbeiro cadastrado.",
  );
  await click("Agenda Geral");
  await waitText("Data da agenda");
  await evaluate(
    `(()=>{const input=[...document.querySelectorAll('label')].find(el=>el.firstChild?.textContent.trim()==='Data da agenda').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(date)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await waitText("11:00");
  const selectAll =
    'input[aria-label="Selecionar todos os agendamentos elegíveis"]';
  await clickSelector(selectAll);
  await click("Remanejar selecionados");
  await waitText("Nova data");
  await formField("Nova data", nextDate);
  await click("Confirmar alterações");
  await waitText("Alterações salvas.");
  let list = (await request("/appointments", null, owner)).body;
  assert.equal(
    list.filter(
      (item) =>
        item.status === "confirmed" && item.starts_at.startsWith(nextDate),
    ).length,
    2,
  );
  await evaluate(
    `(()=>{const input=[...document.querySelectorAll('label')].find(el=>el.firstChild?.textContent.trim()==='Data da agenda').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(nextDate)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await waitText("11:00");
  await clickSelector(selectAll);
  await click("Cancelar selecionados");
  await waitText("Confirmar alterações");
  await click("Confirmar alterações");
  await waitText("Alterações salvas.");
  list = (await request("/appointments", null, owner)).body;
  assert.equal(list.filter((item) => item.status === "cancelled").length, 2);
  console.log(
    "OK: remanejamento e cancelamento em lote persistem sem duplicar reservas.",
  );
  // Permission checks, payout retry protection and transactional rollback.
  const clientLogin = await request("/auth/login", {
    email: "client@client-flow.test",
    password,
  });
  const clientAuth = {
    cookie: clientLogin.cookie,
    csrf: clientLogin.body.csrf_token,
  };
  async function raw(path, body, auth, method = "POST", extra = {}) {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: auth.cookie,
        "X-CSRF-Token": auth.csrf,
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }
  assert.equal(
    (
      await raw(
        "/admin/summary?" + new URLSearchParams(range),
        null,
        clientAuth,
        "GET",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await raw(
        "/admin/agenda/bulk",
        { action: "cancel", changes: [{ id: created[0].id }] },
        clientAuth,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await raw(
        "/admin/payouts",
        { barber_user_id: barber.id, expected_amount_cents: 5000 },
        owner,
        "POST",
        { "Idempotency-Key": "already-paid-owner-test" },
      )
    ).status,
    409,
  );
  const extra = [];
  for (const time of ["14:00", "15:00"])
    extra.push(
      (
        await request(
          "/admin/appointments",
          {
            client_user_id: client.user.id,
            barber_user_id: barber.id,
            service_id: service.id,
            starts_at: new Date(`${nextDate}T${time}:00-03:00`).toISOString(),
          },
          owner,
          {
            "Idempotency-Key": `rollback-${time.replace(":", "-")}-owner-test`,
          },
        )
      ).body,
    );
  const conflicting = extra.map((item) => ({
    id: item.id,
    starts_at: new Date(`${nextDate}T16:00:00-03:00`).toISOString(),
    barber_user_id: barber.id,
  }));
  assert.equal(
    (
      await raw(
        "/admin/agenda/bulk",
        { action: "move", changes: conflicting },
        owner,
      )
    ).status,
    409,
  );
  list = (await request("/appointments", null, owner)).body;
  assert(
    extra.every(
      (before) =>
        list.find((item) => item.id === before.id)?.starts_at ===
        before.starts_at,
    ),
  );
  console.log(
    "OK: cliente não acessa gestão; repasse duplicado é rejeitado; conflito reverte todo o lote.",
  );
  await request(`/appointments/${extra[0].id}/complete`, { notes: "" }, owner);
  const key = { "Idempotency-Key": "retry-payout-owner-test-key" };
  const firstPayout = await raw(
    "/admin/payouts",
    { barber_user_id: barber.id, expected_amount_cents: 5000 },
    owner,
    "POST",
    key,
  );
  const samePayout = await raw(
    "/admin/payouts",
    { barber_user_id: barber.id, expected_amount_cents: 5000 },
    owner,
    "POST",
    key,
  );
  assert.equal(firstPayout.status, 201);
  assert.equal(samePayout.status, 201);
  assert.equal(firstPayout.body.id, samePayout.body.id);
  assert.equal(
    (
      await raw(
        "/admin/payouts",
        { barber_user_id: barber.id, expected_amount_cents: 5000 },
        owner,
        "POST",
        { "Idempotency-Key": "second-new-key-payout-test" },
      )
    ).status,
    409,
  );

  // Summary, payment eligibility and barber earnings must agree on this same DB.
  // A broad period includes both future appointment starts and today's completion.
  const financeRange = {
    from: `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}T00:00:00Z`,
    to: `${new Date(next.getTime() + 7 * 86400000).toISOString().slice(0, 10)}T00:00:00Z`,
  };
  const financeSummary = (
    await request(`/admin/summary?${new URLSearchParams(financeRange)}`, null, owner)
  ).body;
  const ownerEarnings = (await request("/reports/revenue", null, owner)).body;
  const barberLogin = await request("/auth/staff/login", {
    email: "barber@client-flow.test", password,
  });
  const barberAuth = { cookie: barberLogin.cookie, csrf: barberLogin.body.csrf_token };
  const barberEarnings = (await request("/reports/revenue", null, barberAuth)).body;
  assert.equal(financeSummary.commission_cents, 10000);
  assert.equal(financeSummary.outstanding_cents, 0);
  assert.equal(financeSummary.commission_pending_count, 0);
  assert.equal(financeSummary.retained_cents, financeSummary.revenue_cents - financeSummary.commission_cents);
  assert.equal(ownerEarnings.commission_cents, financeSummary.commission_cents);
  assert.equal(ownerEarnings.revenue_cents, financeSummary.revenue_cents);
  assert.deepEqual(barberEarnings, ownerEarnings);
  assert.equal(financeSummary.payouts.reduce((sum, payout) => sum + payout.amount_cents, 0), 10000);
  console.log("OK: resumo do proprietário, repasses e ganhos do barbeiro conferem no mesmo banco; comissão paga continua na produção.");

  await click("Financeiro");
  await waitText("Repasses registrados no período");
  writeFileSync(
    join(temp, "owner-mobile.png"),
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1360,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  writeFileSync(
    join(temp, "owner-desktop.png"),
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  await click("Modo Híbrido: Minha Agenda");
  await waitText("Ativar e abrir minha agenda");
  await click("Ativar e abrir minha agenda");
  await waitText("Olá, Proprietário Teste!");
  assert.equal(await evaluate("location.pathname"), "/gestao/minha-agenda");
  assert.equal(
    (
      await evaluate("fetch('/api/v1/auth/session').then(r=>r.json())")
    ).user.roles.includes("barber"),
    true,
  );
  await click("Voltar ao Painel Geral");
  await waitText("Resumo por forma de pagamento prevista");
  assert.deepEqual(runtimeErrors, []);
  console.log(
    "OK: modo híbrido habilita agenda própria; nenhuma exceção de runtime.",
  );
  console.log(
    `Capturas: ${join(temp, "owner-mobile.png")} e ${join(temp, "owner-desktop.png")}`,
  );
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally {
  await test.close()
}
