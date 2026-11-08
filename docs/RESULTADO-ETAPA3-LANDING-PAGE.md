# Resultado da etapa 3 — galeria, informações e FAQ

Data: 31/10/2026.

**Situação: apresentação implementada com conteúdo ilustrativo temporário autorizado, testada localmente e aguardando aprovação para a etapa 4.** Não houve commit, push ou publicação.

O usuário autorizou fotos genéricas/inventadas e depoimentos fictícios para substituição futura. Também confirmou o atendimento por WhatsApp e as informações de pagamentos e comodidades. Essa orientação atualiza as dependências de conteúdo real do [plano](PLANO-IMPLEMENTACAO-LANDING-PAGE.md).

## Entrega

- Galeria com seis imagens geradas para ilustrar cortes, textura, barba e acabamento. Cada imagem tem identificação visível e texto alternativo indicando que é ilustrativa.
- Três relatos fictícios temporários, identificados individualmente como exemplos. A seção informa que não são avaliações de clientes. Não há fonte, nota, estrelas ou quantidade de avaliações inventadas.
- Imagem ilustrativa de ambiente dentro da localização, acompanhada do aviso de que não representa a unidade real.
- WhatsApp `(13) 97404-0190`, como ação secundária **“Tirar uma dúvida”**, sem promessa de reserva ou lembrete automático.
- Pagamentos confirmados: Pix, cartão de crédito e dinheiro. Comodidades confirmadas: Wi-Fi, ar-condicionado, TV, atendimento infantil e acessibilidade física. Não foram inventadas condições específicas de acessibilidade, prazos ou políticas comerciais.
- Quatro perguntas frequentes sobre conta, profissional, disponibilidade e acompanhamento de reservas, sustentadas pelo funcionamento atual do aplicativo. Expansão nativa por `details`/`summary`, foco visível e respeito à redução de movimento.
- A configuração editorial fica em `src/config/landingContent.ts`. O conteúdo é público: rascunhos privados não devem ser guardados nesse arquivo, mesmo que uma seção esteja oculta.

Richard mantém as iniciais; não foi atribuído um rosto fictício ao profissional real. Sua foto, as especialidades e a origem das recomendações continuam pendentes. Os antigos contadores estáticos não foram reintroduzidos.

## Preservação e divisão do trabalho

Referência anterior em `artifacts/landing-stage3-baseline-20261031-021503/`, com arquivos de origem, `dist`, manifesto de hashes, estado Git e diff. Uma reversão deve preservar as etapas anteriores e mudanças posteriores do usuário.

