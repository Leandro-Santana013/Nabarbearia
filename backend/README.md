# Backend operacional — NA Barbearia

API leve em Rust para a operação interna da NA Barbearia. Usa um único processo Tokio/Axum e SQLite embarcado; não requer Docker, Redis, Node no servidor ou banco externo.

## Rodar localmente

Use Rust estável e gere o token de bootstrap uma vez por ambiente, mantendo-o fora do repositório:

```powershell
$taskRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$taskBytes = New-Object byte[] 32
$taskRng.GetBytes($taskBytes)
$taskRng.Dispose()
$env:NABARBEARIA_BOOTSTRAP_TOKEN = [Convert]::ToBase64String($taskBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
cargo run --manifest-path backend/Cargo.toml
```

Por padrão, a API escuta em `127.0.0.1:3001` e cria `backend/data/nabarbearia.db`, ignorado pelo Git. Em outro terminal, inicie o frontend com `npm run dev`; o Vite encaminha `/api` para a API.

O primeiro proprietário é criado pelo endpoint de setup, protegido pelo token de bootstrap. Depois, o proprietário pode cadastrar serviços, barbeiros e escalas no painel. Clientes criam a própria conta e reservam horários apenas dentro da disponibilidade configurada.

## Contrato principal

Todas as datas de entrada são RFC 3339 em UTC, alinhadas ao minuto. Valores monetários são centavos de BRL.

| Área | Rotas |
| --- | --- |
| Estado | `GET /health`, `GET /setup/status`, `POST /setup/owner` |
| Autenticação | `POST /auth/register`, `POST /auth/login`, `GET /auth/session`, `POST /auth/logout` |
| Público | `GET /public/services`, `GET /public/barbers`, `GET /public/availability` |
| Agenda | `GET/POST /appointments`, `PATCH /appointments/{id}/reschedule`, `POST /appointments/{id}/cancel` |
| Execução | `POST /appointments/{id}/start`, `POST /appointments/{id}/complete`, `POST /appointments/{id}/no-show`, `POST /appointments/{id}/rating` |
| Proprietário | `/admin/services`, `/admin/appointments`, `/admin/barbers`, `/admin/schedules`, `/admin/blocks`, `/admin/commission-rules`, `/admin/reports/revenue` |

Mutações autenticadas exigem cookie de sessão, `Origin` permitido e `X-CSRF-Token`. A criação de agendamento também exige `Idempotency-Key` de 16 a 128 caracteres. Os IDs de negócio e cliente são derivados da sessão, nunca aceitos do navegador.

## Segurança e produção

- Use HTTPS no proxy, `NABARBEARIA_SECURE_COOKIES=true` e origens HTTPS exatas em `NABARBEARIA_ALLOWED_ORIGINS`.
- Injete `NABARBEARIA_BOOTSTRAP_TOKEN` por um gerenciador de segredos; não use uma frase previsível.
- Proteja `backend/data/` e os backups com ACL da conta de serviço.
- Faça backup consistente do SQLite e dos arquivos WAL/SHM com a API parada ou por rotina compatível com WAL.
- WhatsApp, pagamentos, Trinks e notificações não são anunciados nem acionados pela plataforma sem uma integração autorizada e configurada.

## Verificação

```powershell
cargo fmt --manifest-path backend/Cargo.toml --check
cargo test --manifest-path backend/Cargo.toml
cargo clippy --manifest-path backend/Cargo.toml -- -D warnings
```
