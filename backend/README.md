# Backend — NA Barbearia

API Rust/Axum com SQLite para autenticação, catálogo, disponibilidade, agendamentos, execução de serviços, comissões e gestão do proprietário. A visão geral da aplicação está no [README principal](../README.md).

## Execução local

A partir da raiz do repositório, com Node.js 24 e Rust estável instalados:

```bash
npm run dev:backend
```

O script `scripts/dev-backend.mjs` lê `backend/.env`, respeita variáveis já definidas no ambiente e gera um token de bootstrap aleatório quando necessário. O token fica no arquivo local ignorado pelo Git. As migrações são aplicadas na inicialização.

A API usa `http://127.0.0.1:3001/api/v1`. O endpoint `GET /health` retorna `{"status":"ok"}`. Com o frontend compilado em `dist/`, a aplicação também é servida pelo backend na porta 3001.

Para executar Cargo diretamente, injete as variáveis no ambiente antes de chamar:

```bash
cargo run --manifest-path backend/Cargo.toml
```

O binário Rust não carrega `.env` por conta própria; essa leitura é feita pelo script Node.

## Configuração

Use [`.env.example`](.env.example) como referência e mantenha valores reais em `backend/.env` ou nas variáveis do ambiente.

| Variável | Padrão / finalidade |
| --- | --- |
| `NABARBEARIA_BIND` | `127.0.0.1:3001` |
| `NABARBEARIA_DB_PATH` | `backend/data/nabarbearia.db` |
| `NABARBEARIA_FRONTEND_DIR` | `dist` |
| `NABARBEARIA_BOOTSTRAP_TOKEN` | Obrigatória; token aleatório gerado pelo script local quando ausente |
| `NABARBEARIA_ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` |
| `NABARBEARIA_SECURE_COOKIES` | `false` no desenvolvimento local |
| `NABARBEARIA_SESSION_DAYS` | `7` |
| `NABARBEARIA_TIMEZONE` | `America/Sao_Paulo` |

Datas da API usam UTC. As interfaces exibem datas e horários da barbearia em São Paulo. Mudar a porta da API exige ajustar também o proxy do frontend.

## Primeiro proprietário

Consulte `GET /api/v1/setup/status`. Quando `needs_owner` for `true`, crie a primeira conta usando `POST /api/v1/setup/owner`:

- Headers: `Content-Type: application/json`, `Origin` permitido e `X-Bootstrap-Token` com o token local configurado.
- Corpo: `business_name`, `timezone`, `email`, `password` e `display_name`.
- `timezone` deve corresponder à configuração do backend.

O endpoint é destinado à configuração inicial; não redefine uma conta existente. Não há senha universal de proprietário. O cadastro público cria clientes; contas de barbeiro são cadastradas pelo proprietário.

## Endpoints principais

Todos os caminhos abaixo têm o prefixo `/api/v1`.

| Área | Endpoints |
| --- | --- |
| Saúde e configuração | `GET /health`, `GET /setup/status`, `POST /setup/owner` |
| Autenticação | `POST /auth/register`, `POST /auth/login`, `GET /auth/session`, `POST /auth/logout` |
| Própria conta | `PATCH /account` (nome, e-mail, telefone e senha; sem comissão ou permissões) |
| Catálogo público | `GET /public/services`, `GET /public/barbers`, `GET /public/availability` |
| Agendamentos | `GET/POST /appointments`, `PATCH /appointments/{id}/reschedule`, `POST /appointments/{id}/cancel` |
| Execução e avaliação | `POST /appointments/{id}/start`, `POST /appointments/{id}/complete`, `POST /appointments/{id}/no-show`, `POST /appointments/{id}/rating` |
| Detalhes operacionais | `PATCH /appointments/{id}/details` |
| Agenda do barbeiro | `POST /barber/walk-ins`, `GET/POST /barber/blocks` |
| Serviços | `GET/POST /admin/services`, `PUT /admin/services/{id}` |
| Equipe e escalas | `POST /admin/barbers`, `PUT /admin/barbers/{id}`, `POST /admin/schedules`, `POST /admin/blocks` |
| Comissões e repasses | `POST /admin/commission-rules`, `POST /admin/payouts` |
| Gestão | `GET /admin/summary`, `POST /admin/agenda/bulk`, `POST /admin/my-barber-profile` |
| Relatórios | `GET /reports/revenue`, `GET /admin/reports/revenue` |
| Consentimentos | `POST /consents` |

