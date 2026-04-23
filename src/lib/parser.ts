import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface InvoiceData {
  id?: string;
  fileName: string;
  providerName: string;
  providerCnpj: string;
  takerName: string;
  takerCnpj: string;
  takerAddress?: string;
  takerCity?: string;
  takerState?: string;
  intermediaryName?: string;
  intermediaryCnpj?: string;
  invoiceNumber: string;
  issueDate: string;
  serviceValue: number;
  retentions: {
    iss: number;
    pis: number;
    cofins: number;
    ir: number;
    csll: number;
    inss: number;
    total: number;
  };
  uploadDate: string;
  erpReconciled?: boolean;
  competence?: string;
}

function getFirstNode(doc: Document | Element, tagNames: string[]): Element | null {
  for (const tag of tagNames) {
    let nodes = doc.getElementsByTagName(tag);
    if (nodes.length === 0 && doc.getElementsByTagNameNS) {
      nodes = doc.getElementsByTagNameNS("*", tag);
    }
    if (nodes.length > 0) {
      return nodes[0];
    }
  }
  return null;
}

function getNodeValue(doc: Document | Element, tagNames: string[]): string {
  const node = getFirstNode(doc, tagNames);
  if (node && node.textContent) {
    return node.textContent.trim();
  }
  return "";
}

function getNumericValue(doc: Document | Element, tagNames: string[]): number {
  const val = getNodeValue(doc, tagNames);
  if (!val) return 0;
  const parsed = parseFloat(val.replace(/,/g, "."));
  return isNaN(parsed) ? 0 : parsed;
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  // Check DD/MM/YYYY
  const ptBrMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ptBrMatch) {
    return `${ptBrMatch[3]}-${ptBrMatch[2]}-${ptBrMatch[1]}`;
  }
  // Check YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }
  // Check YYYY-MM-DDTHH:mm:ss
  const isoTimeMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoTimeMatch) {
    return isoTimeMatch[1];
  }
  return dateStr;
}

