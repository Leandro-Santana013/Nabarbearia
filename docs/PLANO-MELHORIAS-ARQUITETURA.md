# Plano de melhorias de arquitetura — para avaliação

Data: 29/10/2026. Estado: **F0–F5 aprovadas para execução local e implementadas. F5 validada no Windows; recuperação Linux e aceite externo pendentes.** Consulte os resultados do [Ciclo 1](RESULTADO-CICLO1-ARQUITETURA.md), do [Ciclo 2](RESULTADO-CICLO2-ARQUITETURA.md), de [F3](RESULTADO-F3-ARQUITETURA.md), de [F4](RESULTADO-F4-ARQUITETURA.md) e de [F5](RESULTADO-F5-ARQUITETURA.md).

Base de código conferida: `75f21659f59a4be02d34bc28fcdfcda3b9a6bfc2`, a mesma revisão do [relatório de arquitetura](../artifacts/qa-2026-10-29/relatorio-arquitetura.md). O checkout estava limpo antes da elaboração. Método: skill deepwork, com planejamento e revisão sequenciais pelo mesmo agente.

**Escopo escolhido pelo usuário:** **Ciclo 1 — F0 e F1**, seguido de **Ciclo 2 — F2a e F2b** e das aprovações explícitas de **F3**, **F4** e **F5** nas retomadas de 29/10/2026. As implementações foram entregues localmente; Linux, publicação e aparelho mantêm aceites próprios.

**Registro da elaboração inicial:** foram produzidos o plano e o progresso, com `.slim/` adicionada ao `.gitignore`, sem implementação naquele momento. Após as aprovações, F0–F5 foram implementadas e verificadas localmente conforme os relatórios de resultado e suas ressalvas. Não houve commit, push ou publicação.

## 1. Resultado esperado e limites

O resultado desejado é permitir alterar uma regra de acesso, reserva, agenda, comissão ou entrega sem reconstruir uma sequência distribuída entre telas, handlers e scripts. A melhoria deve ser demonstrada por responsabilidade concentrada, contratos menores para os chamadores e testes de comportamento.

O desenho preservará:

- Site público, entrada exclusiva da equipe e acesso de barbeiro/proprietário pelo navegador.
- Layout, hierarquia, cores, espaçamento, animações, foco e navegação atuais; desktop, celular de 320 px e zoom de até 200% permanecem no aceite.
- SQLite persistente, isolamento por negócio, cookies/CSRF e permissões verificadas no servidor.
- Transações imediatas, histórico, auditoria, idempotência e preço/duração/comissão históricos.
- Conclusão do atendimento e registro da comissão na mesma transação.
- Publicação manual, banco e segredos fora do pacote, assinatura Android compatível e possibilidade de atualizar a interface hospedada sem gerar APK desnecessariamente.

Ficam fora do escopo: novas funcionalidades de conta/OAuth/notificações, troca de banco ou framework, adoção de outro executor de testes, migração geral de JSX para TSX, reorganização completa de pastas e otimização de bundle sem medição. CONTEXT/ADRs formais não são pré-requisito; decisões desta proposta ficarão registradas aqui e no progresso. Tipos mais fortes serão introduzidos nos contratos efetivamente alterados.

## 2. Fases, dependências e tamanho relativo

| Ciclo / fase | Oportunidade do relatório | Entrega principal | Dependência | Esforço / risco |
| --- | --- | --- | --- | --- |
| 1 — F0 | 6: testes de uso | Base verificável e infraestrutura compartilhada dos três fluxos | Nenhuma | Médio / baixo a médio |
| 1 — F1 | 2: acesso | Uma política de sessão e destino por perfil, com entradas públicas/equipe distintas | F0 | Médio / médio a alto |
| 2 — F2 | 3 e 4: reserva/calendário | Coordenação da reserva tipada e regras temporais necessárias ao fluxo | F0; F1 recomendada para estabilizar sessão | Médio a alto / médio |
| 3 — F3 | 1: agenda no backend | Operações completas de agenda sob uma responsabilidade transacional | F0; independe tecnicamente de F2 | Alto / alto |
| 4 — F4 | 5: comissões/repasses | Regras, elegibilidade e consultas financeiras concentradas | F3, com fronteira de transação estabilizada | Alto / alto |
| Entrega — F5 | 7: web/Android | Preparação e verificação coerentes entre produtores/consumidores | Base de testes de F0; independente de F1–F4 | Médio / médio a alto |

