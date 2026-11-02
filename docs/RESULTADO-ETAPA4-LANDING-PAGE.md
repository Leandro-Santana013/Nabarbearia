# Resultado da etapa 4 — otimização e compartilhamento

Data: 31/10/2026.

**Situação: T01–T06 implementados e testados localmente; aguardando aprovação para a etapa 5.** Não houve commit, push, publicação ou alteração do mecanismo de atualização Android. A divisão do JavaScript por rota não entrou nesta entrega.

Referência: [plano da landing page](PLANO-IMPLEMENTACAO-LANDING-PAGE.md). Estado anterior preservado em `artifacts/landing-stage4-baseline-20261031-023531/`, com arquivos de origem, `dist`, hashes, estado Git, diff, capturas e medições anteriores.

## Entrega

### Imagens

- Gerados **45 derivados WebP para 15 fontes**: símbolo, foto coletiva, sete imagens ilustrativas e seis retratos já utilizados no projeto. Richard mantém as iniciais.
- Componentes públicos agora usam `srcset` e `sizes` adequados ao símbolo, abertura, equipe, retratos, galeria e ambiente. Fontes sem variante mantêm o caminho original como fallback.
- Dimensões, proporções, legendas, identificação do conteúdo ilustrativo e fallback de erro foram preservados. A galeria mantém o carregamento próximo da área visível, por `IntersectionObserver`.
- Três medições anteriores identificaram o símbolo da abertura como elemento de LCP no celular de teste. Essa imagem permanece sem lazy loading e recebeu prioridade alta; o símbolo do rodapé e as fotos abaixo da dobra permanecem adiados.
- Os nove originais locais foram preservados e conferidos por hash. Os retratos remotos foram obtidos somente das URLs existentes em `siteConfig.ts`, com cache em `artifacts/stage4-portrait-originals/`.
- `scripts/optimize-public-media.py` permite reconstrução com Pillow/WebP, inclusive `--offline` depois de preencher o cache. Os 45 derivados foram reproduzidos com hashes idênticos nesta máquina.

| Medida de arquivos | Antes | Depois |
| --- | ---: | ---: |
| Soma das 15 fontes versus arquivos selecionados como fallback | 22.658.124 B | 625.270 B |
| Somente as sete imagens ilustrativas, na mesma comparação | 16.286.582 B | 411.306 B |
| Todos os 45 derivados, somados | — | 2.231.772 B |

A redução na soma dos fallbacks é de **97,24%**; nas imagens ilustrativas, **97,47%**. Isso compara arquivos, não o total transferido por uma visita. O navegador pode escolher variantes maiores conforme largura e densidade de pixels. Como os originais foram preservados em `public/` e copiados pelo build, a pasta de publicação não diminuiu nessa mesma proporção.

### Fontes e CSS

- Retirada a solicitação duplicada ao Google Fonts. Plus Jakarta Sans e Geist são fornecidas pelos pacotes locais já instalados.
- Corrigido o nome da família para **`Plus Jakarta Sans Variable`**, conforme a declaração do pacote. Os títulos e as telas internas continuam com Plus Jakarta Sans; o corpo da landing continua com Geist.
- Nenhum consumidor ativo exigia a variante itálica; não foram adicionados arquivos sem uso. `app/globals.css`, que não entra no aplicativo Vite atual, foi preservado.
- Consolidadas 133 regras públicas em `public-site.css`, mantendo a ordem da cascata e usando `:where(.public-site)` para escopar sem elevar a especificidade original.
- Retiradas 19 famílias de estilos sem consumidores, incluindo banners e cartões antigos. Não foram apagados arquivos ou imagens.
- A comparação de AST feita pelos subagentes preservou 204 seletores internos com os mesmos contextos e declarações, exceto a correção intencional do nome da fonte. `styles.css` não contém mais regras públicas da landing.

### Compartilhamento e busca local

