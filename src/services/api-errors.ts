/** Textos de interface por código estável da API; detalhes técnicos ficam no erro. */
const messages: Record<string, string> = {
  STAFF_ONLY: 'Este acesso é exclusivo para barbeiros e proprietário.',
  SLOT_UNAVAILABLE: 'Este horário está indisponível ou bloqueado. Escolha outro horário.',
  BLOCK_OVERLAP: 'Já existe uma pausa neste intervalo. Escolha outro horário.',
  APPOINTMENT_OVERLAP: 'A pausa coincide com um atendimento confirmado. Escolha outro horário.',
  SCHEDULE_OVERLAP: 'Este intervalo coincide com uma escala já cadastrada.',
  INVALID_TRANSITION: 'O atendimento mudou e esta ação não está mais disponível. Atualize a agenda.',
  RATING_EXISTS: 'Este atendimento já foi avaliado.',
  INVALID_RATING: 'Só é possível avaliar atendimentos concluídos, com uma nota de 1 a 5.',
  ACCOUNT_NOT_AVAILABLE: 'Não foi possível cadastrar esta conta. Confira os dados ou fale com a recepção.',
  INVALID_EMAIL: 'Informe um e-mail válido.',
  INVALID_PASSWORD: 'A senha deve ter de 12 a 128 caracteres, sem caracteres de controle.',
  INVALID_PHONE: 'Informe um telefone válido com DDD.',
  INVALID_DATE: 'Informe uma data válida.',
  INVALID_TIMESTAMP: 'Informe uma data e um horário válidos.',
  INVALID_APPOINTMENT: 'Confira os dados e a duração do atendimento.',
  INVALID_PAYMENT: 'Escolha uma forma de pagamento válida.',
  INVALID_NOTE: 'A observação deve ter no máximo 500 caracteres.',
  SERVICE_NOT_FOUND: 'Este serviço não está mais disponível. Atualize o catálogo.',
  BARBER_NOT_FOUND: 'Este profissional não está disponível. Escolha outro profissional.',
  APPOINTMENT_NOT_FOUND: 'Agendamento não encontrado. Atualize a lista.',
  IDEMPOTENCY_KEY_REUSED: 'Os dados desta solicitação mudaram. Atualize a agenda e tente novamente.',
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
}

export function apiErrorMessage(code: string, status: number, login = false): string {
  if (status === 401) return login
    ? 'E-mail ou senha incorretos.'
    : 'Sua sessão expirou. Entre novamente para continuar.'
  if (Object.hasOwn(messages, code)) return messages[code]
  if (status === 403) return 'Sua conta não tem permissão para realizar esta ação.'
  if (status === 409) return 'Os dados mudaram ou o horário ficou indisponível. Atualize a agenda e tente novamente.'
  if (status === 429) return messages.RATE_LIMITED
  return 'Não foi possível concluir a operação. Tente novamente.'
}
