# Lembretes de atendimento pelo WhatsApp

Pesquisa em 30/10/2026. Documento de opções; nenhuma integração foi implementada ou contratada.

## Situação atual

O cliente real recebe `remindersAvailable={false}` e `whatsappStatus="unavailable"` em [ClientApp.tsx](../src/ClientApp.tsx). A confirmação oferece um link para abrir uma mensagem no WhatsApp; esse link não faz um envio automático. O [plano de arquitetura](PLANO-MELHORIAS-ARQUITETURA.md) exclui novas notificações de seu escopo aprovado.

Existe uma tabela reservada `notification_outbox` na [migração inicial](../backend/migrations/0001_initial.sql), mas suas restrições só permitem `status='disabled'` e `attempts=0`, sem referências no código do backend. Ela não constitui uma fila funcional; sua ativação exigiria uma nova migração e implementação.

## É possível sem API ou serviço externo?

Sem contratar um intermediário, sim: podemos integrar diretamente com a WhatsApp Cloud API da Meta. Sem qualquer integração com o WhatsApp, não há como nosso servidor entregar uma mensagem automaticamente dentro dele. Um link `wa.me` apenas abre a conversa e depende da ação da pessoa para enviar.

A Meta permite acesso direto por desenvolvedores ou por parceiros; não cobra uma tarifa adicional pelo acesso direto à plataforma. Isso não elimina a cobrança pelas mensagens. Fonte: [FAQ oficial, integração e custos](https://whatsappbusiness.com/resources/faq/).

## Opções

| Opção | Automático no WhatsApp? | Custo e implicações |
| --- | --- | --- |
| Cloud API diretamente com a Meta | Sim | Evita mensalidade de intermediário; há cobrança por mensagem conforme categoria/mercado. É a opção oficial a avaliar primeiro para uso real. |
| Z-API | Sim | O site anuncia R$ 99,99/mês por instância e teste de 2 dias; não é uma alternativa permanentemente gratuita. A documentação descreve uma sessão do WhatsApp Web por QR Code. |
| Baileys ou whatsapp-web.js hospedado por nós | Sim | Bibliotecas abertas, sem assinatura obrigatória dessas bibliotecas; exigem processo online, manutenção e gestão da sessão. São integrações não oficiais, com risco de bloqueio e quebra de funcionamento. |
| Evolution API hospedada por nós | Sim | Camada de integração aberta. O canal escolhido importa: Baileys usa WhatsApp Web; Cloud API usa a integração oficial e mantém seus custos/regras. Não significa WhatsApp oficial gratuito. |
| Link com mensagem pronta | Não, exige envio manual | Pode aproveitar o que já existe no projeto. Não atende sozinho ao lembrete automático uma hora antes. |

Fontes: [Z-API: planos e teste](https://z-api.io/), [Z-API: funcionamento por sessão Web](https://developer.z-api.io/), [whatsapp-web.js: funcionamento, licença e aviso de bloqueio](https://github.com/wwebjs/whatsapp-web.js), [Baileys: declaração de não afiliação e uso](https://github.com/WhiskeySockets/Baileys), [Evolution: projeto aberto](https://github.com/evolution-foundation/evolution-api), [Evolution: tipos de canal](https://docs.evoapicloud.com/instances/overview).

## Limites da gratuidade oficial

Não devemos prometer lembretes gratuitos em produção. O FAQ atualizado informa cobrança por mensagens de marketing, utilidade e autenticação e, desde 01/10/2026, também por mensagens de serviço, com as primeiras 1.000 mensagens de serviço gratuitas por número empresarial a cada mês. Essa franquia não equivale a 1.000 lembretes por template gratuitos. A mesma página ainda contém um parágrafo antigo sobre cobrança por conversa; esta pesquisa considera a seção específica de custos com data explícita. Não foi fixado um preço brasileiro: a tarifa deve ser confirmada na configuração real da conta. [Fonte oficial](https://whatsappbusiness.com/resources/faq/).

Para iniciar uma conversa ou enviar fora das 24 horas desde a última mensagem do destinatário, a plataforma exige um modelo aprovado. Agendar pelo nosso site não abre essa janela do WhatsApp. O destinatário precisa ter autorizado os contatos e poder desistir. Essas regras também precisam ser consideradas separadamente para cliente e barbeiro. Um lembrete transacional sem promoção é candidato a utilidade; a classificação final depende da Meta. [Política oficial, seções 1 e 2](https://whatsappbusiness.com/policy/).

## Alternativas sem cobrança por mensagem no WhatsApp

- **Notificação local no APK Android:** agendar o aviso no próprio aparelho. Evita contratar mensageria; depende de instalação, permissões e atualização do agendamento no aparelho. Cancelamentos e remarcações feitos por outra pessoa precisam ser sincronizados para evitar avisos antigos. Alarmes exatos têm restrições e permissões específicas; não se deve prometer precisão sem validação no aparelho. [Android: alarmes](https://developer.android.com/develop/background-work/services/alarms).
- **Push no aplicativo/site com Firebase Cloud Messaging:** o FCM é gratuito, mas continua sendo um serviço externo do Google e exige integração, permissão e conectividade; outros recursos de hospedagem/backend podem ter custos próprios. O aviso aparece como notificação do nosso aplicativo/site. [Firebase: capacidades e preço](https://firebase.google.com/products/cloud-messaging).

## Recomendação para este projeto

Se o requisito indispensável for receber pelo WhatsApp, avaliar primeiro a Cloud API direta e estimar o custo com volume real: enviar um aviso ao cliente e outro ao barbeiro representa dois destinatários por atendimento. Bibliotecas não oficiais podem servir a um experimento com número separado, aceitando explicitamente os riscos, mas não são minha recomendação para o número comercial e lembretes dos quais a operação depende.

Se a prioridade for evitar pagamento recorrente, começar com notificações do APK/push e manter o botão manual de WhatsApp é a opção mais adequada. A entrega ocorre fora do WhatsApp.

Independentemente do canal, uma futura implementação precisará persistir os lembretes, reagendar/cancelar junto com o atendimento, evitar duplicatas após reinício e registrar tentativas/resultados. Um worker no backend existente pode selecionar os atendimentos próximos de começar, sem contratar um agendador externo. Isso é proposta técnica, não alteração já realizada.
