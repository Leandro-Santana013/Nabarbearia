# Plano de implementação da landing page — NA Barbearia

Data: 31/10/2026. Base inspecionada: `938a221`.

Origem: [avaliação de design](AVALIACAO-DESIGN-LANDING-PAGE.md). Direção orientada pela skill [frontend-design](<C:/Users/nicky/.agents/skills/frontend-design/SKILL.md>).

**Status: etapas 1 a 6 implementadas e testadas localmente.** A etapa 6 foi autorizada expressamente pelo usuário e inclui a escolha antecipada com retomada após acesso à conta. A etapa 3 continua usando conteúdo ilustrativo temporário autorizado; fotos e depoimentos reais permanecem pendentes. Resultados e evidências: [etapa 1](RESULTADO-ETAPA1-LANDING-PAGE.md), [etapa 2](RESULTADO-ETAPA2-LANDING-PAGE.md), [etapa 3](RESULTADO-ETAPA3-LANDING-PAGE.md), [etapa 4](RESULTADO-ETAPA4-LANDING-PAGE.md), [etapa 5](RESULTADO-ETAPA5-LANDING-PAGE.md) e [etapa 6](RESULTADO-ETAPA6-LANDING-PAGE.md). As entregas são locais; publicação e validação física em Android exigem execução própria.

Este documento cobre todas as melhorias e sugestões do relatório, inclusive as evoluções técnicas posteriores. A primeira entrega corresponde à fase 1 abaixo (L01–L06); a segunda, à fase 2 (C01–C06). Cada entrega tem uma referência local preservada antes das alterações.

## 1. Objetivo e decisões que serão preservadas

A página deve ajudar quem procura uma barbearia em Santos a conhecer os serviços, reconhecer a qualidade do trabalho, confiar na equipe e iniciar um agendamento. O foco editorial passa da explicação da plataforma para a experiência real da NA.

Preservar as escolhas já feitas pelo usuário:

- Símbolo oficial sem palavras no cabeçalho e no rodapé.
- Menu com fundo uniforme, textos e ícones brancos, sem a barra branca; agendamento como principal destaque.
- Instagram com ícone e destino `https://www.instagram.com/nabarbeariaa/`.
- Foto coletiva, linguagem próxima e “Tradição, técnica e resenha”.
- Azul e ciano da identidade, Plus Jakarta Sans nos títulos e Geist no corpo.

A assinatura visual será **pessoas e trabalhos reais da NA**, apoiados pelo símbolo. A composição da equipe e a galeria terão o maior peso visual; os demais blocos serão discretos. Não acrescentar vídeo automático, feed incorporado do Instagram ou efeitos de entrada concorrentes.

| Papel | Token proposto | Aplicação |
| --- | --- | --- |
| Ciano da marca | `#01A6E0` | Arte do símbolo e destaques compatíveis com o contraste necessário. |
| Azul do menu | `#00749C` | Cabeçalho e painel móvel, preservando os textos brancos. |
| Azul profundo | `#062D40` | Títulos, botões principais e blocos de contraste. |
| Branco | `#FFFFFF` | Superfícies, textos do menu e áreas de respiro. |
| Azul claro | `#EEF8FC` | Separação discreta entre grupos de conteúdo. |
| Texto secundário | `#52616B` | Parágrafos e informações de apoio. |

O azul proposto para o menu oferece aproximadamente 5,28:1 com branco, conforme o relatório. A implementação medirá novamente o resultado renderizado, inclusive hover, foco e painel móvel. Cores complementares já existentes, como bordas, serão mantidas somente quando servirem à hierarquia e passarem nas verificações pertinentes.

## 2. Constatações do código que orientam a execução

