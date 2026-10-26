# NA Barbearia

Aplicação de agendamento e gestão da NA Barbearia, em Santos/SP. Reúne o site público, a área do cliente, a operação do barbeiro e o painel do proprietário, integrados a uma API com persistência em SQLite.

## Tecnologias

- **Frontend:** React 19, Vite, TypeScript/JavaScript, Tailwind CSS, componentes shadcn/ui com Base UI e ícones Lucide.
- **Design system:** Plus Jakarta Sans, azul `#0099FF`, fundo `#F4F4F6` e superfícies brancas.
- **Backend:** Rust, Axum e SQLite, com migrações automáticas.
- **Autenticação:** sessão em cookie HttpOnly, proteção CSRF e permissões por perfil.

## Funcionalidades

### Cliente

- Catálogo com pesquisa, categorias, preços e durações.
- Escolha de profissional, consulta de disponibilidade e reserva.
- Comprovante recuperável pelo ID do agendamento.
- Próximos agendamentos, histórico, cancelamento, remarcação e avaliação.
- Perfil com dados da sessão e contato com a recepção pelo WhatsApp.

Visitantes podem consultar o catálogo. Reservas e gerenciamento de agendamentos exigem autenticação e são persistidos na API.

### Barbeiro

Navegação inferior com três abas:

- **Agenda:** datas em pílulas, atendimento atual em destaque, próximos horários e histórico recolhido.
- **Meus Ganhos:** serviços concluídos, comissões calculadas e pendências da data selecionada.
- **Perfil:** dados da conta, contato com a recepção e logout.

A agenda permite iniciar/concluir atendimentos, registrar falta, cadastrar clientes presenciais e bloquear almoço ou pausas. Telefone, observações e pagamento previsto podem ser editados no card. O WhatsApp abre o contato cadastrado; sem telefone, o atalho leva à recepção.

Encaixes e bloqueios respeitam os horários e conflitos da agenda. O início do atendimento e as alterações permanecem salvos após recarregar a página.

### Proprietário

- **Financeiro:** produção por dia ou mês, taxa de faltas, comissões a pagar, formas de pagamento previstas e repasses registrados.
- **Equipe:** cadastro/edição de profissionais, escalas e regras de comissão por barbeiro e serviço.
- **Agenda Geral:** consulta por data/profissional, remanejamento e cancelamento em lote.
- **Serviços:** cadastro e edição de preço, duração, categoria e status ativo/inativo.
- **Modo híbrido:** acesso à agenda profissional do próprio dono, mantendo suas permissões de gestão.

As comissões são calculadas na conclusão sobre o valor registrado no atendimento. Salvar uma regra também regulariza pendências compatíveis, preservando comissões já calculadas. O registro de repasses vincula cada comissão ao pagamento registrado e impede duplicidade; ele não realiza transferência bancária.

Ações em lote aceitam até 100 reservas confirmadas e não iniciadas. O remanejamento mantém os horários e durações originais; qualquer conflito desfaz o lote inteiro.

## Executar localmente

### Requisitos

- Node.js **24 recomendado**, com npm.
- Rust estável e Cargo, com suporte à edição 2024.
- Ferramentas de compilação C/C++ da plataforma para as dependências nativas do backend.

O SQLite é compilado junto ao backend; não é necessário instalar um servidor de banco separado. Execute os comandos a partir da raiz do repositório.

### 1. Instalar dependências

```bash
git clone https://github.com/Leandro-Santana013/Nabarbearia.git
cd Nabarbearia
npm ci
```

### 2. Iniciar a API

Em um terminal:

```bash
npm run dev:backend
```

O script lê `backend/.env`. Se não houver token de bootstrap configurado, gera um token aleatório e o salva nesse arquivo, ignorado pelo Git. Não é necessário gerar o token manualmente para o desenvolvimento local.

A API escuta, por padrão, em **http://127.0.0.1:3001**. Para verificar:

```bash
curl http://127.0.0.1:3001/api/v1/health
```

Resposta esperada: `{"status":"ok"}`.

### 3. Iniciar o frontend

Em outro terminal:

```bash
npm run dev
```

Abra **http://127.0.0.1:5173**. O Vite encaminha `/api` para o backend na porta 3001. Mantenha os dois terminais em execução.