export async function parseInvoiceXml(file: File): Promise<InvoiceData> {
  const text = await file.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

  const invoiceNumber = getNodeValue(xmlDoc, ["nNFSe", "Numero"]);
  const issueDateRaw = getNodeValue(xmlDoc, ["dhEmi", "DataEmissao", "dhProc"]);
  const issueDate = normalizeDate(issueDateRaw);
  
  let providerName = getNodeValue(xmlDoc, ["xNome", "RazaoSocial"]);
  let providerCnpj = getNodeValue(xmlDoc, ["CNPJ", "Cnpj"]);

  const emitNode = getFirstNode(xmlDoc, ["emit", "PrestadorServico", "prest"]);
  if (emitNode) {
    providerName = getNodeValue(emitNode, ["xNome", "RazaoSocial"]) || providerName;
    providerCnpj = getNodeValue(emitNode, ["CNPJ", "Cnpj"]) || providerCnpj;
  }

  let takerName = "";
  let takerCnpj = "";
  let takerAddress = "";
  let takerCity = "";
  let takerState = "";
  
  const tomaNode = getFirstNode(xmlDoc, ["toma", "TomadorServico", "Tomador"]);
  if (tomaNode) {
    takerName = getNodeValue(tomaNode, ["xNome", "RazaoSocial"]);
    takerCnpj = getNodeValue(tomaNode, ["CNPJ", "CpfCnpj", "Cnpj"]);
    
    const endNode = getFirstNode(tomaNode, ["Endereco", "endereco"]);
    if (endNode) {
      takerAddress = getNodeValue(endNode, ["xLgr", "Endereco", "Logradouro"]);
      takerCity = getNodeValue(endNode, ["xMun", "Cidade", "NomeMunicipio"]);
      takerState = getNodeValue(endNode, ["UF", "Uf", "Estado"]);
    }
  }

  let intermediaryName = "";
  let intermediaryCnpj = "";
  const interNode = getFirstNode(xmlDoc, ["Intermediario", "IntermediarioServico", "OrgaoGerador"]);
  if (interNode) {
    intermediaryName = getNodeValue(interNode, ["RazaoSocial", "xNome"]);
    intermediaryCnpj = getNodeValue(interNode, ["Cnpj", "CpfCnpj", "CNPJ"]);
  }

  const serviceValue = getNumericValue(xmlDoc, ["vServ", "ValorServicos", "vBC"]);

  // ISS
  let iss = 0;
  const tpRetISSQN = getNodeValue(xmlDoc, ["tpRetISSQN"]);
  const issRetidoTag = getNodeValue(xmlDoc, ["IssRetido"]);
  if (tpRetISSQN === "2" || tpRetISSQN === "3" || issRetidoTag === "1") {
    iss = getNumericValue(xmlDoc, ["vISSQN", "ValorIss", "vISSRetido", "ValorIssRetido", "ValorISSRetido", "vRetISSQN"]);
  } else if (tpRetISSQN === "1" || issRetidoTag === "2") {
    iss = 0;
  } else {
    // Fallback if tags are missing
    iss = getNumericValue(xmlDoc, ["vISSRetido", "ValorIssRetido", "ValorISSRetido", "vRetISSQN"]);
  }

  // PIS, COFINS, CSLL
  let pis = 0;
  let cofins = 0;
  let csll = 0;

  const tpRetPisCofins = getNodeValue(xmlDoc, ["tpRetPisCofins", "tpRetencaoPisCofins", "tpRetencaoPCC"]);
  const hasTpRetPisCofins = tpRetPisCofins !== "";
  
  let pisRetido = false;
  let cofinsRetido = false;
  let csllRetido = false;

  if (hasTpRetPisCofins) {
    switch (tpRetPisCofins) {
      case "0": pisRetido = false; cofinsRetido = false; csllRetido = false; break;
      case "1": pisRetido = true; cofinsRetido = true; csllRetido = false; break; // TRANSIÇÃO
      case "2": pisRetido = false; cofinsRetido = false; csllRetido = false; break; // TRANSIÇÃO
      case "3": pisRetido = true; cofinsRetido = true; csllRetido = true; break;
      case "4": pisRetido = true; cofinsRetido = true; csllRetido = false; break;
      case "5": pisRetido = true; cofinsRetido = false; csllRetido = false; break;
      case "6": pisRetido = false; cofinsRetido = true; csllRetido = false; break;
      case "7": pisRetido = false; cofinsRetido = true; csllRetido = true; break;
      case "8": pisRetido = false; cofinsRetido = false; csllRetido = true; break;
      case "9": pisRetido = true; cofinsRetido = false; csllRetido = true; break;
    }
  }

  if (hasTpRetPisCofins) {
    pis = pisRetido ? getNumericValue(xmlDoc, ["vPis", "vRetPIS", "ValorPis", "ValorPIS", "vPisRetido"]) : 0;
    cofins = cofinsRetido ? getNumericValue(xmlDoc, ["vCofins", "vRetCOFINS", "ValorCofins", "ValorCOFINS", "vCofinsRetido"]) : 0;
    csll = csllRetido ? getNumericValue(xmlDoc, ["vCSLL", "vRetCSLL", "ValorCsll", "ValorCSLL", "vCsllRetido"]) : 0;
  } else {
    // Fallback logic
    pis = getNumericValue(xmlDoc, ["vRetPIS", "vPisRetido", "ValorPisRetido"]);
    if (!pis) pis = getNumericValue(xmlDoc, ["vPis", "ValorPis", "ValorPIS"]);

    cofins = getNumericValue(xmlDoc, ["vRetCOFINS", "vCofinsRetido", "ValorCofinsRetido"]);
    if (!cofins) cofins = getNumericValue(xmlDoc, ["vCofins", "ValorCofins", "ValorCOFINS"]);

    csll = getNumericValue(xmlDoc, ["vRetCSLL", "vCsllRetido", "ValorCsllRetido"]);
    if (!csll) csll = getNumericValue(xmlDoc, ["vCSLL", "ValorCsll", "ValorCSLL"]);
  }

  // INSS
  let inss = 0;
  const tpRetCP = getNodeValue(xmlDoc, ["tpRetCP", "tpRetINSS"]);
  if (tpRetCP === "1") {
    inss = getNumericValue(xmlDoc, ["vINSS", "vRetCP", "vRetINSS", "ValorInss", "ValorINSS", "vInssRetido"]);
  } else if (tpRetCP === "0") {
    inss = 0;
  } else {
    inss = getNumericValue(xmlDoc, ["vRetCP", "vRetINSS", "vInssRetido", "ValorInssRetido"]);
    if (!inss) inss = getNumericValue(xmlDoc, ["vINSS", "ValorInss", "ValorINSS"]);
  }

  // IRRF
  const ir = getNumericValue(xmlDoc, ["vRetIRRF", "ValorIr", "ValorIR", "vIrRetido", "vIRRF"]);

  let totalRetentions = getNumericValue(xmlDoc, ["vTotalRet"]);
  if (!totalRetentions) {
    totalRetentions = iss + pis + cofins + ir + csll + inss;
  }

  return {
    fileName: file.name,
    providerName: providerName || "Desconhecido",
    providerCnpj: providerCnpj || "Desconhecido",
    takerName: takerName || "Desconhecido",
    takerCnpj: takerCnpj || "Desconhecido",
    takerAddress: takerAddress || "",
    takerCity: takerCity || "",
    takerState: takerState || "",
    intermediaryName: intermediaryName || "",
    intermediaryCnpj: intermediaryCnpj || "",
    invoiceNumber: invoiceNumber || "Desconhecido",
    issueDate: issueDate || "Desconhecido",
    serviceValue,
    retentions: {
      iss,
      pis,
      cofins,
      ir,
      csll,
      inss,
      total: totalRetentions,
    },
    uploadDate: new Date().toISOString(),
  };
}