- `src/PublicSite.tsx` concentra a composição, o menu e as chamadas de ação. Todos os `PlatformLink` levam a `/painel`; o cartão sobre o símbolo leva a `#como-funciona`.
- `src/PlatformApp.tsx` resolve `/painel` e `/agendar`: visitante recebe acesso à conta; usuários com sessão seguem para o destino permitido ao seu perfil. A landing não deve prometer seleção de barbeiro já realizada nesse fluxo.
- Já existem endpoints públicos `GET /api/v1/public/services` e `GET /api/v1/public/barbers`, em `backend/src/handlers.rs`, e métodos `getPublicServices()` e `getPublicBarbers()` em `src/services/api.ts`. A vitrine pode consultar serviços sem criar endpoint nem exigir sessão.
- Os preços e as durações do catálogo operacional não devem ser copiados de `src/data/barbershopData.ts` para novos cartões. A API permanece a fonte para esses valores e para a disponibilidade de reservas.
- `src/config/siteConfig.ts` duplica função em `specialty`, não tem foto de Richard e recebe recomendações estáticas de `barber.likes`. O teste de configuração também fixa os horários cadastrados; esses dados descrevem informação geral, sem determinar a agenda operacional.
- Há estilos públicos tanto em `src/styles.css` quanto em `src/public-site.css`. Alguns seletores agrupam elementos públicos e internos; retirar regras exige verificar seus outros consumidores.
- `src/App.tsx` importa os aplicativos e painéis de forma estática. A separação por rota alcança fronteiras de acesso e será uma fase própria, depois das melhorias de conteúdo.
- `scripts/check-landing-responsive.mjs` depende de seletores como `.public-feature-card`, `#experiencia`, `.location-card` e `.public-map-section`. A reformulação precisa atualizar a cobertura do script junto com a página.

## 3. Estrutura de conteúdo proposta

```text
Cabeçalho: símbolo · navegação curta · Instagram · Agendar horário
Abertura: o que a NA oferece · ação principal · indicação do acesso à conta
Serviços: cabelo · barba · combos
Trabalhos da casa: galeria de cortes reais
Equipe: foto coletiva · apresentação · profissionais
Como agendar: três passos compactos
Avaliações: relatos com fonte
Visite a loja: endereço · horários gerais · contato · foto · mapa
Perguntas frequentes
Rodapé
```

Essa ordem organiza a leitura; não obriga a criar nove faixas altas. Reduzir repetições da agenda, reunir localização e mapa e usar espaçamento proporcional ao conteúdo. Manter numeração somente nos três passos de agendamento. Navegação sugerida: Serviços, Trabalhos, Equipe e Localização; links para blocos ainda sem conteúdo não serão exibidos.

Preservar o destino de `#experiencia` como âncora compatível da nova apresentação de serviços, ou tratar explicitamente essa compatibilidade. Ajustar `scroll-margin-top` para que o cabeçalho fixo não cubra os títulos ao navegar por âncoras.

## 4. Divisão entre subagentes e responsabilidade de integração

Nesta preparação, três subagentes examinaram separadamente design/conteúdo, integração técnica e validação. Suas conclusões foram reunidas neste plano. Eles trabalharam em leitura; nenhum iniciou a implementação.

Na execução, manter no máximo **coordenador + três subagentes simultâneos**. Cada fase terá responsáveis por caminhos distintos. A divisão é por entregas coerentes, com integração entre fases, evitando vários agentes editando o mesmo componente ou arquivo de estilo.

| Responsável | Entrega e propriedade | Limite de atuação |
| --- | --- | --- |
| Coordenador | `src/PublicSite.tsx`, composição, contratos entre entregas e revisão final. Integra mudanças em `siteConfig.ts` e `App.tsx` nos momentos previstos. | Único editor dos arquivos de integração compartilhados. Não publicar nem criar commits sem autorização. |
| Agente A — visual e interação | `src/public-site.css` e componentes públicos de navegação, se a extração tornar o código mais claro. Consolidação das regras públicas em `styles.css` na fase indicada. | Não alterar estilos internos por conveniência nem editar simultaneamente `PublicSite.tsx`. |
| Agente B — conteúdo e dados | Configuração editorial proposta em `src/config/landingContent.ts`, inventário das fontes e adaptador pequeno do catálogo público, se necessário. | Não inventar informações, preços, especialidades ou depoimentos. Entregar contrato de dados antes da integração. |
| Agente C — mídia e acabamento | Variantes em `public/brand/` e diretório de galeria, inventário de dimensões/pesos, favicon e imagem de compartilhamento. | Preservar os arquivos originais; não trocar fotografias por imagens geradas. Não editar `index.html` enquanto outra frente o utiliza. |
| Agente C — validação, após mídia | Atualização do script responsivo, verificações de interação, capturas e revisão da implementação integrada. | Reutiliza a vaga anterior. Testes com API/Chrome executados em sequência; achados voltam ao proprietário do arquivo. |

