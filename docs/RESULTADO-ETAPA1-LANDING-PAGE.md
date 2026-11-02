# Resultado da etapa 1 — landing page

Data: 31/10/2026. Referência anterior: `938a22128858de2299882eccf5236c61cb238f3d`.

**Situação: implementada e testada localmente; aguardando aprovação do usuário para iniciar a próxima etapa.** Não houve commit, push ou publicação. Escopo: L01–L06 do [plano de implementação](PLANO-IMPLEMENTACAO-LANDING-PAGE.md).

## Entrega

- Cabeçalho e painel móvel com fundo uniforme `#00749C`, textos/ícones brancos e botão principal em azul profundo. Contraste branco/fundo: **5,28:1**.
- Cabeçalho alinhado à largura do conteúdo: em 1440 px, ambos têm 1160 px de largura e começam em x = 140 px.
- Atalho “Pular para o conteúdo”, foco visível e destino principal focável.
- Menu fecha por Escape tanto no botão quanto nos links, devolvendo foco ao botão. Toque fora mantém o foco natural do alvo; saída de foco, escolha de seção e transição para desktop também fecham o menu.
- Tipografia menos comprimida e arte do símbolo menor no celular. Botão principal continua visível antes da rolagem na referência de 390 × 844.
- Chamadas de entrada padronizadas como “Agendar horário”, com explicação do acesso/criação de conta. O cartão que leva à explicação passa a dizer “Veja como agendar”.
- Cartões da equipe mostram a função uma vez. Especialidade é opcional. Recomendações estáticas deixam de aparecer na vitrine até terem fonte confirmada; os dados usados pelas telas internas foram preservados. Richard mantém iniciais enquanto não houver foto cadastrada.

Serviços, galeria, avaliações, FAQ, localização unificada, otimização de fontes/mídia, metadados e divisão por rota ficam para as etapas correspondentes. Regras operacionais de acesso, disponibilidade e reserva não foram alteradas.

## Referência e reversão

Antes das mudanças, foi criada a pasta local `artifacts/landing-stage1-baseline-20261031-014859/`, com cópia dos arquivos de origem previstos, `dist`, manifesto SHA-256, HEAD, estado Git, diff e capturas. Os relatórios de avaliação e planejamento já estavam sem rastreamento e foram preservados.

Se houver pedido de reversão, comparar com essa referência e desfazer somente esta entrega, preservando mudanças posteriores. O build atualizou os arquivos gerados rastreados em `dist`, inclusive seus nomes com hash; a versão anterior está na referência local.

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run build` | Passou em TypeScript e build de produção. Permanece o aviso de bundle maior que 500 KB; divisão por rota é uma etapa posterior. |
| `npm.cmd test -- src/config/siteConfig.test.ts` | Dois testes passaram, preservando contatos e horários cadastrados. |
| `node scripts/check-landing-responsive.mjs` | Passou em 21 larguras, de 280 a 1440 px, incluindo 1099/1100/1101 px, sem conteúdo fora da tela. |
| Ajuste de texto | Passou a 150% em 320, 390 e 768 px. |
| Menu aberto | Sem conteúdo fora da tela em 280, 390, 1099 e 1100 px. |
| Interações com entrada real via CDP | Passaram: primeiro Tab/atalho/Enter, menu fechado fora da tabulação, Enter no botão, Escape no botão e nos links, foco de retorno, toque fora, escolha de seção e redimensionamento. |
| CTAs e movimento | Nomes/destinos conferidos; menu utilizável com preferência de movimento reduzido. |
| Axe-core 4.12.1 | Zero violações automatizadas no celular com menu fechado, celular com menu aberto e desktop. Houve uma verificação inconclusiva de contraste no fallback com gradiente, revisada manualmente. |
| Contraste do fallback | Texto `#006487` sobre os extremos do gradiente `#DFF6F7`/`#BCE8EC`: aproximadamente 5,88:1 e 5,01:1. |
| Fluxo de acesso com API/SQLite temporários | Passou: visitante, cliente, barbeiro, proprietário, destinos de `/painel` e `/agendar`, permissões, voltar/avançar, expiração real por 401 e recuperação por login. |
| Revisão | Diff conferido pelo coordenador e por subagente. Capturas desktop/celular examinadas. `git diff --check` passou. |

O fluxo de acesso inicialmente não compilou porque o terminal padrão não tinha `link.exe` do MSVC. Foi repetido com o toolchain GNU já instalado e passou, usando `CARGO_TARGET_DIR` temporário fora do caminho acentuado. Não foi necessário alterar código Rust nem configurações do produto.

O teste de teclado foi ajustado para enviar Enter corretamente pelo protocolo CDP. O teste de toque fora usa um botão temporário, pois seguir uma âncora pode mover o foco naturalmente para seu destino. O botão é removido ao terminar a verificação.

## Evidências locais

- [Primeira tela em celular](../artifacts/landing-stage1-mobile-top.png).
- [Menu aberto em celular](../artifacts/landing-stage1-mobile-menu.png).
- [Apresentação da equipe em celular](../artifacts/landing-stage1-mobile-team.png).
- [Cartões da equipe em celular](../artifacts/landing-stage1-mobile-cards.png).
- [Página completa em desktop](../artifacts/landing-stage1-desktop.png).
- Auditorias: [celular](../artifacts/landing-stage1-a11y-mobile.json), [menu aberto](../artifacts/landing-stage1-a11y-menu.json), [desktop](../artifacts/landing-stage1-a11y-desktop.json).

As evidências em `artifacts/` são locais e ignoradas pelo Git. Capturas adicionais do script responsivo ficaram em `C:/Users/nicky/AppData/Local/Temp/na-responsive-0ILAbq/`; o fluxo de acesso registrou sua evidência em `C:/Users/nicky/AppData/Local/Temp/na-access-flow-BkCuV2/`.

## Limites e próximo passo

As verificações são locais em Chrome. O ajuste de texto não equivale a zoom real do navegador. O atalho de zoom enviado ao navegador automatizado não mudou sua escala; a revisão manual de zoom real a 125%, 150% e 200%, outros navegadores e dispositivo físico continuam pendentes. A auditoria automática não certifica acessibilidade completa.

A próxima etapa é estrutura e conteúdo, começando por serviços e localização unificada. Ela só será iniciada após aprovação do usuário, conforme solicitado.
