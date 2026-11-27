# Dossiê Técnico e Funcional Completo — Sistema NA Barbearia

> **Finalidade deste documento:** Fornecer a uma Inteligência Artificial (ou consultor de precificação) um levantamento exaustivo, verificável e estruturado de toda a arquitetura, funcionalidades, tecnologias, segurança, aplicativo mobile, infraestrutura de produção, automações e qualidade de engenharia do projeto **NA Barbearia**, permitindo estimar com precisão o valor de mercado, esforço de desenvolvimento e faixas de preço de cobrança (venda única, entrega com código-fonte, implantação + manutenção ou modelo SaaS).

---

## 1. Resumo Executivo

O **NA Barbearia** é uma plataforma completa (full-stack + mobile nativo + DevOps/produção) de agendamento online, gestão operacional, controle de comissões e presença digital desenvolvida para barbearias.

Diferente de um MVP simples ou protótipo acadêmico, o sistema apresenta engenharia de **nível de produção**, incluindo:
- **Site institucional / Landing Page pública** otimizada para conversão, SEO e performance de mídia.
- **Aplicação Web multiperfil** (Cliente, Barbeiro, Administrador e Superadministrador/Proprietário com modo híbrido).
- **API Backend de alta performance em Rust (Axum)** com persistência transacional em **SQLite (WAL)**, preparada arquiteturalmente para isolamento multi-unidade (`business_id`).
- **Aplicativo Android nativo (Tauri 2 / ARM64)** dedicado à equipe (barbeiros e gestão), com sistema próprio de **atualização obrigatória OTA**, **notificações locais nativas** (lembretes de atendimento) e recuperação offline.
- **Pipeline completo de CI/CD (GitHub Actions)** com bateria de testes unitários, de integração e E2E reais em navegador (Chrome CDP) antes de cada deploy.
- **Infraestrutura automatizada de produção** em nuvem (Oracle Cloud / Ubuntu + Caddy HTTPS automático + DuckDNS + backups criptograficamente verificados em Object Storage com teste de restauração e rollback automático).

---

## 2. Métricas Quantitativas do Código e Repositório

Levantamento exato feito diretamente sobre o código-fonte do repositório (excluindo `node_modules`, `target`, `dist`, arquivos de lock e binários):

| Camada / Área | Linguagens / Formato | Arquivos | Linhas de Código (LOC) |
| --- | --- | ---: | ---: |
| **Frontend (`src/`)** | TypeScript, TSX, JSX, CSS, JSON | 126 | 11.288 |
| **Backend (`backend/src/`)** | Rust (Edition 2024) | 28 | 8.441 |
| **Scripts, Automação & Testes E2E (`scripts/`)** | JavaScript (ESM/Node), Python | 26 | 4.160 |
| **Documentação Técnica (`docs/`)** | Markdown | 18 | 1.400 |
| **Deploy, Backup & Operações (`deploy/`)** | Python 3 | 4 | 976 |
| **Styleguide / Design System (`app/`)** | TypeScript, TSX, CSS | 5 | 713 |
| **Migrações de Banco (`backend/migrations/`)** | SQL (SQLite) | 12 | 445 |
| **CI/CD (`.github/workflows/`)** | YAML (GitHub Actions) | 1 | 136 |
| **Shell Nativo Mobile/Desktop (`src-tauri/src/`)** | Rust (Tauri 2) | 2 | 22 |
| **TOTAL (Código + Infra + Docs)** | **Múltiplas** | **222** | **~27.581** |

### Outros Indicadores de Escala
- **Total de Endpoints HTTP REST:** 39 rotas versionadas em `/api/v1/*`.
- **Total de Tabelas no Banco de Dados:** 21 tabelas relacionais + 10+ índices dedicados + 12 migrações versionadas.
- **Total de Rotas de Interface (Frontend):** ~20 rotas mapeadas entre site público, cliente, equipe/app, gestão e styleguide.
- **Testes Automatizados Unitários e de Integração:** **170 testes** (41 em Rust, 109 em Vitest/TS, 14 em Python, 6 em Node Test).
- **Testes End-to-End (E2E) e Verificações Reais:** **16 scripts dedicados** (14 fluxos reais em Chrome via CDP + 2 testes em dispositivo físico Android via ADB).
- **Histórico Git:** 72 commits (janela registrada entre 21/09/2026 e 16/11/2026, com 3 contribuidores).