Para SEO e divisão por rota, o coordenador atribuirá uma tarefa exclusiva após encerrar as anteriores que toquem nos mesmos arquivos. Cada entrega informa caminhos alterados, conteúdo pendente, verificações executadas e limitações. O coordenador relê o diff e confere o resultado integrado antes de marcar a fase concluída.

## 5. Fases de implementação

### Fase 0 — Preservar a referência e preparar os insumos

**Responsável:** coordenador, com inventário de conteúdo e mídia em paralelo.

1. Registrar HEAD, `git status --short`, arquivos rastreados alterados e arquivos novos relevantes. A referência atual é `938a221`, mas deve ser conferida novamente no início da execução.
2. Guardar uma cópia local dos arquivos que serão alterados, incluindo arquivos novos preexistentes, além de um diff e um manifesto de caminhos/hashes. Armazenar a referência e as capturas em uma pasta identificada em `artifacts/`, ignorada pelo Git. Não tratar o HEAD sozinho como cópia de trabalho não commitado.
3. Capturar desktop e celular com imagens carregadas; registrar tamanho transferido, quantidade de requisições, fontes e comportamento dos CTAs. O relatório anterior serve de comparação histórica, não substitui esta referência.
4. Montar o inventário da seção 6, com origem, responsável pela confirmação e situação de cada item.
5. Definir o contrato editorial mínimo: serviços em destaque, fotos/legendas, equipe, avaliações, FAQ e informações práticas. Usar configuração simples; não criar CMS ou painel administrativo para esta entrega.

**Saída da fase:** referência recuperável, lista de arquivos sob responsabilidade de cada agente e pendências de conteúdo explícitas. A falta de uma foto não bloqueia contraste, navegação ou reorganização da localização.

### Fase 1 — Legibilidade, navegação e clareza das ações

**Dependência:** fase 0. **Responsáveis:** agente A e coordenador.

| ID | Trabalho | Critério de conclusão |
| --- | --- | --- |
| L01 | Aplicar azul correlato uniforme ao cabeçalho e menu móvel; manter links e ícones brancos e CTA destacado. | Texto normal com contraste mínimo 4,5:1; ícones informativos e estados de foco com contraste aplicável de 3:1. Verificar todos os estados, não apenas a cor base. |
| L02 | Revisar foco visível, incluindo contorno branco afastado no cabeçalho; adicionar “Pular para o conteúdo” e destino focável no início do conteúdo. | Atalho aparece ao receber foco, avança para o conteúdo e permanece utilizável com cabeçalho fixo. |
| L03 | Fechar menu com Escape a partir do botão ou dos links; fechar ao tocar fora e ao escolher seção; limpar listeners ao desmontar. | Escape devolve foco ao botão. Toque fora preserva o foco do elemento escolhido. Menu fechado não deixa links invisíveis na ordem de tabulação; redimensionamento não preserva estado incoerente. |
| L04 | Alinhar cabeçalho à largura do conteúdo, moderar o espaçamento dos títulos e reduzir a arte do símbolo no celular. | Sem letras encostadas ou cortes nas larguras pequenas; bordas alinhadas no desktop; CTA continua visível na referência de 390 × 844. |
| L05 | Padronizar entradas como “Agendar horário”, explicar brevemente o acesso/criação de conta e nomear o cartão informativo “Veja como agendar”. | Nome da ação corresponde ao próximo passo real; Instagram, mapa e telefone mantêm seus destinos e nomes acessíveis. |
| L06 | Retirar a linha duplicada de função e tornar especialidade opcional. Suspender contadores de recomendações sem fonte validada. | Cada cartão mostra função uma vez; nenhuma especialidade ou contagem inventada. Richard mantém iniciais enquanto a foto não estiver disponível. |