function extractRegex(text: string, regex: RegExp, defaultValue = ""): string {
  const match = text.match(regex);
  return match ? match[1].trim() : defaultValue;
}

function parseCurrency(val: string): number {
  if (!val || val === "-") return 0;
  const cleaned = val.replace(/[^\d,-]/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export async function parseInvoicePdf(file: File): Promise<InvoiceData> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n";
  }

  // Normalize spaces
  const text = fullText.replace(/\s+/g, " ");

  // Extract fields using regex
  // Número da NFS-e
  let invoiceNumber = extractRegex(text, /Número da NFS-e\s+(\d+)/i);
  if (!invoiceNumber) invoiceNumber = extractRegex(text, /Número da Nota\s+(\d+)/i);

  // Data de Emissão
  let issueDateRaw = extractRegex(text, /Data e Hora da emissão da NFS-e\s+([\d/]+)/i);
  if (!issueDateRaw) issueDateRaw = extractRegex(text, /Data e Hora de Emissão\s+([\d/]+)/i);
  const issueDate = normalizeDate(issueDateRaw);

  // Prestador
  let providerCnpj = extractRegex(text, /EMITENTE DA NFS-e.*?CNPJ \/ CPF \/ NIF\s+([\d\.\-\/]+)/i);
  if (!providerCnpj) providerCnpj = extractRegex(text, /PRESTADOR DE SERVIÇOS.*?CPF\/CNPJ:\s+([\d\.\-\/]+)/i);
  
  let providerName = extractRegex(text, /EMITENTE DA NFS-e.*?Nome \/ Nome Empresarial\s+(.*?)\s+Endereço/i);
  if (!providerName) providerName = extractRegex(text, /PRESTADOR DE SERVIÇOS.*?Nome\/Razão Social:\s+(.*?)\s+Endereço/i);

  // Tomador
  let takerCnpj = extractRegex(text, /TOMADOR DO SERVIÇO.*?CNPJ \/ CPF \/ NIF\s+([\d\.\-\/]+)/i);
  if (!takerCnpj) takerCnpj = extractRegex(text, /TOMADOR DE SERVIÇOS.*?CPF\/CNPJ:\s+([\d\.\-\/]+)/i);

  let takerName = extractRegex(text, /TOMADOR DO SERVIÇO.*?Nome \/ Nome Empresarial\s+(.*?)\s+Endereço/i);
  if (!takerName) takerName = extractRegex(text, /TOMADOR DE SERVIÇOS.*?Nome\/Razão Social:\s+(.*?)\s+CPF\/CNPJ/i);

  // Valores
  let serviceValueStr = extractRegex(text, /Valor do Serviço\s+R\$\s+([\d\.,]+)/i);
  if (!serviceValueStr) serviceValueStr = extractRegex(text, /VALOR TOTAL DO SERVIÇO = R\$\s+([\d\.,]+)/i);
  const serviceValue = parseCurrency(serviceValueStr);

  // Retenções
  const issStr = extractRegex(text, /ISSQN Retido\s+R\$\s+([\d\.,]+)/i);
  const iss = parseCurrency(issStr);

  let irStr = extractRegex(text, /IRRF\s+R\$\s+([\d\.,]+)/i);
  if (!irStr) irStr = extractRegex(text, /IRRF \(R\$\)\s+([\d\.,]+)/i);
  const ir = parseCurrency(irStr);

  let pisStr = extractRegex(text, /PIS - Débito Apuração Própria\s+R\$\s+([\d\.,]+)/i);
  if (!pisStr) pisStr = extractRegex(text, /PIS\/PASEP \(R\$\)\s+([\d\.,]+)/i);
  const pis = parseCurrency(pisStr);

  let cofinsStr = extractRegex(text, /COFINS - Débito Apuração Própria\s+R\$\s+([\d\.,]+)/i);
  if (!cofinsStr) cofinsStr = extractRegex(text, /COFINS \(R\$\)\s+([\d\.,]+)/i);
  const cofins = parseCurrency(cofinsStr);

  let csllStr = extractRegex(text, /CSLL \(R\$\)\s+([\d\.,]+)/i);
  const csll = parseCurrency(csllStr);

  let inssStr = extractRegex(text, /INSS \(R\$\)\s+([\d\.,]+)/i);
  const inss = parseCurrency(inssStr);

  const totalRetentions = iss + pis + cofins + ir + csll + inss;

  return {
    fileName: file.name,
    providerName: providerName || "Desconhecido",
    providerCnpj: providerCnpj || "Desconhecido",
    takerName: takerName || "Desconhecido",
    takerCnpj: takerCnpj || "Desconhecido",
    invoiceNumber: invoiceNumber || "Desconhecido",
    issueDate: issueDate || "Desconhecido",
    serviceValue,
    retentions: {
      iss,
      pis,
      cofins,
      ir,
      csll,
      inss,
      total: totalRetentions,
    },
    uploadDate: new Date().toISOString(),
  };
}

