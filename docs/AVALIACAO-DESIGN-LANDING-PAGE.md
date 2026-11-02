# Avaliação de design da landing page — NA Barbearia

Data: 31/10/2026. Base de código: `938a221`.

A página já apresenta uma identidade reconhecível: símbolo próprio, ciano da marca, azul profundo e uma foto real da equipe. O próximo ganho mais importante é mostrar melhor o trabalho da barbearia e ajudar o visitante a decidir pelo atendimento. Hoje, uma parte grande do conteúdo explica a plataforma de agendamento, enquanto faltam exemplos de cortes, apresentação dos serviços e depoimentos com fonte.

Esta é uma avaliação da **landing page local**, orientada pela skill [frontend-design](<C:/Users/nicky/.agents/skills/frontend-design/SKILL.md>). O público considerado é quem procura uma barbearia em Santos, especialmente um cliente que ainda não conhece a NA. O objetivo principal da página é gerar confiança e levar ao agendamento. As propostas abaixo são recomendações; não foram implementadas nesta avaliação.

## O que foi conferido

- Código de `PublicSite.tsx`, estilos globais e específicos, configuração pública, dados da loja e entrada `/painel`.
- Inspeção visual em 1440 × 1000 e 390 × 844, incluindo a equipe após o carregamento das imagens.
- Checagem existente de conteúdo fora da tela em **19 larguras, de 280 a 1440 px**: nenhuma ocorrência detectada. O script também passou em três verificações com ajuste de texto a 150%; isso não equivale a uma avaliação completa de zoom e tecnologias assistivas.
- Auditoria automatizada com axe-core 4.12.1: a regra de contraste de texto apontou os quatro links principais do menu. Há verificações que dependem de revisão manual; uma auditoria automática não certifica toda a acessibilidade.
- Teste de Escape no menu móvel: fecha e devolve o foco ao botão quando o foco está dentro da navegação; não fecha quando o foco ainda está no botão de abrir/fechar.

Não foram avaliados a publicação em produção, o desempenho em rede móvel real ou uma reserva completa com backend e autenticação. As recomendações de conversão são hipóteses de design, não resultados de um teste com clientes.

## O que vale preservar

| Elemento | Por que funciona |
| --- | --- |
| Símbolo sem palavras no cabeçalho | É próprio da loja, ocupa pouco espaço e segue a escolha atual de identidade. |
| Cabeçalho com cor uniforme | Deixa a navegação mais limpa e concentra o destaque no botão de agendamento. |
| Ciano, azul profundo e branco | Criam unidade entre marca, botões, blocos de conteúdo e rodapé. |
| Foto coletiva da equipe | É a parte mais pessoal da página e aproxima o visitante das pessoas que vão atendê-lo. |
| Texto “Tradição, técnica e resenha” | Expressa melhor o caráter da loja do que mensagens genéricas sobre tecnologia. |
| Botão de agendamento na primeira tela | A ação principal aparece antes de rolar no celular testado. |
| Links com nomes acessíveis, foco e redução de movimento | A base já considera navegação por teclado e preferências de movimento. |

Não vejo necessidade de começar outro redesign completo. A identidade atual permite evoluir por ajustes e conteúdo mais relevante.

## Melhorias por prioridade

### 1. Corrigir o contraste do menu preservando o texto branco — alta