Esforços são comparativos; não são prazos ou estimativas de horas. F2 será dividida em duas entregas verificáveis, e a ampliação do calendário além da reserva dependerá de necessidade comprovada. F3 e F4 terão diffs e gates separados.

A ordem recomendada é **F0 → F1 → F2 → F3 → F4**. F5 entra antes da próxima mudança relevante no contrato de entrega/atualizador e pode ser antecipada; não precisa esperar as demais refatorações. A publicação das correções já preparadas é uma pendência operacional separada e não deve depender de concluir este plano.

## 3. F0 — Base verificável e execução dos testes de uso

**Objetivo:** tornar a execução dos cenários repetível, diagnosticável e segura antes de mudar os módulos de produto.

**Arquivos de partida:** `scripts/check-client-flow.mjs`, `scripts/check-owner-flow.mjs`, `scripts/check-staff-flow.mjs`, `scripts/stop-test-processes.mjs`, `package.json` e [README](../README.md).

**Trabalho proposto:**

1. Registrar uma execução inicial dos testes atuais, separando falhas do produto de falta de Chrome, toolchain, porta ou permissão. Números do relatório anterior serão referência, não uma nova aprovação.
2. Concentrar em `scripts/test-support/` a criação do banco temporário, inicialização/saúde da API, requisições autenticadas, conexão CDP e limpeza de processos próprios do teste. Reaproveitar o helper de limpeza existente. Recusar portas ocupadas antes de iniciar, para não aproveitar acidentalmente uma API ou navegador de outra execução.
3. Migrar primeiro um fluxo, validar e só então os outros dois. Manter passos e asserções de negócio nos cenários, com as mesmas interações reais no Chrome e SQLite.
4. Fazer falhas de inicialização preservarem etapa, última causa útil, saída do processo e captura quando houver navegador disponível. Redigir logs sem cookies, tokens ou senhas.
5. Manter execução sequencial e portas atuais inicialmente. Paralelismo/portas dinâmicas só entram mediante necessidade posterior; não são requisito desta fase.

**Contrato pretendido:** um cenário solicita ambiente isolado, usa suas operações e o encerra; não monta o protocolo de subprocessos/WebSocket nem encerra processos alheios. Nenhum cenário aponta para o banco da barbearia.

**Aceite / Gate 0:** os três fluxos passam individualmente e em sequência; continuam verificando os mesmos resultados de negócio. Uma falha induzida de inicialização identifica sua causa, encerra processos iniciados pelo teste e permite nova execução. Verificar o caminho Windows e o caminho Linux antes de declarar ambos suportados; se faltar ambiente Linux, registrar o aceite dessa plataforma como pendente. Inspecionar separadamente a divisão entre infraestrutura e cenários.

**Risco principal:** esconder asserções ou reduzir cobertura ao extrair helpers. Confrontar os cenários antes/depois e conferir os dados persistidos, além do resultado do runner.

## 4. F1 — Acesso, sessão e navegação por perfil

**Objetivo:** concentrar restauração, expiração, logout e escolha de destino, preservando as entradas e permissões existentes.

**Arquivos de partida:** `src/App.tsx`, `src/StaffApp.tsx`, `src/ClientApp.tsx`, `src/PlatformApp.tsx`, dashboards, `src/lib/staff-routing.ts` e `src/services/api.ts`.

**Trabalho proposto:**