### Frontend compilado

```bash
npm run build
npm run dev:backend
```

Com o build disponível em `dist/`, o próprio backend serve a aplicação em **http://127.0.0.1:3001**. Encerre uma instância já aberta antes de iniciar outra na mesma porta.

## Android com Tauri: aplicativo online da equipe

O aplicativo Tauri 2 para Android ARM64 abre **https://na-barbearia.duckdns.org/equipe**.
Barbeiros e proprietário entram nessa área; clientes continuam usando o site com
landing page, cadastro e agendamento. Uma sessão válida é restaurada por até sete dias.
O aplicativo exige internet e usa o backend hospedado, sem depender de USB ou do computador ligado.

O [guia de implantação e atualizações](docs/DEPLOY.md) explica Oracle, HTTPS, migração única do banco,
backups privados, recuperação e o workflow manual **Publicar demonstração** no GitHub Actions.

São necessários Android SDK/NDK, JDK 21, depuração USB autorizada e Rust com o
alvo `aarch64-linux-android`. No Windows, o script usa o JDK do Android Studio,
o NDK instalado e o toolchain GNU com MinGW/GCC no PATH, sem alterar o toolchain
padrão do backend:

```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu --profile minimal --target aarch64-linux-android
npm run android:init
npm run android:build
```

`android:build` exige a assinatura existente para atualizar o app instalado.
Somente em uma instalação inteiramente nova, sem assinatura anterior a preservar,
use `npm run android:signing` para criar a chave.
Guarde um backup privado destes dois arquivos, necessários para futuras
atualizações com a mesma assinatura:

- `src-tauri/gen/android/nabarbearia-release.p12`
- `src-tauri/gen/android/keystore.properties`

Ambos são ignorados pelo Git. O Gradle usa essa chave para assinar a versão
release; `android:build:debug` gera a variante de desenvolvimento separada.
O APK de release fica em `src-tauri/gen/android/app/build/outputs/apk/`.

Para instalar a atualização por USB, opcionalmente use:

```powershell
adb devices
adb -d install -r artifacts/NA-Barbearia-arm64-release.apk
adb -d shell am start -n br.com.nabarbearia.app/.MainActivity
```

O arquivo em `artifacts/` é a cópia de entrega da build assinada. Após instalar,
o cabo pode ser desconectado. A equipe também pode entrar pelo navegador em
`/equipe/download` e baixar o APK autenticado. Alterações nas telas e no backend
chegam pela publicação no servidor; alterações nativas exigem outro APK com versão superior.

## Rotas e acesso

| Perfil | Rota | Conteúdo |
| --- | --- | --- |
| Público | `/` | Apresentação da barbearia e localização |
| Público | `/login`, `/entrar`, `/cadastro` | Autenticação e cadastro de cliente |
| Equipe | `/equipe`, `/equipe/login` | Login exclusivo de barbeiro/proprietário e restauração de sessão |
| Equipe | `/equipe/barbeiro`, `/equipe/gestao/...` | Painéis dentro do aplicativo |
| Equipe | `/equipe/download` | Download autenticado do APK |
| Cliente | `/home` | Catálogo de serviços |
| Cliente | `/servico`, `/detalhes` | Seleção de profissional |
| Cliente | `/horarios` | Seleção de data e horário |
| Cliente | `/confirmacao?id=...` | Comprovante da reserva salva |
| Cliente | `/meus-agendamentos`, `/perfil` | Agendamentos e conta |
| Barbeiro | `/barbeiro` | Agenda, ganhos e perfil |
| Proprietário | `/gestao/financeiro` | Indicadores financeiros |
| Proprietário | `/gestao/barbeiros` | Equipe, escalas, comissões e repasses |
| Proprietário | `/gestao/agenda-geral` | Agenda de toda a equipe |
| Proprietário | `/gestao/servicos` | Catálogo e preços |
| Proprietário | `/gestao/minha-agenda` | Agenda no modo híbrido |
| Desenvolvimento | `/styleguide` | Referência visual dos componentes |

`/painel` e `/agendar` direcionam a conta autenticada ao módulo correspondente: cliente → Home, barbeiro → agenda e proprietário → gestão. O acesso direto às áreas protegidas também verifica a sessão e as permissões.