---

## 3. Stack Tecnológica e Ferramentas Utilizadas

### 3.1 Frontend & Design System
- **Core:** React 19.1, TypeScript 5.9, Vite 7.1 (com code splitting via `React.lazy` e `RouteBoundary`).
- **Estilização:** Tailwind CSS v4 (`@tailwindcss/vite`), `tw-animate-css`, CSS customizado para landing page e agenda mobile.
- **Biblioteca de Componentes:** shadcn/ui (v4) sobre `@base-ui/react`, `class-variance-authority`, ícones `lucide-react`, animações com `motion`.
- **Tipografia & Identidade:** `@fontsource-variable/plus-jakarta-sans` e `@fontsource-variable/geist` empacotadas localmente (sem dependência externa de Google Fonts em runtime).
- **Styleguide dedicado:** Rota `/styleguide` para documentação visual dos componentes.

### 3.2 Backend & Banco de Dados
- **Linguagem e Runtime:** Rust 1.99.1 (toolchain fixado em `rust-toolchain.toml`), Tokio (async multi-thread), Axum 0.8, Tower / Tower-HTTP (static serving de `dist/`, tracing, limites de body).
- **Banco de Dados:** SQLite embutido (`rusqlite` com feature `bundled`), modo **WAL (Write-Ahead Logging)**, migrações automáticas na inicialização.
- **Segurança & Criptografia:** `argon2` (hash de senhas), `sha2` (hash de tokens e integridade de APK), `jsonwebtoken` + `reqwest` (rustls-tls) para validação RS256 JWKS do Google OAuth 2.0, `cookie` (HttpOnly/SameSite/Secure), `rand` (`OsRng`), `uuid` v7 (IDs ordenáveis no tempo).
- **Data/Hora e Observabilidade:** `chrono`, `chrono-tz` (`America/Sao_Paulo` na exibição, UTC na persistência), `tracing` + `tracing-subscriber`, `thiserror`.

### 3.3 Mobile Nativo (Android) & Desktop
- **Framework:** Tauri 2 (`@tauri-apps/api`, `@tauri-apps/cli`, `tauri` 2.12.5).
- **Plugins Nativos:** `tauri-plugin-notification` (notificações locais agendadas no Android) e `tauri-plugin-log`.
- **Build & Assinatura Android:** Android SDK/NDK, JDK 21, Gradle, `apksigner`, `aapt`, assinatura release em PKCS#12 (`nabarbearia-release.p12`) com validação automatizada de SHA-256 do certificado.

### 3.4 Infraestrutura, DevOps, CI/CD e Mídia
- **CI/CD:** GitHub Actions (`ubuntu-24.04`) com 3 jobs encadeados (`validate` -> `package` -> `publish`), controle de concorrência e upload de artefatos com checksum SHA-256.
- **Servidor & Rede:** Oracle Cloud VM (Ubuntu 24.04 AMD64), Caddy (reverse proxy + HTTPS automático via TLS), DuckDNS (atualização automática de IP via systemd timer).
- **Armazenamento & Backups:** OCI Object Storage via Instance Principal (sem chaves estáticas), script Python standalone (`deploy/operations.py`), `systemd` services e timers.
- **Pipeline de Mídia:** Python + Pillow (`scripts/optimize-public-media.py`) gerando derivativos WebP responsivos (`srcSet`), manifesto JSON (`publicMedia.generated.json`) e relatório de auditoria de tamanho/SHA-256.

---

## 4. Arquitetura de Software e Diferenciais de Engenharia

1. **Separação Limpa de Domínios no Backend:**
   - Módulo `backend/src/appointments/` (criação, encaixe, remarcação, cancelamento, início, conclusão, no-show, detalhes e lote) desacoplado do framework HTTP (Axum), com erros de domínio próprios e **transações imediatas SQLite (`BEGIN IMMEDIATE`)**.
   - Módulo `backend/src/commissions/` (regras, cálculo histórico, regularização retroativa, elegibilidade, repasses e projeções financeiras) participando da mesma transação de conclusão de atendimento.
