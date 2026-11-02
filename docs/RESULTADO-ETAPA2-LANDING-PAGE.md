# Resultado da etapa 2 — serviços e localização

Data: 31/10/2026.

**Situação: implementada e testada localmente; aguardando aprovação para a próxima etapa.** Escopo: C01–C06 do [plano](PLANO-IMPLEMENTACAO-LANDING-PAGE.md). A etapa 1 foi preservada. Não houve commit, push ou publicação.

## O que mudou

- A seção centrada nas funcionalidades da plataforma foi substituída por três categorias: **cabelo, barba e combos**, com descrições curtas e acesso ao agendamento.
- A vitrine consulta o endpoint público de serviços já existente. Exibe até dois serviços por categoria, com nome, preço exato e duração correspondente ao mesmo serviço.
- O adaptador reconhece somente categorias explicitamente mapeadas, desconsidera itens inativos ou inválidos, limita a seleção e evita duplicatas. Categorias adicionais permanecem disponíveis no catálogo completo do aplicativo, sem associação inventada na vitrine.
- Os valores são recebidos em centavos e formatados em reais. Não há preços copiados do catálogo estático como substituição.
- Enquanto a consulta carrega, a página e os botões continuam disponíveis. Em resposta vazia, falha ou ausência de categorias mapeadas, os cartões mantêm as descrições e orientam a consultar valores ao agendar. Uma resposta recebida depois de desmontar a página não altera a nova montagem.
- A ordem passou a ser **abertura → serviços → equipe → como agendar → localização → rodapé**. A âncora `#experiencia` foi preservada para a nova seção de serviços.
- A faixa de informações rápidas e o segundo bloco de localização foram retirados da composição. A explicação do agendamento foi compactada em três passos.
- Endereço, horários gerais, telefone, Instagram, botão de rota e mapa agora ficam em **uma única seção**. O endereço e os contatos continuam úteis mesmo se o mapa não carregar.

Os horários cadastrados foram preservados e apresentados como informação geral. A agenda operacional continua decidindo a disponibilidade de cada profissional; esta entrega não introduz regra de fechamento ou reserva na landing.

## Referência preservada

O estado da etapa 1 está em `artifacts/landing-stage2-baseline-20261031-015924/`, com cópias dos arquivos previstos, `dist`, manifesto SHA-256, estado Git, diff e capturas. Uma reversão desta etapa deve partir dessa referência, preservando a primeira entrega e mudanças posteriores de outras origens.

## Arquivos desta entrega

| Caminho | Responsabilidade |
| --- | --- |
| `src/PublicSite.tsx` | Composição, consulta do catálogo, estados, textos e localização unificada. |
| `src/public-site.css` | Serviços, lista de valores, bloco compacto e localização responsiva. |
| `src/lib/landing-services.ts` | Validação e seleção de serviços da API para a vitrine. |
| `src/lib/landing-services.test.ts` | Regressões de dados, categorias e correspondência dos valores. |
| `scripts/check-landing-responsive.mjs` | Novas seções, estados do catálogo e navegação, mantendo testes da etapa 1. |
| `scripts/check-landing-catalog-flow.mjs` | Integração com API e SQLite temporários. |
| `dist/` | Resultado gerado pelo build local; não equivale a publicação. |

A entrega contou com subagentes de visual, dados e validação, com propriedade separada dos arquivos. A integração e a revisão final ficaram com o coordenador; um subagente também revisou o código integrado em leitura.

## Validação realizada

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run build` | TypeScript e build de produção passaram. Permanece o aviso de bundle maior que 500 KB; divisão por rota fica para sua fase própria. |
| `npm.cmd test -- src/lib/landing-services.test.ts src/services/api.test.ts` | **14 testes passaram**, incluindo categorias, dados inválidos, duplicatas, preço/duração vinculados, erros de rede e timeout da camada de API. |
| `node scripts/check-landing-responsive.mjs` | **21 larguras passaram**, entre 280 e 1440 px, incluindo a transição de menu em 1099/1100/1101 px; sem conteúdo fora da tela nos cenários verificados. |
| Texto e menu | Ajuste de texto a 150% em 320/390/768 px e menu aberto em 280/390/1099/1100 px passaram. |
| Interação | Atalho de conteúdo, Tab, Enter, Escape, toque fora, escolha de seção, redimensionamento, CTAs e redução de movimento passaram. |
| Catálogo em navegador | Passaram: valores/durações exatos, item inativo, categoria desconhecida, resposta vazia, HTTP 500, resposta lenta e resposta antiga após sair e voltar. |
| API real com SQLite temporário | Passou: criação de serviços pela API, consulta anônima, renderização dos valores corretos, filtro de inativos/categorias não mapeadas, localização única e CTA de visitante levando ao acesso da conta. |
| Auditoria axe-core 4.12.1 | Zero violações automatizadas no celular e no desktop. Verificações inconclusivas: gradiente do fallback de Richard e partes do iframe do Google Maps. |
| Revisão final | Código integrado e capturas examinados. `git diff --check` e verificações de sintaxe dos scripts passaram. |

O teste de API real usou o toolchain GNU já instalado e um diretório temporário de compilação, mantendo as configurações do projeto e os dados da loja intactos. Não foi necessário alterar o backend ou o cliente compartilhado de API.

Na elaboração do teste de resposta lenta, a fixture inicialmente segurava os cabeçalhos e fazia o Chrome aguardar seu cache antes da nova requisição. A fixture foi corrigida para enviar a política de cache imediatamente e atrasar apenas o corpo. O teste de desmontagem e retorno então passou; não foi necessário alterar o comportamento da aplicação para contornar o teste.

## Evidências

- [Página completa em desktop](../artifacts/landing-stage2-desktop.png).
- [Abertura em celular](../artifacts/landing-stage2-mobile-top.png).
- [Serviços sem valores, com API indisponível na prévia](../artifacts/landing-stage2-mobile-services.png).
- [Serviço recebido da API real de teste](../artifacts/landing-stage2-services-api-test.png).
- [Serviços com resposta controlada de teste](../artifacts/landing-stage2-services-fixture.png).
- [Localização em celular](../artifacts/landing-stage2-mobile-location.png).
- Auditorias: [celular](../artifacts/landing-stage2-a11y-mobile.json) e [desktop](../artifacts/landing-stage2-a11y-desktop.json).

Os serviços e preços identificados como **teste** nessas capturas pertencem exclusivamente aos ambientes temporários; não representam o catálogo atual da loja e não foram adicionados ao conteúdo da aplicação. Na prévia local sem API disponível, é esperado que a vitrine apareça sem valores.

As evidências em `artifacts/` são locais e ignoradas pelo Git. Capturas adicionais: `C:/Users/nicky/AppData/Local/Temp/na-responsive-lJIEPc/`. Evidências da integração real: `C:/Users/nicky/AppData/Local/Temp/na-landing-catalog-flow-QG2d5F/`.

## Limites e próximo passo

As verificações são locais em Chrome. Não certificam acessibilidade completa, publicação em produção, desempenho em rede móvel real ou funcionamento em aparelho físico. A revisão de zoom real continua pendente; ajuste de texto e largura de viewport não equivalem a esse teste. O mapa é um conteúdo externo; endereço e link de rota são mantidos fora dele como alternativa.

A próxima fase do plano contempla galeria, foto faltante, depoimentos, foto da unidade, FAQ e informações práticas, condicionados a conteúdo real e confirmado. Nenhum desses blocos foi preenchido com material fictício nesta entrega. A execução permanece parada até a próxima aprovação.