Não há credenciais universais de acesso. Para o banco de demonstração existente, solicite uma conta à equipe responsável. Em um banco novo, o primeiro proprietário deve ser criado pelo endpoint de configuração; consulte o [README do backend](backend/README.md#primeiro-proprietário).

## Dados e configuração

- `src/data/barbershopData.ts`: catálogo local, profissionais e informações institucionais fornecidas para o projeto.
- `src/services/api.ts`: comunicação entre a interface e a API.
- `backend/data/`: banco SQLite local; o snapshot já versionado é destinado à demonstração.
- `backend/migrations/`: estrutura do banco e atualizações aplicadas na inicialização.
- `backend/.env.example`: referência das variáveis de ambiente.

Nos fluxos integrados, serviços, profissionais, disponibilidade, agendamentos e comissões vêm da API. Os dados locais não substituem os cadastros persistidos no backend.

Para receber reservas, cadastre serviços ativos, profissionais ativos e suas escalas no painel do proprietário. Ao ativar o modo híbrido, configure também a escala do dono.

O arquivo `portable/NA-Barbearia.zip` é um pacote previamente versionado; ele não é atualizado automaticamente pelos comandos de build. Para executar o código atual, use o procedimento acima.

## Testes e verificações

```bash
npm test
npm run build
cargo fmt --manifest-path backend/Cargo.toml --check
cargo test --manifest-path backend/Cargo.toml
cargo clippy --manifest-path backend/Cargo.toml -- -D warnings
git diff --check
```

Para os fluxos completos no navegador:

```bash
npm run test:client-flow
npm run test:owner-flow
npm run test:staff-flow
```

- **Cliente/barbeiro:** login, reserva, comprovante, remarcação, avaliação, cancelamento, encaixe, observações, início/conclusão, falta, pausas e navegação entre abas.
- **Proprietário:** serviços ativos/inativos, edição de equipe, escalas, comissões, repasses, remanejamento/cancelamento em lote, rollback de conflitos e modo híbrido.

Os testes de navegador requerem Google Chrome/Chromium e Rust. A variável `CHROME_BIN` permite indicar outro executável compatível. Eles iniciam uma API e um banco temporários nas portas **3011** e **9224**, sem alterar o banco local da barbearia. Execute um fluxo por vez.

## Limites das integrações atuais

- Os links de WhatsApp abrem o contato; envio automático de comprovantes e lembretes ainda não está integrado.
- Edição dos dados pessoais do cliente, recuperação de senha e login Google dependem de integrações próprias; a interface não simula sucesso dessas operações.
- Forma de pagamento prevista não comprova recebimento. O faturamento exibido representa o valor dos serviços concluídos.
- O saldo de comissões a pagar é acumulado; a produção financeira segue o período selecionado. O resultado após comissões é exibido, mas o lucro líquido permanece não apurado sem despesas e impostos.

## Problemas comuns

| Sintoma | Como resolver |
| --- | --- |
| `Address already in use` / `AddrInUse` ao iniciar a API | A porta 3001 já está ocupada. Verifique o endpoint de saúde; se a API responder, ela já está em execução. Para reiniciar, use `Ctrl+C` no terminal da instância atual e execute novamente `npm run dev:backend`. |
| Frontend abre, mas não carrega os dados | Confirme que a API responde em `http://127.0.0.1:3001/api/v1/health` e que o frontend foi aberto pela URL permitida na configuração. |
| Nenhum horário disponível | Verifique serviço/profissional ativos, escala cadastrada, pausas e reservas existentes. |
| Comissão pendente | Cadastre a regra do profissional/serviço na aba Equipe. Não há percentual padrão presumido. |
| `cargo` não encontrado | Instale o Rust e reabra o terminal para carregar o PATH. |

## Segurança e colaboração

Sessões usam cookies HttpOnly, CSRF e validação de Origin. O backend aplica permissões por negócio e perfil e usa transações para proteger reservas, comissões e repasses.

Não versione tokens, senhas, arquivos `.env` reais ou arquivos temporários `*.db-wal`/`*.db-shm`. O banco local em uso não faz parte da atualização de código preparada nesta branch. Para produção, configure HTTPS, cookies seguros, origens permitidas e backups conforme a [documentação do backend](backend/README.md).