Mutações autenticadas exigem cookie de sessão, `Origin` permitido e `X-CSRF-Token`. Criação de agendamentos, encaixes e registro de repasses também exigem `Idempotency-Key`, de 16 a 128 caracteres no formato aceito pela API. Repetir a mesma chave com dados diferentes gera conflito.

Clientes acessam seus próprios agendamentos. Barbeiros acessam a própria operação. Gestão de catálogo, equipe, comissões e repasses exige papel `owner`. As consultas e alterações são isoladas por negócio.

`PATCH /account` altera somente a conta da sessão. Recebe `display_name`, `email` e `phone` (vazio ou de 10 a 13 dígitos com DDD), além de `current_password` e `new_password` opcionais. A senha atual é obrigatória ao alterar e-mail ou senha; a nova senha segue o limite de 12 a 128 caracteres. Essas mudanças encerram as outras sessões e mantêm a sessão atual. Campos de comissão, papel, negócio ou identidade de outro usuário são rejeitados. Dados e auditoria são gravados na mesma transação; o retorno contém o usuário atualizado, sem senhas.

## Agenda e execução

- Reservas usam preço e duração registrados no momento da criação, preservando o histórico após mudanças no catálogo.
- Disponibilidade considera escalas, bloqueios e reservas confirmadas.
- Encaixes presenciais criam uma identidade interna inativa, sem acesso de login.
- Telefone, pagamento previsto e observação ficam no agendamento; proprietário e barbeiro responsável podem editá-los.
- Início, conclusão, falta e alterações da agenda são persistidos.
- Pausas não podem sobrepor reservas confirmadas. O barbeiro só pode criar encaixes e bloqueios para si.

## Comissões e repasses

Regras podem ser gerais ou vinculadas a barbeiro/serviço. Percentuais usam pontos-base: `rule_type: "percent", amount: 5000` representa **50%**. O formulário converte o percentual informado para esse formato.

Ao concluir um atendimento, a API aplica a regra compatível e registra o snapshot e o lançamento financeiro na mesma transação. Sem regra, a comissão fica pendente de configuração. Salvar uma regra regulariza pendências compatíveis, preservando comissões já calculadas. Regras novas com o mesmo escopo, prioridade e vigência substituem a regra ativa anterior.

`POST /admin/payouts` recebe `barber_user_id` e `expected_amount_cents`. O endpoint registra um repasse **já realizado**, sem transferir dinheiro. Cada comissão é vinculada uma única vez ao repasse. Mudança no saldo esperado retorna `409`; repetir a mesma chave de idempotência recupera o registro existente.

## Gestão e ações em lote

`GET /admin/summary?from=...&to=...` aceita períodos de até 366 dias. Retorna produção, faltas, equipe, regras, pagamentos previstos e repasses. A produção segue a data programada dos atendimentos; os saldos a repassar são acumulados. Forma prevista não representa recebimento conciliado, e o saldo após comissões não equivale ao lucro líquido sem despesas.

`POST /admin/agenda/bulk` recebe:

```json
{
  "action": "cancel",
  "changes": [
    {
      "id": "ID_DO_AGENDAMENTO"
    }
  ]
}
```

Use `action: "cancel"` com apenas os IDs ou `action: "move"` com as novas datas/horários; o profissional é opcional no remanejamento. O lote aceita de 1 a 100 IDs únicos, somente de reservas confirmadas e não iniciadas. Conflitos ou dados inválidos desfazem todo o lote, incluindo histórico e auditoria.

`POST /admin/my-barber-profile` ativa o perfil de barbeiro do próprio dono, mantendo seu papel de proprietário. Cadastre sua escala para disponibilizar horários.

## Banco e migrações