1. Caracterizar as rotas públicas, cliente, equipe e compatibilidade, incluindo `/painel`, `/agendar`, `/barbeiro`, `/gestao` e `/equipe/download`. Registrar destino por perfil, visitante, modo híbrido, recarga e voltar/avançar.
2. Concentrar a coordenação em `src/lib/access/`, com uma política de destino e uma responsabilidade de sessão por aplicação montada. Componentes consomem essa coordenação em vez de reproduzir o protocolo.
3. Manter cookies, CSRF, conversão de dados e tradução de erros no serviço HTTP. A expiração será comunicada sem consultar URLs de tela dentro de `api.ts`.
4. Preservar a proteção contra resposta atrasada de sessão anterior, assim como falha de rede recuperável e retomada Android. Falha de conexão não deve ser confundida com credencial incorreta.
5. Definir o tratamento do fallback de `PlatformApp` antes de remover código. Padrão proposto: rotas conhecidas preservadas, perfis documentados encaminhados aos painéis atuais e sessão sem perfil reconhecido recebe acesso negado. Remover `Workspace` e dependências exclusivas apenas após mapear referências e cobrir esse comportamento.

**Contrato pretendido:** telas recebem estado de acesso e ações de autenticação/saída; não escolhem repetidamente destino, tratamento de 401 e retomada. A API continua responsável pela autorização real.

**Aceite / Gate 1:** login, recarga, logout, expiração, resposta antiga após novo login, perda/retorno de rede e destinos dos três perfis passam; cliente permanece impedido de entrar como equipe. Proprietário híbrido conserva gestão e agenda. Rotas antigas continuam levando ao destino aprovado; `/equipe/download` conserva seu fluxo. No Android, uma atualização confirmada bloqueia o acesso da equipe; por solicitação de 30/10/2026, a consulta ocorre em segundo plano, sem tela de verificação na entrada. Conferir navegação, foco, telas estreitas e zoom.

**Risco principal:** alterar compatibilidade ou criar duas fontes de sessão. A inspeção estrutural deve comprovar a direção `tela → coordenação de acesso → API`, sem serviço HTTP importando componentes ou regras de URL.

## 5. F2 — Reserva do cliente e calendário necessário ao fluxo

**Situação:** F2a/F2b concluídas localmente. O usuário aprovou consultar todos os dias na reserva real, inclusive quando o expediente institucional indicar fechado; horários continuam dependentes da agenda operacional da API. A demonstração preserva o expediente institucional. Veja evidências e limites no resultado do Ciclo 2.

**Objetivo:** fazer nova reserva, remarcação e recuperação de comprovante seguirem um contrato consistente, com dados reais completos.

**Arquivos de partida:** `src/ClientApp.tsx`, `src/pages/DateTimeSelection.jsx`, seus tipos/testes, `src/lib/client-api.ts`, `src/data/bookingCatalog.ts` e os helpers temporais citados na candidata 4.

**Entrega F2a — significado das datas:** distinguir data da barbearia, horário de exibição e instante UTC em um ponto de calendário, inicialmente `src/lib/shop-calendar.ts`. Caracterizar os consumidores existentes e migrar apenas os necessários à reserva. O padrão proposto mantém o servidor como autoridade: expediente institucional é informação/apresentação, e não veto adicional a uma escala operacional válida. Se isso divergir do comportamento caracterizado, apresentar a mudança de produto para decisão antes de aplicá-la. Não fixar permanentemente `-03:00` nem propor produto multifuso.

**Entrega F2b — coordenação da reserva:** concentrar em `src/lib/booking/` seleção válida, revisão, confirmação, conflito, repetição e resultado. Separar os adaptadores reais/demonstração e as projeções de apresentação. Uma reserva real exige ID do serviço/profissional, duração numérica e preço em centavos; textos formatados ficam na apresentação. As telas conservam seleção visual, foco e navegação.

