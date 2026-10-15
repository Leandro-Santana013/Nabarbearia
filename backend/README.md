# NA Barbearia

Plataforma de atendimento e gestão da NA Barbearia em Santos/SP. O projeto reúne uma landing page pública e uma área operacional autenticada, conectadas a um backend Rust/Axum com SQLite.

## Rotas

- `/`: apresentação pública, localização e entrada para a agenda;
- `/painel`: autenticação, cadastro de clientes, agenda e gestão operacional;
- `/agendar`: atalho para a plataforma de agendamento.
- `/home`: catálogo e área do cliente, usando a sessão e os dados da API;
- `/meus-agendamentos`: próximos atendimentos, histórico, cancelamento, remarcação e avaliações;
- `/perfil`: dados da conta autenticada e resumo dos atendimentos;
- `/barbeiro`: agenda exclusiva do profissional;
- `/login` e `/cadastro`: acesso e criação de conta.

Clientes que entram por `/painel` ou `/agendar` são direcionados à nova Home.
O catálogo pode ser consultado como visitante; para reservar e gerenciar horários,
é necessário entrar na conta. Confirmações só são exibidas após salvar na API.
O link do comprovante contém o ID do agendamento e pode ser recarregado.

Edição do cadastro e lembretes automáticos de WhatsApp permanecem indisponíveis
enquanto não houver endpoints para essas funções. O suporte pelo WhatsApp continua acessível.

## Executar localmente

Requisitos: Node.js, npm e Rust estável.

1. Gere um token local para o backend, mantendo-o fora do Git:

```powershell
$taskRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$taskBytes = New-Object byte[] 32
$taskRng.GetBytes($taskBytes)
$taskRng.Dispose()
$env:NABARBEARIA_BOOTSTRAP_TOKEN = [Convert]::ToBase64String($taskBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
cargo run --manifest-path backend/Cargo.toml
```

2. Em outro terminal, instale as dependências e inicie o frontend:

```powershell
npm install
npm run dev
```

O frontend usa `http://127.0.0.1:5173` e encaminha `/api` para a API em `http://127.0.0.1:3001`.

## Pacote portátil para Windows

Para gerar uma pasta que já contém o frontend compilado, o backend Rust e o banco SQLite, execute:

```powershell
.\portable\Build-Portable.ps1
```

Depois, abra `portable\release\NA-Barbearia\Start-NA-Barbearia.cmd`. O computador de destino não precisa instalar Node.js, Rust ou um banco separado. As instruções completas ficam em `portable\README.md`.

## Pacote portátil para Linux

Para gerar o pacote Linux com frontend compilado, backend Rust, banco SQLite e todos os registros:

```powershell
.\portable\Build-Portable-Linux.ps1
```

O resultado é `portable\release\NA-Barbearia-linux.tar.gz`. No Linux, extraia o arquivo e execute `bash ./Install-NA-Barbearia.sh`; ele instala as ferramentas de compilação, instala o Rust estável quando necessário e compila o backend nativamente. Depois, use `bash ./Start-NA-Barbearia.sh` para subir a aplicação. Normalmente ela abre em `http://127.0.0.1:3001`; se essa porta estiver ocupada, o script escolhe uma porta livre próxima e mostra o endereço correto.

## Credenciais de demonstração

As credenciais abaixo são exemplos documentais, não devem ser usadas em produção:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Proprietário | `dono@example.test` | `Exemplo123!` |
| Barbeiro | `barbeiro@example.test` | `Exemplo123!` |
| Cliente | `cliente@example.test` | `Exemplo123!` |

O banco SQLite versionado em `backend/data/` é um snapshot de demonstração desta máquina. Ele foi incluído intencionalmente neste repositório conforme o escopo do projeto; não use esse arquivo como banco de produção.

## Verificações

`npm run test:client-flow` executa o fluxo completo em Chrome headless, com uma API
e um banco temporários nas portas 3011 e 9224. Verifica login pelo painel, reserva,
recarga do comprovante, remarcação, avaliação, reagendamento, cancelamento e logout.
Também valida o painel do barbeiro: encaixe, contato, pagamento previsto, observações,
início persistente, conclusão com comissão, falta e almoço bloqueado após recarga.
Requer Google Chrome (`CHROME_BIN` pode indicar outro executável Chromium) e Rust.
O teste não usa nem modifica o banco local da barbearia.

