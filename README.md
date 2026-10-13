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
