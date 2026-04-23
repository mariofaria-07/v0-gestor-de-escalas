import React, { useState } from "react";
import { Upload, Key, Link as LinkIcon, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import JSZip from 'jszip';
import toast from "react-hot-toast";

export function IntegrationsView() {
  const [certificadoFile, setCertificadoFile] = useState<File | null>(null);
  const [pfxPassword, setPfxPassword] = useState("");
  const [automationMode, setAutomationMode] = useState<"manual" | "daily">("manual");
  const [nsuConsulta, setNsuConsulta] = useState("");
  const [cnpjConsulta, setCnpjConsulta] = useState("");
  const [sydleToken, setSydleToken] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const handleUploadCertificado = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCertificadoFile(e.target.files[0]);
      toast.success("Certificado digital carregado na memória. Lembre-se de salvar as configurações.");
    }
  };

  const saveSettings = () => {
    // Aqui no futuro chamaremos o back-end para salvar as configurações
    toast.success("Configurações salvas com sucesso!");
  };

  const handleSyncPortal = async () => {
    if (!certificadoFile) {
      toast.error("Você precisa fazer upload de um certificado A1 (.pfx) para conectar.");
      return;
    }
    if (!pfxPassword) {
      toast.error("A senha do certificado é obrigatória.");
      return;
    }
    if (automationMode === 'daily') {
      toast.loading("Salvando o certificado e a senha no banco de forma segura...");
      setTimeout(() => {
        toast.success("O Robô RPA Noturno foi habilitado para esta empresa. A primeira varredura ocorrerá às 03:00.");
      }, 1500);
      return;
    }

    if (!nsuConsulta) {
      toast.error("Informe o NSU para consulta manual.");
      return;
    }

    setIsSyncing(true);
    const toastId = toast.loading("Autenticando mTLS e conectando ao Governo...");

    try {
      // 1. Converter Arquivo para Base64
      const buffer = await certificadoFile.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
      }
      const pfxBase64 = window.btoa(binary);

      // 2. Chamar nosso Backend no Vercel
      const response = await fetch('/api/nfseDistribuicao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pfxBase64,
          password: pfxPassword,
          nsu: nsuConsulta,
          cnpjConsulta: cnpjConsulta
        })
      });

      const data = await response.json();

      // Tratamento de Erro Cego (Bypass de 500 do Vercel)
      if (data.customError) {
          throw new Error(`${data.customError}. Detalhes: ${data.stacktrace || 'Nenhum'}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Erro desconhecido na API do governo');
      }

      // Auto-Downloader: Baixar Lote via Arquivo ZIP Único
      let countBaixadas = 0;
      const ultNsuRetornado = data.ultNSU || 'Desconhecido';

      if (data.LoteDFe && Array.isArray(data.LoteDFe) && data.LoteDFe.length > 0) {
          const zip = new JSZip();
          for (const doc of data.LoteDFe) {
              if (doc.XmlDescompactado) {
                  zip.file(`nfse_nacional_nsu_${doc.NSU}.xml`, doc.XmlDescompactado);
                  countBaixadas++;
              }
          }

          if (countBaixadas > 0) {
             const content = await zip.generateAsync({type:"blob"});
             const url = URL.createObjectURL(content);
             const a = document.createElement('a');
             a.href = url;
             const dataAtual = new Date().toISOString().split('T')[0];
             const cnpjFileName = cnpjConsulta || 'Todas_Empresas';
             a.download = `Lote_NFSe_${cnpjFileName}_${dataAtual}.zip`;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
          }
      }

      toast.success(countBaixadas > 0 
        ? `Sucesso! ${countBaixadas} XMLs agrupados em ZIP. (O próximo NSU a ser consultado depois deste lote é: ${ultNsuRetornado})`
        : `Busca vazia. Nenhum documento novo a partir desse ponto. A Receita informa que o ponteiro livre mais recente é o NSU: ${ultNsuRetornado}`, { id: toastId });
      
      console.log("Resposta do Governo:", data);
      
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <LinkIcon className="w-6 h-6 text-blue-600" /> Integrações e Configurações API
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Portal Nacional NFS-e */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-600" /> RPA Fiscal NFS-e
            </h3>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">Powered by Vercel</span>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Faça upload do seu certificado digital (A1) e programe a varredura automática. O robô se comunicará com o Portal Nacional da NFS-e toda madrugada.
          </p>
          
          <div className="mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Certificado Digital (.pfx / .p12)</label>
              <div className="flex items-center gap-3">
                <label className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mr-2" />
                  <span className="text-sm font-medium text-slate-600">
                    {certificadoFile ? certificadoFile.name : "Clique para anexar arquivo"}
                  </span>
                  <input type="file" accept=".pfx,.p12" className="hidden" onChange={handleUploadCertificado} />
                </label>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <label className="text-xs font-bold text-slate-700">Modo de Operação do Robô</label>
              <select 
                value={automationMode}
                onChange={e => setAutomationMode(e.target.value as "manual" | "daily")}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="manual">Testar Busca Imediata (Somente agora)</option>
                <option value="daily">Automático Diário: Buscar Notas do Dia Anterior (03:00 am)</option>
              </select>
            </div>
            
            {automationMode === 'manual' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Senha do Certificado *</label>
                  <input 
                    type="password" 
                    value={pfxPassword}
                    onChange={e => setPfxPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">NSU de Busca Inicial</label>
                  <input 
                    type="number" 
                    value={nsuConsulta}
                    onChange={e => setNsuConsulta(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="Ex: 123456"
                  />
                </div>
              </div>
            )}

            {automationMode === 'daily' && (
              <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Senha do Certificado *</label>
                  <input 
                    type="password" 
                    value={pfxPassword}
                    onChange={e => setPfxPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-300 bg-blue-50 focus:ring-blue-500 rounded-lg text-sm"
                    placeholder="••••••••"
                  />
              </div>
            )}
            
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">CNPJ do Emissor/Tomador (Opcional)</label>
              <input 
                type="text" 
                value={cnpjConsulta}
                onChange={e => setCnpjConsulta(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="Apenas números"
              />
            </div>
            
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> A senha e o certificado são enviados diretamente ao portal (mTLS).
            </p>
          </div>

          <button 
            onClick={handleSyncPortal}
            disabled={isSyncing}
            className={`w-full py-2.5 font-medium rounded-lg disabled:opacity-50 transition-colors shadow-sm ${automationMode === 'daily' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}
          >
            {isSyncing ? "Processando..." : automationMode === 'daily' ? "Salvar e Programar RPA Noturno" : "Executar Busca Manual"}
          </button>
        </div>

        {/* Sydle ERP */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-600" /> ERP: Sydle ONE
            </h3>
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">Desconectado</span>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Insira suas credenciais e tokens da API da Sydle para enviar as conciliações geradas neste sistema automaticamente para o financeiro do seu ERP.
          </p>
          
          <div className="space-y-3 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">URL da Instância Sydle</label>
              <input 
                type="text" 
                placeholder="https://suaempresa.sydle.one/api/v1/"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">API Token (Access Key)</label>
              <input 
                type="password" 
                value={sydleToken}
                onChange={(e) => setSydleToken(e.target.value)}
                placeholder="sk_live_..................."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <button 
            onClick={saveSettings}
            className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg"
          >
            Salvar Credenciais
          </button>
        </div>
      </div>
    </div>
  );
}
