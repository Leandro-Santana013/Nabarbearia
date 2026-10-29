# Resultado do Ciclo 1 — F0 e F1

Data: 29/10/2026. Escopo aprovado: implementação local das duas primeiras fases do [plano](PLANO-MELHORIAS-ARQUITETURA.md). Base: `75f21659f59a4be02d34bc28fcdfcda3b9a6bfc2`.

**Resultado:** F0 e F1 implementadas e verificadas localmente no Windows. A execução em Linux continua pendente. As alterações estão no working tree, sem commit, push, workflow disparado, publicação ou intervenção no banco da barbearia. Não foi gerado APK.

## F0 — Infraestrutura dos testes

Os fluxos de cliente, proprietário e equipe passaram a usar [flow-test.mjs](../scripts/test-support/flow-test.mjs). O módulo concentra banco temporário, processos próprios, verificação de saúde, requisições autenticadas, conexão CDP, timeout e captura de diagnóstico. As ações de negócio e asserções permaneceram nos cenários.

Portas ocupadas são recusadas antes de iniciar, evitando aproveitar uma API ou navegador de outra execução. Falhas informam etapa e última causa útil; logs ocultam credenciais conhecidas/campos sensíveis. A limpeza confirma o encerramento, trata subprocessos Windows e grupos de processos POSIX e acusa falha em vez de ignorá-la.

Os [testes do suporte](../scripts/test-support/flow-test.test.mjs) cobrem porta ocupada sem encerrar o servidor existente, timeout com causa/credenciais ocultas, executável ausente e falha do Chrome após a API iniciar, seguida de nova execução. O comando `npm run test:flow-support` e a execução correspondente foram acrescentados ao workflow; o caso com API real requer `NABARBEARIA_TEST_BACKEND` e foi executado nesta validação.

## F1 — Sessão, acesso e compatibilidade

O módulo `src/lib/access/` reúne responsabilidades antes repetidas entre entradas e painéis:

| Arquivo | Responsabilidade |
| --- | --- |
| [session.ts](../src/lib/access/session.ts) | Restauração compartilhada, expiração, logout, falha de conexão e invalidação de respostas antigas |
| [AccessProvider.tsx](../src/lib/access/AccessProvider.tsx) | Fonte de sessão para os consumidores React e integração com retomada do app |
| [routing.ts](../src/lib/access/routing.ts) | Destino por perfil/canal e compatibilidade dos caminhos da equipe |
| [AccessScreen.tsx](../src/lib/access/AccessScreen.tsx) | Apresentação de verificação, conexão, login e acesso negado |
| [navigation.ts](../src/lib/access/navigation.ts) | Navegação por histórico e notificação de mudança |

Os dashboards recebem sessão controlada e usam as ações compartilhadas. A ativação do modo híbrido atualiza essa mesma sessão. O serviço HTTP conserva cookies, CSRF e tradução de erros; comunica expiração por assinatura sem consultar `window`, URL ou importar o módulo de acesso. Respostas de uma sessão anterior não expiram nem substituem o CSRF do novo login.

A restauração do mesmo token continua permitindo que um 401 concorrente dessa sessão a expire. A revisão encontrou esse caso, um teste reproduziu a falha e a correção passou na regressão. A evidência anterior à correção foi preservada em `f1-race-before.log`.

`/painel` e `/agendar` agora encaminham aos painéis atuais. O fallback `Workspace` foi retirado após conferir as referências: os perfis documentados usam cliente, barbeiro ou proprietário; um perfil desconhecido recebe acesso negado. `staff-routing.ts` conserva os exports antigos como compatibilidade para seus consumidores.

Site público e entrada da equipe continuam distintos. A página pública abre sem consultar sessão. A coordenação da equipe é montada dentro do bloqueio Android, preservando atualização antes do login/painel e o caminho de download. Os callbacks do fluxo integrado do cliente passam a usar o logout coordenado; os fallbacks de páginas demonstrativas sem callbacks não foram ampliados nesta fase.

O novo [fluxo de acesso](../scripts/check-access-flow.mjs), disponível em `npm run test:access-flow` e no workflow, cobre visitantes, os três perfis, compatibilidade das duas entradas antigas, permissões de painel, voltar/avançar e 401 real em operação protegida nos canais público/equipe. Inclui acesso em 320 px e foco no campo de e-mail.

## Evidências e validação

Arquivos em [artifacts/arquitetura-ciclo1-2026-10-29](../artifacts/arquitetura-ciclo1-2026-10-29/). Essa pasta é ignorada pelo Git; os documentos em `docs/` e os testes/fontes permanecem revisáveis no working tree.

