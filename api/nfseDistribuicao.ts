import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import https from 'https';
import zlib from 'zlib';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configuração padrão de CORS para o Vercel permitir o Frontend local
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    // Garantir que o Vercel parseou o body
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
        bodyData = JSON.parse(bodyData);
    }

    const { pfxBase64, password, nsu, cnpjConsulta } = bodyData;

    if (!pfxBase64 || !password || !nsu) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes: pfxBase64, password, nsu' });
    }

    // O ambiente de Produção Nacional do Governo
    const environmentUrl = 'https://adn.nfse.gov.br/contribuintes'; 

    // Converter Base64 do Certificado em Buffer binário nativo do Node.js
    const pfxBuffer = Buffer.from(pfxBase64, 'base64');

    // Configurar o Agente HTTPS com mTLS (Autenticação Mútua)
    const httpsAgent = new https.Agent({
      pfx: pfxBuffer,
      passphrase: password,
      rejectUnauthorized: false
    });

    // Fazer a chamada RESTFul para a ADN
    const apiResponse = await axios.get(`${environmentUrl}/DFe/${nsu}`, {
      httpsAgent,
      params: {
        cnpjConsulta: cnpjConsulta || undefined,
        lote: true
      },
      headers: {
        'Accept': 'application/json'
      }
    });

    // Descompactação Inteligente via Backend (zlib nativo)
    const dadosGerais = apiResponse.data;
    if (dadosGerais.LoteDFe && Array.isArray(dadosGerais.LoteDFe)) {
      for (const doc of dadosGerais.LoteDFe) {
        if (doc.ArquivoXml) {
          try {
            const buf = Buffer.from(doc.ArquivoXml, 'base64');
            doc.XmlDescompactado = zlib.gunzipSync(buf).toString('utf-8');
          } catch (e) {
            console.error("Falha ao descompactar XML do NSU " + doc.NSU, e);
          }
        }
      }
    }

    return res.status(200).json(dadosGerais);

  } catch (error: any) {
    // TÉCNICA DE DEBUG CEGO: Em vez de retornar erro 500 para a Vercel (que às vezes corta o log),
    // retornamos 400 ou 200 com a flag de erro para imprimir NA TELA do usuário.
    
    let errorMsg = error.message;
    if (error.response?.data) {
        errorMsg = JSON.stringify(error.response.data);
    }
    
    // Identificar erro de senha inválida do certificado
    if (errorMsg.includes('mac verify failure')) {
        return res.status(200).json({ customError: 'A senha do certificado está incorreta ou o arquivo pfx é inválido.' });
    }

    return res.status(200).json({
      customError: 'Falha na comunicação com a API Nacional',
      stacktrace: errorMsg,
      axiosStatus: error.response?.status
    });
  }
}