**Validação da fase:** capturas comparáveis, contraste automatizado e revisão manual de foco, teclado, Escape, toque fora e navegação. Sem alterar as regras de acesso ou de reservas.

### Fase 2 — Serviços, ordem de leitura e localização única

**Dependência:** fase 1 e contrato editorial da fase 0. **Responsáveis:** agente B e coordenador; agente A ajusta o estilo após os contratos estarem definidos.

| ID | Trabalho | Critério de conclusão |
| --- | --- | --- |
| C01 | Substituir cartões centrados na plataforma por cabelo, barba e combos, com descrições úteis e ação coerente. | Serviços reais compreensíveis sem entrar na plataforma. Fotos somente quando aprovadas; a ausência de foto não impede categorias com texto. |
| C02 | Consultar o catálogo público existente para valores/durações quando exibidos; mapear categorias explicitamente, sem adivinhar equivalências por nome. | Usar serviços ativos recebidos da API, unidades corretas e informação exata. Categorias desconhecidas não recebem associação incorreta; o catálogo completo continua acessível no aplicativo. Não usar preço estático como substituto em falha. Se usar “a partir de”, calcular apenas com serviços válidos da categoria. |
| C03 | Tratar carregamento, erro, resposta vazia e desmontagem da consulta sem bloquear o restante da landing. | Categorias continuam disponíveis sem valores e encaminham para a agenda; nenhuma tela inteira de espera, preço antigo ou carregamento infinito. Testar resposta atrasada e mudança de rota. |
| C04 | Reordenar a página e manter a explicação de agendamento em três passos compactos. Rever a faixa de informações rápidas para retirar repetições e afirmações genéricas. | Serviços e equipe aparecem mais cedo; não há vários blocos repetindo as funções da conta. O conteúdo continua correto para visitantes e usuários com sessão. |
| C05 | Unir endereço, horários gerais, telefone, rota e mapa em “Visite a loja”; reservar espaço para foto e informações práticas confirmadas. | Endereço apresentado uma vez como bloco principal; informação útil disponível mesmo com iframe bloqueado; mapa com título e carregamento sob demanda. |
| C06 | Atualizar seletores e pontos de espera do teste responsivo junto da nova estrutura. | O script realmente percorre as seções presentes, exige os elementos esperados e não passa simplesmente por ignorar seletor ausente. Incluir menu aberto e novos cartões. |

A API de disponibilidade continua decidindo quais horários podem ser reservados, inclusive exceções ao horário geral. Não introduzir bloqueio de domingo ou qualquer regra de reserva na landing.

**Validação da fase:** catálogo real em ambiente temporário, cenários de falha/vazio, responsividade e fluxo de entrada pelo CTA. Preços, se habilitados, conferidos contra a resposta da API.

### Fase 3 — Galeria, equipe completa e confiança

Atualização de escopo de 31/10/2026: o usuário autorizou expressamente fotos genéricas/inventadas e relatos fictícios temporários, para substituição posterior. A apresentação desses exemplos foi implementada com identificação visível, sem atribuí-los a clientes reais ou à unidade. WhatsApp, pagamentos e comodidades foram confirmados pelo usuário. Os critérios abaixo continuam sendo o objetivo para a substituição pelo conteúdo real; a conclusão visual temporária não comprova fotos, especialidades ou avaliações reais ainda não fornecidas.

**Dependência:** composição da fase 2 e insumos confirmados. **Responsáveis:** agentes B/C e coordenador.