```powershell
npm test
npm run build
cargo fmt --manifest-path backend/Cargo.toml --check
cargo test --manifest-path backend/Cargo.toml
cargo clippy --manifest-path backend/Cargo.toml -- -D warnings
git diff --check
```

## Segurança e operação

O backend usa sessão em cookie `HttpOnly`, proteção CSRF, validação estrita de `Origin`, isolamento por negócio, Argon2id e transações SQLite para impedir conflitos de horário. O token de bootstrap, arquivos `.env` reais e demais segredos devem permanecer fora do repositório.

## Agenda profissional

Em `/barbeiro`, a agenda usa datas em pílulas, encaixes presenciais, pausas de 15 minutos e almoço de uma hora. Encaixes respeitam horários de trabalho e conflitos; pausas são persistidas e impedem reservas sobrepostas. Cada barbeiro pode alterar somente a própria agenda.

Telefone, pagamento previsto e observações podem ser preenchidos no encaixe ou editados no card. O WhatsApp abre o contato cadastrado; sem telefone, o atalho leva à recepção. Pagamento previsto não representa pagamento recebido. Identidades presenciais são registros internos sem acesso de login.

O resumo soma os serviços concluídos na data selecionada e as comissões já calculadas pelas regras do proprietário. Atendimentos sem regra aparecem como pendentes de configuração, sem percentual presumido.

### Dados operacionais da agenda

A migração 0007 acrescenta telefone, pagamento previsto e observação ao agendamento. O telefone é opcional e aceita de 10 a 13 dígitos; pagamento previsto aceita Pix, Cartão ou Presencial. Esses campos não confirmam cobrança. Apenas proprietário ou barbeiro responsável podem editá-los.

Encaixes usam o catálogo ativo, validação de disponibilidade, transação e idempotência. O cliente presencial recebe uma identidade interna inativa, sem credenciais de acesso. Barbeiros só podem criar encaixes e bloqueios para si; bloqueios sobrepostos a reservas confirmadas são rejeitados. A lista de agendamentos informa execução iniciada e comissões calculadas; valores de comissão não são expostos aos clientes.

Ao cadastrar uma regra, pendências compatíveis são regularizadas na mesma transação. O snapshot de comissão e o lançamento financeiro passam a `posted`; receitas e comissões já lançadas não são alteradas. Regras novas com o mesmo escopo, prioridade e vigência substituem a regra ativa anterior. Percentuais usam pontos-base: `rule_type: "percent", amount: 5000` representa 50%. A resposta de conclusão já inclui o valor de comissão calculado.

### Gestão do proprietário

A migração 0008 cria o registro de repasses e a associação de cada comissão ao repasse correspondente. Todos os endpoints abaixo exigem papel `owner`; mutações também validam Origin e CSRF:

- `GET /admin/summary?from=...&to=...`: indicadores e equipe no período (até 366 dias), regras ativas, formas previstas e repasses; saldos a pagar acumulados.
- `GET /admin/services`: catálogo completo, incluindo inativos; criação/edição usam os endpoints de serviços existentes.
- `PUT /admin/barbers/{id}`: nome, foto HTTPS e disponibilidade para novas reservas.
- `POST /admin/payouts`: registra pagamento já realizado, com `barber_user_id`, `expected_amount_cents` e `Idempotency-Key`. Transação vincula cada comissão uma única vez; saldo alterado retorna 409. Não envia dinheiro.
- `POST /admin/agenda/bulk`: `{ action: "cancel" | "move", changes: [{id, starts_at?, barber_user_id?}] }`, entre 1 e 100 IDs únicos. Apenas confirmados não iniciados; alterações e histórico/auditoria são atômicos.
- `POST /admin/my-barber-profile`: ativa o perfil de barbeiro do próprio dono, mantendo seu papel de proprietário. Escalas continuam necessárias.

Indicadores usam a data programada do atendimento e valores de snapshots. O resumo não apresenta método previsto como recebimento confirmado nem saldo após comissão como lucro líquido sem despesas.
