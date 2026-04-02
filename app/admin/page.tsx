"use client"

import { useState, useEffect } from "react"
import { AdminLogin } from "@/components/escala/admin-login"
import { AdminPanel } from "@/components/escala/admin-panel"
import { Spinner } from "@/components/ui/spinner"

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch("/api/admin/verify")
        if (response.ok) {
          setAuthenticated(true)
        }
      } catch (error) {
        console.error("Erro ao verificar autenticacao:", error)
      } finally {
        setChecking(false)
      }
    }

    checkAuth()
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />
  }

  return <AdminPanel onLogout={() => setAuthenticated(false)} />
}