| Verificação | Resultado e limite |
| --- | --- |
| Base antes da refatoração | 44 testes frontend, 7 Rust GNU, build e três fluxos reais passaram |
| Frontend final | **63 testes passaram em 13 arquivos**; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-unit.log) |
| Suporte dos fluxos | **4 testes passaram, nenhum ignorado**; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-support.log) |
| Cliente/barbeiro | Reserva, comprovante, remarcação do mesmo ID, conclusão, comissão, avaliação, encaixe, pausa, conflito/permissões e logout; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-client.log) |
| Proprietário | Catálogo, equipe, regras/repasse, lote, rollback de conflito e modo híbrido; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-owner.log) |
| Equipe | Login exclusivo, restauração, rede/retomada, logout, download e simulações do atualizador; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-staff.log) |
| Acesso e compatibilidade | Quatro entradas protegidas para visitante, destinos dos três perfis, permissões, histórico e expiração 401 real; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-access.log) |
| Agenda responsiva | **22 combinações**, de 320 a 1440 px e zoom até 200%, com navegação por datas e formulários; API simulada para apresentação; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-barber-responsive.log) |
| Página pública | **22 combinações**, de 280 a 1440 px, incluindo texto a 150%; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-landing-responsive.log) |
| Build final | TypeScript/Vite passaram; JS de 667,63 kB, gzip 208,43 kB; o aviso existente acima de 500 kB permanece; [log](../artifacts/arquitetura-ciclo1-2026-10-29/final-build.log) |
| Inspeção estrutural | Separação cenário/infraestrutura conferida; nenhum ciclo de importação de execução encontrado envolvendo acesso na verificação dirigida; HTTP sem dependência do navegador/acesso |
| Diff | `git diff --check` passou; backend, deploy, código nativo e `tsconfig.app.json` não foram alterados |

Os quatro fluxos usam Chrome e API/SQLite reais em ambientes temporários. As verificações de geometria foram preservadas e complementadas por inspeção visual das capturas de cliente, agenda, gestão desktop, zoom e login da equipe. O último ajuste após as verificações visuais afetou somente a geração da sessão; o build, os testes frontend e os quatro fluxos reais foram executados novamente. Não houve alteração de layout/CSS nessa correção.

Capturas preservadas: [cliente](../artifacts/arquitetura-ciclo1-2026-10-29/capturas/cliente-home.png), [barbeiro em 320 px](../artifacts/arquitetura-ciclo1-2026-10-29/capturas/barbeiro-320.png), [agenda híbrida em 200%](../artifacts/arquitetura-ciclo1-2026-10-29/capturas/agenda-hibrida-200.png), [gestão desktop](../artifacts/arquitetura-ciclo1-2026-10-29/capturas/gestao-desktop.png), [equipe expirada em 320 px](../artifacts/arquitetura-ciclo1-2026-10-29/capturas/equipe-expirada-320.png) e [página pública](../artifacts/arquitetura-ciclo1-2026-10-29/capturas/publico-320.png).

Os resultados Rust pertencem à base conferida nesta execução e continuam aplicáveis ao backend inalterado; não representam uma segunda execução após a refatoração frontend. Nenhuma certificação de produção ou aparelho físico foi feita.

## Revisão e pendências

Revisão sequencial pelo mesmo agente, conforme deepwork; não foi revisão independente.

- **Gate 0: attempt 1 of 3:** a revisão encontrou limpeza com confirmação/diagnóstico insuficientes. Houve também limitação do sandbox ao manipular processos Windows. **Attempt 2 of 3:** limpeza reconciliada e quatro testes de suporte passaram, com os três fluxos preservados. Aceite Windows concluído; Linux pendente.
- **Gate 1: attempt 1 of 3:** conferidos contratos, referências do fallback, compatibilidade e direção das dependências; ajustadas a ausência de consulta de sessão no site público e a projeção dos dados privados do cliente. O caso de 401 concorrente com restauração do mesmo token foi reproduzido. **Attempt 2 of 3:** correção confirmada por 63 testes e quatro fluxos reais; sem achado material remanescente no escopo local.

O ambiente Vite exigiu execução fora do sandbox por falha de leitura da configuração/ancestrais. Rust foi verificado com `stable-x86_64-pc-windows-gnu`, usando target temporário sem acentos. Esses fatos foram tratados como limitações de ambiente, sem alterar configurações do produto para contorná-los.

Permanecem pendentes: execução Linux da infraestrutura de processos, publicação e validação no Android físico. WSL não está instalado e Docker não está disponível nesta máquina; nenhum servidor externo foi utilizado para esses testes. A verificação Linux foi incorporada ao workflow existente para futura execução autorizada. As fases F2–F5 permanecem propostas, sem implementação nesta rodada.

O acompanhamento detalhado local está em `.slim/deepwork/melhorias-arquitetura.md`. A implementação do Ciclo 1 está pronta para revisão do usuário; commit, push e publicação dependem de autorização específica.
