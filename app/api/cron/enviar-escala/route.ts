import { NextRequest, NextResponse } from "next/server"
import { getEscalaHoje, marcarComoEnviada } from "@/lib/firebase-service"
import { enviarEscalaParaMotorista } from "@/lib/whatsapp-service"

// Esta rota sera chamada pelo Vercel Cron
// Configurar em vercel.json para rodar as 6:30 em dias uteis

export async function GET(request: NextRequest) {
  // Verificar se e um cron job autorizado
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  // Verificar se e dia util (segunda a sexta)
  const hoje = new Date()
  const diaSemana = hoje.getDay()

  if (diaSemana === 0 || diaSemana === 6) {
    return NextResponse.json({
      success: true,
      message: "Fim de semana - nenhum envio necessario",
    })
  }

  try {
    // Buscar escala de hoje
    const escala = await getEscalaHoje()

    if (!escala) {
      return NextResponse.json({
        success: true,
        message: "Nenhuma escala encontrada para hoje",
      })
    }

    // Verificar se ja foi enviada hoje
    if (escala.enviado) {
      return NextResponse.json({
        success: true,
        message: "Escala ja foi enviada hoje",
      })
    }

    // Enviar via WhatsApp
    const resultado = await enviarEscalaParaMotorista(escala)

    if (resultado.success) {
      await marcarComoEnviada(escala.data)
      return NextResponse.json({
        success: true,
        message: "Escala enviada com sucesso",
        messageId: resultado.messageId,
      })
    }

    return NextResponse.json(
      {
        success: false,
        error: resultado.error || "Erro ao enviar mensagem",
      },
      { status: 500 }
    )
  } catch (error) {
    console.error("Erro no cron de envio:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
