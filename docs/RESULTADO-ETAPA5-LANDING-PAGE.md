# Resultado da etapa 5 — carregamento por rotas

Data: 31/10/2026.

**Situação: T07 implementado e testado localmente; aguardando aprovação para a etapa 6.** Não houve commit, push, publicação, geração de APK ou alteração de código nativo. A seleção antecipada de serviço/profissional não foi implementada nesta etapa.

Referência: [plano](PLANO-IMPLEMENTACAO-LANDING-PAGE.md). O estado anterior está preservado em `artifacts/landing-stage5-baseline-20261031-122717/`, com arquivos de origem, `dist`, hashes, estado Git e diff.

## Entrega e limites dos módulos

- A landing permanece disponível na entrada, sem esperar por um módulo de painel.
- `App.tsx` carrega sob demanda três entradas: `PublicApp`, `StaffApp` e `StyleguideApp`. A classificação de caminhos foi extraída para um módulo pequeno, sem dependências de login ou sessão.
- `PublicApp` concentra o acesso público antes presente em `App.tsx`. Cliente, barbeiro e proprietário são carregados nos ramos correspondentes. O login continua incluído na entrada de acesso, sem trazer os painéis para o visitante.
- `StaffApp` preserva `AndroidUpdateGate` e o provedor de sessão. Seus painéis também são carregados sob demanda.
- Os provedores ficam fora dos limites de espera dos painéis. Mudanças de caminho não usam `key={path}` nos provedores ou aplicativos; a reserva em andamento e a sessão continuam preservadas entre telas.
- A agenda pessoal do proprietário já utilizava `BarberDashboard`; essa dependência foi mantida. Por isso o painel do barbeiro pode ser baixado ao abrir a gestão, mas permanece fora da entrada pública e do login.
- O Vite agora emite `dist/.vite/manifest.json`, usado para verificar o grafo de arquivos. Esse manifesto de build é independente do manifesto de atualização Android.

Não foram alterados endpoints, autorização, regras de reserva, disponibilidade, idempotência ou rotas de compatibilidade.

## Espera e recuperação

Enquanto um módulo carrega, a tela usa uma superfície neutra `#F4F4F6`, com sinalização acessível de carregamento e sem mensagem intermediária visível. Essa espera **não** publica `naReady`; o mecanismo existente continua aguardando a tela de destino e seus dados iniciais.

Uma falha de carregamento mostra “Não foi possível abrir esta página”, com duas ações: **Recarregar página** e **Voltar ao início**. O título recebe foco, o conteúdo mantém o marco semântico `main` e o aviso fica em um contêiner interno. A auditoria inicial identificou um papel ARIA inadequado no `main`; ele foi corrigido e a auditoria final não apontou violações nessa tela.