2. **Integridade Financeira e Histórica:**
   - Todos os valores monetários são armazenados e calculados em **centavos inteiros** (`price_cents`, `amount_cents`, `retained_cents`) e percentuais em **pontos-base** (`5000` = 50%), eliminando erros de ponto flutuante.
   - Preço e duração são congelados no agendamento no momento da criação; alterações futuras no catálogo não distorcem históricos nem remarcações.
   - Comissões já calculadas geram `commission_snapshots` imutáveis; repasses (`commission_payouts` + `commission_payout_items`) vinculam cada comissão uma única vez, impedindo pagamento duplicado.
3. **Idempotência e Concorrência Real:**
   - Criação de reservas, encaixes e registro de repasses exigem `Idempotency-Key` (16–128 chars). Reenvios por falha de rede retornam o resultado original; mesma chave com payload diferente retorna conflito (`409`).
   - Operações em lote (até 100 agendamentos) executam dentro de uma única transação com **rollback integral** (incluindo histórico e auditoria) se qualquer item conflitar.
4. **Arquitetura de Acesso e Sessão no Frontend (`src/lib/access/`):**
   - `session.ts` centraliza restauração de sessão, expiração (HTTP 401), logout e proteção contra respostas fora de ordem (race conditions).
   - `AccessProvider` integra a sessão ao ciclo de vida do React e à retomada de app em segundo plano.
   - `src/lib/booking/` encapsula intenção de reserva, seleção de profissional, disponibilidade, chave de idempotência e recuperação de conflitos.
5. **Preparação Multi-Tenant:**
   - O esquema SQL já possui tabela `businesses` e isolamento de consultas e mutações por `business_id`, facilitando evolução futura para SaaS multi-barbearia.

---

## 5. Inventário Detalhado de Funcionalidades por Perfil

### 5.1 Site Público / Landing Page (`/`)
- Apresentação institucional da marca, identidade visual própria e navegação responsiva com header inteligente (oculta/reaparece no scroll) e menu mobile acessível (Escape, clique fora, `aria-expanded`).
- **Catálogo Dinâmico Integrado à API:** exibe serviços reais agrupados por categoria (Cabelo, Barba, Combos) com preço e duração, com fallback gracioso em caso de indisponibilidade.
- **Equipe Dinâmica:** carrega barbeiros ativos diretamente da API com fotos otimizadas em WebP e especialidades.
- **Fluxo de Intenção Preservada (`landing-intent`):** o visitante pode clicar em "Escolher serviço" ou "Escolher este profissional" direto na landing page; a escolha é salva e retomada automaticamente após o login/cadastro na tela de agendamento.
- **Conteúdo Rico:** Galeria de fotos da barbearia, Reel/vídeo institucional (`PublicShopReel`), seção "Como agendar em 3 passos", depoimentos de clientes, mapa interativo do Google Maps com botão "Como chegar" e seção de FAQ (perguntas frequentes).
- **Acessibilidade e Performance:** `skip-link`, animações de *scroll reveal* com `IntersectionObserver` respeitando `prefers-reduced-motion`, imagens responsivas com `srcSet` e `fetchPriority="high"` no hero.

### 5.2 Autenticação, Contas e Controle de Acesso (RBAC)
- **Perfis suportados:** `client` (Cliente), `barber` (Barbeiro), `admin` (Administrador operacional), `super_admin` (Proprietário / Superadministrador financeiro + opção de modo híbrido como barbeiro).
- **Métodos de Entrada:**
  - E-mail e senha (cadastro público para clientes; login separado para equipe em `/equipe/login`).
  - **Login com Google (OAuth 2.0 / Google Identity Services):** botão nativo do Google no frontend + validação criptográfica RS256 contra as chaves públicas JWKS do Google no backend Rust, com vínculo por `google_subject`.
- **Bootstrap Seguro:** endpoint `POST /api/v1/setup/owner` protegido por `X-Bootstrap-Token` para criação inicial do primeiro proprietário sem credenciais hardcoded.
- **Gestão da Própria Conta (`PATCH /account`):** cliente e barbeiro editam nome, e-mail, telefone (validação DDD 10–13 dígitos) e senha; alteração de e-mail/senha exige senha atual e **encerra automaticamente todas as outras sessões ativas** do usuário. Bloqueio estrito contra escalonamento de privilégio ou alteração de comissão.
- **Roteamento Inteligente:** `/painel` e `/agendar` redirecionam automaticamente conforme o perfil autenticado.
- **Registro de Consentimentos:** endpoint `POST /api/v1/consents` e tabela `consents` para rastreabilidade de termos/privacidade (LGPD).

