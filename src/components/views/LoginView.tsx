import React, { useState } from "react";
import { FileText, AlertCircle, Lock } from "lucide-react";
import { auth } from "../../firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

interface LoginViewProps {
  requirePasswordChange: boolean;
  setRequirePasswordChange: (val: boolean) => void;
}

export function LoginView({ requirePasswordChange, setRequirePasswordChange }: LoginViewProps) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (requirePasswordChange) {
        await sendPasswordResetEmail(auth, loginEmail);
        setAuthError("Email de redefinição enviado! Verifique sua caixa de entrada com o link com a nova senha para acessar.");
      } else {
        await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      }
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') setAuthError("Usuário não encontrado.");
      else if (err.code === 'auth/wrong-password') setAuthError("Senha incorreta.");
      else setAuthError("Erro na autenticação. Verifique os dados e tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        <div className="bg-blue-600 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Analisador NFS-e</h1>
          <p className="text-blue-100 mt-2 text-sm">Plataforma de Conciliação Inteligente</p>
        </div>
        
        <div className="p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">{requirePasswordChange ? "Recuperar Senha / Primeiro Acesso" : "Acesse sua Conta"}</h2>
          
          {authError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{authError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail corporativo</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="seu.email@empresa.com.br"
              />
            </div>

            {!requirePasswordChange && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-700">Senha</label>
                  <button 
                    type="button" 
                    onClick={() => setRequirePasswordChange(true)} 
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Primeiro acesso ou esqueceu?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
            >
              {requirePasswordChange ? (
                <>Recuperar via E-mail</>
              ) : (
                <><Lock className="w-4 h-4" /> Entrar na Plataforma</>
              )}
            </button>
          </form>
          
          {requirePasswordChange && (
            <div className="mt-4 text-center">
              <button 
                onClick={() => setRequirePasswordChange(false)} 
                className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                Voltar para o Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