**Contrato pretendido:** a mesma intenção reutiliza sua chave de idempotência; uma intenção alterada não reaproveita indevidamente a anterior. Remarcação conserva o ID e os valores históricos exigidos pelo contrato atual. “Qualquer disponível” resulta em profissional concreto antes da confirmação. Não é obrigatório introduzir biblioteca de máquina de estados.

**Aceite / Gate 2:** resposta perdida após gravação e nova tentativa produzem uma única reserva; conflito permite mudar horário e tentar novamente; cliques repetidos não duplicam a operação; comprovante é recuperado pelo ID após recarga. Cobrir retorno da autenticação, serviço indisponível e seleção de profissional. Exemplos temporais: meia-noite UTC, virada de mês/ano, horário iniciado, duração perto do fechamento e navegador em fuso diferente. Comparar com a disponibilidade da API, incluindo divergência entre expediente institucional e escala.

**Risco principal:** tornar demonstração permissiva o modelo de produção ou mudar a oferta de dias sem decisão. Expandir o calendário para relatórios/ganhos somente como uma etapa posterior delimitada, se os mesmos contratos forem úteis; não migrar todos os helpers automaticamente.

## 6. F3 — Operações de agenda no backend

**Situação:** aprovada explicitamente pelo usuário, implementada e validada localmente: 17 testes Rust, fmt/Clippy/build, 83 testes frontend e cinco fluxos reais passaram. Consulte o [resultado de F3](RESULTADO-F3-ARQUITETURA.md) para contratos, evidências e limites; F4/F5 continuam separadas.

**Objetivo:** concentrar o resultado completo de uma operação de agenda, mantendo transporte Axum e persistência SQLite existentes.

**Arquivos de partida:** `backend/src/handlers.rs`, `backend/src/handlers/owner.rs`, `backend/src/db.rs` e testes HTTP/transacionais existentes.

**Trabalho proposto:**

1. Desenhar contratos internos de criação, encaixe, remarcação, cancelamento, início/conclusão e lote; manter os casos de uso distintos, com erros traduzidos pelos handlers para o contrato HTTP atual.
2. Introduzir um módulo de operações, inicialmente `backend/src/appointments/`, responsável por permissão de negócio, conflitos, gravação, histórico e auditoria. Evitar um conjunto de helpers públicos que ainda exija ao handler ordenar esses passos.
3. Migrar por grupos pequenos, começando por criação/encaixe/remarcação e depois transições/lote, com verificação entre grupos. Os handlers passam contexto autenticado confiável e dados validados de transporte.
4. O comando completo controla a transação imediata. No lote, as operações internas participam da mesma transação; na conclusão, o cálculo/registro de comissão participa dela também. Não criar commits internos ou transações aninhadas por item.
5. Preservar `Db::with_conn`, o contrato HTTP e o esquema do banco. Não introduzir repositórios genéricos ou outro adaptador de persistência sem necessidade concreta.

**Aceite / Gate 3:** SQLite real demonstra conflito entre reservas concorrentes, repetição idempotente, isolamento entre negócios e negação de ações indevidas. Falha no meio de lote reverte agenda, histórico e auditoria; falha ao registrar comissão não deixa atendimento concluído parcialmente. Confirmar preço/duração históricos e transições válidas. Os fluxos cliente/barbeiro e proprietário continuam passando.

**Risco principal:** mudar limites de transação. Antes de migrar, manter os testes transacionais existentes e acrescentar somente as lacunas necessárias. A revisão deve inspecionar os pontos de início/commit/rollback e a direção de dependências; o módulo de operações não depende de tipos HTTP.

## 7. F4 — Comissões e repasses

**Situação:** aprovada explicitamente pelo usuário, implementada e validada localmente. Passaram 29 testes Rust (12 novos financeiros), 83 frontend, fmt/Clippy/build e cinco fluxos reais com backend recompilado. Resumo do proprietário, repasses e ganhos do barbeiro conferidos sobre o mesmo banco temporário. Consulte o [resultado de F4](RESULTADO-F4-ARQUITETURA.md) para contratos, revisão e limites.