| ID | Trabalho | Critério de conclusão |
| --- | --- | --- |
| C07 | Criar galeria de seis a oito trabalhos reais, grade responsiva e legendas por serviço. | Recortes consistentes, rostos preservados quando presentes, alternativas textuais adequadas, sem reprodução automática ou download antecipado de toda a galeria. Uma grade simples dispensa criar um lightbox. |
| C08 | Incluir foto de Richard e especialidades reais, quando fornecidas; conferir origem e atualização das recomendações. | Imagem correta e fallback também testado. Número só reaparece quando fonte e manutenção estiverem definidas. Não confundir perfil estático da vitrine com profissional operacional selecionável. |
| C09 | Adicionar dois ou três relatos verificáveis, com fonte/link; nota e quantidade apenas se a atualização estiver definida. | Texto fiel à fonte, sem atribuições falsas ou estatísticas estáticas apresentadas como atuais. |
| C10 | Colocar foto atual da fachada ou ambiente junto da localização. | Foto ajuda a reconhecer a unidade, com legenda e enquadramento útil no celular. |
| C11 | Acrescentar WhatsApp como contato secundário “Tirar uma dúvida”, pagamentos e comodidades confirmados. | Número e atendimento confirmados; link correto em celular/desktop; contato não promete confirmar reserva. Informações de acessibilidade física descrevem condições verificadas. |
| C12 | Incluir quatro a seis perguntas frequentes com respostas aprovadas, usando controles nativos como `details`/`summary` quando adequados. | Teclado e foco funcionam; respostas refletem a operação e o aplicativo. Não criar política de cancelamento, cobrança, atraso ou atendimento infantil por iniciativa editorial. |

**Regra para pendências:** preparar a estrutura sem exibir blocos vazios, fotos genéricas ou conteúdo demonstrativo. Galeria, depoimentos e FAQ incompletos continuam registrados como pendentes; não considerar a fase totalmente concluída apenas porque o componente existe. O restante pode ser integrado e testado localmente.

**Validação da fase:** conferir fontes e conteúdo, carregar a página por rolagem antes das capturas, testar falha de imagem e comparar a leitura completa em celular. Reduzir espaçamento e redundâncias antes de retirar conteúdo útil somente para diminuir a altura.

### Fase 4 — Mídia, fontes, CSS e compartilhamento

**Dependência:** estrutura estabilizada; SEO pode começar após confirmar domínio e informações da loja. **Responsáveis:** agente C, agente A e coordenador, em caminhos separados.

| ID | Trabalho | Critério de conclusão |
| --- | --- | --- |
| T01 | Preparar variantes do símbolo, da foto coletiva, dos retratos autorizados e da galeria. Preferir vetor original do símbolo quando disponível. | `srcset`/`sizes` coerentes com exibição; dimensões reservadas; qualidade visual aprovada; peso e transferência comparados ao início. Não redesenhar o símbolo nem inventar um vetor por aproximação. Preservar originais. |
| T02 | Aplicar carregamento adequado às imagens e mapa. | Conteúdo abaixo da dobra sob demanda; imagem que efetivamente determine o LCP não recebe lazy loading inadvertidamente. Medir antes de decidir preload ou prioridade. Falha de mídia não rompe a composição. |
| T03 | Unificar estratégia de fontes, preferindo os pacotes locais já instalados e retirando a solicitação redundante do Google Fonts. | Conferir o nome real da família declarada pelo pacote e usado no CSS; as duas fontes pretendidas são renderizadas; não há requisição duplicada nem troca de fonte que corte textos. Checar outras telas que usam Plus Jakarta Sans. |
| T04 | Consolidar estilos públicos em `public-site.css`, escopados à landing; remover regras antigas sem consumidores. | Inventário prévio dos seletores, incluindo os agrupados com estilos internos. Sem mudança involuntária em login, cliente, equipe, proprietário ou styleguide. Não apagar arquivos ou assets nesta limpeza. |
| T05 | Criar favicon e imagem de compartilhamento com marca/foto real; completar canonical, `og:url`, `og:image`, dimensões e texto alternativo. Rever título, descrição e theme-color coerentes. | Domínio público confirmado; URLs absolutas válidas; HTML inicial contém os metadados. Confirmar o efeito do HTML compartilhado nas rotas internas; não tratar canonical como redirecionamento. |
| T06 | Adicionar JSON-LD de negócio local com informações confirmadas e visíveis. | JSON válido, tipo apropriado, endereço/telefone/horários coerentes; sem avaliações agregadas ou dados não verificados. Validar marcação; não prometer posição ou destaque no Google. |

Os horários gerais publicados e estruturados serão mantidos pela mesma fonte editorial. Se não houver horário confirmado, omitir essa propriedade da marcação até confirmação. Uma divergência na origem deve ser resolvida na origem, sem criar cópia divergente em `index.html`.