O texto branco de 13 px sobre `#01A6E0` apresentou **2,78:1** na ferramenta. Para texto desse tamanho, a referência WCAG AA é **4,5:1**. Ícones brancos que identificam controles, como Instagram e o menu móvel, também precisam de atenção: a referência para essa informação visual é **3:1**. [WCAG: contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WCAG: contraste não textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Para manter os links brancos escolhidos por você, recomendo usar um azul correlato mais escuro **somente no cabeçalho e no menu móvel**. Uma opção é `#00749C`, que oferece aproximadamente **5,28:1** com branco. O ciano original pode continuar nas áreas de marca e nos destaques maiores.

O foco do teclado também deve ser revisto junto dessa mudança: no cabeçalho mais escuro, um contorno branco com afastamento fica mais legível. A mudança de fundo é uma proposta deste relatório, não uma alteração já feita.

Evidência: [estilos do menu](../src/public-site.css), [auditoria local](../artifacts/design-report-a11y.json).

### 2. Dar mais espaço aos serviços e ao resultado do trabalho — alta

“A experiência” e “Como funciona” se concentram em agenda, conta, histórico e segurança. O visitante ainda não encontra uma apresentação dos serviços na landing page, nem fotos de cortes realizados.

Recomendo transformar a primeira dessas seções em uma apresentação curta de **cabelo, barba e combos**, com fotos reais e uma frase útil para cada opção. A explicação de agendamento pode continuar em um único bloco compacto de três passos.

Se houver preço e duração na vitrine, os valores devem acompanhar o catálogo operacional. O projeto tem serviços no arquivo de dados e um catálogo recebido pela API no aplicativo; copiar números para uma nova seção criaria mais um ponto de atualização. Sem integração definida, é melhor apresentar as categorias e encaminhar para consultar os valores atuais.

Evidência: [conteúdo atual](../src/PublicSite.tsx), [dados dos serviços](../src/data/barbershopData.ts), [catálogo do cliente](../src/ClientApp.tsx).

### 3. Encurtar a leitura e retirar repetições — alta

O endereço aparece em “Localização” e novamente no bloco do mapa. A facilidade de agendar também reaparece em vários trechos. Na largura de 390 px, a página mediu aproximadamente **6854 px de altura**, com o bloco inicial ocupando **917 px**. Esses valores não representam um erro, mas mostram uma oportunidade de reduzir a rolagem que repete informações.

Proposta: reunir endereço, horários, telefone e mapa em uma única seção; reduzir a altura da arte do logo no celular; aproximar a equipe e os serviços da primeira parte da página. A ação principal já está visível na primeira tela e deve continuar assim.

### 4. Refinar a tipografia e os cartões da equipe — média

Os títulos têm espaçamento bastante fechado entre letras: `-.065em` no título principal e `-.055em` no título da equipe. No celular, a frase da equipe parece apertada, embora o texto no código esteja correto.

Vale testar um espaçamento mais moderado nos títulos menores e deixar o tratamento mais forte concentrado na abertura. Não é necessário trocar as famílias: Plus Jakarta Sans nos títulos e Geist no corpo já oferecem dois papéis claros.

Nos cartões, “Barbeiro(a)” aparece duas vezes porque `role` e `specialty` recebem o mesmo valor. Recomendo manter uma única identificação e usar a outra linha apenas quando houver uma especialidade real confirmada. A foto de Richard não está cadastrada no mapa de imagens, por isso ele aparece com iniciais. As outras seis fotos carregaram após a rolagem; não há evidência desta avaliação de que estejam quebradas.

Os números de “recomendações” vêm de valores estáticos chamados `likes`. Antes de tratá-los como prova social atual, vale esclarecer a origem e a atualização desses números.

Evidência: [configuração da equipe](../src/config/siteConfig.ts), [dados dos profissionais](../src/data/barbershopData.ts), [cartões em celular](../artifacts/design-report-mobile-cards.png).

### 5. Alinhar os nomes das ações ao próximo passo — média

“Agendar horário”, “Acessar plataforma”, “Ir para a agenda” e “Escolher meu profissional” apontam para o mesmo `/painel`. Pelo código, um visitante sem sessão passa pela tela de acesso antes de seguir adiante. O botão de escolher profissional não inicia uma seleção específica na landing page.

Recomendo usar **“Agendar horário”** como ação principal consistente e explicar brevemente que o cliente entra ou cria a conta para continuar. Se futuramente os cartões permitirem selecionar um barbeiro, essa intenção precisa ser mantida ao passar pela autenticação.

O cartão sobreposto ao logo tem aparência de agendamento, mas leva à explicação “Como funciona”. Vale dar a ele um rótulo explícito, como “Veja como agendar”, ou integrá-lo à ação principal.

Evidência: [links da página](../src/PublicSite.tsx), [entrada da plataforma](../src/PlatformApp.tsx).

### 6. Melhorar pequenos comportamentos de navegação — média

Recomendo permitir fechar o menu móvel com Escape também quando o foco estiver no botão, além de fechar ao tocar fora. São refinamentos de uso; a navegação atual já fecha ao escolher uma seção.

Também vale incluir um atalho “Pular para o conteúdo” para navegação por teclado e alinhar o cabeçalho ao mesmo limite horizontal do conteúdo principal. Hoje o cabeçalho usa uma referência de 1280 px, enquanto o conteúdo usa 1160 px, criando bordas diferentes em desktop.

### 7. Otimizar os arquivos antes de acrescentar mais mídia — média

O símbolo local tem cerca de **467 KB** e a foto coletiva, **970 KB**. O mesmo símbolo é reutilizado e pode aproveitar cache; o ponto de melhoria é seu peso para usos pequenos, como o cabeçalho. As fotos individuais carregadas têm larguras naturais entre aproximadamente 1070 e 2777 px, acima do necessário para os cartões vistos no celular, e não há `srcset` nesses elementos.

Recomendo preparar versões adequadas às dimensões de exibição, manter qualidade nos rostos e evitar uma galeria que baixe todas as imagens de uma vez. Se a loja tiver o símbolo vetorial original, ele é uma boa opção para o cabeçalho.

A fonte Plus Jakarta Sans é solicitada pelo Google Fonts em `index.html` e também importada localmente no CSS. Vale escolher uma estratégia de carregamento e retirar a redundância. O JavaScript de entrada atual tem cerca de **676 KB antes de compressão** e inclui o aplicativo além da landing page; separar carregamento por rota é uma oportunidade técnica posterior, não uma condição para melhorar o visual.

Essas medições indicam oportunidades; não foi medido um problema de LCP em produção. A orientação de desempenho é medir antes de atribuir lentidão a um arquivo específico. [Referência de medição e otimização de LCP](https://web.dev/articles/optimize-lcp).

## O que pode ser acrescentado

| Conteúdo | Como eu colocaria | O que precisa estar disponível |
| --- | --- | --- |
| **Serviços em destaque** | Três categorias com nome claro, descrição curta e acesso ao agendamento. | Categorias reais; fonte atualizada se houver preço e duração. |
| **Galeria de cortes** | Seis a oito fotos, com enquadramento consistente e legenda do serviço. No celular, uma grade leve, sem reprodução automática. | Fotos reais selecionadas pela loja e autorização de uso das pessoas retratadas. |
| **Avaliações de clientes** | Dois ou três relatos curtos, acompanhados da origem e de um link para conferir. | Depoimentos verificáveis; nota e quantidade atualizadas se forem exibidas. |
| **O espaço da loja** | Uma foto do ambiente ou fachada junto da localização. | Foto atual, útil para reconhecer a unidade ao chegar. |
| **Contato por WhatsApp** | Ação secundária “Tirar uma dúvida”, próxima ao telefone e aos horários. | Confirmar que o número cadastrado recebe esse atendimento. |
| **Perguntas frequentes** | Quatro a seis respostas curtas sobre agendamento, atendimento infantil, pagamento e alteração de horário. | Respostas aprovadas pela operação; não criar políticas novas no texto. |
| **Informações práticas** | Pagamentos e comodidades em uma lista compacta perto da localização. | Confirmar os dados já presentes no projeto, como Pix, cartão, Wi-Fi e acessibilidade física. |

Eu priorizaria **serviços + galeria** antes de acrescentar mais blocos sobre a plataforma. Um feed do Instagram incorporado não é necessário para essa primeira evolução: uma seleção de fotos da própria loja permite controlar melhor o peso e a apresentação.

O WhatsApp deve ter função de contato; disponibilidade e confirmação de reserva continuam sob responsabilidade da agenda. Os horários apresentados como informação geral também precisam de manutenção, sem substituir a disponibilidade operacional por uma regra fixa no site.

## Direção visual proposta

A assinatura visual mais forte pode ser a combinação **pessoas e trabalho real da NA**, apoiada pelo símbolo e pelo azul da marca. A foto coletiva já oferece esse caminho. A galeria deve reforçá-lo sem acrescentar vários estilos de cartão ou efeitos concorrentes.

| Papel | Cor proposta |
| --- | --- |
| Ciano de marca e destaques | `#01A6E0` |
| Azul correlato para cabeçalho com texto branco | `#00749C` |
| Azul profundo para títulos e botões principais | `#062D40` |
| Branco | `#FFFFFF` |
| Fundo azul claro | `#EEF8FC` |
| Texto secundário | `#52616B` |

Manteria Plus Jakarta Sans nos títulos e Geist nos parágrafos e na navegação, com menos compressão entre letras no celular. A animação pode continuar discreta: estados de foco, passagem do cursor e pequenas transições são suficientes. Não vejo benefício imediato em vídeo automático ou vários efeitos de entrada.

Uma ordem de leitura possível é:

```text
Símbolo + menu + Agendar horário
Abertura curta: o que a NA oferece + chamada principal
Serviços em destaque
Trabalhos da casa: galeria de cortes
Equipe: foto coletiva + profissionais
Como agendar: três passos compactos
Avaliações verificáveis
Visite a loja: endereço + horários + contato + mapa
Perguntas frequentes e rodapé
```

Essa estrutura é uma proposta para comparar com a atual, não uma obrigação de criar nove blocos grandes. Na implementação, eu combinaria seções curtas e retiraria repetições para que as adições não tornem a página ainda mais longa.

## Acabamento para compartilhamento e busca local

O HTML já possui título, descrição e algumas propriedades Open Graph. Faltam uma imagem de compartilhamento, `og:url`, favicon e uma URL canônica explícita no arquivo inspecionado. Recomendo completar esses pontos usando o domínio público confirmado e um recorte real da marca ou da loja.

Também é possível adicionar dados estruturados de negócio local, coerentes com endereço, telefone e horários realmente exibidos. Essa marcação ajuda a comunicar informações ao buscador, mas não garante posição ou uma apresentação especial no resultado. [Documentação oficial de LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business).

## Sequência recomendada

| Etapa | Entrega | Como avaliar |
| --- | --- | --- |
| **Primeiro: legibilidade e clareza** | Contraste do cabeçalho, espaçamento dos títulos, textos das ações, repetição dos cartões e comportamento do menu. | Contraste medido, leitura em celular, teclado e destinos coerentes. |
| **Depois: conteúdo que ajuda a escolher** | Serviços, galeria real, foto faltante e localização reunida. | O visitante entende o que pode fazer na loja, vê resultados e encontra como chegar. |
| **Em seguida: confiança e acabamento** | Depoimentos verificados, FAQ, informações práticas, metadados e otimização de mídia. | Dados conferidos, compartilhamento correto e desempenho medido em condições reais. |

A manutenção também merece um ajuste posterior: há regras da landing page em `styles.css` e sobrescritas em `public-site.css`, incluindo estilos do banner antigo que não está mais no componente. Consolidar essas regras durante uma implementação futura reduz o risco de um ajuste funcionar em uma largura e ser desfeito em outra. Não é necessário mudar a arquitetura do aplicativo para executar as melhorias visuais propostas.

## Evidências locais

- [Página completa em desktop](../artifacts/design-report-desktop.png). As imagens abaixo da dobra foram carregadas por rolagem antes desta captura final.
- [Primeira tela em celular](../artifacts/design-report-mobile-top.png).
- [Equipe em celular](../artifacts/design-report-mobile-team.png).
- [Cartões dos profissionais em celular](../artifacts/design-report-mobile-cards.png).
- [Menu móvel](../artifacts/design-report-mobile-menu.png).
- [Auditoria automatizada em JSON](../artifacts/design-report-a11y.json).

As capturas e o JSON estão em `artifacts/`, ignorado pelo Git. O relatório é o único arquivo de documentação criado para esta avaliação; o código da aplicação foi mantido como estava.
