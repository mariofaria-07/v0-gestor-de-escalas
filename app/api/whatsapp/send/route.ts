import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getEscalaDia, marcarComoEnviada } from "@/lib/firebase-service"
import { enviarEscalaParaMotorista } from "@/lib/whatsapp-service"

export async function POST(request: NextRequest) {
  // Verificar autenticacao admin
  const cookieStore = await cookies()
  const session = cookieStore.get("admin_session")

  if (session?.value !== "authenticated") {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  try {
    const { data } = await request.json()

    if (!data) {
      return NextResponse.json({ error: "Data nao informada" }, { status: 400 })
    }

    // Buscar escala do dia
    const escala = await getEscalaDia(data)

    if (!escala) {
      return NextResponse.json(
        { error: "Escala nao encontrada para esta data" },
        { status: 404 }
      )
    }

    // Enviar via WhatsApp
    const resultado = await enviarEscalaParaMotorista(escala)

    if (resultado.success) {
      await marcarComoEnviada(data)
      return NextResponse.json({
        success: true,
        messageId: resultado.messageId,
      })
    }

    return NextResponse.json(
      { error: resultado.error || "Erro ao enviar mensagem" },
      { status: 500 }
    )
  } catch (error) {
    console.error("Erro ao enviar WhatsApp:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}
