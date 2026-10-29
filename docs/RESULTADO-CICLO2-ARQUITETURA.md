# Resultado do Ciclo 2 — F2a e F2b

Data: 29/10/2026. Escopo aprovado: calendário necessário à reserva e coordenação da reserva do cliente, com testes/revisão e preservação do layout. Continuação local do [plano](PLANO-MELHORIAS-ARQUITETURA.md), preservando as alterações do [Ciclo 1](RESULTADO-CICLO1-ARQUITETURA.md).

**Resultado:** F2a/F2b implementadas e verificadas localmente no Windows. Nenhum commit, push, workflow disparado, publicação ou novo APK. Backend, banco da barbearia, código nativo e configuração TypeScript não foram alterados. Os testes de uso empregaram API real e bancos temporários.

## Decisão de produto aprovada

Foi apresentada a diferença observada entre expediente institucional e escala operacional: a tela bloqueava domingos antes de consultar a API, mesmo que um profissional tivesse escala naquele dia. O usuário aprovou usar a agenda operacional como autoridade.

Na reserva real, os 14 dias apresentados são selecionáveis. Horários continuam vindo exclusivamente da API, que considera escala, pausas e reservas. A possibilidade de consultar um domingo não cria disponibilidade; sem escala/horário retornado, a tela mostra o estado vazio. A demonstração conserva o expediente institucional e seus dias fechados.

## F2a — Calendário e disponibilidade

[shop-calendar.ts](../src/lib/shop-calendar.ts) concentra o significado de data da barbearia, horário exibido e instante. Dias de calendário são manipulados sem depender do fuso do navegador; a apresentação usa São Paulo e não concatena um deslocamento UTC fixo. Reserva e classificação dos agendamentos do cliente usam essa base; não houve migração geral das regras de financeiro/gestão.

[availability.ts](../src/lib/booking/availability.ts) mantém adaptadores distintos para disponibilidade real e demonstração. Os slots reais preservam instante e profissional concreto, descartam dados inválidos e verificam se o início já passou. “Qualquer disponível” agrupa horários iguais para apresentação, conservando o vínculo com um profissional real na operação.

Os exports antigos `getDateOptions`, `getTimeSlots` e `availabilityFromApi` permanecem disponíveis pelos caminhos anteriores para compatibilidade. Os testes de expediente existentes continuam cobrindo demonstração; a política operacional real tem cobertura própria.

## F2b — Coordenação da reserva

| Arquivo | Responsabilidade |
| --- | --- |
| [reservation.ts](../src/lib/booking/reservation.ts) | Intenção real, catálogo válido, dados obrigatórios em centavos/duração, profissional, reserva versus remarcação, confirmação concorrente e chave de idempotência |
| [selection.ts](../src/lib/booking/selection.ts) | Consulta e descarte de respostas atrasadas, dia/horário selecionados, revisão, revalidação no clique, confirmação e recuperação de falhas |
| [useBookingSelection.ts](../src/lib/booking/useBookingSelection.ts) | Integração do controlador de seleção com React e ciclo de vida da tela |
| [ClientApp.tsx](../src/ClientApp.tsx) | Integração com sessão, catálogo, registros do cliente, navegação e apresentação do comprovante |
| [DateTimeSelection.jsx](../src/pages/DateTimeSelection.jsx) | Apresentação, filtro visual de período, foco e visibilidade do resumo |

O modelo real exige ID, preço em centavos e duração numérica; não extrai dados de textos formatados nem depende dos campos opcionais da demonstração. A projeção para tela fica na fronteira de apresentação. A remarcação mantém ID e dados históricos do agendamento; “agendar novamente” usa o catálogo atual.

Repetições simultâneas da mesma intenção compartilham a operação. Nova tentativa após resposta perdida reutiliza a chave; mudar o horário gera outra intenção. Um instante ISO equivalente é normalizado para não produzir chaves diferentes para o mesmo pedido. O valor final apresentado após sucesso vem do registro retornado pelo servidor.

Uma falha de conexão/timeout preserva a seleção: o servidor pode ter gravado a reserva mesmo sem o cliente receber a resposta. Um conflito confirmado recarrega a disponibilidade, impedindo nova confirmação do slot rejeitado e permitindo escolher outro. Uma resposta concluída depois de trocar a sessão ou a intenção não publica o resultado como se pertencesse à seleção atual.

## Verificações executadas

Evidências em [artifacts/arquitetura-ciclo2-2026-10-29](../artifacts/arquitetura-ciclo2-2026-10-29/), pasta ignorada pelo Git. O working tree conserva os fontes/testes e a documentação revisáveis.

