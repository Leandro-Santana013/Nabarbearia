# Resultado local — F4: comissões e repasses

Data: 29/10/2026. Escopo aprovado: executar F4 do [plano de arquitetura](PLANO-MELHORIAS-ARQUITETURA.md), preservando F0–F3. **Implementação e validação local concluídas.** F5 permanece separada.

## Contrato entregue

[commissions/mod.rs](../backend/src/commissions/mod.rs) concentra a política financeira e oferece operações completas de criação de regra/regularização, registro de repasse, resumo do proprietário e relatório de ganhos. Os handlers autenticam, verificam CSRF, convertem IDs/datas e traduzem erros próprios para o contrato HTTP existente. As operações também verificam o papel e usam o negócio da identidade autenticada.

| Arquivo | Responsabilidade |
| --- | --- |
| [settlement.rs](../backend/src/commissions/settlement.rs) | Escolha de regra, centavos/arredondamento, snapshot histórico e lançamento de comissão; recebe a transação do chamador |
| [rules.rs](../backend/src/commissions/rules.rs) | Validação da regra, referências do mesmo negócio, substituição de regra equivalente, auditoria e regularização de pendências sob uma transação imediata |
| [storage.rs](../backend/src/commissions/storage.rs) | Uma política de elegibilidade compartilhada entre saldo exibido e repasse: comissão postada e ainda sem vínculo com pagamento |
| [payouts.rs](../backend/src/commissions/payouts.rs) | Conferência do saldo esperado, repetição por chave, registro dos itens e auditoria sob uma transação imediata |
| [queries.rs](../backend/src/commissions/queries.rs) | Produção por período, saldo acumulado, regras/pagamentos/repasses e ganhos por profissional; cada resposta é lida em um snapshot transacional |
| [tests.rs](../backend/src/commissions/tests.rs) | Comportamento financeiro sobre SQLite real, incluindo falhas induzidas e duas conexões independentes |

A conclusão em [appointments/transitions.rs](../backend/src/appointments/transitions.rs) continua gravando execução, histórico, receita, comissão e auditoria antes do mesmo commit de F3. O cálculo recebe apenas os fatos históricos necessários em `Settlement`, sem abrir/confirmar outra transação. O antigo `appointments/commission.rs` foi transferido para `commissions/settlement.rs`; o módulo financeiro não depende de `appointments`, handlers ou Axum. As importações das partes financeiras alteradas são explícitas.

Comportamentos preservados:

- Regra específica de barbeiro precede regra apenas de serviço; depois vêm especificidade de serviço, prioridade e criação mais recente. A vigência considera o início histórico do atendimento, com início inclusivo e fim exclusivo.
- Percentuais usam pontos-base e o arredondamento anterior: `(base_cents * amount + 5000) / 10000`. Valor fixo, inclusive superior ao preço, e comissão zero conservam o contrato existente.
- Ausência de regra gera pendência, sem impedir a conclusão. Criar uma regra regulariza somente as pendências elegíveis, sem recalcular comissões já postadas nem usar preço reajustado do catálogo.
- O resumo usa a data de início da agenda; o relatório de ganhos usa a data de conclusão. O saldo a repassar considera todo o histórico elegível, independentemente do período selecionado. Uma comissão paga continua integrando a produção.
- Repasse registra pagamento já efetuado e exige o saldo integral esperado. A mesma chave e intenção devolvem o mesmo registro; chave reutilizada para outra intenção ou saldo desatualizado são recusados. A associação única por atendimento e a transação imediata impedem pagamento duplicado.
- `retained_cents` continua sendo receita menos comissões. Não representa lucro líquido; a apresentação existente mantém “Não apurado” e informa a ausência de despesas/impostos.

## Validação

Evidências em [artifacts/arquitetura-f4-2026-10-29](../artifacts/arquitetura-f4-2026-10-29/), ignoradas pelo Git.

