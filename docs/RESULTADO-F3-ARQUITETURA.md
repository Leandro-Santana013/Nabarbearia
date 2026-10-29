# Resultado local — F3: operações de agenda

Data: 29/10/2026. Escopo aprovado: executar F3 do [plano de arquitetura](PLANO-MELHORIAS-ARQUITETURA.md), preservando as alterações locais dos ciclos anteriores. **Implementação e validação local concluídas.** F4/F5, commit, push e publicação não estão incluídos.

## Contrato entregue

[appointments/mod.rs](../backend/src/appointments/mod.rs) oferece operações completas com `Db`, identidade autenticada e comandos sem tipos HTTP. Os handlers autenticam, verificam CSRF, validam a sintaxe e traduzem o resultado. As operações verificam permissões de negócio, conflitos e transições, controlando gravação, histórico e auditoria na mesma transação imediata. Os erros próprios são traduzidos para os códigos/status HTTP existentes em [error.rs](../backend/src/error.rs).

| Arquivo | Responsabilidade |
| --- | --- |
| [creation.rs](../backend/src/appointments/creation.rs) | Reserva do cliente e recepção/encaixe, preço/duração do catálogo, identidade de recepção e resposta idempotente persistida |
| [transitions.rs](../backend/src/appointments/transitions.rs) | Remarcação, cancelamento, início, conclusão, falta e detalhes operacionais, com as permissões e transições anteriores |
| [bulk.rs](../backend/src/appointments/bulk.rs) | Comando completo de lote, liberação temporária dos horários selecionados, troca de horários e rollback de todos os itens |
| [storage.rs](../backend/src/appointments/storage.rs) | Leitura da agenda, conflito com escala/pausas/reservas, histórico e verificação de profissional ativo |
| `commission.rs` (agora [commissions/settlement.rs](../backend/src/commissions/settlement.rs), após [F4](RESULTADO-F4-ARQUITETURA.md)) | Política de cálculo/registro existente, preservada e executada dentro da transação de conclusão |
| [db.rs](../backend/src/db.rs) | `Db::with_conn` preservado e escrita de auditoria compartilhada sem conhecimento de HTTP |

Cada uma das nove operações abre uma transação `Immediate`; somente a operação completa efetua seu commit. O lote não chama comandos que abram transações por item. Na conclusão, execução, histórico, receita, snapshot de comissão, lançamento financeiro e auditoria são gravados antes do mesmo commit. A ausência de regra continua produzindo comissão pendente de configuração; não é tratada como falha técnica. A regularização existente continua podendo chamar o cálculo dentro da sua própria transação.

O módulo de operações não importa handlers, Axum, headers, estado da aplicação ou tipos de resposta HTTP. A identidade vem da autenticação do servidor; o comando não aceita `business_id` escolhido no corpo da requisição. As funções internas de conflito/histórico não ficam disponíveis aos handlers para remontarem o protocolo. As leituras e a política financeira preservadas têm acesso interno explícito. `handlers/owner.rs` passou a usar imports explícitos.

## Evidências e testes

Evidências em [artifacts/arquitetura-f3-2026-10-29](../artifacts/arquitetura-f3-2026-10-29/), ignoradas pelo Git. Os fontes/testes e este resultado permanecem revisáveis no checkout.

| Verificação | Resultado |
| --- | --- |
| Base Rust antes da mudança | 7 testes passaram; [log](../artifacts/arquitetura-f3-2026-10-29/base-rust.log) |
| Extrações por grupos | Os 7 testes existentes passaram após criação/encaixe/remarcação e novamente após transições/lote |
| Rust final | **17 testes passaram**, incluindo 10 novos de operações com SQLite real; [log](../artifacts/arquitetura-f3-2026-10-29/final-rust.log) |
| Clippy | Passou com `--all-targets -- -D warnings`, incluindo os novos testes; [log](../artifacts/arquitetura-f3-2026-10-29/clippy-all-targets.log) |
| Formatação | `cargo fmt --check` passou |
| Backend compilado | Build GNU Windows passou; [log](../artifacts/arquitetura-f3-2026-10-29/final-build-rust.log) |
| Regressão frontend | **83 testes passaram em 16 arquivos**; [log](../artifacts/arquitetura-f3-2026-10-29/frontend-test.log) |
| Cliente/barbeiro | Passou: reserva/comprovante, remarcação, execução/conclusão, avaliação, cancelamento, encaixe/detalhes, falta, bloqueios e permissões; [log](../artifacts/arquitetura-f3-2026-10-29/final-client-flow.log) |
| Proprietário | Passou: catálogo/equipe, comissão/repasse, remanejamento/cancelamento em lote, rollback de conflito e modo híbrido; [log](../artifacts/arquitetura-f3-2026-10-29/final-owner-flow.log) |
| Equipe | Passou: sessão, download, atualização simulada, rede e retomada; [log](../artifacts/arquitetura-f3-2026-10-29/final-staff-flow.log) |
| Acesso | Passou: compatibilidade de rotas, três perfis, permissões, back/forward e expiração por 401 real; [log](../artifacts/arquitetura-f3-2026-10-29/final-access-flow.log) |
| Reserva F2 | Passou: domingo operacional, Tóquio, clique repetido, resposta perdida após gravação, mesma chave, comprovante por ID, remarcação histórica e conflito real; [log](../artifacts/arquitetura-f3-2026-10-29/final-booking-flow.log) |
| Diff e estrutura | `git diff --check` passou; oito corpos transacionais individuais preservados; sem tipos HTTP ou dependência dos handlers no módulo de operações |

