# NA Barbearia

Plataforma de atendimento e gestão da NA Barbearia em Santos/SP. O projeto reúne uma landing page pública e uma área operacional autenticada, conectadas a um backend Rust/Axum com SQLite.

## Rotas

- `/`: apresentação pública, localização e entrada para a agenda;
- `/painel`: autenticação, cadastro de clientes, agenda e gestão operacional;
- `/agendar`: atalho para a plataforma de agendamento.

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

## Credenciais de demonstração

As credenciais abaixo são exemplos documentais, não devem ser usadas em produção:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Proprietário | `dono@example.test` | `Exemplo123!` |
| Barbeiro | `barbeiro@example.test` | `Exemplo123!` |
| Cliente | `cliente@example.test` | `Exemplo123!` |

O banco SQLite versionado em `backend/data/` é um snapshot de demonstração desta máquina. Ele foi incluído intencionalmente neste repositório conforme o escopo do projeto; não use esse arquivo como banco de produção.

## Verificações

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