| Verificação | Resultado |
| --- | --- |
| Testes frontend | **83 passaram em 16 arquivos**, incluindo 20 casos novos de calendário, seleção e reserva; [log](../artifacts/arquitetura-ciclo2-2026-10-29/final-unit.log) |
| TypeScript e build Vite | Passaram; JS 672,26 kB, gzip 210,46 kB; aviso existente acima de 500 kB permanece; [log](../artifacts/arquitetura-ciclo2-2026-10-29/build-verificado.log) |
| Cliente/barbeiro existente | Reserva, comprovante, remarcação, conclusão/comissão, avaliação, cancelamento, encaixe, pausas, conflitos/permissões e logout; [log](../artifacts/arquitetura-ciclo2-2026-10-29/cliente-verificado.log) |
| Proprietário | Catálogo, equipe, comissões/repasses, lote, rollback de conflito e modo híbrido; [log](../artifacts/arquitetura-ciclo2-2026-10-29/final-owner.log) |
| Equipe | Sessão, rede/retomada, login/logout, download e cenários simulados do atualizador; [log](../artifacts/arquitetura-ciclo2-2026-10-29/final-staff.log) |
| Acesso | Rotas antigas, permissões, voltar/avançar e expiração 401 real; [log](../artifacts/arquitetura-ciclo2-2026-10-29/final-access.log) |
| Reserva F2 | Domingo e 09:00 permitidos por escala, navegador em Tóquio, autenticação no meio do fluxo, clique repetido, perda da resposta após gravação, mesma chave, comprovante, remarcação histórica e conflito real; [log](../artifacts/arquitetura-ciclo2-2026-10-29/final-booking.log) |
| Apresentação | Capturas em 320, 390 e 1440 px, sem overflow horizontal do documento; foco do resumo e botão alcançável com ampliação de 200%; capturas inspecionadas |
| Estrutura | Nenhum ciclo de importação de execução envolvendo reserva na inspeção dirigida; regras e protocolo retirados das telas |
| Preservação visual | Comparação com snapshot do início da F2 confirmou markup/classes integralmente preservados, alterando somente a ligação dos handlers |
| Diff | `git diff --check` passou; nenhuma alteração em backend/deploy/nativo/tsconfig |

As cinco verificações de uso executaram Chrome e API/SQLite reais. No teste da resposta perdida, o POST realmente chegou ao servidor e foi gravado; somente a entrega da resposta ao navegador foi interrompida por uma instrumentação do teste. A nova tentativa encontrou a mesma reserva. No conflito, outra requisição real ocupou o horário depois da revisão; a confirmação recusada não gerou gravação adicional.

O reajuste de preço foi aplicado pela API administrativa ao banco temporário, e a remarcação manteve o valor anterior. Duração histórica diferente da duração atual do catálogo também foi exercitada no teste do módulo. A verificação de tipos corrigiu a assinatura dos mocks; a preparação do novo teste de uso foi ajustada para usar o PUT existente de edição de serviço e aguardar o foco agendado pela tela.

Capturas: [320 px](../artifacts/arquitetura-ciclo2-2026-10-29/capturas/reserva-320.png), [390 px](../artifacts/arquitetura-ciclo2-2026-10-29/capturas/reserva-390.png), [desktop](../artifacts/arquitetura-ciclo2-2026-10-29/capturas/reserva-1440.png) e [ampliação de 200%](../artifacts/arquitetura-ciclo2-2026-10-29/capturas/reserva-zoom-200.png). A última usa ampliação por gesto do navegador, com deslocamento da área visível e foco na confirmação; não representa um redesenho com novo reflow de layout.

## Revisão deepwork

Revisão sequencial pelo mesmo agente, com inspeção estrutural separada; não foi revisão independente.

- **Gate 2a: attempt 1 of 3:** datas de São Paulo, viradas de dia/ano, fuso diferente, duração perto do fechamento, slots iniciados, política real/demonstração e decisão sobre domingo conferidos. Compatibilidade dos exports e apresentação preservadas. Aceite local concluído.
- **Gate 2b: attempt 1 of 3:** confirmadas a concentração dos dados/protocolo, concorrência, identidade do profissional, isolamento da resposta por sessão/intenção, histórico e recuperação de erro. A categoria exibida conserva a conversão existente para evitar mudança incidental de texto. Testes e cenários reais passaram; sem regressão material remanescente no escopo local.

## Limites e próximos passos

- O backend continua sendo a autoridade final. A consulta pública de disponibilidade usa a duração atual do catálogo, inclusive quando a remarcação preserva duração histórica. Essa limitação existente pode apresentar candidatos conservadores ou receber conflito na validação final quando as durações diferirem; não foi introduzido um novo contrato HTTP na F2.
- A repetição após perda de resposta foi validada enquanto o horário continua futuro. O backend verifica “horário futuro” antes de consultar a chave de idempotência; após o início, o usuário deve consultar seus agendamentos. A chave da tentativa fica na instância do fluxo, sem nova persistência de rascunho entre recargas. O comprovante já confirmado é recuperado pelo ID da URL.
- A remarcação conserva o PATCH existente, sem acrescentar idempotência transacional ao backend. Os testes comprovam a preservação do agendamento, não uma mudança desse protocolo.
- Não houve nova certificação Linux, de produção ou de instalação no aparelho. A pendência Linux do Ciclo 1 permanece; os cenários foram incorporados ao workflow, sem dispará-lo.

O próximo candidato do plano é F3, em escopo separado: operações transacionais de agenda e os limites de contrato descritos acima. F3–F5 não foram iniciadas. Commit, push e publicação continuam dependentes de autorização específica.
