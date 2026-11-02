# Resultado da etapa 6 — Escolha antecipada na landing

Data: 31/10/2026. Escopo: E01 do [plano de implementação](PLANO-IMPLEMENTACAO-LANDING-PAGE.md), autorizado pelo usuário. Implementado e validado localmente, com investigações, implementação do armazenamento e revisão independente delegadas a três subagentes. Integração, inspeção visual e execução dos testes realizadas pelo coordenador. A direção visual seguiu a skill frontend-design.

## Comportamento entregue

- Cada serviço válido mostrado na landing oferece **Escolher serviço**, com preço e duração da API. Depois do login ou cadastro, o cliente chega à seleção de profissional com esse serviço.
- A lista operacional da equipe usa `GET /public/barbers`. **Escolher este profissional** guarda seu ID e, após o acesso, apresenta o catálogo com a preferência visível. Ao escolher o serviço, o profissional já aparece selecionado.
- A foto coletiva e a apresentação editorial foram preservadas. Se a consulta de profissionais falhar ou vier vazia, os cartões editoriais continuam disponíveis **sem botões que simulem uma seleção operacional**. Não foi feita correspondência por nome com a equipe estática.
- Um aviso acompanha a escolha no login/cadastro e nas etapas de seleção. **Cancelar escolha** descarta a preferência e retorna ao catálogo. Continuar como visitante também descarta. As chamadas genéricas de agendamento iniciam um fluxo sem preferência anterior.
- A escolha sobrevive à recarga, inclusive na seleção de profissional ou calendário. Datas e horários devem ser escolhidos novamente após recarregar; não são persistidos por esta funcionalidade.
- Profissionais e serviços são revalidados contra o catálogo atual. Se algum tiver sido desativado, a preferência é descartada com aviso, sem substituir silenciosamente por outra pessoa ou serviço.
- Contas de barbeiro e proprietário mantêm os destinos permitidos pelo perfil. A escolha de cliente é descartada nesses casos.
- Cancelamento fica desabilitado durante login/cadastro ou confirmação em andamento. A preferência é limpa depois de uma reserva confirmada, preservada quando uma tentativa de confirmação falha e descartada ao sair, expirar a sessão ou trocar de conta.

Nenhuma escolha cria uma reserva automaticamente. O calendário continua consultando disponibilidade pelo par serviço/profissional, e a confirmação explícita continua usando o mecanismo de reserva existente. O domínio atual não possui uma matriz adicional de especialidades por serviço: profissionais e serviços ativos da unidade são elegíveis, e a API decide os horários disponíveis, inclusive exceções ao horário geral.

## Estado temporário e proteção entre contas

O módulo [landing-intent.ts](../src/lib/booking/landing-intent.ts) guarda apenas versão, data de criação, IDs opcionais de serviço/profissional e ID da conta vinculada. Usa `sessionStorage`, com validade de **30 minutos**. Não armazena senha, token, preço, horário nem destino de redirecionamento.

Uma escolha anônima é vinculada à primeira conta de cliente que a retomar. Escolhas vinculadas a outra conta, registros expirados, JSON inválido e campos não permitidos são descartados. O vínculo não renova a validade; uma nova escolha explícita substitui a anterior. A identidade atual é consultada no clique da landing, evitando transportar uma escolha de cliente já autenticado para outra conta.

Se o navegador bloquear o armazenamento, há fallback em memória durante a navegação atual. Nesse caso, a continuidade após recarga não é garantida. A funcionalidade não sincroniza escolhas entre abas, dispositivos ou contas e não constitui autorização para reservar.

## Design e acessibilidade

Os novos controles usam a paleta azul/ciano existente, altura mínima de 44 px, nomes acessíveis que incluem o texto visível e foco destacado. O carregamento é anunciado sem bloquear a landing; uma falha ao iniciar a escolha aparece na seção correspondente e permite tentar novamente.

A inspeção do login encontrou contraste insuficiente em textos e botões preexistentes. As correções ficaram restritas ao componente de login/cadastro: azul `#00749C`, hover `#006487` e cinza mais escuro nos textos auxiliares. O azul principal com branco oferece aproximadamente **5,28:1**. Os tokens globais dos demais painéis não foram alterados.

Verificações axe locais com dados de teste:

| Superfície | Violações | Observação |
| --- | --- | --- |
| Landing 390 px | 0 | Uma verificação automática inconclusiva no gradiente das iniciais. |
| Menu móvel aberto | 0 | Mesma verificação inconclusiva. |
| Landing 1440 px | 0 | Mesma verificação inconclusiva. |
| Login com escolha pendente | 0 | Contraste e aviso verificados. |
| Cadastro com escolha pendente | 0 | Inclui estado hover do botão. |