| Verificação | Resultado |
| --- | --- |
| Base Rust antes de F4 | 17/17 passaram novamente; `base-rust.log` |
| Rust final | **29/29 passaram**, com 12 novos testes financeiros; `final-rust.log` |
| Formatação e Clippy | `fmt --check` e `clippy --all-targets -- -D warnings` passaram; `fmt.log` / `clippy.log` |
| Build backend | Passou com toolchain GNU Windows; `build-rust.log` |
| Regressão frontend | **83/83 em 16 arquivos**; `frontend-test-verified.log` |
| Proprietário | Fluxo real passou com comparação de resumo, receita/comissão do proprietário, ganhos do barbeiro e repasses no mesmo SQLite; `final-owner-flow.log` |
| Cliente/barbeiro, equipe, acesso e reserva | Quatro fluxos reais adicionais passaram, sequencialmente; `final-{client,staff,access,booking}-flow.log` |
| Preservação e estrutura | Cálculo, consultas de produção e de ganhos preservados; uma consulta de elegibilidade; dois comandos financeiros imediatos; `review-preservation.json` |
| UI | Capturas do financeiro de proprietário em 390 e 1360 px inspecionadas; mantidas em `capturas/`. O fluxo verifica ausência de overflow horizontal |
| Diff | `git diff --check` passou |

Os testes novos cobrem especificidade/prioridade/recência/vigência, percentual/fixo/zero, configuração ausente, regularização posterior, preço histórico e repetição direta do cálculo sem regravar postados. Também cobrem permissões/isolamento por negócio, períodos distintos, saldo acumulado, saldo alterado antes do pagamento, intenção repetida ou trocada, novo ganho após pagamento e duas conexões SQLite disputando a mesma comissão. Falhas no segundo item de regularização/repasse e nas auditorias comparam todas as linhas de agenda, execução, regras, snapshots, lançamentos, repasses, itens e auditoria antes/depois. O teste de F3 que falha o lançamento de comissão e exige rollback integral da conclusão continua passando.

Os cinco fluxos usaram Chrome, API recompilada e bancos temporários. O frontend não foi alterado nem recompilado: os fluxos usam o `dist` verificado no Ciclo 2. Não se reivindica uma nova rodada completa de responsividade/zoom de F0–F2. Os testes frontend exigiram execução fora da restrição de leitura do esbuild sobre o ancestral de `vite.config.ts`; passaram sem modificar configuração.

## Revisão e limites

Revisão sequencial pelo mesmo agente, com passe estrutural separado; sem revisão independente.

- **Gate 4: attempt 1 of 3:** a conferência do diff identificou mudança da prioridade de rejeição para valor de regra inválido combinado com data malformada. A validação compartilhada passou a ser chamada antes do parsing das datas na borda e novamente no comando; uma asserção de API preserva o código anterior. Também foram reforçados os testes de repetição direta do cálculo e de rollback da substituição de regra.
- **Gate 4: attempt 2 of 3:** os 29 testes Rust, 83 frontend, fmt, Clippy, build e cinco fluxos reais passaram com a reconciliação. A comparação normalizada confirmou preservação integral do corpo do cálculo, descontando assinatura/entrada mínima, e das consultas de produção/ganhos. A inspeção confirmou a transação de conclusão intacta, duas operações financeiras completas e independência do transporte. Nenhum achado material remanescente no escopo local.

As primeiras fixtures financeiras usavam um hash desabilitado menor que o mínimo do banco; foram corrigidas sem alterar esquema. A primeira ampliação do fluxo usava timestamps com segundos/milissegundos; foi alinhada ao contrato existente de minuto UTC. Esses erros eram da preparação dos testes, e os logs anteriores foram preservados.

Schemas, migrações, dependências, contratos externos e UI/CSS permanecem os mesmos. Não houve uso do banco real, alteração de servidor/APK, acionamento de workflow, commit, push ou publicação. Linux, produção e aparelho não foram certificados. F5 depende de autorização própria.