**Validação da fase:** rede, fontes realmente aplicadas, comparação dos assets e medições de desempenho no mesmo ambiente. LCP/CLS e transferência são resultados a registrar; o plano não atribui ganho numérico antecipado nem declara desempenho de produção a partir de localhost.

### Fase 5 — Carregamento do aplicativo por rota

**Dependência:** fases anteriores integradas e referência de desempenho registrada. **Responsável:** tarefa técnica exclusiva coordenada, seguida de revisão de regressão.

**T07:** separar as entradas pesadas por rota em `src/App.tsx`, usando importação dinâmica e tratamento de espera/erro coerente com o projeto. Manter a landing disponível sem baixar antecipadamente todos os painéis, login, styleguide e fluxo de reservas quando não forem necessários.

Antes de implementar, verificar as dependências comuns: importar o cliente de API na landing não deve trazer os painéis por dependência transitiva. Não substituir o roteamento existente nem alterar permissões para obter uma divisão de arquivos.

Critérios de conclusão:

- Rede confirma que acessar `/` não transfere os módulos exclusivos dos painéis; comparar tamanho transferido com a referência.
- Navegação por CTA, acesso direto, recarga, voltar/avançar e rotas de cliente/equipe/proprietário continuam funcionando.
- Estados de espera e falha ao carregar um módulo permitem recuperação; não introduzem uma tela preta ou alteração indesejada na abertura do Android.
- Verificar caminho de publicação dos chunks e compatibilidade com a forma de carregamento do aplicativo instalado. Testes locais não substituem verificação física quando houver efeito no Android.
- Rodar os testes de acesso e canais afetados; se a abertura Android for alcançada, incluir suas verificações específicas.

Esta é uma entrega posterior explícita do plano. Se a medição recomendar outra fronteira de divisão, registrar a decisão e os dados antes de implementar. Ela não deve atrasar a correção do contraste e das informações da landing.

### Fase 6 — Seleção antecipada de serviço ou profissional

Implementada após autorização do usuário em 31/10/2026. Contratos, testes e limites estão no [resultado da etapa 6](RESULTADO-ETAPA6-LANDING-PAGE.md).

**Dependência:** vitrine estável e mapeamento para IDs operacionais. **Responsável:** tarefa funcional exclusiva, após as melhorias visuais.

**E01:** o relatório cita como evolução permitir que um cartão já inicie a escolha do profissional. Planejar também o tratamento de serviço selecionado quando houver esse tipo de ação. A implementação é condicional à decisão de oferecer essa interação; os botões genéricos da fase 1 continuam corretos sem ela.

1. Definir origem e validade dos IDs da API; não usar apenas nomes ou IDs estáticos da vitrine como correspondência.
2. Definir um estado mínimo e temporário de intenção, com validação de dados permitidos; não incluir informação sensível ou aceitar destino de redirecionamento arbitrário.
3. Preservar a escolha durante login/cadastro e retomar no ponto compatível do fluxo de cliente. Usuário de outro perfil mantém seu destino autorizado.
4. Revalidar profissional ativo, serviço, compatibilidade e disponibilidade ao retomar. Intenção é preferência, nunca reserva nem garantia de horário.
5. Cobrir cancelamento, logout, troca de conta, intenção inválida/expirada, profissional removido e recarga. Não transportar seleção entre contas inadvertidamente.

**Critério de conclusão:** o rótulo “Escolher este profissional” só aparece quando a escolha realmente sobrevive ao acesso à conta. Essa evolução não muda idempotência, confirmação de reserva, autorização ou cálculo de disponibilidade.

## 6. Insumos e decisões pendentes da loja

Essas confirmações são necessárias para conteúdo verdadeiro, mas não precisam interromper o trabalho independente. Reunir as solicitações em uma rodada antes da fase correspondente.