O gradiente foi conferido pelas cores computadas: texto `#006487` sobre extremos `#DFF6F7` e `#BCE8EC`, com razões aproximadas de 5,88:1 e 5,01:1. A análise automatizada continua registrada como inconclusiva; esses testes não representam certificação de acessibilidade de todo o aplicativo.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run build` | TypeScript e build de produção passaram. |
| `npm.cmd test` | **164 testes em 20 arquivos passaram**, incluindo 28 do estado temporário. |
| `node scripts/check-landing-intent-flow.mjs` | API/SQLite e Chrome temporários: login inválido, cadastro, recarga, cancelamento, preferência de profissional, disponibilidade filtrada, confirmação e limpeza passaram. |
| Casos de segurança e alterações operacionais do novo fluxo | Serviço/profissional desativados, registro inválido/expirado, campo de redirect, vínculo de outra conta, troca real A→B com o aplicativo montado, logout e perfis internos passaram. |
| Confirmação com POST retido | Cancelamento desabilitado, nenhuma navegação/limpeza prematura; liberação da requisição real leva ao comprovante e limpa a preferência. |
| Fluxos `access`, `client` e `booking` | Passaram; incluem visitante, recuperação após login, domingo operacional em navegador com fuso de Tóquio, idempotência, conflito e remarcação com valores históricos. |
| Fluxos `staff` e `owner` | Passaram, incluindo permissões e operações dos painéis. |
| Fluxos `android-startup` e `android-update` | Passaram no navegador com a ponte simulada existente. |
| `node scripts/check-landing-responsive.mjs` | **21 larguras, de 280 a 1440 px**, incluindo escolhas operacionais, nomes longos, menu, FAQ, imagens e fontes. Profissionais vazios/indisponíveis e recuperação também passaram. |
| `node scripts/check-route-loading.mjs` | Divisão por rota, falha/recuperação de módulos, histórico e prontidão Android preservados. |
| `node scripts/check-public-metadata.mjs --origin http://127.0.0.1:4173` | Metadados e assets da versão local passaram. |
| Sintaxe dos scripts e `git diff --check` | Sem erros. |

O novo fluxo pode ser repetido com `npm.cmd run test:landing-intent-flow`. Os fluxos com backend/Chrome usam portas compartilhadas e foram executados em sequência, usando somente bancos de teste. Neste Windows foi usada temporariamente a toolchain GNU e o cache de build em `%TEMP%`, sem mudar a configuração do projeto.

## Arquivos e evidências

Principais fontes: [PublicSite.tsx](../src/PublicSite.tsx), [ClientApp.tsx](../src/ClientApp.tsx), [AccessProvider.tsx](../src/lib/access/AccessProvider.tsx), [LoginScreen.jsx](../src/pages/LoginScreen.jsx), [LandingChoiceNotice.tsx](../src/components/LandingChoiceNotice.tsx), [estado temporário](../src/lib/booking/landing-intent.ts), [testes do estado](../src/lib/booking/landing-intent.test.ts), [fluxo integrado](../scripts/check-landing-intent-flow.mjs), [verificação responsiva](../scripts/check-landing-responsive.mjs) e [estilos públicos](../src/public-site.css). `package.json` ganhou apenas o comando de teste; `dist` foi regenerado pelo build.

Referência anterior preservada em `artifacts/landing-stage6-baseline-20261031-130847/`, com cópias selecionadas, build anterior, diff, estado Git e hashes. Evidências locais, ignoradas pelo Git:

- [Serviços no celular](../artifacts/landing-stage6-services-mobile.png), [profissionais no celular](../artifacts/landing-stage6-professionals-mobile.png), [escolha retomada](../artifacts/landing-stage6-service-resumed.png), [calendário filtrado](../artifacts/landing-stage6-professional-calendar.png) e [aviso no login](../artifacts/landing-stage6-login-choice.png).
- Logs `artifacts/landing-stage6-*-flow.log`, `landing-stage6-responsive.log`, `landing-stage6-route-loading.log` e relatórios `landing-stage6-a11y-*.json`.
- O log de cada fluxo identifica sua pasta temporária de evidências. As capturas usam dados fictícios de teste, sem operar reservas de produção.

## Situação de entrega

As seis etapas do plano têm implementação local. Continuam pendentes os insumos reais já declarados na etapa 3, a publicação autorizada e a validação em aparelho Android físico. Não foi criado commit, push, publicação nem APK nesta etapa. Os testes de Android no navegador não comprovam comportamento em dispositivo real ou condições reais de rede.