- Favicon PNG de 64 × 64, a partir do símbolo existente.
- Imagem social JPEG de 1200 × 630, usando o símbolo e a foto coletiva real, com todos os rostos preservados.
- HTML inicial com título, descrição, tema, canonical, Open Graph, Twitter Card e URLs absolutas da imagem social.
- JSON-LD `HairSalon` gerado no build a partir de `BARBERSHOP_INFO`, a mesma origem do endereço, telefone e horários visíveis. Não foram criadas cópias independentes desses horários no HTML.
- Nenhum relato fictício, nota estática, quantidade de avaliações ou imagem ilustrativa entra nos dados estruturados.
- Serialização protege a fronteira do script JSON e os atributos/título são escapados. Dias sem mapeamento ou horários incompletos produzem erro de preparação, evitando marcação silenciosamente inconsistente.

O domínio `https://na-barbearia.duckdns.org` foi conferido na documentação e na configuração atual do projeto. A tentativa de abertura pública pela ferramenta web não foi acessível; esta entrega não afirma a saúde da produção nem a presença dos novos assets naquele endereço.

Como a aplicação é uma SPA, `/painel` e `/equipe/login` recebem a identidade e o canonical inicial da raiz. Isso foi conferido localmente: canonical não é redirecionamento e não modifica autorização. Metadados distintos por rota exigiriam outra decisão de renderização; não foram introduzidos nesta fase.