| Insumo | Quantidade ou confirmação | Alternativa enquanto pendente |
| --- | --- | --- |
| Cortes realizados | Seis a oito fotos, serviço correspondente e uso autorizado. | Não exibir galeria nem âncora vazia; serviços continuam com descrições. |
| Foto de Richard | Retrato correto e uso autorizado; confirmar equipe atual. | Iniciais e função única, sem presumir que seja novo no time. |
| Especialidades e recomendações | Especialidades reais; origem e rotina de atualização dos números. | Omitir linha opcional e contadores sem fonte. |
| Depoimentos | Dois ou três relatos com origem, link e identificação adequada. | Não exibir avaliações ou nota sem comprovação. |
| Foto da unidade | Fachada ou ambiente atual e uso autorizado. | Endereço e mapa mantêm a seção útil. |
| Atendimento por WhatsApp | Confirmar o número cadastrado e sua finalidade de contato. | Manter telefone/Instagram já existentes, sem novo botão não confirmado. |
| Pagamentos e comodidades | Conferir itens presentes no código, inclusive acessibilidade física. | Omitir itens não confirmados. |
| FAQ e horários gerais | Validar respostas, atendimento infantil, pagamentos e alteração de horário; revisar horários cadastrados. | Usar apenas respostas confirmadas. Não definir novas políticas nem indisponibilidade de agenda. |
| Domínio de referência | Confirmar URL pública canônica e ambiente de publicação. | Preparar assets/metadados, sem publicar URLs locais ou inventadas como definitivas. |
| Símbolo vetorial | Arquivo oficial, caso exista. | Variantes raster otimizadas a partir do arquivo existente. |

## 7. Matriz de validação e comandos

Executar verificações proporcionais a cada entrega; ampliar para canais internos quando houver mudanças compartilhadas. Os comandos abaixo são para a futura implementação e foram conferidos no projeto; não foram executados nesta etapa de planejamento.

| Área | Verificação e evidência |
| --- | --- |
| Compilação | `npm.cmd run build`: TypeScript e build de produção. Conferir alterações geradas em `dist`, que é rastreado no repositório; não confundir build local com publicação. |
| Dados e adaptadores | `npm.cmd test -- src/config/siteConfig.test.ts` e testes focados do adaptador, se criado. Cobrir transformação real, ausência/falha e unidades de preço/duração; não criar testes que apenas copiem texto ou CSS. |
| Responsividade | Após o build, `node scripts/check-landing-responsive.mjs`, atualizado com a nova estrutura. Manter as 19 larguras entre 280 e 1440 px, acrescentar 1099/1100/1101 px ao redor da transição atual do menu e registrar capturas. |
| Leitura manual | Conferir 320/390 px, tablet e 1440 px; retrato/paisagem e zoom real de 125%, 150% e 200%. O `text-size-adjust: 150%` do script não substitui zoom real. |
| Teclado e toque | Tab/Shift+Tab, atalho de conteúdo, foco visível, menu fechado/aberto, Escape no botão e nos links, toque fora, mudança de largura, âncoras e FAQ. Não usar roles de menu de aplicativo para navegação comum do site. |
| Acessibilidade | Repetir axe em desktop e celular, com menu aberto/fechado e conteúdo carregado; complementar com revisão manual de contraste, rótulos, ordem de títulos, imagens e foco. Registrar verificações inconclusivas, sem declarar certificação. |
| Movimento | Simular `prefers-reduced-motion`; conteúdo e ações seguem disponíveis sem depender de animação. |
| Catálogo e mídia | API normal/lenta/indisponível/vazia; serviço desativado; foto ausente/quebrada; mapa bloqueado. Confirmar que a landing e seus CTAs continuam úteis. |
| Acesso | `npm.cmd run test:access-flow` quando houver alteração de navegação, importação de rotas ou autenticação. Conferir visitante e sessões de cliente, barbeiro e proprietário. |
| Reserva | `npm.cmd run test:booking-flow` se a intenção antecipada ou o fluxo de seleção forem alterados. Testar com banco temporário; não criar reservas em produção. |
| Canais internos | Na fase de divisão de rotas ou mudanças compartilhadas, executar em sequência `npm.cmd run test:client-flow`, `npm.cmd run test:staff-flow` e `npm.cmd run test:owner-flow`; `npm.cmd run test:barber-responsive` se estilos usados no painel forem alcançados. |
| Android | Se a divisão de rotas afetar entrada/carregamento, `npm.cmd run test:android-startup-flow` e `npm.cmd run test:android-update-flow`, além de registrar validação física pendente quando não disponível. Não alterar o mecanismo de atualização nesta entrega. |
| Compartilhamento e busca | Inspecionar HTML inicial, favicon, URLs absolutas, imagem OG acessível e JSON-LD válido; comparar os dados com os visíveis. Testar acesso público dos assets quando houver autorização de publicação. |
| Desempenho | Comparar requisições, bytes, fontes, imagens e carregamento de módulos em condições equivalentes. Fazer medições repetidas de laboratório, identificadas como tal; medir rede móvel real/produção depois da publicação autorizada. |
| Revisão final | `git diff --check`, inspeção do diff e capturas completas depois de rolar/carregar fotos. Toda ressalva deve ficar na entrega final. |