**Objetivo:** concentrar escolha de regra, preservação histórica, regularização, elegibilidade e projeções financeiras.

**Arquivos de partida:** `settle_commission` e consultas em `backend/src/handlers.rs`, `backend/src/handlers/owner.rs` e o contrato de resumo consumido por `src/lib/owner-dashboard.ts`.

**Trabalho proposto:** agrupar as regras em `backend/src/commissions/`, preservando o comportamento útil de `settle_commission`. Tornar explícitas as dependências hoje alcançadas por `use super::*` nas partes alteradas. A conclusão chama o módulo financeiro dentro da transação de F3; regularização e repasse controlam suas próprias operações completas. Separar conceitualmente produção por período e saldo acumulado, mantendo os nomes e contratos públicos compatíveis.

**Aceite / Gate 4:** testar prioridade das regras específicas/gerais, percentual/fixo, ausência de configuração, regularização posterior, preservação de comissão já calculada, saldo alterado durante a operação e repetição de repasse. O mesmo valor não pode ser pago duas vezes. A falha de comissão continua revertendo a conclusão. Conferir API, resumo do proprietário e ganhos do barbeiro sobre o mesmo banco temporário.

**Risco principal:** recalcular histórico ou tornar registros parcialmente persistidos. Preservar valores em centavos, arredondamento vigente e transação. Repasse permanece registro de pagamento efetuado; resultado após comissões não será apresentado como lucro líquido.

## 8. F5 — Contrato de entrega web/Android

**Objetivo:** reduzir o conhecimento manual necessário para preparar e verificar versões compatíveis, sem unificar entregas que precisam permanecer independentes.

**Arquivos de partida:** `scripts/tauri-android.mjs`, `src/lib/android-update.ts`, `src/components/AndroidUpdateGate.tsx`, `backend/src/handlers/android.rs`, `deploy/operations.py`, workflow manual e [RELEASE-VALIDATION](RELEASE-VALIDATION.md).

**Trabalho proposto:**

1. Criar amostras compartilhadas de manifesto válido/inválido em `tests/fixtures/android-release/`, utilizadas pelos produtores/consumidores Node, TypeScript, Rust e Python conforme a responsabilidade de cada um.
2. Concentrar preparação e verificação de revisão, versão Android, tamanho/hash, proteção do APK e ordem de disponibilização. Os comandos existentes devem executar essa política; um mero encaminhador de comandos não satisfaz a fase.
3. Manter explícita a compatibilidade do helper instalado administrativamente e do pacote web/backend. Não conceder ao usuário de deploy capacidade de substituir código privilegiado.
4. Preservar APK antes do manifesto, ausência de cache indevido, rejeição de HTML e recuperação existente. Um 204 significa ausência de APK anunciado, e não sucesso de atualização disponível.
5. Atualizar as instruções para separar preparado localmente, empacotado, publicado e validado no aparelho. Não disparar workflow nem instalar o helper nesta aprovação local.

**Aceite / Gate 5:** fixtures dão resultados coerentes entre consumidores; divergência de versão/tamanho/hash e anúncio incompleto são recusados antes da disponibilização. Operações e recuperação passam em Linux, além das verificações locais aplicáveis. Navegador comum mantém acesso e o download privado continua restrito à equipe.

**Aceite externo, quando autorizado e disponível:** conferir revisão/manifesto públicos e executar atualização sobre versão anterior no Android, com a mesma assinatura, cancelamento/falha/retomada e Wi-Fi/4G. Sem aparelho, a validação nativa fica pendente e não é substituída por simulação no navegador.

**Risco principal:** anunciar compatibilidade que só foi validada parcialmente. A situação online descrita no relatório anterior é histórica; este planejamento não a consultou novamente. A publicação das correções existentes segue seu próprio checklist, sem exigir a refatoração completa de F5.

## 9. Verificação e revisão conforme deepwork