A recarga é explícita, preserva a URL completa e os cookies e não entra em loop automático. Foi escolhida porque `React.lazy` mantém a promessa rejeitada; simplesmente limpar o estado de erro não resolve todos os casos de importação armazenados pelo navegador. Essa escolha segue o comportamento documentado de [React.lazy](https://react.dev/reference/react/lazy) e [Suspense](https://react.dev/reference/react/Suspense).

O sinal de prontidão é publicado quando a tela de erro acionável está pronta, evitando que a abertura nativa a deixe encoberta. Ao mudar para outra rota, o erro anterior é limpo sem reiniciar o provedor de sessão.

## Código inicial e rede

O fechamento dos imports estáticos da entrada foi medido no manifesto e conferido por requisições reais de Chrome em servidor local.

| JavaScript exigido pela entrada | Antes | Depois |
| --- | ---: | ---: |
| Sem compressão | 692.572 B | 274.499 B |
| Gzip local de referência | 216.049 B | 84.976 B |

Redução de **60,37% no JavaScript inicial sem compressão**. A soma de todos os arquivos da aplicação não é esse valor: os demais módulos são baixados quando necessários. Gzip foi calculado localmente para comparação; não é medição da configuração de compressão em produção nem garantia de LCP.

O teste de rede confirmou:

- Nenhum módulo de acesso, cliente, equipe, proprietário, barbeiro ou styleguide solicitado na carga inicial da landing.
- O CTA baixa a entrada de acesso; o login de visitante não baixa os painéis.
- O styleguide só carrega quando acessado.
- As entradas autenticadas solicitam o painel necessário e preservam os limites entre canais.

O build deixou de apresentar o aviso anterior de chunk JavaScript acima de 500 KB. Não houve medição nova de Core Web Vitals em produção.

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run build` | TypeScript e build de produção passaram, com manifesto e arquivos separados. |
| `npm.cmd test` | **136 testes passaram em 19 arquivos**. |
| `node scripts/check-route-loading.mjs` | Passaram manifesto/rede, CTA, aliases, URL direta, recarga, voltar/avançar e styleguide sob demanda. |
| Módulo externo com falha | HTTP 503 observado, tela de recuperação sem reload automático, recarga manual com posterior HTTP 200, URL com query/hash e cookie preservados. |
| Resposta tardia de módulo | Voltar durante a espera mantém a landing; a resposta antiga não substitui a rota atual; avançar continua funcionando. |
| Painel autenticado retido | JS do barbeiro e, depois, dados iniciais da agenda foram retidos separadamente. `naReady` permaneceu falso até o destino estar pronto. |
| Falha do módulo interno | Erro acionável sem descartar a sessão simulada para o login. Recarga recuperou o painel e a URL completa; prontidão somente após dados. |
| Fluxo real de acesso | Passaram visitante, três perfis, destinos legados, permissões, histórico de navegação e expiração por 401. |
| Fluxo real de cliente | Passaram autenticação, catálogo, reserva, remarcação, atendimento, avaliação e cancelamento persistidos. |
| Fluxos reais de equipe e proprietário | Passaram sessão, download, atualização, catálogo, comissões, repasses, ações em lote e conflitos com rollback. |
| Fluxo de reserva | Passaram retomada após autenticação, escala operacional incluindo domingo, navegador em Tóquio, idempotência, resposta perdida e preservação de valores históricos. |
| Abertura Android | Passaram login, barbeiro, proprietário, espera dos dados, retomada e erro de conexão acionável. |
| Atualização Android | Passaram consulta silenciosa, retomada, versões anterior/atual, falha de consulta, atualização obrigatória e ausência de APK anunciado. |
| Landing | Passaram 21 larguras, menu, FAQ, texto ampliado, imagens, fontes, catálogo e comportamentos das etapas anteriores. |
| Metadados | HTML, assets e entradas `/`, `/painel` e `/equipe/login` continuaram passando. |
| Axe-core 4.12.1 | Zero violações automatizadas na tela final de recuperação e na landing; a landing conserva verificações inconclusivas de contraste já registradas. |
| Revisão | Investigação e revisão independente de dependências, sessão e prontidão. As lacunas de espera/falha do módulo interno identificadas na revisão foram acrescentadas ao teste e passaram. `git diff --check` passou. |

Os sete fluxos com backend rodaram sequencialmente com API/SQLite temporários e toolchain GNU, sem acessar o banco da loja. O teste específico de chunks usa servidor e sessão simulados para controlar atrasos e falhas; ele não substitui os fluxos autenticados reais executados em complemento.

Nos testes de falha, o servidor mantém HTTP 503 até a ação de recarregar. Isso evita que uma requisição de pré-carregamento consuma a falha e uma importação seguinte receba sucesso sem exercitar a recuperação. O teste observa os códigos HTTP recebidos pelo navegador.

## Publicação e Android

O empacotador existente copia `dist` recursivamente e inclui os arquivos separados. O servidor estático atende esse diretório, e os fluxos com backend real serviram os novos chunks corretamente. A configuração atual do Tauri aponta para a entrada HTTPS `/equipe`; os caminhos de assets continuam resolvidos na mesma origem.

Não foi feita publicação ou instalação física. Se uma página antiga tentar carregar um arquivo de uma versão anterior após uma publicação, a recuperação manual permite buscar o documento atual; a troca real de release em produção não foi exercitada nesta entrega. O aplicativo continua dependendo de conexão — esta mudança não implementa funcionamento offline.

## Arquivos e evidências

Principais caminhos: `src/App.tsx`, `src/PublicApp.tsx`, `src/StaffApp.tsx`, `src/StyleguideApp.tsx`, `src/components/RouteBoundary.tsx`, `src/lib/access/paths.ts`, `vite.config.ts` e `scripts/check-route-loading.mjs`. `dist/` foi atualizado pelo build.

- [Entrada em celular](../artifacts/landing-stage5-mobile.png).
- [Tela de recuperação em celular](../artifacts/landing-stage5-route-error-mobile.png).
- [Grafo e requisições de rotas](../artifacts/landing-stage5-route-loading.json).
- [Comparação do JavaScript inicial](../artifacts/landing-stage5-initial-js.json).
- Auditorias: [recuperação](../artifacts/landing-stage5-a11y-error.json) e [landing](../artifacts/landing-stage5-a11y-landing.json).
- Logs dos fluxos: [acesso](../artifacts/landing-stage5-access-flow.log), [cliente](../artifacts/landing-stage5-client-flow.log), [equipe](../artifacts/landing-stage5-staff-flow.log), [gestão](../artifacts/landing-stage5-owner-flow.log), [reserva](../artifacts/landing-stage5-booking-flow.log), [abertura Android](../artifacts/landing-stage5-android-startup-flow.log) e [atualização Android](../artifacts/landing-stage5-android-update-flow.log).

`artifacts/` é local e ignorado pelo Git. Evidências adicionais: `C:/Users/nicky/AppData/Local/Temp/na-route-loading-OLdjsZ/` e `C:/Users/nicky/AppData/Local/Temp/na-responsive-MIEoC1/`.

## Próximo passo

A etapa 6 contempla seleção antecipada de serviço/profissional com intenção preservada durante autenticação. Não foi iniciada. Esta entrega termina aqui e aguarda aprovação.