### 5.3 Área do Cliente (`/home`, `/servico`, `/horarios`, `/confirmacao`, `/meus-agendamentos`, `/perfil`)
- Exploração do catálogo com busca textual, filtro por categoria, preços e durações.
- Seleção de profissional específico ou opção **"Qualquer profissional disponível"** (com resolução para um barbeiro concreto na confirmação).
- Consulta em tempo real de datas e horários disponíveis considerando escala semanal do barbeiro, bloqueios pontuais, bloqueios recorrentes, reservas existentes e fuso horário da unidade (`America/Sao_Paulo`).
- Confirmação de reserva com proteção contra duplo clique, falha de rede (mantém intenção com mesma `Idempotency-Key`) e conflito de horário (recarrega slots).
- **Comprovante Digital (`/confirmacao?id=...`):** recuperável após recarga da página pelo ID da reserva.
- **Meus Agendamentos:** visualização de próximos horários e histórico; ações de **remarcação** (mantendo o preço histórico original), **cancelamento** e **avaliação de 1 a 5 estrelas** em serviços concluídos.
- **Aviso de Cancelamento pela Barbearia:** notificação destacada quando a barbearia cancela um agendamento, com confirmação de leitura (`PATCH /appointments/{id}/cancellation-notice`).
- **Perfil:** edição de dados pessoais/senha e atalho direto para contato com a recepção no WhatsApp.

### 5.4 Operação do Barbeiro (`/barbeiro` e `/equipe/barbeiro`)
- Interface mobile-first com navegação inferior em 3 abas: **Agenda**, **Meus Ganhos** e **Perfil**.
- **Agenda Diária:** navegação por datas em pílulas, card de atendimento atual em destaque, próximos horários e histórico recolhível.
- **Ciclo de Vida do Atendimento:** iniciar atendimento, concluir atendimento (disparando cálculo automático de comissão e lançamento financeiro) ou registrar falta (`no-show`), com persistência integral.
- **Edição Operacional no Card:** atualização de telefone do cliente, observações (`client_note`) e forma de pagamento prevista (`Pix`, `Cartão`, `Presencial`).
- **Encaixes Presenciais (Walk-ins):** cadastro rápido de clientes sem conta (cria identidade interna inativa sem acesso de login), respeitando conflitos de agenda.
- **Bloqueios e Pausas:** criação de pausas pontuais (ex.: almoço/compromissos) sem sobrepor reservas confirmadas + visualização de bloqueios recorrentes configurados pela gestão.
- **Meus Ganhos:** listagem de serviços concluídos por data, comissões calculadas, pendências (quando falta regra) e histórico de ganhos.
- **Atalho WhatsApp Inteligente:** abre conversa com o telefone do cliente cadastrado no agendamento; se ausente, direciona para a recepção.
- **Notificações Locais Nativas (no App Android v0.2.5+):** botão para ativar/desativar lembretes automáticos **1 hora antes de cada atendimento confirmado** (janela de 30 dias), sincronizados em fila local com o sistema de notificações do Android (`tauri-plugin-notification`).

### 5.5 Painel de Gestão — Administrador e Proprietário (`/gestao/*` e `/equipe/gestao/*`)
- **Separação de Níveis (`admin` vs `super_admin`):**
  - `admin` gerencia catálogo, equipe, escalas e agenda geral, mas **não vê valores financeiros, comissões ou repasses**.
  - `super_admin` (Proprietário) tem acesso total, incluindo financeiro, comissões, repasses e modo híbrido.
- **Aba Financeiro (Superadmin):**
  - Filtro de período (dia, mês ou intervalo customizado de até 366 dias).
  - Indicadores: produção/faturamento de serviços concluídos, taxa de faltas (`no-show`), total de comissões, saldo acumulado de comissões a pagar, resultado retido após comissões (`retained_cents`), detalhamento por forma de pagamento prevista.
  - **Registro de Repasses (`POST /admin/payouts`):** quita o saldo acumulado de um barbeiro vinculando cada comissão a um comprovante de repasse, exigindo `expected_amount_cents` (retorna `409` se o saldo mudou no meio tempo) e `Idempotency-Key`.