Cada fase segue **inspecionar/desenhar → implementar → validar → revisar → reconciliar**, com pesquisa adicional quando surgir uma dúvida concreta. Antes da implementação, registrar responsabilidade, contrato, invariantes, caminhos que mudam e evidência esperada. Métodos e tipos finais serão escolhidos nessa inspeção, dentro do escopo aprovado.

A revisão será uma nova leitura crítica pelo mesmo agente, confrontando o diff com o contrato da fase; não será apresentada como revisão independente. Mudanças de interfaces, localização ou direção de dependências terão uma inspeção estrutural separada. Pergunta de aceite: o chamador deixou de precisar conhecer regras e ordem de uso, ou apenas passou a importar mais arquivos?

Cada gate tem uma revisão inicial e no máximo duas novas revisões materiais, registradas como `Gate N: attempt M of 3`. Reabrir apenas pendências ou riscos introduzidos pela correção. Ao esgotar esse limite, registrar risco residual e pedir decisão quando ele impedir o aceite; não esconder falha ou ampliar indefinidamente a fase.

### Comandos previstos

Comandos existentes ou equivalentes diretos do workflow, em PowerShell, a partir da raiz. Na execução, verificar o código de saída após cada comando e interromper a sequência dependente quando houver falha.

```powershell
npm.cmd test
npm.cmd run build
cargo fmt --manifest-path backend/Cargo.toml --check
cargo test --locked --manifest-path backend/Cargo.toml
cargo clippy --locked --manifest-path backend/Cargo.toml -- -D warnings
cargo build --locked --manifest-path backend/Cargo.toml
python -m unittest discover -s deploy -p test_operations.py -v
git diff --check
```

Após build atualizado e backend compilado, configurar `CHROME_BIN` e, quando necessário, `NABARBEARIA_TEST_BACKEND` com caminhos verificados. Executar **um fluxo por vez**:

```powershell
node scripts/check-client-flow.mjs
node scripts/check-owner-flow.mjs
node scripts/check-staff-flow.mjs
node scripts/check-barber-responsive.mjs
node scripts/check-landing-responsive.mjs
```

Os três scripts de fluxo são equivalentes aos scripts npm de fluxo depois do build; isso evita repetir o build sem mudança intermediária. Se MSVC não estiver disponível, verificar o toolchain GNU e usar target temporário sem acentos, sem presumir que o problema é do produto. Restaurar alterações temporárias de ambiente ao final.

| Fase | Verificações exigidas para o aceite |
| --- | --- |
| F0 | Base inicial dos testes existentes; três fluxos reais; falha de inicialização/limpeza; compatibilidade Windows/Linux |
| F1 | Testes frontend e build; cliente/equipe/proprietário; regressão de rotas, expiração e atualização; verificação visual das telas alteradas |
| F2 | Testes frontend e build; reserva/remarcação reais; casos temporais e de repetição; verificação visual do fluxo alterado |
| F3 | fmt, testes Rust, Clippy e build; SQLite/transações/permissões; fluxos cliente e proprietário |
| F4 | Mesmas verificações Rust; cenários financeiros e transação com conclusão; ganhos/resumo/repasse no fluxo real |
| F5 | Contratos nas linguagens alteradas; build/testes correspondentes; operações/rollback Linux; cenários do atualizador; aceite externo separado |

Executar uma regressão conjunta ao fechar cada ciclo e a bateria aplicável completa ao concluir o escopo aprovado. Usar resultados anteriores dentro da mesma revisão quando não houver alteração que os invalide. Testes visuais com API simulada verificam apresentação; os cenários de negócio continuam exigindo API e banco reais. Testes ignorados ou bloqueados devem aparecer no resultado.

## 10. Entregáveis, recuperação e aprovação

Cada fase entregue conterá diff local delimitado, contrato/decisões registrados, testes relevantes, evidências em `artifacts/` e resultado do gate. Documentação permanente ficará em `docs/`; acompanhamento local ficará em `.slim/deepwork/melhorias-arquitetura.md`, ignorado pelo Git.

