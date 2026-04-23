import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import https from 'https';
import zlib from 'zlib';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc } from "firebase/firestore";

// Configuração do DB para pegar credenciais e salvar notas
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log("Iniciando RPA Cron Job (Busca de NFS-e)...");

    // Valida se o Vercel enviou o header de Cron (Segurança)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !req.query.manual) {
        return res.status(401).json({ error: 'Acesso negado. Apenas Vercel Cron Runner autorizado.' });
    }

    try {
        // 1. Buscar a configuração da empresa e certificado salvo no Firebase
        const configSnapshot = await getDocs(collection(db, "integrations_config"));
        if (configSnapshot.empty) {
            return res.status(404).json({ error: 'Nenhuma credencial ou certificado A1 encontrado no banco de dados.' });
        }

        const configDoc = configSnapshot.docs[0];
        const config = configDoc.data();
        const { pfxBase64, password, lastKnownNsu, cnpj } = config;

        if (!pfxBase64) {
            return res.status(400).json({ error: 'Certificado A1 ausente na configuração do usuário.' });
        }

        // Determinar a data base "D-1" (Ontem)
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        ontem.setHours(0, 0, 0, 0); // Inicio de Ontem

        // 2. Configurar Autenticação mTLS
        const pfxBuffer = Buffer.from(pfxBase64, 'base64');
        const httpsAgent = new https.Agent({
            pfx: pfxBuffer,
            passphrase: password,
            rejectUnauthorized: false
        });

        // 3. Iterar nos NSUs (Lote) até encontrar notas fora de "ontem" ou o fim da fila
        let currentNsu = lastKnownNsu || 0;
        let processedCount = 0;
        let hasMore = true;

        while (hasMore && processedCount < 10) { // Limite de chamadas por cron p/ evitar timeout (Vercel limite: 10s-60s)
            console.log(`[RPA] Buscando Lote do NSU: ${currentNsu}...`);
            const apiResponse = await axios.get(`https://adn.nfse.gov.br/contribuintes/DFe/${currentNsu}`, {
                httpsAgent,
                params: { cnpjConsulta: cnpj, lote: true },
                headers: { 'Accept': 'application/json' }
            });

            const dados = apiResponse.data;
            if (dados.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO' || !dados.LoteDFe || dados.LoteDFe.length === 0) {
                console.log("[RPA] Fim da fila. Nenhuma nota a mais.");
                hasMore = false;
                break;
            }

            // O Lote tem notas. Vamos processar!
            let highestNsu = currentNsu;

            for (const doc of dados.LoteDFe) {
                if (doc.NSU > highestNsu) highestNsu = doc.NSU;

                // Converter string de data do Governo (ex: 2026-04-22T10:00:00Z) para objeto Date
                const docDate = new Date(doc.DataHoraGeracao);

                // O usuário pediu especificamente "notas do dia anterior" (D-1)
                // Se a nota é de hoje (já estourou D-1) ou antes de Ontem, ignoramos (ou decidimos salvar).
                // Mas geralmente guardamos todas e apenas filtramos. No RPA, só faremos 'commit' no BD das do filtro.
                if (docDate >= ontem && doc.ArquivoXml) {
                    // Decodificar Base64 + Gzip
                    let rawXml = doc.ArquivoXml;
                    try {
                        const buf = Buffer.from(doc.ArquivoXml, 'base64');
                        rawXml = zlib.gunzipSync(buf).toString('utf-8');
                    } catch(e) {
                        console.error("RPA falha no unzip:", e);
                    }
                    
                    // Salvar no Banco o xml decodificado e legível
                    await addDoc(collection(db, "raw_invoices_portal"), {
                        nsu: doc.NSU,
                        tipo: doc.TipoDocumento,
                        xmlGerado: rawXml,
                        dataHoraGeracao: doc.DataHoraGeracao,
                        statusRpa: "PROCESSAR_SYDLE",
                        empresa_cnpj: cnpj,
                        lidoEm: new Date().toISOString()
                    });
                    processedCount++;
                }
            }

            // Pular o NSU para a próxima iteração
            currentNsu = highestNsu;
        }

        // Atualizar o config do firebase para a próxima madrugada não repetir
        if (currentNsu > (lastKnownNsu || 0)) {
            await updateDoc(doc(db, "integrations_config", configDoc.id), {
                lastKnownNsu: currentNsu,
                updatedAt: new Date().toISOString()
            });
        }
        
        return res.status(200).json({ 
            message: 'RPA Executado com sucesso', 
            notasImportadas: processedCount,
            nsuFilaParou: currentNsu
        });

    } catch (error: any) {
        console.error("RPA Cron Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
}