Os testes de fluxo usam recursos compartilhados, incluindo portas 3011/9224, e devem rodar **sequencialmente**, sem disputar ambiente entre agentes. Antes de iniciar servidores, verificar portas ocupadas; encerrar somente processos criados para os testes. No Windows, se o sandbox bloquear a resolução de caminhos do Vite/esbuild, resolver a execução no ambiente apropriado sem mudar a configuração do produto para contornar o bloqueio.

### Critérios de liberação entre fases

1. O responsável entrega o resultado com evidências; o coordenador compara com este plano e a identidade aprovada.
2. Achados de conteúdo incorreto, fluxo quebrado, contraste insuficiente ou regressão são corrigidos antes de encerrar a fase afetada.
3. Revisar apenas as áreas alcançadas por novas correções, evitando repetir toda a bateria sem motivo.
4. Registrar separadamente **implementado**, **testado localmente**, **pendente de conteúdo**, **pendente em dispositivo** e **publicado**. Nenhuma dessas situações implica as demais.

## 8. Cobertura integral do relatório

| Recomendação de origem | Tarefas previstas |
| --- | --- |
| Contraste do menu, ícones, foco e branco escolhido | L01–L02. |
| Serviços e resultados reais, preços pela fonte operacional | C01–C03, C07. |
| Menos repetição, localização unificada, arte móvel menor e CTA inicial | L04, C04–C05. |
| Tipografia, função duplicada, especialidades, Richard e recomendações | L04, L06, C08. |
| Nomes das ações, conta e cartão informativo | L05; E01 para a seleção antecipada futura. |
| Escape, toque fora, atalho e alinhamento horizontal | L02–L04. |
| Símbolo, foto coletiva, retratos, vetor oficial, variantes e lazy loading | T01–T02. |
| Estratégia única de fontes | T03. |
| Carregamento por rota | T07, fase técnica própria com regressão. |
| Galeria, depoimentos e foto da unidade | C07, C09–C10. |
| WhatsApp, pagamentos, comodidades e FAQ | C11–C12. |
| Ordem de leitura e contenção de novos blocos | C04 e revisão integrada de composição. |
| Paleta, famílias, assinatura visual e movimento discreto | Seções 1/3, L01/L04 e validação de movimento. |
| Favicon, compartilhamento, canonical e busca local | T05–T06. |
| Consolidação de CSS e estilos do banner antigo | T04. |
| Ausência de feed do Instagram, vídeo automático e efeitos excessivos | Decisão de direção na seção 1; nenhuma dessas adições é necessária. |
| Medir sem atribuir ganho de conversão ou LCP não comprovado | Fase 0, T02/T07 e matriz de validação. |

## 9. Reversão e encerramento

A execução será local e dividida em entregas recuperáveis. Se o usuário pedir para voltar, comparar o estado com a referência da fase 0 e reverter apenas as alterações desta implementação, preservando trabalho posterior de outras origens. Não usar restauração ampla, limpeza ou exclusão de arquivos como atalho.

Não criar commit, push, publicação ou release como consequência automática deste plano. A eventual publicação tem autorização e validação próprias.

Ao finalizar a implementação, atualizar um documento de resultado com: fases concluídas, capturas antes/depois, comandos executados e resultados, conteúdo ainda pendente, regressões examinadas, medições comparáveis e limitações de produção/dispositivo. A conclusão integral exige também resolver ou declarar explicitamente os itens condicionais e os insumos ainda indisponíveis.