Nesta proposta, o agente executor assume pesquisa, desenho, implementação, validação e revisão em passes separados. O usuário avalia escopo e decisões de produto. Execução técnica não pressupõe outros agentes ou continuidade em segundo plano.

A recuperação local será facilitada por alterações pequenas, compatibilidade HTTP e ausência planejada de migração de dados. Ao surgir regressão, isolar e reverter somente o diff da fase, preservando trabalho alheio. Publicação futura conserva backup/rollback operacional. Se uma mudança de esquema ou contrato externo se mostrar necessária, ela será apresentada como ampliação de escopo antes de executar.

| Opção de aprovação | O que autoriza futuramente |
| --- | --- |
| **Ciclo 1 — aprovado** | Implementação local de F0 e F1 concluída com evidências; aceite Windows realizado e execução Linux pendente, antes da escolha dos próximos ciclos |
| **Ciclo 2 — aprovado** | F2a/F2b implementadas com calendário, coordenação da reserva, decisão de disponibilidade operacional e testes/revisão locais |
| **F3 — aprovada** | Operações transacionais de agenda, com regressão Rust/SQLite e fluxos reais locais; sem incluir F4/F5 |
| **F4 — aprovada** | Política financeira, regularização, elegibilidade, projeções e repasses concentrados, com histórico, transações e contratos HTTP preservados; sem incluir F5 |
| **F5 — aprovada** | Contrato compartilhado Android, preparação de APK/pacote web, compatibilidade do helper e recuperação testadas localmente; Linux e aparelho pendentes, sem publicação ou instalação do helper |
| Roteiro completo local | Implementar F0–F4 em sequência e F5 no momento indicado, respeitando gates e decisões de produto pendentes |
| Fases selecionadas | Executar as fases indicadas, com suas dependências técnicas e verificação correspondente |

A aprovação futura cobre somente o escopo escolhido. Gates técnicos aprovados permitem avançar dentro desse escopo sem pedir confirmação a cada etapa. Mudança de regra de produto não resolvida, remoção de compatibilidade divergente do plano ou risco material sem aceite voltam para decisão do usuário. Commit, push, publicação e ações administrativas externas exigem autorização específica e não estão incluídos nestas opções.

**Decisões já aprovadas:** F0/F1, compatibilidade das URLs antigas, acesso negado para perfil desconhecido, F2a/F2b com agenda operacional como autoridade na reserva real e execução local de F3/F4/F5. A mudança observável dos dias consultáveis foi apresentada e aprovada explicitamente. Commit, push, publicação e instalação administrativa permanecem fora da autorização atual.

## 11. Fontes e limites da análise

- [Relatório de arquitetura](../artifacts/qa-2026-10-29/relatorio-arquitetura.md): origem das sete candidatas, invariantes e sequência sugerida.
- [Relatório de testes/correções](../artifacts/qa-2026-10-29/relatorio.md) e [plano anterior](../artifacts/qa-2026-10-29/plano-melhorias.md): histórico local, correções preparadas e pendências externas. Não foram sobrescritos.
- [README](../README.md), [backend/README](../backend/README.md), [package.json](../package.json) e [workflow](../.github/workflows/publish-demo.yml): comportamento documentado, ferramentas e comandos existentes.
- [RELEASE-VALIDATION](RELEASE-VALIDATION.md): distinção entre correção local, helper administrativo, publicação e aparelho.
- Conferência dirigida de `App`, `StaffApp`, `PlatformApp`, `api.test.ts`, contratos de reserva, transações/comissões e preparação dos scripts de fluxo. Não foi feita uma nova auditoria integral do repositório nem consulta ao servidor.

Os documentos serviram como evidência. Perguntas e ressalvas do relatório não foram tratadas como autorização de execução. Nenhuma melhoria proposta está certificada por testes nesta rodada de planejamento.