- **Aba Equipe:**
  - Cadastro e edição de barbeiros (nome, foto, especialidade, recomendações, status ativo/inativo).
  - Gestão de **escalas semanais** por profissional.
  - Gestão de **regras de comissão** (escopo geral, por barbeiro ou por barbeiro+serviço; percentual ou valor fixo; prioridade e vigência). Salvar uma nova regra regulariza automaticamente comissões pendentes compatíveis sem alterar as já calculadas.
- **Aba Agenda Geral:**
  - Visão consolidada por data e profissional.
  - Criação administrativa de agendamentos e edição de detalhes.
  - **Ações em Lote (`POST /admin/agenda/bulk`):** seleção de 1 até 100 agendamentos confirmados não iniciados para **cancelar em lote** ou **remanejar (trocar data/horário/barbeiro)** atomicamente, com rollback total em qualquer conflito.
  - **Bloqueios Pontuais e Recorrentes:** criação/exclusão de bloqueios semanais recorrentes (dia inteiro ou faixa horária específica, ex.: folga fixa ou almoço diário).
- **Aba Serviços:**
  - Cadastro e edição de serviços (nome, categoria, preço, duração em minutos, status ativo/inativo).
- **Modo Híbrido (`/gestao/minha-agenda`):**
  - O proprietário (`super_admin`) pode ativar seu próprio perfil de barbeiro (`POST /admin/my-barber-profile`) e alternar entre o painel de gestão e sua própria agenda de atendimentos.

---

## 6. Aplicativo Mobile Android (Tauri 2)

O projeto entrega um aplicativo Android ARM64 real (`br.com.nabarbearia.app`, atualmente na versão `0.2.5`) focado na equipe (barbeiros e proprietário):
- **Abertura Fluida (Zero Flash):** tema Android claro `#F4F4F6` (mesmo no modo noturno) + splash nativo sincronizado via `data-na-ready="true"` e `postVisualStateCallback`, garantindo que o app só saia da logo após carregar fontes, sessão e dados iniciais.
- **Restauração de Sessão e Retomada:** sessão válida mantida por até 7 dias; ao retornar do segundo plano, revalida a sessão preservando a tela atual e só recarrega se o bundle web tiver sido atualizado.
- **Recuperação Offline Nativa:** tratamento de falha de conexão inicial com tela nativa de "Tentar novamente", validado automaticamente em celular físico via script ADB (`check-android-offline.py`).
- **Sistema Próprio de Atualização Obrigatória (Self-Hosted OTA):**
  - O app verifica silenciosamente `GET /api/v1/staff/android/release` na abertura e ao voltar do segundo plano.
  - Se houver versão mais nova, o componente `AndroidUpdateGate` bloqueia o painel e exibe a tela **Atualize para continuar** (versão, tamanho em MB, status de download/instalação).
  - O APK é servido em streaming autenticado (`GET /api/v1/staff/android/apk`, restrito à equipe) sem carregar o arquivo inteiro na RAM do servidor.
  - O backend valida integridade (SHA-256 e tamanho) antes de anunciar o manifesto; se houver divergência, recusa o anúncio.
  - Scripts dedicados (`scripts/tauri-android.mjs`, `scripts/release/android-release.mjs`, `scripts/android-signing.mjs`, `scripts/android-icons.mjs`) automatizam build, assinatura, verificação com `apksigner`/`aapt` e geração de `release.json`.
- **Notificações Locais Nativas:** lembretes de atendimento integrados ao canal de notificações de alta prioridade do Android (`barber-appointments`).

---

## 7. Segurança, Privacidade e Confiabilidade