Os cinco fluxos finais foram executados sequencialmente com Chrome, SQLite temporário e o binário compilado da versão final do backend. Nenhum deles utilizou a API ou o banco da barbearia. A regressão frontend exigiu execução fora do sandbox porque o esbuild não conseguia ler o ancestral do `vite.config.ts`; passou sem alteração de configuração. Não houve nova mudança de UI que exigisse repetir as inspeções visuais do Ciclo 2.

Os dez testes novos cobrem:

- Duas conexões independentes para o mesmo arquivo SQLite disputam o mesmo horário: somente uma reserva, histórico, auditoria e chave persistem.
- Tentativas simultâneas da mesma intenção devolvem o mesmo ID; mudar a intenção com a mesma chave é recusado sem gravação; outro usuário pode usar a mesma chave.
- Falha de auditoria na criação de encaixe reverte inclusive a identidade de recepção. Nova tentativa e repetição bem-sucedidas não duplicam cliente/reserva e preservam contato, pagamento e notas.
- Cliente alheio, barbeiro alheio, papel inadequado e identidade de outro negócio não conseguem executar as ações; serviços, profissionais e clientes de outro negócio não são usados na criação.
- Remarcação e conclusão conservam preço/duração históricos após reajuste do catálogo, e a comissão usa o preço histórico. Repetição da conclusão é recusada sem duplicar receita/comissão.
- Repetição do início não duplica execução/auditoria; execução iniciada bloqueia remarcação, falta e lote.
- Conflito depois do primeiro item remanejado desfaz todas as alterações. Troca entre horários selecionados funciona e mantém valores históricos.
- Falha na auditoria do segundo cancelamento em lote restaura também o primeiro, seu histórico e sua auditoria.
- Falha no lançamento financeiro de comissão, depois de gravar snapshot/receita/histórico, restaura integralmente o estado anterior à conclusão; nova tentativa funciona após retirar a falha.
- Detalhes, cancelamento, falta, transições inválidas e lote vazio/repetido mantêm os contratos anteriores.

As verificações de rollback comparam todas as linhas de agenda, histórico, auditoria, execução, lançamentos financeiros, snapshots de comissão, idempotência, usuários e papéis antes/depois. Não usam mocks de persistência. A preparação dos testes foi corrigida para gerar hashes de 64 caracteres e chaves válidas conforme as restrições existentes do SQLite; as primeiras falhas eram das fixtures, sem alteração do esquema para acomodá-las.

## Revisão e limites

Revisão sequencial pelo mesmo agente, com inspeção estrutural separada; sem revisão independente.

- **Gate 3: attempt 1 of 3:** a comparação dos snapshots confirmou preservação dos corpos transacionais das oito operações individuais e da política de comissão, descontando renomeação do tipo de erro e formatação. O lote foi conferido separadamente contra a implementação anterior, com validação sintática de data/ID na borda e regras transacionais no comando. Reconciliada a guarda antecipada de papel de cliente no handler de criação para preservar também a prioridade de rejeição HTTP anterior; a operação continua verificando a permissão de negócio.
- **Gate 3: attempt 2 of 3:** 17 testes Rust, fmt, Clippy incluindo testes, build e os cinco fluxos reais passaram com o código final. Confirmados os nove pontos de abertura/commit, sem transação aninhada por item ou commit interno no cálculo de comissão. Nenhum achado material remanescente no escopo local.

O esquema, migrações, `Db::with_conn`, rotas e formatos de resposta permanecem os mesmos. Nenhuma alteração de UI/CSS/frontend, deploy ou código nativo foi necessária em F3. Os fluxos usam o `dist` já compilado e verificado no Ciclo 2, com o novo binário backend; não se apresenta o build anterior do frontend como uma nova compilação nesta fase.

Os limites identificados no F2 continuam explícitos: disponibilidade pública usa duração atual do catálogo; o POST verifica horário futuro antes de recuperar a chave; PATCH de remarcação mantém seu protocolo sem nova chave transacional. Corrigi-los implicaria uma mudança adicional de contrato/produto e não foi necessário para a extração de F3.

A validação é local em Windows com toolchain GNU. Linux, produção e aparelho não foram certificados nesta fase. Banco real da barbearia, servidor, APK e workflow não foram alterados ou acionados. F4 pode ser avaliada em seguida, com a fronteira transacional estabilizada; F4/F5 continuam dependendo de autorização separada.
