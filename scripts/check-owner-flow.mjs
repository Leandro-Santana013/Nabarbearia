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
  const shopToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const day = new Date(`${shopToday}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  const date = day.toISOString().slice(0, 10);
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);
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
  assert.deepEqual(
    (await request(`/admin/schedules?date=${date}`, null, owner)).body,
    [{ barber_user_id: barber.id, start_minute: 600, end_minute: 1200 }],
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
          `(()=>{const element=document.querySelector(${JSON.stringify(selector)});return Boolean(element&&!element.disabled&&element.getAttribute('aria-disabled')!=='true')})()`,
        ),
      `controle habilitado ${selector}`,
    );
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  };
  const setSelected = async (selector, selected) => {
    await until(
      () =>
        evaluate(
          `(()=>{const element=document.querySelector(${JSON.stringify(selector)});return Boolean(element&&!element.disabled)})()`,
        ),
      `controle habilitado ${selector}`,
    );
    const current = await evaluate(
      `(()=>{const element=document.querySelector(${JSON.stringify(selector)});return element.matches('input[type=checkbox]')?element.checked:element.getAttribute('aria-pressed')==='true'})()`,
    );
    if (current !== selected) {
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).click()`,
      );
    }
    await until(
      () =>
        evaluate(
          `(()=>{const element=document.querySelector(${JSON.stringify(selector)});return element&&(element.matches('input[type=checkbox]')?element.checked:element.getAttribute('aria-pressed')==='true')===${JSON.stringify(selected)}})()`,
        ),
      `seleção ${selected ? "ativa" : "inativa"} ${selector}`,
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
  const formSelect = async (label, value) =>
    evaluate(
      `(()=>{const label=[...document.querySelectorAll('[role=dialog] label')].find(el=>el.firstChild?.textContent.trim()===${JSON.stringify(label)});const select=label.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(value)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
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
  await click("Novo serviço");
  await waitText("Novo serviço");
  await formField("Nome", "Barba Express");
  await formField("Categoria", "Barba");
  await formField("Descrição", "Barba com acabamento.");
  await formField("Preço (R$)", "75");
  await formField("Duração (min)", "45");
  await click("Salvar");
  await waitText("Alterações salvas.");
  await waitText("Catálogo de Serviços & Preços (2)");
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
    const normalizedOption = option.replace(/\s+/g, " ").trim();
    await evaluate(
      `(()=>{const trigger=[...document.querySelectorAll('button[aria-labelledby]')].find(el=>document.getElementById(el.getAttribute('aria-labelledby'))?.textContent===${JSON.stringify(label)});trigger.click();})()`,
    );
    await until(
      () =>
        evaluate(
          `[...document.querySelectorAll('[role=option]')].some(el=>el.textContent.replace(/\\s+/g,' ').trim()===${JSON.stringify(normalizedOption)})`,
        ),
      `opção ${option}`,
    );
    await evaluate(
      `[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.replace(/\\s+/g,' ').trim()===${JSON.stringify(normalizedOption)}).click()`,
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
  const teamSummary = (
    await request(`/admin/summary?${new URLSearchParams(range)}`, null, owner)
  ).body;
  const targetBarber = teamSummary.team.find(
    (item) => item.name === "Barbeiro Atualizado",
  );
  const agendaWeekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  for (let weekday = 1; weekday <= 6; weekday++) {
    const offset = (weekday - agendaWeekday + 7) % 7;
    const scheduleDate = new Date(`${date}T12:00:00Z`);
    scheduleDate.setUTCDate(scheduleDate.getUTCDate() + offset);
    const scheduleDateText = scheduleDate.toISOString().slice(0, 10);
    const daySchedules = (
      await request(`/admin/schedules?date=${scheduleDateText}`, null, owner)
    ).body;
    if (!daySchedules.some((item) => item.barber_user_id === targetBarber.id))
      await request(
        "/admin/schedules",
        {
          barber_user_id: targetBarber.id,
          weekday,
          start_minute: 600,
          end_minute: 1200,
        },
        owner,
      );
  }

  console.log(
    "OK: login abre gestão; catálogo ativa/inativa com preço e duração reais; comissão e repasse persistem; barbeiro cadastrado.",
  );
  await click("Agenda Geral");
  await waitText("Data da agenda");
  await evaluate(
    `(()=>{const input=[...document.querySelectorAll('label')].find(el=>el.firstChild?.textContent.trim()==='Data da agenda').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(date)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await waitText("11:00");
  await waitText("Cliente Integração");
  assert.equal(
    await evaluate(
      "document.querySelector('.owner-agenda-grid').innerText.includes('Barbeiro Atualizado')",
    ),
    true,
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  const agendaLayout = () =>
    evaluate(`(() => {
      const table = document.querySelector('.owner-agenda-grid');
      const button = [...table.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === 'Agendar às 10:30 com Barbeiro Atualizado');
      const row = button.closest('tr');
      return [table, ...table.querySelectorAll('thead th'), ...row.cells, button].map((element) => {
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.width, rect.height].map((value) => Math.round(value * 100) / 100);
      });
    })()`);
  const assertAgendaStableOnHover = async (viewport) => {
    await send("Emulation.setDeviceMetricsOverride", viewport);
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1,
      y: 1,
    });
    const hoverTarget = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.owner-agenda-grid button')].find((item) => item.getAttribute('aria-label') === 'Agendar às 10:30 com Barbeiro Atualizado');
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = button.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    const layoutBeforeHover = await agendaLayout();
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: hoverTarget.x,
      y: hoverTarget.y,
    });
    await until(
      () =>
        evaluate(`(() => {
        const button = [...document.querySelectorAll('.owner-agenda-grid button')].find((item) => item.getAttribute('aria-label') === 'Agendar às 10:30 com Barbeiro Atualizado');
        return [...button.querySelectorAll('span')].some((span) => span.textContent.includes('Agendar') && getComputedStyle(span).display !== 'none');
        })()`),
      "ação Agendar visível no hover",
    );
    assert.deepEqual(
      await agendaLayout(),
      layoutBeforeHover,
      "a grade, as colunas e o botão devem manter o tamanho ao exibir Agendar",
    );
  };
  await assertAgendaStableOnHover({
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await assertAgendaStableOnHover({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const selectAll =
    'input[aria-label="Selecionar todos os agendamentos elegíveis"]';
  await setSelected(selectAll, true);
  await waitText("2 selecionado(s)");
  assert.equal(
    await evaluate(
      '(()=>{const edit=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Editar agendamento");const cancel=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Cancelar selecionados");return edit.disabled&&!cancel.disabled})()',
    ),
    true,
  );
  await setSelected(selectAll, false);
  await waitText("0 selecionado(s)");
  await setSelected(
    'button[aria-label$="agendamento de Cliente Integração às 11:00"]',
    true,
  );
  await waitText("1 selecionado(s)");
  await click("Editar agendamento");
  await waitText("Barbeiro responsável");
  await selectOption("Atendimento", "Barba Express · 45 min · R$ 75,00");
  await formField("Nova data", date);
  await formField("Horário", "13:30");
  await selectOption("Barbeiro responsável", "Barbeiro Atualizado");
  await click("Salvar alterações");
  await waitText("Alterações salvas.");
  let list = (await request("/appointments", null, owner)).body;
  const replacementService = (await request("/admin/services", null, owner))
    .body.find((item) => item.name === "Barba Express");
  const edited = list.find((item) => item.id === created[1].id);
  assert.equal(edited.service_id, replacementService.id);
  assert.equal(edited.barber_user_id, targetBarber.id);
  assert.equal(
    new Date(edited.starts_at).toISOString(),
    new Date(`${date}T13:30:00-03:00`).toISOString(),
  );
  assert.equal(
    new Date(edited.ends_at).toISOString(),
    new Date(`${date}T14:15:00-03:00`).toISOString(),
  );
  assert.equal(edited.price_cents, 7500);
  assert.equal(edited.duration_minutes, 45);
  assert.equal(
    list.filter((item) => item.status === "confirmed" && item.id !== created[0].id).length,
    2,
  );
  await waitText("11:00");
  await waitText("Cliente Integração");

  await clickSelector(
    'button[aria-label="Agendar às 15:00 com Barbeiro Atualizado"]',
  );
  await waitText("Novo agendamento");
  await formField("Nome do cliente", "Cliente da Agenda");
  await formField("WhatsApp (opcional)", "(11) 99999-1234");
  await selectOption("Atendimento", "Barba Express · 45 min · R$ 75,00");
  await selectOption("Barbeiro responsável", "Barbeiro Atualizado");
  await formSelect("Pagamento previsto (opcional)", "Pix");
  await formField("Observação (opcional)", "Acabamento curto");
  await click("Confirmar agendamento");
  await waitText("Alterações salvas.");
  list = (await request("/appointments", null, owner)).body;
  const walkIn = list.find((item) => item.client_display_name === "Cliente da Agenda");
  assert.ok(walkIn);
  assert.equal(walkIn.barber_user_id, targetBarber.id);
  assert.equal(walkIn.service_id, replacementService.id);
  assert.equal(walkIn.price_cents, 7500);
  assert.equal(walkIn.duration_minutes, 45);
  assert.equal(walkIn.client_phone, "11999991234");
  assert.equal(walkIn.payment_method, "Pix");
  assert.equal(walkIn.client_note, "Acabamento curto");
  assert.equal(
    new Date(walkIn.starts_at).toISOString(),
    new Date(`${date}T15:00:00-03:00`).toISOString(),
  );

  await setSelected(selectAll, true);
  await waitText("3 selecionado(s)");
  await click("Cancelar selecionados");
  await waitText("Confirmar alterações");
  await click("Confirmar alterações");
  await waitText("Alterações salvas.");
  await until(
    () =>
      evaluate(
        "[...document.querySelectorAll('.owner-agenda-grid tbody tr')].some(row=>row.cells[0]?.innerText.trim()==='11:00'&&!row.cells[1]?.innerText.includes('Agendado'))",
      ),
    "horário cancelado vazio na grade",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.owner-agenda-grid').innerText.includes('Agendado')",
    ),
    false,
  );
  list = (await request("/appointments", null, owner)).body;
  assert.equal(list.filter((item) => item.status === "cancelled").length, 3);
  console.log(
    "OK: seleção original, edição individual, criação pelo horário vazio e cancelamento múltiplo persistem no banco.",
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
        `/admin/schedules?date=${date}`,
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
  // O retorno ao painel de gestão fica no perfil da agenda híbrida.
  await click("Perfil");
  await click("Painel de gestão");
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