| Camada | Controle Implementado |
| --- | --- |
| **Senhas** | Hash **Argon2** em `spawn_blocking`; política de 8 a 128 caracteres, maiúscula + símbolo; bloqueio explícito de lista de 30+ senhas comuns/fracas. |
| **Sessões** | Cookie `na_session` com `HttpOnly`, `SameSite=Lax`, `Secure` (em produção), validade configurável (padrão 7 dias), armazenado com hash **SHA-256** no banco. |
| **Proteção CSRF & Origem** | Header obrigatório `X-CSRF-Token` validado com comparação em **tempo constante** (`constant_time_eq`) + validação estrita do header `Origin` contra whitelist. |
| **Headers HTTP** | `Content-Security-Policy` (CSP) restritiva, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store`. |
| **Rate Limiting & DoS** | `RateLimiter` em memória isolado por chave com teto de 10.000 buckets (evita exaustão de RAM) + `DefaultBodyLimit` de **16 KB** na API. |
| **OAuth Google** | Validação server-side completa do JWT RS256 contra JWKS oficial do Google (`iss`, `aud`, `exp`, `email_verified`, `sub`). |
| **Auditoria & LGPD** | Tabela `audit_log` gravada na mesma transação das mutações críticas + tabela `consents` para consentimentos do usuário. |
| **Idempotência** | Tabela `idempotency_keys` prevenindo cobranças, agendamentos ou repasses duplicados. |
| **Isolamento Operacional (Deploy)** | Usuário `nabarbearia-deploy` sem permissão de root livre; somente comandos whitelisted via helper `/usr/local/sbin/nabarbearia`; verificação de integridade `DELIVERY.json` + recusa de arquivos privados (`.db`, `.env`, `.p12`, `.apk`) no pacote web. |

---

## 8. Esquema de Banco de Dados (SQLite) e Catálogo de APIs

### 8.1 Tabelas do Banco de Dados (21 Tabelas, 12 Migrações)
1. `schema_migrations` — controle de versões aplicadas.
2. `security_state` — estado de segurança/bootstrap.
3. `businesses` — dados do estabelecimento (base multi-tenant).
4. `users` — contas de usuários (e-mail, hash Argon2, telefone, `google_subject`).
5. `user_roles` — papéis por usuário/negócio (`client`, `barber`, `admin`, `super_admin`).
6. `barber_profiles` — perfil público, foto, especialidade, recomendações e status do barbeiro.
7. `services` — catálogo de serviços (preço em centavos, duração, categoria, ativo).
8. `weekly_schedules` — escalas semanais por barbeiro.
9. `availability_blocks` — bloqueios pontuais de agenda (com `block_type`).
10. `recurring_availability_blocks` — bloqueios semanais recorrentes.
11. `appointments` — agendamentos (preço/duração congelados, telefone, pagamento previsto, observação, origem de cancelamento, ciência do cliente).
12. `appointment_history` — linha do tempo de alterações/transições do agendamento.
13. `service_executions` — registro de início/conclusão da execução do serviço.
14. `commission_rules` — regras de comissão (tipo, valor/pontos-base, escopo, prioridade, vigência).
15. `commission_snapshots` — comissões calculadas e congeladas por atendimento.
16. `commission_payouts` — cabeçalho dos repasses registrados aos barbeiros.
17. `commission_payout_items` — vínculo 1:1 entre comissão e repasse (anti-duplicidade).
18. `financial_entries` — lançamentos financeiros de receita.
19. `ratings` — avaliações de clientes (1–5 estrelas).
20. `consents` — registro de consentimentos (LGPD).
21. `sessions`, `idempotency_keys`, `audit_log`, `notification_outbox` — infraestrutura transacional, sessões e fila futura de notificações.

### 8.2 Catálogo Completo de Endpoints REST (`/api/v1`)
- **Saúde & Setup (3):** `GET /health`, `GET /setup/status`, `POST /setup/owner`
- **Autenticação & Conta (7):** `POST /auth/register`, `POST /auth/login`, `POST /auth/staff/login`, `POST /auth/google`, `GET /auth/session`, `POST /auth/logout`, `PATCH /account`
- **Android OTA (2):** `GET /staff/android/release`, `GET /staff/android/apk`
- **Catálogo Público (3):** `GET /public/services`, `GET /public/barbers`, `GET /public/availability`
- **Agendamentos & Execução (10):** `GET /appointments`, `POST /appointments`, `PATCH /appointments/{id}/reschedule`, `POST /appointments/{id}/cancel`, `PATCH /appointments/{id}/cancellation-notice`, `POST /appointments/{id}/start`, `PATCH /appointments/{id}/details`, `POST /appointments/{id}/complete`, `POST /appointments/{id}/no-show`, `POST /appointments/{id}/rating`
- **Operação Barbeiro (4):** `POST /barber/walk-ins`, `GET /barber/blocks`, `POST /barber/blocks`, `GET /barber/recurring-blocks`
- **Gestão Admin/Proprietário (16):**
  - Serviços: `GET /admin/services`, `POST /admin/services`, `PUT /admin/services/{id}`
  - Equipe: `POST /admin/barbers`, `PUT /admin/barbers/{id}`, `POST /admin/my-barber-profile`
  - Escalas e Bloqueios: `GET /admin/schedules`, `POST /admin/schedules`, `GET /admin/blocks`, `POST /admin/blocks`, `GET /admin/recurring-blocks`, `POST /admin/recurring-blocks`, `DELETE /admin/recurring-blocks/{id}`
  - Agenda & Lote: `POST /admin/appointments`, `PATCH /admin/appointments/{id}`, `POST /admin/agenda/bulk`
- **Financeiro, Comissões & Relatórios (5):** `GET /admin/summary`, `POST /admin/commission-rules`, `POST /admin/payouts`, `GET /admin/reports/revenue`, `GET /reports/revenue`
- **LGPD (1):** `POST /consents`

---

## 9. DevOps, Infraestrutura de Produção e Continuidade de Negócio

Um diferencial expressivo de valor deste projeto é que ele **não entrega apenas código**, mas toda a engenharia de implantação e operação segura com **custo de hospedagem próximo de zero** (compatível com Oracle Cloud Always Free):

- **Provisionamento Automatizado (`deploy/bootstrap.py`):** configura Ubuntu 24.04, instala Caddy (HTTPS automático), configura firewall, cria usuário de serviço, virtualenv OCI e timers `systemd`. Idempotente (pode ser reexecutado sem sobrescrever banco ou tokens).
- **CI/CD Completo (`.github/workflows/publish-demo.yml`):**
  1. `validate`: roda Vitest, build TypeScript/Vite, testes Python de ops, testes Node de release, `cargo fmt --check`, `cargo test`, `cargo clippy -D warnings` e **7 fluxos completos E2E no Chrome real**.
  2. `package`: compila binário Rust otimizado (`--release`) para Linux AMD64 e gera pacote assinado com inventário `DELIVERY.json` e `.sha256`.
  3. `publish`: verifica protocolo do helper remoto via SSH (`StrictHostKeyChecking=yes`), envia artefato, executa deploy atômico com manutenção HTTP 503 (`Retry-After`), valida `/api/v1/health` e executa verificação externa de contrato (`verify-release`).
- **Rollback Automático Seguro:** antes de trocar o symlink `/opt/nabarbearia/current`, cria snapshot do SQLite; se o healthcheck falhar após migrações, restaura automaticamente o código anterior **e** o snapshot do banco anterior às migrações.
- **Backups Automatizados & Disaster Recovery:**
  - Rotina diária às 03h (`America/Sao_Paulo`) + backup pré-deploy.
  - Usa API nativa de backup do SQLite (consistente com WAL), valida integridade (`PRAGMA integrity_check`), envia para bucket privado no **OCI Object Storage** (via Instance Principal), **baixa/relê para conferir SHA-256** e aplica retenção de 7 dias.
  - Comando `sudo nabarbearia test-restore <ID>` testa a restauração real em uma porta isolada (`3012`) sem afetar produção.
- **Gestão de Mídia:** script Python (`scripts/optimize-public-media.py`) que baixa/processa imagens, aplica rotação EXIF, gera múltiplos tamanhos em WebP (lossless para RGBA, quality 84 para fotos) e valida cada arquivo gerado.

---

## 10. Qualidade, Testes Automatizados e Acessibilidade

| Camada de Teste | Ferramenta | Quantidade / Cobertura |
| --- | --- | --- |
| **Backend (Unitário + Integração SQLite Real)** | `cargo test` + `clippy -D warnings` + `rustfmt` | **41 testes** (incluindo conexões concorrentes SQLite, rollback de lote/comissão, idempotência, isolamento por negócio, contrato de manifesto Android com 34 casos em fixture compartilhada). |
| **Frontend (Unitário)** | Vitest | **109 testes** (regras de calendário, fuso horário, disponibilidade, roteamento por perfil, sessão, intenção da landing, painel do dono, atualização Android). |
| **Deploy & Operações** | Python `unittest` | **14 testes** (empacotamento, backup/restore, protocolo de entrega, rollback). |
| **Release & Suporte E2E** | Node `node --test` | **6 testes** (contrato Android, infraestrutura de teste E2E e recuperação de processo). |
| **E2E Navegador (Chrome CDP Real)** | Scripts Node + API/SQLite temporários | **14 scripts E2E** cobrindo: fluxo completo de cliente, proprietário, equipe/barbeiro, controle de acesso/401, edição de conta, reservas complexas (fuso, domingo, concorrência, preço histórico), intenção da landing, catálogo da landing, atualização Android, abertura Android, metadados públicos, carregamento de rotas e responsividade (320px / 390px / 1440px + zoom 200%). |
| **E2E Dispositivo Físico Android** | Python + ADB | **2 scripts** (`check-android-offline.py` e `check-android-startup.py`) gravando vídeo/capturas e validando abertura a frio e recuperação offline em smartphone real. |

---

## 11. Limitações Conhecidas e Itens Fora do Escopo Atual (Transparência)

Para uma precificação justa e realista, a IA avaliadora deve considerar que os seguintes itens **não estão implementados** na versão atual (embora a base esteja preparada para vários deles):
1. **Envio Automático de WhatsApp:** os links abrem o WhatsApp diretamente (`wa.me`); disparo automático de lembretes/comprovantes via API oficial (Meta Cloud API / Evolution) ainda não está integrado (embora exista a tabela `notification_outbox` e documento de pesquisa em `docs/PESQUISA-LEMBRETES-WHATSAPP.md`).
2. **Gateway de Pagamento / Conciliação Bancária:** o sistema registra a forma de pagamento prevista (`Pix`, `Cartão`, `Presencial`) e repasses manuais já realizados; não processa cobranças online nem faz transferências bancárias automáticas.
3. **Recuperação de Senha por E-mail:** ainda não há integração com servidor SMTP/serviço transacional para reset de senha automatizado.
4. **Lojas Oficiais (Google Play / App Store):** o app Android é distribuído via APK assinado self-hosted para a equipe; não há build iOS nem publicação configurada em lojas oficiais.
5. **Gestão Contábil/Fiscal Completa:** o módulo financeiro apura receita bruta de serviços concluídos, comissões e saldo retido; não possui controle de despesas fixas, estoque de produtos, emissão de NFS-e ou DRE completo.

---

## 12. Guia de Parâmetros para a IA Avaliadora de Preço

Com base em todo o dossiê acima, solicite à IA de precificação que avalie o projeto considerando as seguintes dimensões e apresente cenários comparativos:

1. **Estimativa de Esforço Técnico (Horas / Homem-Mês):**
   - Quebrar por bloco: (a) Design/Landing Page + Styleguide; (b) Frontend Web (Cliente + Barbeiro + Admin/Proprietário); (c) Backend Rust + Modelagem SQLite + Segurança + Financeiro/Comissões; (d) App Android Tauri 2 + OTA + Notificações Locais; (e) DevOps/CI-CD/Infra/Backups OCI; (f) Suíte de 170 testes + 16 fluxos E2E.
2. **Cenários de Precificação (Mercado Brasileiro — R$):**
   - **Cenário A — Venda de Projeto Sob Medida (Exclusivo com Código-Fonte):** valor para cliente final (barbearia de pequeno/médio porte vs rede/franquia) adquirindo propriedade intelectual do software.
   - **Cenário B — Licença de Uso + Implantação (Setup + Mensalidade):** taxa única de setup/personalização + mensalidade recorrente (manutenção, monitoramento, backups, suporte e evolução).
   - **Cenário C — Posicionamento de Portfólio / Primeiro Cliente Real (Desconto Estratégico):** preço realista para fechar com uma barbearia local sem desvalorizar excessivamente a engenharia entregue.
   - **Cenário D — Referência de Agência / Consultoria Sênior:** quanto uma software house cobraria para desenvolver este mesmo escopo do zero.
3. **Diferenciais Comerciais que Justificam Valor Mais Alto:**
   - Custo recorrente de servidor praticamente zero (arquitetura Rust + SQLite enxuta rodando em 1 GB de RAM).
   - Sem taxa por agendamento ou comissão de marketplace (como Trinks/Booksy/Fresha).
   - App Android dedicado para a equipe com atualização própria e lembretes nativos.
   - Segurança financeira (comissões imutáveis, anti-duplicidade de repasse, auditoria) e backup automatizado com teste de restauração.
4. **Upsells / Fases Futuras para Cobrar à Parte:**
   - Integração WhatsApp automático (lembretes e confirmação).
   - Pagamento online (Pix automático / sinal de reserva).
   - Controle de estoque/produtos + despesas/lucro líquido.
   - Publicação na Google Play / versão iOS.
   - Multi-unidades (ativando a estrutura `businesses` já existente no banco).