As migrações ficam em `backend/migrations/` e são aplicadas automaticamente. Não edite migrações já aplicadas para alterar o esquema; acrescente uma nova versão.

As versões 0007 e 0008 acrescentam detalhes operacionais ao agendamento e registros de repasses com associação às comissões. O banco versionado é um snapshot de demonstração. Bancos em uso e arquivos WAL/SHM locais não devem ser incluídos nas atualizações de código.

## Organização das operações de agenda

`src/appointments/` oferece comandos completos de criação, recepção/encaixe, remarcação, cancelamento, início, conclusão, falta, detalhes e lote. Cada comando recebe `Db`, a identidade autenticada e dados de entrada; concentra permissões de negócio, conflitos, gravações, histórico e auditoria sob uma transação imediata. Os handlers mantêm autenticação/CSRF, validação sintática e respostas HTTP. O módulo de operações usa erros próprios, traduzidos em `src/error.rs`, sem depender de Axum.

O lote libera e ocupa horários dentro da mesma transação, permitindo trocas entre selecionados e revertendo todos os itens em caso de falha. A conclusão grava execução, receita e comissão antes do mesmo commit, chamando `commissions/settlement.rs` dentro dessa transação. Não houve migração de esquema nesta extração.

Os testes em `src/appointments/tests.rs` usam SQLite real e incluem conexões independentes concorrentes, repetição idempotente, isolamento por negócio e falhas induzidas de auditoria/comissão. O resultado local e os limites estão em [RESULTADO-F3-ARQUITETURA](../docs/RESULTADO-F3-ARQUITETURA.md).

## Organização financeira

`src/commissions/` concentra regras, cálculo histórico, regularização, elegibilidade, repasses e projeções financeiras. Criar regra e registrar repasse são operações completas com identidade autenticada e uma transação imediata própria. O cálculo participa da transação de conclusão sem confirmar alterações por conta própria. Comissões já postadas não são recalculadas; regularização e pagamento têm rollback integral, incluindo auditoria. Saldo exibido e repasse usam a mesma política de elegibilidade.

O resumo do proprietário seleciona produção pela data de início da agenda; o relatório de ganhos seleciona pela conclusão. Saldo a repassar é acumulado, sem filtro de período, e comissões pagas continuam na produção. Cada projeção usa um snapshot transacional. Repasse registra pagamento já efetuado e exige o saldo esperado; repetir a mesma chave devolve o registro original, sem consumir novos ganhos. `retained_cents` significa receita menos comissão, sem apuração de despesas/impostos ou lucro líquido. Os contratos HTTP permanecem compatíveis.

Os testes em `src/commissions/tests.rs` cobrem regras/vigência, centavos, histórico, regularização, permissões, períodos, rollback e repasses concorrentes por duas conexões SQLite. Resultado, evidências e limites em [RESULTADO-F4-ARQUITETURA](../docs/RESULTADO-F4-ARQUITETURA.md).

## Verificações

```bash
cargo fmt --manifest-path backend/Cargo.toml --check
cargo test --manifest-path backend/Cargo.toml
cargo clippy --manifest-path backend/Cargo.toml -- -D warnings
```

Os fluxos completos da aplicação são verificados por `npm run test:client-flow` e `npm run test:owner-flow`, com banco e API temporários; execute um por vez. Consulte os requisitos no [README principal](../README.md#testes-e-verificações).

## Operação

- Se a porta 3001 já estiver ocupada, verifique `/api/v1/health` antes de iniciar outra instância. Para reiniciar a existente, use `Ctrl+C` no terminal responsável.
- Em produção, use HTTPS, `NABARBEARIA_SECURE_COOKIES=true` e origens HTTPS exatas na configuração.
- Injete o token de bootstrap por um mecanismo de segredos e proteja o acesso ao banco e aos backups.
- Faça backups consistentes do SQLite com a API parada ou com uma rotina compatível com WAL; não copie somente o arquivo `.db` enquanto houver gravações pendentes.
- WhatsApp automático, conciliação de pagamentos e recuperação de senha exigem integrações adicionais.
