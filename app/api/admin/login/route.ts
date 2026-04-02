import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "escala2026"

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (password === ADMIN_PASSWORD) {
      const cookieStore = await cookies()
      cookieStore.set("admin_session", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 24 horas
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: "Senha incorreta" }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Erro no servidor" }, { status: 500 })
  }
}
