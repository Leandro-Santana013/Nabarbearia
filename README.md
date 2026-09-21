# NA Barbearia · site público

Landing page pública da NA Barbearia, em Santos/SP. A raiz do projeto apresenta a marca, informações públicas verificadas, localização, horários publicados e o caminho oficial para agendamento.

## O que está público

- Hero editorial azul/ciano com CTA **Agendar horário**.
- Conteúdo factual configurado em `src/config/siteConfig.ts`.
- Blocos de experiência, como agendar e localização.
- Telefone, endereço e horários publicados sem incluir o sábado, cujo horário de origem é ambíguo.
- Link direto para o Instagram oficial: https://www.instagram.com/nabarbeariaa/.
- CTA para a página oficial do Trinks: https://www.trinks.com/na-barbearia.

O site não publica serviços, preços, duração, equipe, fotos, avaliações exatas, WhatsApp ou pagamentos sem dados/configuração confirmados.

## Limite entre site público, Trinks e demo interna

O site público **não possui agenda própria, login, painel operacional ou API**. O botão de agendamento abre o Trinks em nova aba com `noopener noreferrer`. Disponibilidade, confirmação, remarcação e cancelamento são realizados no próprio Trinks; isso não é uma integração de API.

O MVP de operação anterior foi preservado somente para inspeção interna em:

```text
/demo-interno
```

Essa rota mostra explicitamente um ambiente fictício, sem autenticação e sem backend. Ela não tem link na navegação pública e não representa dados reais da NA Barbearia. O `demoRepository` continua separado de `siteConfig` para impedir que dados de demonstração vazem para a home.

## Stack

- React 19 + TypeScript
- Vite 7
- CSS responsivo com tokens azul/ciano/branco
- Lucide React para ícones
- Vitest para regras do demo interno

## Como executar

Requer Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Abra `/` para o site público. Para inspecionar o fluxo legado isolado, abra `/demo-interno` diretamente.

Verificações:

```bash
npm test
npm run build
git diff --check
```

## Estrutura

```text
src/
  App.tsx                  # roteamento mínimo: público na raiz, demo em /demo-interno
  PublicSite.tsx           # landing pública sem agenda local ou dashboards
  DemoApp.tsx              # superfície interna fictícia herdada do MVP
  config/siteConfig.ts     # fatos públicos tipados e links oficiais
  styles.css               # tokens, landing, demo isolado e acessibilidade
  data/demoRepository.ts   # dados locais exclusivamente do demo interno
  domain/booking.ts        # regras/testes do demo interno
```

## Dados públicos configurados

Os dados abaixo estão centralizados em `siteConfig` e podem ser substituídos quando houver nova fonte confirmada:

- Nome: NA Barbearia.
- Cidade: Santos/SP.
- Endereço: Avenida Affonso Penna, 261, Macuco, Santos, SP, 11020-001.
- Telefone: (13) 97404-0190.
- Horários publicados: domingo 10:00–19:00; segunda e terça 10:00–20:30; quarta a sexta 10:00–20:00.
- Trinks: `https://www.trinks.com/na-barbearia`.
- Instagram: `https://www.instagram.com/nabarbeariaa/`.

O horário de sábado foi deliberadamente omitido. Endereço, horários e canais não devem ser copiados para outros projetos sem nova verificação.

## Acessibilidade e design

A home é mobile-first, usa sans-serif pesada em títulos editoriais, azul/ciano e branco, cartões com raio de 12–16px, container de aproximadamente 1160px, foco visível, alvos de toque de pelo menos 44px, links externos seguros e suporte a `prefers-reduced-motion`. O hero usa composição nativa em CSS/HTML; não há imagem quebrada nem foto alegada como sendo da barbearia.

## Limites e próximos passos

1. Validar com a equipe qualquer serviço, preço, duração, equipe, fotos e avaliações antes de publicar.
2. Se necessário, adicionar CMS/configuração para conteúdo público, mantendo uma fonte de verdade revisável.
3. Considerar autenticação e backend somente em uma superfície operacional separada.
4. Se o Trinks oferecer uma integração oficial autorizada, documentá-la antes de substituir o redirecionamento.
5. Adicionar consentimento/LGPD, logs e observabilidade caso dados pessoais ou integrações sejam introduzidos.

Não há alegação de integração com Trinks além do redirecionamento para a URL oficial.
