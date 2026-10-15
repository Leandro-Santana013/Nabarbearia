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

No painel do proprietário (`/painel`), “Comissão por barbeiro e serviço” permite informar percentuais de 0 a 100. O serviço é opcional para a regra geral do barbeiro. Salvar calcula pendências compatíveis e preserva comissões já lançadas. Na API, percentuais são expressos em pontos-base (50% = `amount: 5000`); o formulário faz essa conversão automaticamente.

## Painel do proprietário

Login de proprietário e `/painel` abrem `/gestao/financeiro`. As outras abas ficam em `/gestao/barbeiros`, `/gestao/agenda-geral` e `/gestao/servicos`. A gestão usa dados da API, incluindo profissionais reais (a contagem é dinâmica) e serviços inativos.

O Financeiro filtra produção por dia ou mês em São Paulo. Faturamento significa valor dos serviços concluídos; formas de pagamento são as previstas no agendamento, sem conciliação de recebimentos. O saldo de comissões a pagar é acumulado, enquanto a produção da equipe segue o período selecionado. O resultado após comissões é exibido; lucro líquido fica não apurado enquanto despesas e impostos não forem cadastrados.

Em Equipe, os diálogos permitem cadastrar/editar profissionais, configurar escala e comissão e registrar repasses já realizados. O registro não transfere dinheiro. Repasses são idempotentes e vinculados às comissões quitadas, impedindo duplicidade.

Na Agenda Geral, somente reservas confirmadas e não iniciadas são elegíveis para ações em lote (até 100). Remanejamentos preservam horários e durações, com opção de mudar a data e o profissional. Qualquer conflito desfaz todo o lote. Concluídos, faltas e cancelamentos permanecem consultáveis.

O modo híbrido inclui o proprietário na equipe com a mesma conta e abre sua agenda pessoal. É necessário cadastrar sua escala para receber reservas.

`npm run test:owner-flow` valida o módulo no Chrome com API e banco temporários, incluindo cadastro/edição, serviços inativos, comissões, repasses, lote com rollback e modo híbrido. Usa as portas de teste 3011 e 9224; execute separadamente de `test:client-flow`.
