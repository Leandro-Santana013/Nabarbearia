# Na Barbearia · MVP demonstrativo

Aplicação web responsiva para explorar uma operação de barbearia com agenda do cliente, visão profissional e visão de dono/SuperAdmin. Este repositório começou vazio; por isso, toda a identidade, catálogo e agenda exibidos são uma base provisória para validação de produto.

> **Importante:** os registros, nomes, valores, datas e horários da interface estão marcados como demonstração. Eles não representam preços, duração, endereço, escala, fotos ou conteúdo real da Na Barbearia. O Instagram exibido é apenas uma saída para o endereço oficial a confirmar; não há feed inventado.

## Visão do MVP

O fluxo principal é local e sem login: o visitante escolhe um serviço, profissional, data e horário, cria um agendamento e pode remarcar ou cancelar. A troca de abas de papel permite demonstrar três superfícies no mesmo navegador:

- **Cliente:** catálogo sem preço/duração definidos, escolha de barbeiro e horário, agendar, remarcar e cancelar.
- **Barbeiro:** agenda própria, atualização para confirmado/concluído/falta, métricas individuais e comissão ilustrativa.
- **Dono / SuperAdmin:** agenda geral, agenda própria em perfil híbrido, equipe/escala demonstrativa e indicadores financeiros.

A troca de papel é uma affordance de demonstração, **não é autenticação nem RBAC**.

## Stack

- React 19 + TypeScript
- Vite 7
- CSS responsivo com tokens editáveis em `src/styles.css`
- Lucide React para ícones
- Vitest para testes do domínio de agendamento

## Como executar

Requer Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Outros comandos:

```bash
npm run build       # verificação TypeScript + bundle de produção
npm test            # testes unitários do domínio
npm run preview     # serve o bundle gerado
```

## Estrutura

```text
src/
  App.tsx                  # abas de papel e telas do MVP
  styles.css               # tokens, layout, responsividade e acessibilidade
  types.ts                 # entidades e estados do domínio
  data/demoRepository.ts   # dataset e adaptador em memória
  domain/booking.ts        # regras puras de agenda e métricas
  domain/ports.ts          # fronteiras para persistência, auth e notificações
  domain/booking.test.ts    # testes unitários
```

## Domínios preparados

O modelo local explicita os limites que uma API deverá persistir:

- `User`/roles: cliente, barbeiro e dono/SuperAdmin.
- `Service`: catálogo sem assumir preço ou duração reais.
- `AvailabilityBlock`: bloqueios e disponibilidade por profissional.
- `Appointment`: agendamento e seu estado.
- `AppointmentHistory`: trilha de mudanças de status.
- `ServiceExecution`: início, conclusão e observações do atendimento.
- `CommissionSnapshot`: taxa e valor da comissão, hoje apenas ilustrativos.
- `FinancialEntry`: receita/comissão; somente atendimentos concluídos entram no cálculo da demonstração.

`PersistencePort`, `AuthPort` e `NotificationPort` em `src/domain/ports.ts` são contratos para trocar o adaptador em memória por API/banco, autenticação e WhatsApp/e-mail/push. Nenhuma chave ou integração externa é usada.

## Estados e regras da demonstração

- Agendamento: `confirmed`, `completed`, `no-show` e `cancelled`.
- Slots ocupados e bloqueios não aparecem como opções disponíveis.
- Remarcar volta o agendamento para `confirmed`.
- Cancelar mantém o registro e altera seu estado para `cancelled`.
- Receita e comissão são calculadas somente a partir de `completed`.
- A comissão de 40% é uma taxa **ilustrativa**, não uma regra de negócio real.
- O estado vive no React e é reiniciado ao recarregar a página.

## Identidade e acessibilidade

A direção provisória usa carvão, off-white e cobre/âmbar pelos tokens no começo de `src/styles.css`. O hero não afirma possuir foto real: ele reserva uma área para mídia validada. O layout é mobile-first, controles têm alvo mínimo de toque, há foco visível, labels e `prefers-reduced-motion`.

## Roadmap Canvas

O Canvas foi tratado como direcionamento de produto, não como um BMC completo. A sequência sugerida é:

- **P0 · demonstração:** cliente, agenda local, remarcação/cancelamento, visão barbeiro e dono.
- **P1 · configuração:** catálogo real, preços/durações, endereço, horários, escala e identidade validados.
- **P2 · conta e segurança:** autenticação, RBAC no servidor, organização/unidade e consentimentos.
- **P3 · operação:** persistência, conflito atômico de agenda no servidor, histórico e regras de cancelamento/no-show.
- **P4 · financeiro:** execução de serviço, comissão configurável, snapshots e lançamentos conciliáveis.
- **P5 · comunicação e conformidade:** adaptador WhatsApp com logs/retry, provedor real, LGPD, auditoria e observabilidade.

### Lacunas deliberadas

Ainda precisam de decisão e dados do estabelecimento: comissão, cancelamento/no-show, horários e duração, autenticação, consentimento/LGPD, provedor WhatsApp, preços, endereço, fotos e URL oficial do Instagram. O MVP deixa esses pontos explícitos para serem preenchidos sem transformar hipótese em dado real.

## Verificação desta entrega

Antes do commit, a base deve passar por `npm install`, `npm test` e `npm run build`. O processo de desenvolvimento não requer APIs, banco, chaves ou serviços externos.