A marcação segue os tipos de [Schema.org HairSalon](https://schema.org/HairSalon) e a orientação de [LocalBusiness do Google](https://developers.google.com/search/docs/appearance/structured-data/local-business). Os horários representam informação geral, incluindo o domingo cadastrado como fechado; a agenda operacional continua decidindo disponibilidade e exceções. Dados estruturados não garantem posição ou destaque de busca.

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run build` | TypeScript e build de produção passaram. Continua o aviso de JavaScript maior que 500 KB; sua divisão pertence à etapa 5. |
| Testes de conteúdo público, configuração, metadados e seleção de serviços | **20 testes passaram** em quatro arquivos. |
| `node scripts/check-landing-responsive.mjs` | **21 larguras passaram**, de 280 a 1440 px, além de menu aberto, texto a 150%, FAQ aberta, teclado, foco, Escape, toque fora e movimento reduzido. |
| Imagens e fontes no navegador | Confirmados `srcset`/`sizes`, seleção de WebP local, prioridade da abertura, ausência de requisições ao Google Fonts e uso das fontes locais. |
| Erro real de imagem | Fallback, legenda, identificação e espaço preservados. O teste remove `srcset` antes de forçar a falha, para não testar acidentalmente outra variante válida. |
| Catálogo | Cenários válido, vazio, erro, demora e resposta antiga após sair/voltar continuaram passando. |
| `node scripts/check-public-metadata.mjs --origin http://127.0.0.1:4173` | Passaram HTML inicial, JSON-LD, canonical, favicon, JPEG/dimensões e resposta das rotas `/`, `/painel` e `/equipe/login`. |
| Fluxo de acesso com API/SQLite temporários | Passaram perfis, destinos, permissões, voltar/avançar, expiração por 401 e recuperação por login. |
| Fluxo de cliente | Passaram login, catálogo, reserva, remarcação, atendimento pelo barbeiro, avaliação e cancelamento persistidos. |
| Fluxo de equipe | Passaram acesso, sessão, download e cenários existentes de atualização. Isso não equivale a validação física no Android. |
| Fluxo de proprietário | Passaram catálogo, comissão, repasse, ações em lote, rollback de conflito, permissão e agenda própria. |
| `node scripts/check-barber-responsive.mjs` | Passaram agenda do barbeiro e agenda da gestão em 320–1440 px e nos cenários de escala do script, incluindo navegação de datas e formulários. |
| Revisão visual | Landing em desktop/celular, galeria, símbolo, rostos, favicon, imagem social e styleguide examinados. |
| Axe-core 4.12.1 | Zero violações automatizadas na landing em celular e desktop; verificações inconclusivas continuam registradas para gradiente e conteúdo externo do mapa. |
| Revisão de código | Duas revisões cruzadas independentes sem achados materiais. Diff e sintaxe conferidos. |

Os fluxos com backend rodaram **sequencialmente**, usando o toolchain GNU instalado e o diretório temporário de compilação já utilizado pelo projeto. Somente os processos e bancos temporários dos testes foram encerrados.

Houve uma interrupção por limite de uso da revisão automática de aprovação. As ações recusadas não foram executadas naquele momento; depois da solicitação do usuário para continuar, a revisão voltou a funcionar e as verificações pendentes foram executadas normalmente.

## Medições locais comparáveis

Três sessões novas de Chrome antes e três depois, na prévia local em 390 × 844, sem simular rede móvel. Os resultados são observações de laboratório; rede externa, cache e ambiente podem variar.

| Execução | LCP anterior | LCP posterior |
| --- | ---: | ---: |
| 1 | 1160 ms | 652 ms |
| 2 | 1092 ms | 628 ms |
| 3 | 1164 ms | 676 ms |
| **Mediana** | **1160 ms** | **652 ms** |

O CLS foi apresentado arredondado como 0,0 pela ferramenta; os registros brutos contêm pequenas entradas e não sustentam afirmar ausência absoluta de deslocamentos. Não houve medição de INP por interação ou comprovação de Core Web Vitals em produção. A redução observada não deve ser apresentada como ganho garantido para todos os usuários.

## Arquivos e evidências

Principais mudanças: `src/lib/public-media.ts`, `src/config/publicMedia.generated.json`, `src/config/publicMetadata.ts`, seus testes, `src/PublicSite.tsx`, `src/components/PublicContent.tsx`, `src/styles.css`, `src/public-site.css`, `index.html`, `vite.config.ts`, helper de mídia e scripts de verificação. `dist/` foi atualizado pelo build, sem publicação.

Assets: derivados em `public/brand/optimized/`, [favicon](../public/favicon.png) e [imagem social](../public/brand/og-cover.jpg).

- [Abertura em celular](../artifacts/landing-stage4-mobile.png).
- [Galeria em celular](../artifacts/landing-stage4-mobile-gallery.png).
- [Página completa em desktop](../artifacts/landing-stage4-desktop.png).
- [Styleguide](../artifacts/landing-stage4-styleguide.png).
- Auditorias: [celular](../artifacts/landing-stage4-a11y-mobile.json), [desktop](../artifacts/landing-stage4-a11y-desktop.json).
- [Relatório de mídia](../artifacts/stage4-media-report.json), [originais preservados](../artifacts/landing-stage4-originals-check.json), [comparação de medições](../artifacts/landing-stage4-vitals-comparison.json), [fontes e rede](../artifacts/landing-stage4-fonts-network.json).
- Logs dos fluxos: [acesso](../artifacts/landing-stage4-access-flow.log), [cliente](../artifacts/landing-stage4-client-flow.log), [equipe](../artifacts/landing-stage4-staff-flow.log), [gestão](../artifacts/landing-stage4-owner-flow.log) e [agendas responsivas](../artifacts/landing-stage4-barber-responsive.log).

`artifacts/` é local e ignorado pelo Git. Capturas adicionais dos testes ficaram em `C:/Users/nicky/AppData/Local/Temp/na-responsive-I80cKL/` e `C:/Users/nicky/AppData/Local/Temp/na-barber-responsive-eG4wLt/`.

## Limites e próximo passo

Zoom real completo, outros navegadores, aparelho físico e compartilhamento/validação em produção permanecem sem comprovação nesta entrega. As imagens e os relatos temporários continuam identificados; conteúdo verdadeiro, foto de Richard e especialidades ainda dependem de substituição posterior.

A etapa 5 trata do carregamento do aplicativo por rota. A execução para aqui e aguarda aprovação, conforme o acordo de trabalhar em partes.
