import type { EscalaDia } from "./firebase-types"

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"

interface WhatsAppResponse {
  success: boolean
  messageId?: string
  error?: string
}

function formatarMensagemEscala(escala: EscalaDia): string {
  if (escala.feriado) {
    return `*Escala Rio Acima - ${escala.data}*\n\n${escala.descricaoFeriado?.toUpperCase()}\n\nNAO HAVERA ESCALA NESTE DIA.`
  }

  if (escala.colaboradores.length === 0) {
    return `*Escala Rio Acima - ${escala.data}*\n\nNAO HA COLABORADORES ESCALADOS PARA ESTE DIA.`
  }

  let msg = `*Escala Rio Acima - ${escala.data}*\n*Atencao Motorista e Colaboradores*\n\n*Passageiros do dia:*\n`

  escala.colaboradores.forEach((colaborador) => {
    msg += `- ${colaborador}\n`
  })

  msg += `\nPor favor, estejam nos pontos de embarque no horario combinado.`

  return msg
}

export async function enviarMensagemWhatsApp(
  telefone: string,
  mensagem: string
): Promise<WhatsAppResponse> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID

  if (!accessToken || !phoneId) {
    return {
      success: false,
      error: "Configuracoes do WhatsApp nao encontradas (WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_ID)",
    }
  }

  // Formatar telefone (remover caracteres especiais, adicionar codigo do pais se necessario)
  let telefoneFormatado = telefone.replace(/\D/g, "")
  if (!telefoneFormatado.startsWith("55")) {
    telefoneFormatado = "55" + telefoneFormatado
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefoneFormatado,
        type: "text",
        text: {
          body: mensagem,
        },
      }),
    })

    const data = await response.json()

    if (response.ok) {
      return {
        success: true,
        messageId: data.messages?.[0]?.id,
      }
    }

    return {
      success: false,
      error: data.error?.message || "Erro desconhecido ao enviar mensagem",
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao conectar com API do WhatsApp",
    }
  }
}

export async function enviarEscalaParaMotorista(escala: EscalaDia): Promise<WhatsAppResponse> {
  const telefoneMotorista = process.env.WHATSAPP_MOTORISTA_PHONE

  if (!telefoneMotorista) {
    return {
      success: false,
      error: "Telefone do motorista nao configurado (WHATSAPP_MOTORISTA_PHONE)",
    }
  }

  const mensagem = formatarMensagemEscala(escala)
  return enviarMensagemWhatsApp(telefoneMotorista, mensagem)
}

export { formatarMensagemEscala }