Foram aplicadas as novas instruções de uso de subagentes fornecidas pelo usuário: investigação independente de conteúdo, análise de design/acessibilidade, revisão de segurança e implementação, e atualização isolada do script de testes. O coordenador integrou o código e executou as verificações disponíveis. Não houve edição simultânea dos mesmos arquivos por agentes distintos; os resultados necessários foram recebidos antes da consolidação.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run build` | TypeScript e build de produção passaram. Continua o aviso de bundle maior que 500 KB, previsto para a fase de carregamento por rota. |
| `npm.cmd test -- src/components/PublicContent.test.ts` | Seis testes passaram: blocos vazios, fontes/protocolos, texto escapado, distinção de exemplos fictícios, fotos válidas e contato. |
| `node scripts/check-landing-responsive.mjs` | Passou em 21 larguras de 280 a 1440 px, incluindo transição do menu em 1099/1100/1101 px. |
| Texto e menu | Ajuste de texto a 150% em 320/390/768 px e menu aberto em 280/390/1099/1100 px passaram. |
| FAQ | Enter/Espaço abrem e fecham mantendo foco; foco visível, respostas abertas em 280/390/768/1440 px e redução de movimento passaram. |
| Imagens | O navegador confirmou carregamento próximo da tela e ausência de imagens da galeria ainda distante. Falha real de imagem preservou fallback, identificação, legenda, espaço e foco. |
| Conteúdo temporário | Verificados os rótulos por imagem e por relato, aviso de seção e ausência de fontes fictícias. |
| Regressões das etapas anteriores | Menu, atalho de conteúdo, Escape, toque fora, redimensionamento, CTAs e cenários de catálogo válido/vazio/HTTP 500/lento/resposta tardia passaram. |
| Axe-core 4.12.1 | Zero violações automatizadas em celular e desktop; uma regra inconclusiva de contraste, incluindo o gradiente do fallback e, conforme carregamento, conteúdo externo do mapa. |
| Revisão | Revisão independente sem achados materiais; capturas examinadas pelo coordenador. `git diff --check` passou. |

As imagens novas usam `IntersectionObserver` com margem de 240 px, proporção reservada e carregamento tardio. O observador é desconectado após a aproximação e ao desmontar; há fallback para navegadores sem essa API. Isso controla quando o arquivo começa a carregar, mas não comprova ganho de LCP ou desempenho de produção.

Os sete originais PNG somam aproximadamente **16,3 MB**. Otimização de formato, tamanhos e variantes continua na etapa 4. Não houve otimização global dos assets, fontes ou CSS nesta entrega.

## Arquivos e evidências

Código: `src/components/PublicContent.tsx`, `src/components/PublicContent.test.ts`, `src/config/landingContent.ts`, integração em `src/PublicSite.tsx`, estilos em `src/public-site.css` e verificações em `scripts/check-landing-responsive.mjs`. `dist/` foi atualizado pelo build local.

- [Galeria em celular](../artifacts/landing-stage3-mobile-gallery.png).
- [Relatos de exemplo em celular](../artifacts/landing-stage3-mobile-testimonials.png).
- [FAQ em celular](../artifacts/landing-stage3-mobile-faq.png).
- [Galeria em desktop](../artifacts/landing-stage3-desktop-gallery.png).
- [Localização e ambiente em desktop](../artifacts/landing-stage3-desktop-location.png).
- [Página completa em desktop](../artifacts/landing-stage3-desktop.png).
- Auditorias: [celular](../artifacts/landing-stage3-a11y-mobile.json), [desktop](../artifacts/landing-stage3-a11y-desktop.json).

As evidências de `artifacts/` são locais e ignoradas pelo Git. O teste responsivo registrou capturas adicionais em `C:/Users/nicky/AppData/Local/Temp/na-responsive-ZsKIkA/`.

## Imagens e prompts

Foi usada a skill `imagegen`, pelo modo de ferramenta integrada. Os arquivos selecionados foram copiados para o projeto, preservando os originais da ferramenta. São imagens geradas, sem vínculo com trabalhos reais da equipe ou com a unidade.

| Arquivo salvo | Assunto do prompt |
| --- | --- |
| [fade.png](../media-sources/brand/illustrative/fade.png) | Rear three-quarter close view of an anonymous adult man's fresh low taper fade haircut, dark hair, black barber cape, no face visible. |
| [textura.png](../media-sources/brand/illustrative/textura.png) | Side and rear close view of an anonymous adult man's short curly textured haircut, medium brown skin, black barber cape, face outside the frame. |
| [classico.png](../media-sources/brand/illustrative/classico.png) | Rear three-quarter close view of a neat classic side-part men's haircut, dark brown hair, black barber cape, no face visible. |
| [barba.png](../media-sources/brand/illustrative/barba.png) | Close view of the lower face of an anonymous adult man with a neatly shaped full beard and natural skin texture, black cape, face cropped above nose. |
| [acabamento.png](../media-sources/brand/illustrative/acabamento.png) | Close side view of an anonymous adult man's short beard and precise sideburn fade, face cropped above nose, no tools touching skin. |
| [combo.png](../media-sources/brand/illustrative/combo.png) | Rear three-quarter close view of an anonymous adult man with short textured haircut and neat short beard, black cape, no frontal face. |
| [ambiente.png](../media-sources/brand/illustrative/ambiente.png) | A fictional empty contemporary neighborhood barbershop interior, one black barber chair, large mirror, warm timber ceiling, pale walls, restrained cyan accents, no people. |

Prompt final de cada imagem: o texto abaixo, substituindo `{assunto}` pela célula correspondente acima e `{enquadramento}` por `Portrait 3:4`, ou `Landscape 3:2` no ambiente.

```text
Use case: photorealistic-natural. Asset: temporary illustrative photo for a Brazilian barbershop website. {assunto} Natural editorial photography, soft daylight, neutral textures, subtle cyan and deep blue. {enquadramento} single-photo framing. No text, logos, watermark or collage. Do not depict an existing business.
```

## Pendências e próxima etapa

Substituir as imagens e os relatos temporários por conteúdo verdadeiro quando for fornecido, com origem e uso confirmados; trocar os tipos/rótulos somente depois dessa conferência. A foto de Richard e especialidades reais continuam pendentes.

As verificações são locais em Chrome. Zoom real, outros navegadores, dispositivo físico e desempenho em produção continuam sem validação nesta entrega. As auditorias automáticas não certificam acessibilidade completa.

A etapa 4 reúne otimização de mídia, fontes, CSS e compartilhamento. Sua execução permanece aguardando aprovação, conforme a orientação de trabalhar em partes.
