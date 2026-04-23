import React, { useState, useEffect, useRef, ChangeEvent, Fragment } from "react";
import { Upload, FileText, Search, Trash2, AlertCircle, Loader2, Download, ChevronDown, ChevronRight, Building2, CalendarDays, Plus, Filter, LayoutDashboard, List, AlertTriangle, CheckCircle2, XCircle, FileSpreadsheet, Settings, LogOut, Lock } from "lucide-react";
import { LoginView } from "./components/views/LoginView";
import { IntegrationsView } from "./components/views/IntegrationsView";
import { parseInvoiceXml, parseInvoicePdf, type InvoiceData } from "./lib/parser";
import { db, auth } from "./firebase";
import { collection, addDoc, getDocs, doc, query, orderBy, writeBatch, deleteDoc, setDoc, getDoc, where, updateDoc, deleteField } from "firebase/firestore";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail } from "firebase/auth";
import { cn } from "./lib/utils";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import JSZip from "jszip";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

export interface SystemInvoice {
  emissao: string;
  fornecedor: string;
  cnpjFornecedor?: string;
  numero: string;
  pis: number;
  cofins: number;
  csll: number;
  irrf: number;
  iss: number;
  inss: number;
  valorServico?: number;
}

export interface ReconciliationResult {
  id: string;
  xmlInvoice?: InvoiceData;
  systemInvoice?: SystemInvoice;
  status: 'Conciliado' | 'Divergente' | 'Não Lançado' | 'Falta XML';
  divergences: string[];
  justification?: string;
  takerCnpj?: string;
  takerName?: string;
  competence?: string;
  manuallyLinked?: boolean;
  reconciledBy?: string;
  reconciledAt?: string;
}

export interface Company {
  id?: string;
  cnpj: string;
  rootCnpj: string;
  name: string;
  identifier?: string;
  address?: string;
  city?: string;
  state?: string;
}

export interface ClosedMonth {
  id: string;
  competence: string;
  cnpj: string;
  closedAt: string;
  closedBy: string;
}

export default function App() {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [closedMonths, setClosedMonths] = useState<ClosedMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'invoices' | 'reconciliation' | 'pending' | 'companies' | 'fechamento' | 'admin' | 'integrations'>('dashboard');

  // State for expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  // State for drilldown (Retentions)
  const [drilldownInvoice, setDrilldownInvoice] = useState<InvoiceData | null>(null);

  // New Filters & Grouping
  const [groupBy, setGroupBy] = useState<'taker' | 'date'>('taker');
  const [retentionFilter, setRetentionFilter] = useState<'all' | 'with' | 'without'>('all');
  const [retentionFilters, setRetentionFilters] = useState({
    iss: false,
    pis: false,
    cofins: false,
    csll: false,
    irrf: false,
    inss: false,
  });
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // Competence State
  const [selectedCompetence, setSelectedCompetence] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  // Clear DB State
  const [showClearDbModal, setShowClearDbModal] = useState(false);
  const [clearDbConfirmText, setClearDbConfirmText] = useState("");
  const [clearingDb, setClearingDb] = useState(false);

  // Reconciliation State
  const [reconDateStart, setReconDateStart] = useState("");
  const [reconDateEnd, setReconDateEnd] = useState("");
  const [reconciliationResults, setReconciliationResults] = useState<ReconciliationResult[]>([]);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationStatusFilter, setReconciliationStatusFilter] = useState<'all' | 'Conciliado' | 'Divergente' | 'Não Lançado' | 'Falta XML'>('all');
  const [reconciliationTaxFilter, setReconciliationTaxFilter] = useState<'all' | 'IRRF' | 'PIS' | 'COFINS' | 'CSLL' | 'INSS' | 'ISS' | 'Valor Líquido'>('all');
  const [reconciliationCompany, setReconciliationCompany] = useState<string>("");
  const [reconSearchTerm, setReconSearchTerm] = useState("");
  const [selectedReconIds, setSelectedReconIds] = useState<string[]>([]);
  const [showDiffModal, setShowDiffModal] = useState<ReconciliationResult | null>(null);
  const systemFileInputRef = useRef<HTMLInputElement>(null);

  // Quick Company Modals
  const [showQuickCompanyModal, setShowQuickCompanyModal] = useState(false);
  const [quickCompanyData, setQuickCompanyData] = useState({ cnpj: "", name: "", identifier: "" });

  // Justification State
  const [showJustifyModal, setShowJustifyModal] = useState(false);
  const [justifyResultId, setJustifyResultId] = useState<string | null>(null);
  const [justificationText, setJustificationText] = useState("");

  // Linking State
  const [linkingResultId, setLinkingResultId] = useState<string | null>(null);
  const [linkSearchTerm, setLinkSearchTerm] = useState("");

  // Batch Delete State
  const [batchDeleteStartDate, setBatchDeleteStartDate] = useState("");
  const [batchDeleteEndDate, setBatchDeleteEndDate] = useState("");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // CSV Import Confirm State
  const [showImportConfirmModal, setShowImportConfirmModal] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  // Pendencies Filter State
  const [pendenciesMinDate, setPendenciesMinDate] = useState("2025-03-01");

  // Weekly Control State
  const [weeklyControls, setWeeklyControls] = useState<Record<string, { s1: boolean, s2: boolean, s3: boolean, s4: boolean, final: boolean }>>({});

  // Company Edit State
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCompanyData, setEditCompanyData] = useState<Partial<Company>>({});

  const [isDragActive, setIsDragActive] = useState(false);
  const [showXmlDetailsModal, setShowXmlDetailsModal] = useState<InvoiceData | null>(null);

  const incrementMonth = (offset: number) => {
    const parts = selectedCompetence.split('-');
    let date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1 + offset, 1);
    setSelectedCompetence(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const logAdminAction = async (action: string, metadata: any) => {
    if (!user) return;
    try {
      const logRef = doc(collection(db, "audit_logs"));
      await setDoc(logRef, {
        action,
        userEmail: user.email || 'Desconhecido',
        timestamp: new Date().toISOString(),
        ...metadata
      });
    } catch(err) {
      console.error("Failed to log action", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload({ target: { files: e.dataTransfer.files } } as any);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user needs to change password
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().requirePasswordChange) {
          setRequirePasswordChange(true);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    fetchInvoices();
    fetchCompanies();
    fetchReconciliations();
    fetchClosedMonths();
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const data: any[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setAuditLogs(data);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    }
  };

  const fetchWeeklyControls = async () => {
    try {
      const q = query(collection(db, "weekly_controls"));
      const querySnapshot = await getDocs(q);
      const data: Record<string, any> = {};
      querySnapshot.forEach((doc) => {
        data[doc.id] = doc.data();
      });
      setWeeklyControls(data);
    } catch (err) {
      console.error("Error fetching weekly controls:", err);
    }
  };

  const fetchClosedMonths = async () => {
    try {
      const q = query(collection(db, "closed_months"));
      const querySnapshot = await getDocs(q);
      const data: ClosedMonth[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ClosedMonth);
      });
      setClosedMonths(data);
    } catch (err) {
      console.error("Error fetching closed months:", err);
    }
  };

  const fetchReconciliations = async () => {
    try {
      const q = query(collection(db, "reconciliations"));
      const querySnapshot = await getDocs(q);
      const data: ReconciliationResult[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ReconciliationResult);
      });
      setReconciliationResults(data);
    } catch (err) {
      console.error("Error fetching reconciliations:", err);
    }
  };

  const handleQuickCompanyAdd = async () => {
    try {
      if (!quickCompanyData.cnpj || !quickCompanyData.name) {
        alert("CNPJ e Razão Social são obrigatórios.");
        return;
      }
      
      const cleanCnpj = quickCompanyData.cnpj.replace(/[^\d]/g, '');
      const rootCnpj = cleanCnpj.substring(0, 8);
      
      const newCompany = {
        cnpj: cleanCnpj,
        rootCnpj,
        name: quickCompanyData.name,
        identifier: quickCompanyData.identifier,
        address: "",
        city: "",
        state: ""
      };
      
      const newCompanyRef = doc(collection(db, "companies"));
      await setDoc(newCompanyRef, newCompany);
      
      setCompanies(prev => [...prev, { ...newCompany, id: newCompanyRef.id }]);
      setReconciliationCompany(cleanCnpj);
      setShowQuickCompanyModal(false);
      setQuickCompanyData({ cnpj: "", name: "", identifier: "" });
    } catch(err) {
      console.error(err);
      alert("Erro ao salvar empresa");
    }
  };

  const handleJustify = async () => {
    if (!justifyResultId || !justificationText.trim()) return;
    
    try {
      const docRef = doc(db, "reconciliations", justifyResultId);
      const updateData = { 
        status: 'Conciliado', 
        justification: justificationText,
        reconciledBy: user?.email || 'Desconhecido',
        reconciledAt: new Date().toISOString()
      };
      await setDoc(docRef, updateData, { merge: true });
      
      setReconciliationResults(prev => prev.map(r => 
        r.id === justifyResultId 
          ? { ...r, status: 'Conciliado', justification: justificationText, reconciledBy: updateData.reconciledBy, reconciledAt: updateData.reconciledAt } 
          : r
      ));

      await logAdminAction('Conciliação Manual (Justificativa)', {
        reconciliationId: justifyResultId,
        justification: justificationText
      });
      
      setShowJustifyModal(false);
      setJustifyResultId(null);
      setJustificationText("");
    } catch (err) {
      console.error("Error saving justification:", err);
      alert("Erro ao salvar justificativa.");
    }
  };

  const fetchCompanies = async () => {
    try {
      const q = query(collection(db, "companies"));
      const querySnapshot = await getDocs(q);
      const data: Company[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Company);
      });
      setCompanies(data);
    } catch (err) {
      console.error("Error fetching companies:", err);
    }
  };

  const saveCompany = async (id: string) => {
    try {
      await setDoc(doc(db, "companies", id), editCompanyData, { merge: true });
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...editCompanyData } : c));
      setEditingCompanyId(null);
    } catch (err) {
      console.error("Error updating company:", err);
      alert("Erro ao atualizar empresa.");
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, "invoices"), orderBy("uploadDate", "desc"));
      const querySnapshot = await getDocs(q);
      const data: InvoiceData[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as InvoiceData);
      });
      setInvoices(data);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching invoices:", err);
      setError("Erro ao carregar notas fiscais. Verifique a conexão com o Firebase.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    
    try {
      const newInvoices: InvoiceData[] = [];
      const existingKeys = new Set(invoices.map(inv => `${inv.providerCnpj}_${inv.invoiceNumber}`));
      const existingCompanyCnpjs = new Set(companies.map(c => c.cnpj));
      const newCompaniesMap = new Map<string, Company>();
      let duplicatesCount = 0;
      let addedCount = 0;
      
      const processFile = async (file: File) => {
        let parsedData: InvoiceData | null = null;

        if (file.type === "text/xml" || file.name.endsWith(".xml")) {
          parsedData = await parseInvoiceXml(file);
        } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          parsedData = await parseInvoicePdf(file);
        }
        
        if (parsedData) {
          // Assign competence based on issueDate
          if (parsedData.issueDate) {
            const dateParts = parsedData.issueDate.split('/'); // DD/MM/YYYY
            if (dateParts.length === 3) {
              parsedData.competence = `${dateParts[2]}-${dateParts[1]}`;
            }
          }

          const key = `${parsedData.providerCnpj}_${parsedData.invoiceNumber}`;
          if (existingKeys.has(key)) {
            duplicatesCount++;
            return;
          }
          existingKeys.add(key);

          const docRef = await addDoc(collection(db, "invoices"), parsedData);
          newInvoices.push({ ...parsedData, id: docRef.id });
          addedCount++;

          // Check for new company
          const cleanCnpj = parsedData.takerCnpj.replace(/[^\d]/g, '');
          if (cleanCnpj && cleanCnpj !== 'Desconhecido' && !existingCompanyCnpjs.has(cleanCnpj) && !newCompaniesMap.has(cleanCnpj)) {
            newCompaniesMap.set(cleanCnpj, {
              cnpj: cleanCnpj,
              rootCnpj: cleanCnpj.substring(0, 8),
              name: parsedData.takerName,
              address: parsedData.takerAddress || "",
              city: parsedData.takerCity || "",
              state: parsedData.takerState || ""
            });
          }

          if (parsedData.intermediaryCnpj && (!parsedData.takerCnpj || parsedData.takerCnpj === 'Desconhecido')) {
            await logAdminAction('Aleta: Nota com Intermediador', {
              fileName: parsedData.fileName,
              intermediaryName: parsedData.intermediaryName,
              intermediaryCnpj: parsedData.intermediaryCnpj,
              providerName: parsedData.providerName,
              message: 'Nota fiscal identificada sem tomador explícito, mas contendo um intermediador.'
            });
          }
        }
      };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (file.name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
          const zip = new JSZip();
          const zipContent = await zip.loadAsync(file);
          
          const zipEntries = Object.values(zipContent.files);
          for (const zipEntry of zipEntries) {
            if (!zipEntry.dir && (zipEntry.name.endsWith(".xml") || zipEntry.name.endsWith(".pdf"))) {
              const blob = await zipEntry.async("blob");
              const extractedFile = new File([blob], zipEntry.name, { 
                type: zipEntry.name.endsWith(".xml") ? "text/xml" : "application/pdf" 
              });
              await processFile(extractedFile);
            }
          }
        } else {
          await processFile(file);
        }
      }
      
      // Save new companies
      if (newCompaniesMap.size > 0) {
        const batch = writeBatch(db);
        const addedCompanies: Company[] = [];
        newCompaniesMap.forEach((company) => {
          const newCompanyRef = doc(collection(db, "companies"));
          batch.set(newCompanyRef, company);
          addedCompanies.push({ ...company, id: newCompanyRef.id });
        });
        await batch.commit();
        setCompanies(prev => [...prev, ...addedCompanies]);
      }

      setInvoices((prev) => [...newInvoices, ...prev]);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (duplicatesCount > 0) {
        alert(`${addedCount} nota(s) importada(s) com sucesso.\n${duplicatesCount} nota(s) ignorada(s) pois já estavam cadastradas (duplicadas).`);
      } else if (addedCount > 0) {
        alert(`${addedCount} nota(s) importada(s) com sucesso.`);
      }
    } catch (err: any) {
      console.error("Error parsing/uploading file:", err);
      setError("Erro ao processar os arquivos. Verifique se são XMLs, PDFs ou ZIPs válidos.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta nota?")) return;
    
    try {
      const targetInvoice = invoices.find(i => i.id === id);
      await deleteDoc(doc(db, "invoices", id));
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      await logAdminAction('Exclusão de Nota', {
        invoiceId: id,
        invoiceNumber: targetInvoice?.invoiceNumber,
        providerName: targetInvoice?.providerName
      });
    } catch (err) {
      console.error("Error deleting invoice:", err);
      alert("Erro ao excluir a nota.");
    }
  };

  const handleManualValidation = async (id: string) => {
    const result = reconciliationResults.find(r => r.id === id);
    if (!result) return;
    
    const justification = prompt("Informe uma justificativa para a validação manual:");
    if (justification === null) return; // cancelled
    
    const updatedResult = {
      ...result,
      status: 'Conciliado' as const,
      justification: justification || 'Validado manualmente (Falta XML)',
      reconciledBy: user?.email || 'Desconhecido',
      reconciledAt: new Date().toISOString()
    };
    
    try {
      await updateDoc(doc(db, "reconciliations", id), {
        status: updatedResult.status,
        justification: updatedResult.justification,
        reconciledBy: updatedResult.reconciledBy,
        reconciledAt: updatedResult.reconciledAt
      });
      setReconciliationResults(prev => prev.map(r => r.id === id ? updatedResult : r));
      await logAdminAction('Conciliação Manual (Falta XML)', {
        reconciliationId: id,
        justification: updatedResult.justification
      });
    } catch (e) {
      console.error(e);
      alert("Erro ao validar manualmente.");
    }
  };

  const handleUnlinkXml = async (id: string) => {
    const result = reconciliationResults.find(r => r.id === id);
    if (!result || !result.xmlInvoice || !result.systemInvoice) return;
    
    if (!confirm("Deseja realmente desvincular este XML? Ele voltará para o status 'Não Lançado'.")) return;

    const xmlInv = result.xmlInvoice;
    const providerName = xmlInv.providerName.toLowerCase().trim().replace(/[^\w\s]/gi, '');
    const newXmlDocId = `recon_${reconciliationCompany}_${providerName}_${xmlInv.invoiceNumber}_unlinked_${Date.now()}`;

    const newXmlResult: ReconciliationResult = {
      id: newXmlDocId,
      xmlInvoice: xmlInv,
      status: 'Não Lançado',
      divergences: ['Nota importada via XML, mas não encontrada no relatório do sistema (Desvinculada manualmente).'],
      takerCnpj: xmlInv.takerCnpj,
      takerName: xmlInv.takerName,
      competence: result.competence,
    };

    const updatedTargetResult: ReconciliationResult = {
      ...result,
      xmlInvoice: undefined,
      status: 'Falta XML',
      divergences: ['Nota presente no sistema, mas XML não foi importado para esta empresa.'],
      reconciledBy: undefined,
      reconciledAt: undefined
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "reconciliations", newXmlDocId), newXmlResult);
      batch.update(doc(db, "reconciliations", id), {
        xmlInvoice: deleteField(),
        status: 'Falta XML',
        divergences: updatedTargetResult.divergences,
        reconciledBy: deleteField(),
        reconciledAt: deleteField()
      });
      if (xmlInv.id) {
        batch.update(doc(db, "invoices", xmlInv.id), { erpReconciled: false });
      }
      await batch.commit();

      setReconciliationResults(prev => {
        const newResults = prev.map(r => r.id === id ? updatedTargetResult : r);
        newResults.push(newXmlResult);
        return newResults;
      });
      
      setInvoices(prev => prev.map(inv => inv.id === xmlInv.id ? { ...inv, erpReconciled: false } : inv));
      
      await logAdminAction('Desvinculação de XML Manual', {
        reconciliationId: id,
        invoiceNumber: xmlInv.invoiceNumber
      });
    } catch (e) {
      console.error(e);
      alert("Erro ao desvincular XML.");
    }
  };

  const handleSystemFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!reconciliationCompany) {
      alert("Por favor, selecione a Empresa (ERP) antes de importar o CSV.");
      if (systemFileInputRef.current) {
        systemFileInputRef.current.value = "";
      }
      return;
    }

    setPendingImportFile(file);
    setShowImportConfirmModal(true);
    if (systemFileInputRef.current) {
      systemFileInputRef.current.value = "";
    }
  };

  const processSystemFile = (file: File) => {
    setReconciling(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target?.result as string;
      
      const lines = text.split('\n');
      
      // Find the header line index (it should contain 'Fornecedor' and 'NF')
      let headerIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Fornecedor') && lines[i].includes('NF')) {
          headerIndex = i;
          break;
        }
      }
      
      const textToParse = lines.slice(headerIndex).join('\n');

      Papa.parse(textToParse, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsedData = results.data as any[];
          const systemInvoices: SystemInvoice[] = parsedData.map(row => {
            const parseCurrency = (val: string) => {
              if (!val) return 0;
              const cleanVal = String(val).replace(/\./g, '').replace(',', '.');
              return parseFloat(cleanVal) || 0;
            };

            const nfKey = Object.keys(row).find(k => k.includes('NF'));
            const cnpjKey = Object.keys(row).find(k => {
              const upper = k.toUpperCase();
              return upper.includes('CNPJ') || upper.includes('CGC') || (upper.includes('FORNECEDOR') && k !== 'Fornecedor');
            });
            
            return {
              emissao: row['Emissão'] || '',
              fornecedor: row['Fornecedor'] || '',
              cnpjFornecedor: cnpjKey ? row[cnpjKey] : '',
              numero: row['Nº NF'] || row['N NF'] || (nfKey ? row[nfKey] : ''),
              pis: parseCurrency(row['PIS_RETIDO']),
              cofins: parseCurrency(row['COFINS_RETIDO']),
              csll: parseCurrency(row['CONTRIB_SOCIAL_RETIDO']),
              irrf: parseCurrency(row['IRRF']),
              iss: parseCurrency(row['ISS']),
              inss: parseCurrency(row['INSS']),
            };
          }).filter(inv => inv.numero || inv.fornecedor);

          reconcileData(systemInvoices);
          setReconciling(false);
          setShowImportConfirmModal(false);
          setPendingImportFile(null);
        },
        error: (err) => {
          console.error("Error parsing CSV:", err);
          alert("Erro ao ler o arquivo CSV.");
          setReconciling(false);
        }
      });
    };
    reader.onerror = () => {
      alert("Erro ao ler o arquivo.");
      setReconciling(false);
    };
    reader.readAsText(file, 'ISO-8859-1'); // Usually Brazilian CSVs are in ISO-8859-1
  };

  const reconcileData = async (systemInvoices: SystemInvoice[]) => {
    // Check if the selected month is locked for this company
    const isLocked = closedMonths.some(cm => cm.cnpj === reconciliationCompany && cm.competence === selectedCompetence);
    if (isLocked) {
      alert(`O mês de competência ${selectedCompetence} está fechado/travado para esta empresa. Não é possível realizar novas conciliações.`);
      return;
    }

    const results: ReconciliationResult[] = [];
    
    const normalizeString = (str: string) => str.toLowerCase().trim().replace(/[^\w\s]/gi, '');
    
    // Get existing recons to preserve state and justifications
    const existingRecons = reconciliationResults.filter(r => 
      r.takerCnpj === reconciliationCompany && r.competence === selectedCompetence
    );
    const existingReconsMap = new Map<string, ReconciliationResult>(existingRecons.map(r => [r.id as string, r]));

    const compareInvoiceNumbers = (xmlNum: string, sysNum: string) => {
      if (!xmlNum || !sysNum) return false;
      if (xmlNum === sysNum) return true;
      if (Number(xmlNum) === Number(sysNum)) return true;
      const cleanXmlNum = xmlNum.replace(/^(20\d{2}|\d{2})0+/, '');
      if (cleanXmlNum === sysNum) return true;
      if (Number(cleanXmlNum) === Number(sysNum)) return true;
      return false;
    };

    const xmlMap = new Map<string, InvoiceData[]>();
    const globalXmlMap = new Map<string, InvoiceData[]>();
    
    // Use ALL invoices for the company to catch those with wrong issueDate/competence
    const companyInvoices = reconciliationCompany 
      ? invoices.filter(inv => inv.takerCnpj.replace(/[^\d]/g, '') === reconciliationCompany)
      : invoices;

    companyInvoices.forEach(inv => {
      const cleanCnpj = inv.providerCnpj.replace(/[^\d]/g, '');
      const keyByCnpj = `${cleanCnpj}`;
      const keyByName = `${normalizeString(inv.providerName)}`;
      
      if (!xmlMap.has(keyByCnpj)) xmlMap.set(keyByCnpj, []);
      xmlMap.get(keyByCnpj)?.push(inv);
      
      if (!xmlMap.has(keyByName)) xmlMap.set(keyByName, []);
      xmlMap.get(keyByName)?.push(inv);
    });

    invoices.forEach(inv => {
      const cleanCnpj = inv.providerCnpj.replace(/[^\d]/g, '');
      const keyByCnpj = `${cleanCnpj}`;
      const keyByName = `${normalizeString(inv.providerName)}`;
      
      if (!globalXmlMap.has(keyByCnpj)) globalXmlMap.set(keyByCnpj, []);
      globalXmlMap.get(keyByCnpj)?.push(inv);
      
      if (!globalXmlMap.has(keyByName)) globalXmlMap.set(keyByName, []);
      globalXmlMap.get(keyByName)?.push(inv);
    });

    const processedXmlKeys = new Set<string>();
    const invoicesToUpdate: InvoiceData[] = [];

    // Detect duplicates in system invoices
    const sysInvFrequency = new Map<string, number>();
    systemInvoices.forEach(sysInv => {
      const cleanSysCnpj = sysInv.cnpjFornecedor ? sysInv.cnpjFornecedor.replace(/[^\d]/g, '') : '';
      const keyByCnpj = cleanSysCnpj ? `${cleanSysCnpj}_${sysInv.numero}` : '';
      const keyByName = `${normalizeString(sysInv.fornecedor)}_${sysInv.numero}`;
      const key = keyByCnpj || keyByName;
      
      sysInvFrequency.set(key, (sysInvFrequency.get(key) || 0) + 1);
    });

    const docIdCounts = new Map<string, number>();

    systemInvoices.forEach((sysInv, index) => {
      const cleanSysCnpj = sysInv.cnpjFornecedor ? sysInv.cnpjFornecedor.replace(/[^\d]/g, '') : '';
      const keyByCnpj = cleanSysCnpj ? `${cleanSysCnpj}` : '';
      const keyByName = `${normalizeString(sysInv.fornecedor)}`;
      
      // Find matching XML using the new compareInvoiceNumbers logic
      let xmlInv = undefined;
      const possibleXmls = (keyByCnpj && xmlMap.get(keyByCnpj)) || xmlMap.get(keyByName) || [];
      xmlInv = possibleXmls.find(x => compareInvoiceNumbers(x.invoiceNumber, sysInv.numero));

      const keyForFreq = (cleanSysCnpj ? `${cleanSysCnpj}_${sysInv.numero}` : '') || `${normalizeString(sysInv.fornecedor)}_${sysInv.numero}`;
      const isDuplicate = (sysInvFrequency.get(keyForFreq) || 0) > 1;
      
      const providerName = normalizeString(sysInv.fornecedor || xmlInv?.providerName || '');
      const invoiceNum = sysInv.numero || xmlInv?.invoiceNumber || '';
      const baseDocId = `recon_${reconciliationCompany}_${providerName}_${invoiceNum}`;
      
      const count = (docIdCounts.get(baseDocId) || 0) + 1;
      docIdCounts.set(baseDocId, count);
      const docId = count > 1 ? `${baseDocId}_${count}` : baseDocId;
      
      const existing = existingReconsMap.get(docId);

      // CUTOFF DATE LOGIC: Do not flag as "Falta XML" if the system invoice issue date is before 01/03/2026
      const isBeforeCutoff = (dateStr: string) => {
        if (!dateStr) return false;
        let d: Date;
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
          } else {
            d = new Date(dateStr);
          }
        } else {
          d = new Date(dateStr);
        }
        return d < new Date('2026-03-01T00:00:00');
      };

      if (!xmlInv) {
        if (isBeforeCutoff(sysInv.emissao)) {
          return; // Skip this invoice entirely, don't flag as Falta XML
        }

        const possibleGlobalXmls = (keyByCnpj && globalXmlMap.get(keyByCnpj)) || globalXmlMap.get(keyByName) || [];
        const globalXmlInv = possibleGlobalXmls.find(x => compareInvoiceNumbers(x.invoiceNumber, sysInv.numero));
        let status = globalXmlInv ? 'Divergente' : 'Falta XML';
        let justification = existing?.justification;
        
        if (existing && existing.justification && existing.status === 'Conciliado') {
           status = 'Conciliado';
        }

        let divergenceMsg = 'Nota presente no sistema, mas XML não foi importado para esta empresa.';
        if (globalXmlInv) {
          const isSameCompany = globalXmlInv.takerCnpj.replace(/[^\d]/g, '') === reconciliationCompany;
          if (isSameCompany) {
            divergenceMsg = `Lançada na competência errada. A nota pertence à competência ${globalXmlInv.competence}.`;
          } else {
            divergenceMsg = `Lançada na empresa errada. A nota pertence à empresa ${globalXmlInv.takerName} (${globalXmlInv.takerCnpj}).`;
          }
        }

        const result: ReconciliationResult = {
          id: docId,
          systemInvoice: sysInv,
          status: status as any,
          divergences: [
            divergenceMsg,
            ...(isDuplicate ? ['Lançamento em duplicidade no ERP.'] : [])
          ],
          takerCnpj: reconciliationCompany,
          competence: selectedCompetence,
        };
        if (justification) {
          result.justification = justification;
        }
        results.push(result);
      } else {
        const keyToMark = `${xmlInv.providerCnpj.replace(/[^\d]/g, '')}_${xmlInv.invoiceNumber}`;
        processedXmlKeys.add(keyToMark);
        
        const divergences: string[] = [];
        const errors: string[] = [];
        const tolerance = 0.05; 
        
        if (isDuplicate) {
          divergences.push('Lançamento em duplicidade no ERP.');
          errors.push('Lançamento em duplicidade no ERP.');
        }

        // CSRF Aggregation Logic
        const sysCsrf = sysInv.pis + sysInv.cofins + sysInv.csll;
        let xmlCsrf = xmlInv.retentions.pis + xmlInv.retentions.cofins + xmlInv.retentions.csll;
        
        // Regra: se a soma do sistema for igual à tag CSLL do XML, a tag CSLL contém o total (PCC)
        const isCsllSumOfCsrf = Math.abs(sysCsrf - xmlInv.retentions.csll) <= tolerance && sysCsrf > 0;
        
        if (isCsllSumOfCsrf) {
          xmlCsrf = xmlInv.retentions.csll;
        }

        if (Math.abs(sysCsrf - xmlCsrf) > tolerance) {
          if (xmlCsrf > 0 && xmlCsrf < 10 && sysCsrf <= tolerance) {
            divergences.push(`PCC (CSRF) inferior a R$ 10,00 (${formatCurrency(xmlCsrf)}). Não há retenção no ERP.`);
          } else {
            if (Math.abs(sysInv.pis - xmlInv.retentions.pis) > tolerance) {
              divergences.push(`PIS divergente: Sist (${formatCurrency(sysInv.pis)}) vs XML (${formatCurrency(xmlInv.retentions.pis)})`);
              errors.push('PIS');
            }
            if (Math.abs(sysInv.cofins - xmlInv.retentions.cofins) > tolerance) {
              divergences.push(`COFINS divergente: Sist (${formatCurrency(sysInv.cofins)}) vs XML (${formatCurrency(xmlInv.retentions.cofins)})`);
              errors.push('COFINS');
            }
            if (Math.abs(sysInv.csll - xmlInv.retentions.csll) > tolerance) {
              divergences.push(`CSLL divergente: Sist (${formatCurrency(sysInv.csll)}) vs XML (${formatCurrency(xmlInv.retentions.csll)})`);
              errors.push('CSLL');
            }
          }
        }

        if (Math.abs(sysInv.irrf - xmlInv.retentions.ir) > tolerance) {
          if (xmlInv.retentions.ir > 0 && xmlInv.retentions.ir < 10 && sysInv.irrf <= tolerance) {
            divergences.push(`IRRF inferior a R$ 10,00 (${formatCurrency(xmlInv.retentions.ir)}). Não há retenção no ERP.`);
          } else {
            divergences.push(`IRRF divergente: Sist (${formatCurrency(sysInv.irrf)}) vs XML (${formatCurrency(xmlInv.retentions.ir)})`);
            errors.push('IRRF');
          }
        }
        if (Math.abs(sysInv.iss - xmlInv.retentions.iss) > tolerance) {
          divergences.push(`ISS divergente: Sist (${formatCurrency(sysInv.iss)}) vs XML (${formatCurrency(xmlInv.retentions.iss)})`);
          errors.push('ISS');
        }
        if (Math.abs(sysInv.inss - xmlInv.retentions.inss) > tolerance) {
          divergences.push(`INSS divergente: Sist (${formatCurrency(sysInv.inss)}) vs XML (${formatCurrency(xmlInv.retentions.inss)})`);
          errors.push('INSS');
        }

        let status = errors.length > 0 ? 'Divergente' : 'Conciliado';
        let justification = existing?.justification;
        if (existing && existing.justification && existing.status === 'Conciliado') {
           status = 'Conciliado';
        }

        const result: ReconciliationResult = {
          id: docId,
          xmlInvoice: xmlInv,
          systemInvoice: sysInv,
          status: status as any,
          divergences,
          takerCnpj: xmlInv.takerCnpj,
          takerName: xmlInv.takerName,
          competence: selectedCompetence,
        };
        if (justification) {
          result.justification = justification;
        }
        results.push(result);

        if (!xmlInv.erpReconciled || xmlInv.competence !== selectedCompetence) {
          invoicesToUpdate.push({ ...xmlInv, erpReconciled: true, competence: selectedCompetence });
        }
      }
    });

    // Process XMLs not in CSV
    companyInvoices.forEach(inv => {
      const cleanCnpj = inv.providerCnpj.replace(/[^\d]/g, '');
      const keyToMark = `${cleanCnpj}_${inv.invoiceNumber}`;
      
      if (!processedXmlKeys.has(keyToMark)) {
        const providerName = normalizeString(inv.providerName);
        const baseDocId = `recon_${reconciliationCompany}_${providerName}_${inv.invoiceNumber}`;
        
        const count = (docIdCounts.get(baseDocId) || 0) + 1;
        docIdCounts.set(baseDocId, count);
        const docId = count > 1 ? `${baseDocId}_${count}` : baseDocId;
        
        const existing = existingReconsMap.get(docId);

        // If it already exists in the database (e.g., from a previous CSV import this week),
        // we DO NOT overwrite it with "Não Lançado". We just leave it alone.
        if (!existing) {
           // We only create "Não Lançado" if it's a completely new XML that has never been reconciled
           // AND its competence matches the selected one.
           if (inv.competence === selectedCompetence) {
             results.push({
               id: docId,
               xmlInvoice: inv,
               status: 'Não Lançado',
               divergences: ['Nota importada via XML, mas não encontrada no relatório do sistema.'],
               takerCnpj: inv.takerCnpj,
               takerName: inv.takerName,
               competence: selectedCompetence,
             });
           }
        }
      }
    });

    // Save to Firestore
    try {
      const batch = writeBatch(db);
      
      results.forEach(res => {
        if (res.id) {
          const docRef = doc(db, "reconciliations", res.id);
          batch.set(docRef, res, { merge: true });
        }
      });
      
      await batch.commit();
      
      // Update local state by merging
      setReconciliationResults(prev => {
        const newMap = new Map(prev.map(r => [r.id, r]));
        results.forEach(r => {
          if (r.id) newMap.set(r.id, r);
        });
        return Array.from(newMap.values());
      });
    } catch (err) {
      console.error("Error saving reconciliations:", err);
    }

    setActiveTab('reconciliation');

    // Update erpReconciled status in Firebase
    if (invoicesToUpdate.length > 0) {
      try {
        const batch = writeBatch(db);
        invoicesToUpdate.forEach(inv => {
          if (inv.id) {
            batch.update(doc(db, "invoices", inv.id), { 
              erpReconciled: true,
              competence: selectedCompetence 
            });
          }
        });
        await batch.commit();
        setInvoices(prev => prev.map(inv => {
          const updated = invoicesToUpdate.find(u => u.id === inv.id);
          return updated ? updated : inv;
        }));
      } catch (err) {
        console.error("Error updating erpReconciled status:", err);
      }
    }
  };

  const handleAutoReconcile = async () => {
    if (!reconciliationCompany) {
      alert("Selecione uma empresa (Tomador) para conciliar.");
      return;
    }
    
    // Check if the selected month is locked for this company
    const isLocked = closedMonths.some(cm => cm.cnpj === reconciliationCompany && cm.competence === selectedCompetence);
    if (isLocked) {
      alert(`O mês de competência ${selectedCompetence} está fechado/travado para esta empresa. Não é possível realizar novas conciliações.`);
      return;
    }

    const existingSystemInvoices = reconciliationResults
      .filter(r => r.systemInvoice && r.takerCnpj === reconciliationCompany && r.competence === selectedCompetence)
      .map(r => r.systemInvoice!);

    if (existingSystemInvoices.length === 0) {
      alert("Nenhum dado do sistema (ERP) encontrado para esta empresa e competência. Importe o CSV primeiro.");
      return;
    }

    setReconciling(true);
    try {
      await reconcileData(existingSystemInvoices);
      alert("Conciliação automática concluída com sucesso!");
    } catch (err) {
      console.error(err);
      alert("Erro ao realizar conciliação automática.");
    } finally {
      setReconciling(false);
    }
  };

  const handleClearCompanyReconciliation = async () => {
    if (!reconciliationCompany) {
      alert("Selecione uma empresa (Tomador) para limpar os dados.");
      return;
    }
    
    const isLocked = closedMonths.some(cm => cm.cnpj === reconciliationCompany && cm.competence === selectedCompetence);
    if (isLocked) {
      alert(`O mês de competência ${selectedCompetence} está fechado/travado para esta empresa. Não é possível limpar os dados.`);
      return;
    }

    const comp = companies.find(c => c.cnpj === reconciliationCompany);
    const companyName = comp ? (comp.identifier || comp.name) : reconciliationCompany;
    if (!confirm(`Tem certeza que deseja limpar TODOS os dados importados (XMLs e Conciliação) da empresa ${companyName} para a competência ${selectedCompetence}?`)) return;

    try {
      setReconciling(true);
      const batch = writeBatch(db);
      let hasData = false;

      // 1. Delete Reconciliations
      const qRecon = query(
        collection(db, "reconciliations"), 
        where("takerCnpj", "==", reconciliationCompany),
        where("competence", "==", selectedCompetence)
      );
      const snapshotRecon = await getDocs(qRecon);
      snapshotRecon.docs.forEach(doc => {
        batch.delete(doc.ref);
        hasData = true;
      });

      // 2. Delete Invoices (XMLs)
      const qInv = query(
        collection(db, "invoices"),
        where("competence", "==", selectedCompetence)
      );
      const snapshotInv = await getDocs(qInv);
      snapshotInv.docs.forEach(doc => {
        const data = doc.data();
        if (data.takerCnpj && data.takerCnpj.replace(/[^\d]/g, '') === reconciliationCompany) {
          batch.delete(doc.ref);
          hasData = true;
        }
      });

      if (!hasData) {
        alert("Nenhum dado encontrado para esta empresa nesta competência.");
        setReconciling(false);
        return;
      }

      await batch.commit();
      
      setReconciliationResults(prev => prev.filter(r => !(r.takerCnpj === reconciliationCompany && r.competence === selectedCompetence)));
      setInvoices(prev => prev.filter(inv => !(inv.takerCnpj.replace(/[^\d]/g, '') === reconciliationCompany && inv.competence === selectedCompetence)));
      
      alert("Dados da empresa limpos com sucesso.");
    } catch (err) {
      console.error("Error clearing company data:", err);
      alert("Erro ao limpar dados.");
    } finally {
      setReconciling(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!batchDeleteStartDate || !batchDeleteEndDate) {
      alert("Por favor, selecione a data de início e fim.");
      return;
    }

    const start = new Date(batchDeleteStartDate);
    const end = new Date(batchDeleteEndDate);
    end.setHours(23, 59, 59, 999);

    const invoicesToDelete = invoices.filter(inv => {
      if (inv.erpReconciled) return false; // Only delete open/unreconciled invoices
      const issueDate = new Date(inv.issueDate);
      return issueDate >= start && issueDate <= end;
    });

    if (invoicesToDelete.length === 0) {
      alert("Nenhuma nota em aberto encontrada neste período.");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir ${invoicesToDelete.length} notas em aberto deste período?`)) return;

    setIsBatchDeleting(true);
    try {
      const chunkSize = 400;
      for (let i = 0; i < invoicesToDelete.length; i += chunkSize) {
        const chunk = invoicesToDelete.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((inv) => {
          if (inv.id) {
            batch.delete(doc(db, "invoices", inv.id));
          }
        });
        await batch.commit();
      }
      
      setInvoices(prev => prev.filter(inv => !invoicesToDelete.find(d => d.id === inv.id)));
      alert(`${invoicesToDelete.length} notas excluídas com sucesso.`);
      setBatchDeleteStartDate("");
      setBatchDeleteEndDate("");
    } catch (err) {
      console.error("Error batch deleting:", err);
      alert("Erro ao excluir notas em lote.");
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleClearDatabase = async () => {
    if (clearDbConfirmText.toLowerCase() !== "confirmo") {
      alert("Texto de confirmação incorreto. Digite 'confirmo' para prosseguir.");
      return;
    }
    
    setClearingDb(true);
    try {
      const chunkSize = 400;
      
      // Delete invoices
      for (let i = 0; i < invoices.length; i += chunkSize) {
        const chunk = invoices.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((inv) => {
          if (inv.id) {
            batch.delete(doc(db, "invoices", inv.id));
          }
        });
        await batch.commit();
      }
      
      // Delete reconciliations
      for (let i = 0; i < reconciliationResults.length; i += chunkSize) {
        const chunk = reconciliationResults.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((recon) => {
          if (recon.id) {
            batch.delete(doc(db, "reconciliations", recon.id));
          }
        });
        await batch.commit();
      }

      setInvoices([]);
      setReconciliationResults([]);
      setShowClearDbModal(false);
      setClearDbConfirmText("");
      alert("Banco de dados apagado com sucesso.");
    } catch (err) {
      console.error("Error clearing database:", err);
      alert("Erro ao apagar banco de dados.");
    } finally {
      setClearingDb(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      inv.providerCnpj.toLowerCase().includes(term) ||
      inv.invoiceNumber.toLowerCase().includes(term) ||
      inv.providerName.toLowerCase().includes(term) ||
      inv.takerName.toLowerCase().includes(term) ||
      inv.takerCnpj.toLowerCase().includes(term);

    const matchesRetention = 
      retentionFilter === 'all' ? true :
      retentionFilter === 'with' ? inv.retentions.total > 0 :
      inv.retentions.total === 0;

    const anySpecificFilterActive = Object.values(retentionFilters).some(v => v);
    let matchesSpecificRetentions = true;
    if (anySpecificFilterActive) {
      matchesSpecificRetentions = 
        (retentionFilters.iss && inv.retentions.iss > 0) ||
        (retentionFilters.pis && inv.retentions.pis > 0) ||
        (retentionFilters.cofins && inv.retentions.cofins > 0) ||
        (retentionFilters.csll && inv.retentions.csll > 0) ||
        (retentionFilters.irrf && inv.retentions.ir > 0) ||
        (retentionFilters.inss && inv.retentions.inss > 0);
    }

    let matchesDate = true;
    if (dateStart && inv.issueDate < dateStart) matchesDate = false;
    if (dateEnd && inv.issueDate > dateEnd) matchesDate = false;

    let matchesCompany = true;
    if (reconciliationCompany) {
      const cleanTakerCnpj = inv.takerCnpj.replace(/[^\d]/g, '');
      const selectedClean = reconciliationCompany.replace(/[^\d]/g, '');
      matchesCompany = cleanTakerCnpj === selectedClean;
    }

    return matchesSearch && matchesRetention && matchesDate && matchesSpecificRetentions && matchesCompany;
  });

  const exportToExcel = () => {
    if (filteredInvoices.length === 0) {
      alert(`Nenhuma nota para exportar com os filtros atuais.`);
      return;
    }

    const dataToExport = filteredInvoices.map(inv => ({
      'Tomador': inv.takerName,
      'CNPJ Tomador': inv.takerCnpj,
      'Fornecedor': inv.providerName,
      'CNPJ Fornecedor': inv.providerCnpj,
      'Nº Nota': inv.invoiceNumber,
      'Data Emissão': formatDate(inv.issueDate),
      'Valor Serviço': inv.serviceValue,
      'Total Retenções': inv.retentions.total,
      'ISS': inv.retentions.iss,
      'IRRF': inv.retentions.ir,
      'INSS': inv.retentions.inss,
      'CSRF (PIS+COFINS+CSLL)': inv.retentions.pis + inv.retentions.cofins + inv.retentions.csll,
      'PIS': inv.retentions.pis,
      'COFINS': inv.retentions.cofins,
      'CSLL': inv.retentions.csll,
      'Arquivo': inv.fileName
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas");
    XLSX.writeFile(wb, `relatorio_notas.xlsx`);
  };

  // Grouping logic
  const groupedInvoices = filteredInvoices.reduce((acc, inv) => {
    const key = groupBy === 'taker' 
      ? (inv.takerCnpj || "CNPJ Não Identificado") 
      : (inv.issueDate || "Data Não Identificada");
    
    if (!acc[key]) acc[key] = [];
    acc[key].push(inv);
    return acc;
  }, {} as Record<string, InvoiceData[]>);

  // Sort groups (Dates descending, CNPJs ascending)
  const sortedGroupKeys = Object.keys(groupedInvoices).sort((a, b) => {
    if (groupBy === 'date') return b.localeCompare(a);
    return a.localeCompare(b);
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getGroupDisplayName = (key: string, invoicesInGroup: InvoiceData[]) => {
    if (groupBy === 'taker') {
      const name = invoicesInGroup[0]?.takerName || "Nome Não Identificado";
      return `${key} - ${name}`;
    } else {
      return formatDate(key);
    }
  };

  // Chart Data Preparation
  const groupedByTakerForChart = filteredInvoices.reduce((acc, inv) => {
    const key = inv.takerCnpj || "Não Identificado";
    if (!acc[key]) acc[key] = { name: key, Serviços: 0, Retenções: 0, Liquido: 0 };
    acc[key].Serviços += inv.serviceValue;
    acc[key].Retenções += inv.retentions.total;
    acc[key].Liquido += (inv.serviceValue - inv.retentions.total);
    return acc;
  }, {} as Record<string, { name: string, Serviços: number, Retenções: number, Liquido: number }>);

  const chartData = (Object.values(groupedByTakerForChart) as { name: string, Serviços: number, Retenções: number, Liquido: number }[])
    .sort((a, b) => b.Serviços - a.Serviços)
    .slice(0, 10)
    .map(item => ({
      ...item,
      name: item.name // Keep CNPJ as name for the chart
    }));

  const totalISS = filteredInvoices.reduce((acc, inv) => acc + inv.retentions.iss, 0);
  const totalIRRF = filteredInvoices.reduce((acc, inv) => acc + inv.retentions.ir, 0);
  const totalINSS = filteredInvoices.reduce((acc, inv) => acc + inv.retentions.inss, 0);
  const totalCSRF = filteredInvoices.reduce((acc, inv) => acc + inv.retentions.pis + inv.retentions.cofins + inv.retentions.csll, 0);

  const retentionTypeData = [
    { name: 'ISS', value: totalISS, color: '#3b82f6' },
    { name: 'IRRF', value: totalIRRF, color: '#ef4444' },
    { name: 'INSS', value: totalINSS, color: '#f59e0b' },
    { name: 'CSRF', value: totalCSRF, color: '#10b981' },
  ].filter(d => d.value > 0);

  if (loading && invoices.length === 0 && companies.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 flex-col gap-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-medium">Carregando aplicação...</p>
      </div>
    );
  }

  if (!user && !loading) {
    return <LoginView requirePasswordChange={requirePasswordChange} setRequirePasswordChange={setRequirePasswordChange} />;
  }

  if (user && !reconciliationCompany) {
    // Generate dashboard data based on roots
    const rootAnalytics = companies.reduce((acc, c) => {
      const root = c.rootCnpj;
      if (!acc[root]) acc[root] = { rootCnpj: root, companies: 0, totalInvoices: 0, reconciled: 0, divergent: 0, missingXml: 0, unlaunched: 0 };
      acc[root].companies += 1;
      return acc;
    }, {} as Record<string, any>);

    reconciliationResults.forEach(r => {
      const cleanTaker = r.takerCnpj?.replace(/[^\d]/g, '') || '';
      const root = cleanTaker.substring(0, 8);
      if (rootAnalytics[root]) {
        rootAnalytics[root].totalInvoices++;
        if (r.status === 'Conciliado') rootAnalytics[root].reconciled++;
        if (r.status === 'Divergente') rootAnalytics[root].divergent++;
        if (r.status === 'Falta XML') rootAnalytics[root].missingXml++;
        if (r.status === 'Não Lançado') rootAnalytics[root].unlaunched++;
        
        // Compute retentions
        const reten = r.systemInvoice?.valorRetencoes || r.xmlInvoice?.retentions?.total || 0;
        if (reten > 0) {
           rootAnalytics[root].retentionsTotal = (rootAnalytics[root].retentionsTotal || 0) + reten;
           if (r.status === 'Não Lançado') {
              rootAnalytics[root].retentionsUnlaunched = (rootAnalytics[root].retentionsUnlaunched || 0) + reten;
           } else {
              rootAnalytics[root].retentionsLaunched = (rootAnalytics[root].retentionsLaunched || 0) + reten;
           }
        }
      }
    });
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
           <div className="max-w-[1600px] w-full mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg shadow-sm">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-800">
                  Conciliador NFS-e
                </h1>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowQuickCompanyModal(true)} 
                  className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Nova Empresa
                </button>
                <button 
                  onClick={() => signOut(auth)} 
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 border border-transparent hover:bg-slate-100 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
                >
                  Sair
                </button>
              </div>
           </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto py-12 px-6 flex flex-col items-center">
           <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
             <Building2 className="w-8 h-8" />
           </div>
           <h2 className="text-3xl font-bold text-slate-800 text-center mb-3">Bem-vindo de volta, {user.email?.split('@')[0]}</h2>
           <p className="text-slate-500 text-center mb-8 max-w-md">Selecione a empresa para iniciar a conciliação. Abaixo você vê o resumo atual por grupo (Matriz).</p>
           
           <div className="w-full max-w-md mb-12 relative">
             <label className="block text-sm font-medium text-slate-700 mb-2">Selecione para onde ir:</label>
             <div className="relative">
               <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <select
                 value={reconciliationCompany}
                 onChange={(e) => setReconciliationCompany(e.target.value)}
                 className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-medium text-slate-800"
               >
                 <option value="" disabled>Escolha uma empresa, matriz ou filial...</option>
                 {companies.sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                   <option key={c.cnpj} value={c.cnpj}>
                     {c.identifier || c.name} ({c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")})
                   </option>
                 ))}
               </select>
               <ChevronDown className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
             </div>
           </div>

           <div className="w-full space-y-4">
              <h3 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">Resumo por Grupo Empresarial</h3>
              {Object.keys(rootAnalytics).length === 0 ? (
                <div className="text-center p-8 bg-white rounded-2xl border border-dashed border-slate-300">
                   <p className="text-slate-500">Nenhum dado importado para exibir resumo.</p>
                </div>
              ) : (
                Object.values(rootAnalytics).map((root: any) => (
                  <div key={root.rootCnpj} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-5 h-5 text-slate-400" />
                        <h4 className="font-bold text-slate-800 text-lg">Matriz Base: {root.rootCnpj}</h4>
                      </div>
                      <p className="text-sm text-slate-500">Filiais vinculadas: {root.companies} | Total Títulos: {root.totalInvoices}</p>
                    </div>
                    
                    <div className="flex flex-wrap lg:flex-nowrap gap-4 w-full xl:w-auto items-center">
                      <div className="flex gap-4 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0">
                        <div 
                          onClick={() => {
                            const company = companies.find(c => c.rootCnpj === root.rootCnpj);
                            if (company) {
                              setReconciliationCompany(company.cnpj);
                              setActiveTab('reconciliation');
                              setReconciliationStatusFilter('Conciliado');
                            }
                          }}
                          className="flex-1 lg:flex-none min-w-[100px] p-3 bg-green-50 border border-green-100 rounded-xl text-center cursor-pointer hover:bg-green-100 transition-colors"
                        >
                        <p className="text-xs font-semibold text-green-700 mb-1 uppercase">Conciliados</p>
                        <p className="text-xl font-bold text-green-800">{root.reconciled}</p>
                      </div>
                      <div 
                        onClick={() => {
                          const company = companies.find(c => c.rootCnpj === root.rootCnpj);
                          if (company) {
                            setReconciliationCompany(company.cnpj);
                            setActiveTab('reconciliation');
                            setReconciliationStatusFilter('Divergente');
                          }
                        }}
                        className="flex-1 lg:flex-none min-w-[100px] p-3 bg-amber-50 border border-amber-100 rounded-xl text-center cursor-pointer hover:bg-amber-100 transition-colors"
                      >
                        <p className="text-xs font-semibold text-amber-700 mb-1 uppercase">Divergentes</p>
                        <p className="text-xl font-bold text-amber-800">{root.divergent}</p>
                      </div>
                      <div 
                        onClick={() => {
                          const company = companies.find(c => c.rootCnpj === root.rootCnpj);
                          if (company) {
                            setReconciliationCompany(company.cnpj);
                            setActiveTab('reconciliation');
                            setReconciliationStatusFilter('Não Lançado');
                          }
                        }}
                        className="flex-1 lg:flex-none min-w-[100px] p-3 bg-blue-50 border border-blue-100 rounded-xl text-center cursor-pointer hover:bg-blue-100 transition-colors"
                      >
                        <p className="text-xs font-semibold text-blue-700 mb-1 uppercase">Não Lançados</p>
                        <p className="text-xl font-bold text-blue-800">{root.unlaunched}</p>
                      </div>
                      <div 
                        onClick={() => {
                          const company = companies.find(c => c.rootCnpj === root.rootCnpj);
                          if (company) {
                            setReconciliationCompany(company.cnpj);
                            setActiveTab('reconciliation');
                            setReconciliationStatusFilter('Falta XML');
                          }
                        }}
                        className="flex-1 lg:flex-none min-w-[100px] p-3 bg-red-50 border border-red-100 rounded-xl text-center cursor-pointer hover:bg-red-100 transition-colors"
                      >
                        <p className="text-xs font-semibold text-red-700 mb-1 uppercase">Falta XML</p>
                        <p className="text-xl font-bold text-red-800">{root.missingXml}</p>
                      </div>
                    </div>
                    
                    {(root.retentionsTotal > 0) && (
                      <div className="flex gap-4 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 mt-4 xl:mt-0 xl:ml-2 xl:border-l xl:border-slate-200 xl:pl-6">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">Retenções (R$)</p>
                          <div className="flex gap-3">
                            <div className="min-w-[110px] p-3 bg-slate-50 border border-slate-200 rounded-xl">
                              <p className="text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider block">Total Retido</p>
                              <p className="text-lg font-bold text-slate-800">{formatCurrency(root.retentionsTotal)}</p>
                            </div>
                            <div className="min-w-[110px] p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                              <p className="text-[10px] font-bold text-emerald-700 mb-1 uppercase tracking-wider block flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Lançadas</p>
                              <p className="text-lg font-bold text-emerald-800">{formatCurrency(root.retentionsLaunched || 0)}</p>
                            </div>
                            <div className="min-w-[110px] p-3 bg-rose-50 border border-rose-100 rounded-xl">
                              <p className="text-[10px] font-bold text-rose-700 mb-1 uppercase tracking-wider block flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Ñ Lançadas</p>
                              <p className="text-lg font-bold text-rose-800">{formatCurrency(root.retentionsUnlaunched || 0)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                ))
              )}
           </div>
        </main>

        {showQuickCompanyModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            {/* Quick company modal logic will render fine here */}
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  Nova Empresa
                </h3>
                <button onClick={() => setShowQuickCompanyModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ *</label>
                  <input
                    type="text"
                    value={quickCompanyData.cnpj}
                    onChange={(e) => setQuickCompanyData({ ...quickCompanyData, cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Razão Social *</label>
                  <input
                    type="text"
                    value={quickCompanyData.name}
                    onChange={(e) => setQuickCompanyData({ ...quickCompanyData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apelido/Identificador (Opcional)</label>
                  <input
                    type="text"
                    value={quickCompanyData.identifier}
                    onChange={(e) => setQuickCompanyData({ ...quickCompanyData, identifier: e.target.value })}
                    placeholder="Ex: Matriz SP"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleQuickCompanyAdd}
                    className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex justify-center items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Salvar e Selecionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragActive && (
        <div className="absolute inset-0 z-[100] bg-blue-500/10 backdrop-blur-[2px] border-4 border-dashed border-blue-500 flex items-center justify-center m-4 rounded-2xl pointer-events-none transition-all">
           <div className="bg-white p-10 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center">
             <div className="p-4 bg-blue-50 rounded-full mb-4">
               <Upload className="w-12 h-12 text-blue-500 animate-bounce" />
             </div>
             <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Solte os arquivos</h2>
             <p className="text-slate-500 mt-2 font-medium">XML, PDF ou pacotes ZIP para importação inteligente.</p>
           </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30 shadow-sm flex-none">
        <div className="max-w-[1600px] w-full mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-sm">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight text-slate-800 leading-none">
                Conciliador NFS-e
              </h1>
              {reconciliationCompany && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{companies.find(c => c.cnpj === reconciliationCompany)?.identifier || companies.find(c => c.cnpj === reconciliationCompany)?.name} ({reconciliationCompany.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")})</span>
                  <button 
                    onClick={() => setReconciliationCompany("")}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded transition-colors border border-slate-200"
                  >
                    Trocar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 hidden md:flex">
              <button 
                onClick={() => incrementMonth(-1)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
              </button>
              <div className="flex flex-col items-center px-1">
                <label className="text-[10px] font-medium text-slate-500 whitespace-nowrap uppercase tracking-wider mb-0.5 leading-none">Mês Vigente</label>
                <input
                  type="month"
                  value={selectedCompetence}
                  onChange={(e) => setSelectedCompetence(e.target.value)}
                  className="bg-transparent border-none text-sm font-bold text-slate-800 focus:ring-0 p-0 cursor-pointer h-5"
                />
              </div>
              <button 
                onClick={() => incrementMonth(1)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar XML/PDF
            </button>
            <input
              type="file"
              multiple
              accept=".xml, .pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            {user && (
              <button 
                onClick={() => signOut(auth)} 
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors ml-2"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>
      
      {/* Remove the old "Global Filters Bar" since we moved it into the header and selector screen */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 py-6 overflow-x-hidden">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 mb-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="flex flex-wrap gap-1 bg-slate-200/50 p-1 rounded-lg w-fit mb-6 border border-slate-200">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={cn("px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all", activeTab === 'dashboard' ? "bg-white shadow-sm text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
          >
            <LayoutDashboard className="w-4 h-4" />
            Resumo
          </button>
          <button 
            onClick={() => setActiveTab('invoices')} 
            className={cn("px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all", activeTab === 'invoices' ? "bg-white shadow-sm text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
          >
            <List className="w-4 h-4" />
            Notas Fiscais
          </button>
          <button 
            onClick={() => setActiveTab('reconciliation')} 
            className={cn("px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all", activeTab === 'reconciliation' ? "bg-white shadow-sm text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Conciliação
          </button>
          <button 
            onClick={() => setActiveTab('pending')} 
            className={cn("px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all", activeTab === 'pending' ? "bg-white shadow-sm text-blue-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50")}
          >
            <AlertCircle className="w-4 h-4" />
            Pendências ERP
          </button>
          <button 
            onClick={() => setActiveTab('fechamento')} 
            className={cn("px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all", activeTab === 'fechamento' ? "bg-white shadow-sm text-purple-700" : "text-slate-600 hover:text-purple-700 hover:bg-purple-50")}
          >
            <Lock className="w-4 h-4" />
            Fechamento
          </button>
          <button 
            onClick={() => setActiveTab('admin')} 
            className={cn("px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all border-l border-slate-300 ml-1 pl-5", activeTab === 'admin' ? "bg-white shadow-sm text-red-700" : "text-slate-600 hover:text-red-700 hover:bg-red-50")}
          >
            <Settings className="w-4 h-4" />
            Administração / Auditoria
          </button>
          <button 
            onClick={() => setActiveTab('integrations')} 
            className={cn("px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-all", activeTab === 'integrations' ? "bg-white shadow-sm text-blue-700" : "text-slate-600 hover:text-blue-700 hover:bg-blue-50")}
          >
            <Download className="w-4 h-4" />
            Integrações (ERP / Portal)
          </button>
        </div>

        {/* Integrações Tab */}
        {activeTab === 'integrations' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <IntegrationsView />
          </div>
        )}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Dashboard Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 w-full text-slate-700 font-medium text-sm flex items-center gap-3">
                 <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                   <Building2 className="w-4 h-4" />
                 </div>
                 <div>
                   <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Visão Consolidada</p>
                   <p className="font-semibold text-slate-800">
                     {companies.find(c => c.cnpj === reconciliationCompany)?.name || 'Empresa Atual'}
                   </p>
                 </div>
              </div>
              <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0 hidden sm:block">Período de Emissão:</label>
                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                  <input 
                    type="date" 
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    title="Data Inicial"
                    className="bg-white border text-sm border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                  />
                  <span className="text-slate-400 font-medium">-</span>
                  <input 
                    type="date" 
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    title="Data Final"
                    className="bg-white border text-sm border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                  />
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-500">Total de Notas</p>
                  <FileText className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-3xl font-bold text-slate-800">{filteredInvoices.length}</p>
                <p className="text-xs text-slate-400 mt-1">Notas importadas no sistema</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-500">Total de Serviços</p>
                  <Building2 className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-3xl font-bold text-slate-800">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.serviceValue, 0))}</p>
                <p className="text-xs text-slate-400 mt-1">Soma de todos os serviços</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-500">Total de Retenções</p>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-3xl font-bold text-red-600">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.retentions.total, 0))}</p>
                <p className="text-xs text-slate-400 mt-1">Soma de impostos retidos</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-500">Status Semanal</p>
                  <CalendarDays className="w-4 h-4 text-indigo-500" />
                </div>
                {(() => {
                  const totalCompanies = companies.length;
                  if (totalCompanies === 0) return <p className="text-sm text-slate-500 mt-2">Nenhuma empresa</p>;
                  
                  const allCompetences = Array.from(new Set(reconciliationResults.map(r => r.competence))).sort((a, b) => String(b).localeCompare(String(a)));
                  const currentComp = allCompetences.length > 0 ? allCompetences[0] : '';
                  const controlsForComp = Object.values(weeklyControls).filter((c: any) => c.competence === currentComp);
                  
                  const s1Done = controlsForComp.filter((c: any) => c.s1).length;
                  const finalDone = controlsForComp.filter((c: any) => c.final).length;
                  
                  return (
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600">Semana 1 ({currentComp})</span>
                          <span className="font-medium">{s1Done}/{totalCompanies}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(s1Done / totalCompanies) * 100}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600">Fechamento ({currentComp})</span>
                          <span className="font-medium">{finalDone}/{totalCompanies}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(finalDone / totalCompanies) * 100}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Tax Breakdown Cards */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Resumo de Retenções (Analista Fiscal)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">IRRF</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.retentions.ir, 0))}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">PIS</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.retentions.pis, 0))}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">COFINS</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.retentions.cofins, 0))}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">CSLL</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.retentions.csll, 0))}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">INSS</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.retentions.inss, 0))}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">ISS</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(filteredInvoices.reduce((a, b) => a + b.retentions.iss, 0))}</p>
                </div>
              </div>
            </div>

            {/* Chart Section */}
            {invoices.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-800 mb-6">Top 10 Tomadores (Por Valor de Serviço)</h3>
                  <div className="h-[350px] w-full relative">
                    <div className="absolute inset-0">
                      <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
                      <BarChart
                        data={chartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `R$ ${value / 1000}k`} />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          cursor={{ fill: '#f1f5f9' }}
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar dataKey="Liquido" name="Valor Líquido" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={50} />
                        <Bar dataKey="Retenções" name="Retenções" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Document Counter by Taker */}
                <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Contador de Documentos por Tomador</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-medium">Tomador</th>
                          <th className="px-4 py-3 font-medium text-right">Quantidade de Notas</th>
                          <th className="px-4 py-3 font-medium text-right">Valor Total de Serviços</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(Object.entries(
                          filteredInvoices.reduce((acc, inv) => {
                            const key = inv.takerCnpj || "Não Identificado";
                            if (!acc[key]) {
                              acc[key] = { count: 0, total: 0, name: inv.takerName };
                            }
                            acc[key].count += 1;
                            acc[key].total += inv.serviceValue;
                            return acc;
                          }, {} as Record<string, { count: number, total: number, name: string }>)
                        ) as [string, { count: number, total: number, name: string }][]).sort((a, b) => b[1].count - a[1].count).map(([cnpj, data]) => (
                          <tr key={cnpj} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {cnpj} <span className="text-slate-500 font-normal text-xs ml-2">{data.name}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">{data.count}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(data.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Provider Retention Report */}
                <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Relatório de Fornecedores com Retenção</h3>
                    <button
                      onClick={() => {
                        const data = (Object.entries(
                          filteredInvoices.reduce((acc, inv) => {
                            if (inv.retentions.total > 0) {
                              if (!acc[inv.providerName]) {
                                acc[inv.providerName] = { iss: 0, pis: 0, cofins: 0, csll: 0, ir: 0, inss: 0, total: 0 };
                              }
                              acc[inv.providerName].iss += inv.retentions.iss;
                              acc[inv.providerName].pis += inv.retentions.pis;
                              acc[inv.providerName].cofins += inv.retentions.cofins;
                              acc[inv.providerName].csll += inv.retentions.csll;
                              acc[inv.providerName].ir += inv.retentions.ir;
                              acc[inv.providerName].inss += inv.retentions.inss;
                              acc[inv.providerName].total += inv.retentions.total;
                            }
                            return acc;
                          }, {} as Record<string, { iss: number, pis: number, cofins: number, csll: number, ir: number, inss: number, total: number }>)
                        ) as [string, { iss: number, pis: number, cofins: number, csll: number, ir: number, inss: number, total: number }][]).map(([provider, vals]) => ({
                          'Fornecedor': provider,
                          'ISS': vals.iss,
                          'PIS': vals.pis,
                          'COFINS': vals.cofins,
                          'CSLL': vals.csll,
                          'IRRF': vals.ir,
                          'INSS': vals.inss,
                          'Total Retido': vals.total
                        }));

                        if (data.length === 0) {
                          alert("Nenhum dado para exportar.");
                          return;
                        }

                        const ws = XLSX.utils.json_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Retenções por Fornecedor");
                        XLSX.writeFile(wb, `relatorio_fornecedores_retencao.xlsx`);
                      }}
                      className="py-1.5 px-3 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Exportar XLS
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-medium">Fornecedor</th>
                          <th className="px-4 py-3 font-medium text-right">ISS</th>
                          <th className="px-4 py-3 font-medium text-right">PIS</th>
                          <th className="px-4 py-3 font-medium text-right">COFINS</th>
                          <th className="px-4 py-3 font-medium text-right">CSLL</th>
                          <th className="px-4 py-3 font-medium text-right">IRRF</th>
                          <th className="px-4 py-3 font-medium text-right">INSS</th>
                          <th className="px-4 py-3 font-medium text-right">Total Retido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(Object.entries(
                          filteredInvoices.reduce((acc, inv) => {
                            if (inv.retentions.total > 0) {
                              if (!acc[inv.providerName]) {
                                acc[inv.providerName] = { iss: 0, pis: 0, cofins: 0, csll: 0, ir: 0, inss: 0, total: 0 };
                              }
                              acc[inv.providerName].iss += inv.retentions.iss;
                              acc[inv.providerName].pis += inv.retentions.pis;
                              acc[inv.providerName].cofins += inv.retentions.cofins;
                              acc[inv.providerName].csll += inv.retentions.csll;
                              acc[inv.providerName].ir += inv.retentions.ir;
                              acc[inv.providerName].inss += inv.retentions.inss;
                              acc[inv.providerName].total += inv.retentions.total;
                            }
                            return acc;
                          }, {} as Record<string, { iss: number, pis: number, cofins: number, csll: number, ir: number, inss: number, total: number }>)
                        ) as [string, { iss: number, pis: number, cofins: number, csll: number, ir: number, inss: number, total: number }][]).sort((a, b) => b[1].total - a[1].total).map(([provider, data]) => (
                          <tr key={provider} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">{provider}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{data.iss > 0 ? formatCurrency(data.iss) : '-'}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{data.pis > 0 ? formatCurrency(data.pis) : '-'}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{data.cofins > 0 ? formatCurrency(data.cofins) : '-'}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{data.csll > 0 ? formatCurrency(data.csll) : '-'}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{data.ir > 0 ? formatCurrency(data.ir) : '-'}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{data.inss > 0 ? formatCurrency(data.inss) : '-'}</td>
                            <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(data.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Action Bar */}
            <div className="flex justify-end">
               <button
                onClick={exportToExcel}
                className="py-2 px-4 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar Relatório Excel
              </button>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="CNPJ, Nota, Fornecedor..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
                
                <div className="w-full lg:w-auto">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Período de Emissão</label>
                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                    <input 
                      type="date" 
                      value={dateStart}
                      onChange={(e) => setDateStart(e.target.value)}
                      title="Data Inicial"
                      className="bg-white border text-sm border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                    />
                    <span className="text-slate-400 font-medium">-</span>
                    <input 
                      type="date" 
                      value={dateEnd}
                      onChange={(e) => setDateEnd(e.target.value)}
                      title="Data Final"
                      className="bg-white border text-sm border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700"
                    />
                  </div>
                </div>

                <div className="w-full lg:w-48">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status Retenção</label>
                  <div className="relative">
                    <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select 
                      value={retentionFilter}
                      onChange={(e) => setRetentionFilter(e.target.value as any)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none"
                    >
                      <option value="all">Todas as Notas</option>
                      <option value="with">Com Retenção</option>
                      <option value="without">Sem Retenção</option>
                    </select>
                  </div>
                </div>

                <div className="w-full lg:w-48">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Agrupar por</label>
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button 
                      onClick={() => setGroupBy('taker')}
                      className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-colors", groupBy === 'taker' ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700")}
                    >
                      Tomador
                    </button>
                    <button 
                      onClick={() => setGroupBy('date')}
                      className={cn("flex-1 text-xs font-medium py-1.5 rounded-md transition-colors", groupBy === 'date' ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700")}
                    >
                      Data
                    </button>
                  </div>
                </div>
              </div>

              {/* Specific Retention Filters */}
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-medium text-slate-500 mb-2">Filtrar por tipo específico de retenção (Exibe notas que contenham qualquer um dos selecionados):</label>
                <div className="flex flex-wrap gap-4">
                  {[
                    { id: 'iss', label: 'ISS' },
                    { id: 'pis', label: 'PIS' },
                    { id: 'cofins', label: 'COFINS' },
                    { id: 'csll', label: 'CSLL' },
                    { id: 'irrf', label: 'IRRF' },
                    { id: 'inss', label: 'INSS' },
                  ].map((filter) => (
                    <label key={filter.id} className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={retentionFilters[filter.id as keyof typeof retentionFilters]}
                          onChange={(e) => setRetentionFilters(prev => ({ ...prev, [filter.id]: e.target.checked }))}
                          className="peer sr-only"
                        />
                        <div className="w-4 h-4 rounded border border-slate-300 bg-white peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-colors"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 pointer-events-none">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                      </div>
                      <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors font-medium">{filter.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 font-medium">Fornecedor</th>
                      <th className="px-6 py-3 font-medium">CNPJ</th>
                      <th className="px-6 py-3 font-medium">Nº Nota</th>
                      <th className="px-6 py-3 font-medium">Emissão</th>
                      <th className="px-6 py-3 font-medium text-right">Valor Serviço</th>
                      <th className="px-6 py-3 font-medium text-right">Retenções</th>
                      <th className="px-6 py-3 font-medium text-right">Valor Líquido</th>
                      <th className="px-6 py-3 font-medium text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                          Carregando dados...
                        </td>
                      </tr>
                    ) : sortedGroupKeys.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                          Nenhuma nota encontrada com os filtros atuais.
                        </td>
                      </tr>
                    ) : (
                      sortedGroupKeys.map((groupKey) => {
                        const groupInvoices = groupedInvoices[groupKey];
                        const isExpanded = expandedGroups[groupKey] ?? true;
                        const groupTotal = groupInvoices.reduce((acc, inv) => acc + inv.serviceValue, 0);
                        const groupRetentions = groupInvoices.reduce((acc, inv) => acc + inv.retentions.total, 0);
                        const groupLiquid = groupTotal - groupRetentions;

                        return (
                          <Fragment key={groupKey}>
                            {/* Group Header */}
                            <tr 
                              className="bg-slate-100/50 hover:bg-slate-100 cursor-pointer transition-colors"
                              onClick={() => toggleGroup(groupKey)}
                            >
                              <td colSpan={4} className="px-6 py-3 font-medium text-slate-800">
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                  {groupBy === 'taker' ? <Building2 className="w-4 h-4 text-blue-600" /> : <CalendarDays className="w-4 h-4 text-blue-600" />}
                                  {getGroupDisplayName(groupKey, groupInvoices)}
                                  <span className="text-xs font-normal text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                                    {groupInvoices.length} notas
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-right font-semibold text-slate-800">
                                {formatCurrency(groupTotal)}
                              </td>
                              <td className="px-6 py-3 text-right font-semibold text-red-600">
                                {groupRetentions > 0 ? formatCurrency(groupRetentions) : "-"}
                              </td>
                              <td className="px-6 py-3 text-right font-semibold text-green-600">
                                {formatCurrency(groupLiquid)}
                              </td>
                              <td className="px-6 py-3"></td>
                            </tr>

                            {/* Group Invoices */}
                            {isExpanded && groupInvoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 pl-12">
                                  <div className="font-medium text-slate-800 truncate max-w-[200px]" title={inv.providerName}>
                                    {inv.providerName}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-slate-600">{inv.providerCnpj}</td>
                                <td className="px-6 py-4 text-slate-600">{inv.invoiceNumber}</td>
                                <td className="px-6 py-4 text-slate-600">{formatDate(inv.issueDate)}</td>
                                <td className="px-6 py-4 text-right font-medium text-slate-800">
                                  {formatCurrency(inv.serviceValue)}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {inv.retentions.total > 0 ? (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDrilldownInvoice(inv);
                                      }}
                                      className="font-medium text-red-600 hover:text-red-800 underline decoration-red-300 underline-offset-2"
                                    >
                                      {formatCurrency(inv.retentions.total)}
                                    </button>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      inv.id && handleDelete(inv.id);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })
                     )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Reconciliation Tab */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Conciliação de Notas</h2>
                  <p className="text-sm text-slate-500 mt-1">Importe o relatório do sistema (CSV) para cruzar com as notas em XML.</p>
                </div>
                <div className="flex flex-col gap-3 w-full md:w-auto">
                  <div className="relative w-full">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por Fornecedor, CNPJ ou Nº da Nota..."
                      value={reconSearchTerm}
                      onChange={(e) => setReconSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                      {['all', 'Conciliado', 'Divergente', 'Não Lançado', 'Falta XML'].map(status => (
                        <button
                          key={status}
                          onClick={() => setReconciliationStatusFilter(status as any)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap",
                            reconciliationStatusFilter === status 
                              ? "bg-white text-blue-700 shadow-sm border border-slate-200/60" 
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                          )}
                        >
                          {status === 'all' ? 'Todos os Status' : status}
                        </button>
                      ))}
                    </div>
                  
                    <select
                      value={reconciliationTaxFilter}
                      onChange={(e) => setReconciliationTaxFilter(e.target.value as any)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-700 h-[34px]"
                    >
                      <option value="all">Todos os Impostos</option>
                      <option value="IRRF">IRRF Divergente</option>
                      <option value="PIS">PIS Divergente</option>
                      <option value="COFINS">COFINS Divergente</option>
                      <option value="CSLL">CSLL Divergente</option>
                      <option value="INSS">INSS Divergente</option>
                      <option value="ISS">ISS Divergente</option>
                      <option value="Valor Líquido">Valor Líquido Divergente</option>
                    </select>

                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 hidden lg:inline">Período</label>
                      <input
                        type="date"
                        value={reconDateStart}
                        onChange={(e) => setReconDateStart(e.target.value)}
                        className="bg-white border text-xs font-medium border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 w-[115px] h-[26px]"
                        title="Data de Emissão Inicial"
                      />
                      <span className="text-slate-400 font-medium">-</span>
                      <input
                        type="date"
                        value={reconDateEnd}
                        onChange={(e) => setReconDateEnd(e.target.value)}
                        className="bg-white border text-xs font-medium border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 w-[115px] h-[26px]"
                        title="Data de Emissão Final"
                      />
                    </div>
                    
                    <button
                      onClick={() => {
                        if (reconciliationResults.length === 0) {
                          alert("Nenhuma conciliação para exportar.");
                          return;
                        }
                        
                        const wb = XLSX.utils.book_new();

                        // Helper to format data
                        const formatData = (invs: InvoiceData[], type: 'iss' | 'inss' | 'ir' | 'pcc') => {
                          return invs.map(inv => {
                            let retValue = 0;
                            if (type === 'iss') retValue = inv.retentions.iss;
                            if (type === 'inss') retValue = inv.retentions.inss;
                            if (type === 'ir') retValue = inv.retentions.ir;
                            if (type === 'pcc') retValue = inv.retentions.pis + inv.retentions.cofins + inv.retentions.csll;
                            
                            return {
                              'Nº Nota': inv.invoiceNumber,
                              'Emissão': formatDate(inv.issueDate),
                              'Fornecedor': inv.providerName,
                              'CNPJ Fornecedor': inv.providerCnpj,
                              'Tomador': inv.takerName,
                              'CNPJ Tomador': inv.takerCnpj,
                              'Valor Bruto': inv.serviceValue,
                              'Valor Retenção': retValue
                            };
                          });
                        };

                        // Get all XML invoices from current reconciliation results that have XMLs
                        const xmlInvoices = reconciliationResults
                          .filter(r => r.xmlInvoice)
                          .map(r => r.xmlInvoice as InvoiceData);

                        // ISS
                        const issInvoices = xmlInvoices.filter(inv => inv.retentions.iss > 0);
                        if (issInvoices.length > 0) {
                          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(issInvoices, 'iss')), "Retenção ISS");
                        }

                        // INSS
                        const inssInvoices = xmlInvoices.filter(inv => inv.retentions.inss > 0);
                        if (inssInvoices.length > 0) {
                          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(inssInvoices, 'inss')), "Retenção INSS");
                        }

                        // IR
                        const irInvoices = xmlInvoices.filter(inv => inv.retentions.ir > 0);
                        if (irInvoices.length > 0) {
                          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(irInvoices, 'ir')), "Retenção IRRF");
                        }

                        // PCC
                        const pccInvoices = xmlInvoices.filter(inv => (inv.retentions.pis + inv.retentions.cofins + inv.retentions.csll) > 0);
                        if (pccInvoices.length > 0) {
                          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(pccInvoices, 'pcc')), "Retenção PCC");
                        }

                        if (wb.SheetNames.length === 0) {
                          alert("Nenhuma retenção encontrada nas notas conciliadas.");
                          return;
                        }

                        XLSX.writeFile(wb, `fechamento_retencoes_${reconciliationCompany}.xlsx`);
                      }}
                      className="py-1.5 px-3 bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs h-[34px]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Fechar Retenções
                    </button>
                    <button
                      onClick={handleClearCompanyReconciliation}
                      disabled={!reconciliationCompany || reconciling}
                      className="py-1.5 px-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 h-[34px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Importados
                    </button>
                  <button
                    onClick={() => {
                      if (reconciliationResults.length === 0) {
                        alert("Nenhuma conciliação para exportar.");
                        return;
                      }
                      const filteredResults = reconciliationStatusFilter === 'all' 
                        ? reconciliationResults 
                        : reconciliationResults.filter(r => r.status === reconciliationStatusFilter);
                        
                      const dataToExport = filteredResults.map(result => ({
                        'Status': result.status,
                        'Fornecedor': result.systemInvoice?.fornecedor || result.xmlInvoice?.providerName,
                        'Nº Nota': result.systemInvoice?.numero || result.xmlInvoice?.invoiceNumber,
                        'Emissão': result.systemInvoice?.emissao || (result.xmlInvoice ? formatDate(result.xmlInvoice.issueDate) : ''),
                        'Divergências': result.divergences.join('; ')
                      }));
                      const ws = XLSX.utils.json_to_sheet(dataToExport);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Conciliacao");
                      XLSX.writeFile(wb, `relatorio_conciliacao.xlsx`);
                    }}
                    className="py-2 px-4 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Exportar
                  </button>
                  <button
                    onClick={() => systemFileInputRef.current?.click()}
                    disabled={reconciling}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70"
                  >
                    {reconciling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Importar CSV
                  </button>
                  <button
                    onClick={handleAutoReconcile}
                    disabled={reconciling || !reconciliationCompany}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70"
                    title="Reconcilia os dados do sistema com os XMLs mais recentes"
                  >
                    {reconciling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Conciliar Novamente
                  </button>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    ref={systemFileInputRef}
                    onChange={handleSystemFileUpload}
                  />
                </div>
              </div>
            </div>

              {/* Filtering and Variables */}
              {(() => {
                const currentPeriodResults = reconciliationResults.filter(r => (!reconciliationCompany || r.takerCnpj === reconciliationCompany) && r.competence === selectedCompetence);
                
                const fullyFilteredResults = currentPeriodResults
                  .filter(r => reconciliationStatusFilter === 'all' || r.status === reconciliationStatusFilter)
                  .filter(r => {
                    if (reconciliationTaxFilter === 'all') return true;
                    const errCode = reconciliationTaxFilter === 'Valor Líquido' ? 'PCC' : reconciliationTaxFilter;
                    return r.divergences.some(d => d.includes(errCode));
                  })
                  .filter(r => {
                    if (!reconSearchTerm) return true;
                    const term = reconSearchTerm.toLowerCase();
                    const cnpj = (r.systemInvoice?.cnpjFornecedor || r.xmlInvoice?.providerCnpj || "").toLowerCase();
                    const pName = (r.systemInvoice?.fornecedor || r.xmlInvoice?.providerName || "").toLowerCase();
                    const invNum = (r.systemInvoice?.numero || r.xmlInvoice?.invoiceNumber || "").toLowerCase();
                    return cnpj.includes(term) || pName.includes(term) || invNum.includes(term);
                  })
                  .filter(r => {
                    if (!reconDateStart && !reconDateEnd) return true;
                    let dStr = r.systemInvoice?.emissao || r.xmlInvoice?.issueDate;
                    if (!dStr) return true;
                    let dt: Date;
                    if (dStr.includes('/')) {
                      const p = dStr.split('/');
                      dt = new Date(`${p[2]}-${p[1]}-${p[0]}T00:00:00`);
                    } else {
                      dt = new Date(dStr);
                    }
                    const timestamp = dt.getTime();
                    let start = reconDateStart ? new Date(reconDateStart + "T00:00:00").getTime() : 0;
                    let end = reconDateEnd ? new Date(reconDateEnd + "T23:59:59").getTime() : Infinity;
                    return timestamp >= start && timestamp <= end;
                  });

                  const impactSum = currentPeriodResults
                    .filter(r => r.status === 'Divergente' || r.status === 'Não Lançado')
                    .reduce((acc, r) => {
                      const xmlVal = r.xmlInvoice?.serviceValue || 0;
                      const sysVal = r.systemInvoice?.valorServico || 0;
                      return acc + Math.abs(xmlVal - sysVal);
                    }, 0);

                const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (e.target.checked) {
                    setSelectedReconIds(fullyFilteredResults.filter(r => r.status !== 'Conciliado').map(r => r.id));
                  } else {
                    setSelectedReconIds([]);
                  }
                };

                const toggleReconId = (id: string, checked: boolean) => {
                  setSelectedReconIds(prev => checked ? [...prev, id] : prev.filter(pId => pId !== id));
                };

                return (
                  <>
                    {currentPeriodResults.length > 0 && (
                      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                        {[
                          { label: 'Total', count: currentPeriodResults.length, color: 'bg-slate-100 text-slate-800' },
                          { label: 'Conciliado', count: currentPeriodResults.filter(r => r.status === 'Conciliado').length, color: 'bg-green-100 text-green-800' },
                          { label: 'Divergente', count: currentPeriodResults.filter(r => r.status === 'Divergente').length, color: 'bg-amber-100 text-amber-800' },
                          { label: 'Falta XML', count: currentPeriodResults.filter(r => r.status === 'Falta XML').length, color: 'bg-red-100 text-red-800' },
                          { label: 'Não Lançado', count: currentPeriodResults.filter(r => r.status === 'Não Lançado').length, color: 'bg-blue-100 text-blue-800' },
                        ].map(stat => (
                          <div key={stat.label} className={`p-4 rounded-lg border border-slate-200/50 flex flex-col items-center justify-center text-center ${stat.color}`}>
                            <span className="text-2xl font-bold">{stat.count}</span>
                            <span className="text-[11px] font-bold uppercase tracking-wider mt-1 opacity-80">{stat.label}</span>
                          </div>
                        ))}
                        <div className="col-span-2 lg:col-span-1 p-4 rounded-lg border border-rose-200/50 flex flex-col items-center justify-center text-center bg-rose-50 text-rose-800">
                          <span className="text-xl font-bold tracking-tight">{formatCurrency(impactSum)}</span>
                          <span className="text-[11px] font-bold uppercase tracking-wider mt-1 opacity-80 flex flex-col items-center">
                            <span>Impacto Financeiro</span>
                            <span className="text-[9px] opacity-70 leading-tight">(Soma das Diferenças)</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedReconIds.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
                        <span className="text-sm font-semibold text-blue-800">{selectedReconIds.length} nota(s) selecionada(s)</span>
                         <div className="flex gap-2">
                          <button 
                             onClick={() => {
                               const batch = writeBatch(db);
                               const now = new Date().toISOString();
                               selectedReconIds.forEach(id => {
                                  batch.update(doc(db, "reconciliations", id), { 
                                     status: 'Conciliado', 
                                     justification: 'Validado em lote via seleção',
                                     reconciledBy: user?.email || 'Desconhecido',
                                     reconciledAt: now
                                  });
                               });
                               batch.commit().then(async () => {
                                 setReconciliationResults(prev => prev.map(r => selectedReconIds.includes(r.id) ? { ...r, status: 'Conciliado', justification: 'Validado em lote via seleção', reconciledBy: user?.email || 'Desconhecido', reconciledAt: now } : r));
                                 
                                 await logAdminAction('Conciliação em Lote (Forçada)', {
                                   count: selectedReconIds.length,
                                   ids: selectedReconIds
                                 });
                                 
                                 setSelectedReconIds([]);
                               });
                             }}
                             className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded shadow-sm flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Forçar Conciliação
                          </button>
                        </div>
                      </div>
                    )}

                    {reconciliationResults.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-3 w-10 text-center">
                                <input type="checkbox" checked={selectedReconIds.length === fullyFilteredResults.filter(r => r.status !== 'Conciliado').length && fullyFilteredResults.length > 0} onChange={handleToggleSelectAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                              </th>
                              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Status</th>
                              <th className="px-4 py-3 font-semibold text-center uppercase tracking-wider text-xs">XML Imp.</th>
                              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Valor (R$)</th>
                              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Fornecedor</th>
                              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Nº Nota</th>
                              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Emissão</th>
                              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-xs">Detalhes da Divergência</th>
                              <th className="px-4 py-3 font-semibold text-center uppercase tracking-wider text-xs">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {fullyFilteredResults.map((result) => (
                              <React.Fragment key={result.id}>
                                <tr className={`hover:bg-slate-50 transition-colors ${selectedReconIds.includes(result.id) ? 'bg-blue-50/50' : ''}`}>
                                  <td className="px-3 py-3 w-10 text-center">
                                    <input 
                                      type="checkbox" 
                                      checked={selectedReconIds.includes(result.id)}
                                      onChange={(e) => toggleReconId(result.id, e.target.checked)}
                                      disabled={result.status === 'Conciliado'}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                            {result.status === 'Conciliado' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="w-3.5 h-3.5" /> Conciliado</span>}
                            {result.status === 'Divergente' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><AlertTriangle className="w-3.5 h-3.5" /> Divergente</span>}
                            {result.status === 'Não Lançado' && (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><FileText className="w-3.5 h-3.5" /> Não Lançado</span>
                                {result.xmlInvoice && result.xmlInvoice.retentions.total > 0 && (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">COM RETENÇÃO</span>
                                )}
                              </div>
                            )}
                            {result.status === 'Falta XML' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3.5 h-3.5" /> Falta XML</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {result.xmlInvoice ? (
                              <span className="inline-flex justify-center p-1 rounded-full bg-emerald-100 text-emerald-600" title="XML Importado via arquivo">
                                <CheckCircle2 className="w-4 h-4" />
                              </span>
                            ) : (
                              <span className="inline-flex justify-center p-1 rounded-full bg-slate-100 text-slate-400" title="XML ainda não importado">
                                <XCircle className="w-4 h-4" />
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {formatCurrency(result.systemInvoice?.valorServico || result.xmlInvoice?.serviceValue || 0)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[200px]" title={result.systemInvoice?.fornecedor || result.xmlInvoice?.providerName}>
                            {result.systemInvoice?.fornecedor || result.xmlInvoice?.providerName}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{result.systemInvoice?.numero || result.xmlInvoice?.invoiceNumber}</td>
                          <td className="px-4 py-3 text-slate-600">{result.systemInvoice?.emissao || (result.xmlInvoice ? formatDate(result.xmlInvoice.issueDate) : '')}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {result.divergences.length > 0 ? (
                              <ul className="list-disc list-inside text-xs space-y-1">
                                {result.divergences.map((div, i) => <li key={i} className={result.status === 'Divergente' ? 'text-amber-700' : 'text-slate-500'}>{div}</li>)}
                              </ul>
                            ) : (
                              <span className="text-slate-400 text-xs">Sem divergências</span>
                            )}
                            {result.justification && (
                              <div className="mt-2 text-xs bg-slate-100 p-2 rounded text-slate-700 border border-slate-200">
                                <strong>Justificativa:</strong> {result.justification}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {result.status === 'Divergente' && (
                                <>
                                  <button
                                    onClick={() => setShowDiffModal(result)}
                                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded transition-colors uppercase tracking-wider"
                                  >
                                    Ver Diferenças
                                  </button>
                                  <button
                                    onClick={() => {
                                      setJustifyResultId(result.id);
                                      setShowJustifyModal(true);
                                    }}
                                    className="text-[11px] border border-slate-200 font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 px-2 py-1 rounded transition-colors uppercase tracking-wider"
                                  >
                                    Justificar
                                  </button>
                                </>
                              )}
                              {result.status === 'Não Lançado' && result.xmlInvoice && (
                                <button
                                  onClick={() => setShowXmlDetailsModal(result.xmlInvoice!)}
                                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors shadow-sm uppercase tracking-wider"
                                  title="Ver dados do XML para lançamento no ERP"
                                >
                                  Ver XML
                                </button>
                              )}
                              {(result.status === 'Divergente' || result.status === 'Conciliado') && result.xmlInvoice && result.systemInvoice && result.manuallyLinked && (
                                <button
                                  onClick={() => handleUnlinkXml(result.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                  title="Desvincular XML Manualmente"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                              {result.status === 'Falta XML' && (
                                <>
                                  <button
                                    onClick={() => setLinkingResultId(result.id)}
                                    className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded transition-colors uppercase tracking-wider"
                                    title="Vincular XML manualmente"
                                  >
                                    Vincular XML
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-slate-900">Nenhuma conciliação realizada</h3>
                  <p className="text-sm text-slate-500 mt-1">Importe o relatório do sistema para iniciar o cruzamento de dados.</p>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  )}
        {/* Pending Tab */}
        {activeTab === 'pending' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Pendências ERP (Aging)</h2>
                <p className="text-sm text-slate-500">Notas importadas via XML que ainda não foram conciliadas no ERP.</p>
              </div>
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 whitespace-nowrap">A partir de:</label>
                  <input
                    type="date"
                    value={pendenciesMinDate}
                    onChange={(e) => setPendenciesMinDate(e.target.value)}
                    className="bg-white border text-sm border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-700 w-[130px]"
                  />
                </div>
                <button
                  onClick={() => {
                    const pendingInvoices = invoices.filter(inv => !inv.erpReconciled && (!pendenciesMinDate || new Date(inv.issueDate) >= new Date(pendenciesMinDate)));
                    if (pendingInvoices.length === 0) {
                      alert("Nenhuma pendência para exportar com o filtro atual.");
                      return;
                    }
                    const dataToExport = pendingInvoices.map(inv => {
                      const days = Math.floor((new Date().getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24));
                      return {
                        'Nº Nota': inv.invoiceNumber,
                        'Data Emissão': formatDate(inv.issueDate),
                        'Fornecedor': inv.providerName,
                        'CNPJ Fornecedor': inv.providerCnpj,
                        'Tomador': inv.takerName,
                        'CNPJ Tomador': inv.takerCnpj,
                        'Valor Serviço': inv.serviceValue,
                        'Dias de Emissão': days > 0 ? days : 0
                      };
                    });
                    const ws = XLSX.utils.json_to_sheet(dataToExport);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Pendencias");
                    XLSX.writeFile(wb, `relatorio_pendencias_erp.xlsx`);
                  }}
                  className="py-2 px-4 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Exportar
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 font-medium">Status (Dias)</th>
                      <th className="px-6 py-3 font-medium">Fornecedor</th>
                      <th className="px-6 py-3 font-medium">Nº Nota</th>
                      <th className="px-6 py-3 font-medium">Emissão</th>
                      <th className="px-6 py-3 font-medium">Tomador</th>
                      <th className="px-6 py-3 font-medium text-right">Valor</th>
                      <th className="px-6 py-3 font-medium text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const filteredPending = invoices.filter(inv => !inv.erpReconciled && (!pendenciesMinDate || new Date(inv.issueDate) >= new Date(pendenciesMinDate)));
                      
                      if (filteredPending.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                              Nenhuma nota pendente encontrada para o período selecionado.
                            </td>
                          </tr>
                        );
                      }

                      return filteredPending.map((inv) => {
                        const days = Math.floor((new Date().getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24));
                        let statusColor = "bg-green-100 text-green-800";
                        let statusText = "Até 15 dias";
                        if (days > 15 && days <= 25) {
                          statusColor = "bg-yellow-100 text-yellow-800";
                          statusText = "16 a 25 dias";
                        } else if (days > 25) {
                          statusColor = "bg-red-100 text-red-800";
                          statusText = "Mais de 25 dias";
                        }

                        return (
                          <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium", statusColor)}>
                                {days > 0 ? `${days} dias` : 'Hoje'} ({statusText})
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-800 truncate max-w-[200px]" title={inv.providerName}>
                              {inv.providerName}
                            </td>
                            <td className="px-6 py-4 text-slate-600">{inv.invoiceNumber}</td>
                            <td className="px-6 py-4 text-slate-600">{formatDate(inv.issueDate)}</td>
                            <td className="px-6 py-4 text-slate-600 truncate max-w-[200px]" title={inv.takerName}>{inv.takerName}</td>
                            <td className="px-6 py-4 text-right font-medium text-slate-800">
                              {formatCurrency(inv.serviceValue)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={async () => {
                                  if (!confirm("Tem certeza que deseja excluir esta nota das pendências?")) return;
                                  try {
                                    if (inv.id) {
                                      await deleteDoc(doc(db, "invoices", inv.id));
                                      setInvoices(prev => prev.filter(i => i.id !== inv.id));
                                    }
                                  } catch (e) {
                                    console.error(e);
                                    alert("Erro ao excluir nota.");
                                  }
                                }}
                                className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 transition-colors"
                                title="Excluir Nota"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Admin Tab (Audit Logs) */}
        {activeTab === 'admin' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Administração / Auditoria</h2>
                  <p className="text-sm text-slate-500">Registro completo de ações realizadas na plataforma.</p>
                </div>
                <div className="flex gap-2">
                   <button 
                     onClick={fetchAuditLogs}
                     className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                   >
                     Atualizar Logs
                   </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Data/Hora</th>
                      <th className="px-4 py-3 font-medium">Usuário</th>
                      <th className="px-4 py-3 font-medium">Ação</th>
                      <th className="px-4 py-3 font-medium">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.length > 0 ? (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">
                            {new Date(log.timestamp).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {log.userEmail}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-md" title={JSON.stringify(log, null, 2)}>
                            {JSON.stringify(log).substring(0, 100)}...
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          Nenhum log de auditoria encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Companies Tab */}
        {false && activeTab === 'companies' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Empresas do Grupo (Tomadores)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">CNPJ</th>
                      <th className="px-4 py-3 font-medium text-blue-600">Identificador (Apelido)</th>
                      <th className="px-4 py-3 font-medium">Nome (Razão Social)</th>
                      <th className="px-4 py-3 font-medium">Endereço</th>
                      <th className="px-4 py-3 font-medium">Cidade</th>
                      <th className="px-4 py-3 font-medium">UF</th>
                      <th className="px-4 py-3 font-medium text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companies.length > 0 ? (
                      companies.map((company, idx) => (
                        <tr key={company.id || company.cnpj || `comp-table-${idx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800">{company.cnpj}</td>
                          <td className="px-4 py-3 text-blue-700 font-medium bg-blue-50/30">
                            {editingCompanyId === company.id ? (
                              <input 
                                type="text" 
                                placeholder="Ex: Porsche Matriz"
                                value={editCompanyData.identifier || ''} 
                                onChange={(e) => setEditCompanyData({...editCompanyData, identifier: e.target.value})}
                                className="w-full px-2 py-1 border border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded text-sm bg-white"
                              />
                            ) : (company.identifier || <span className="text-slate-400 italic text-xs">Adicionar apelido...</span>)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {editingCompanyId === company.id ? (
                              <input 
                                type="text" 
                                value={editCompanyData.name || ''} 
                                onChange={(e) => setEditCompanyData({...editCompanyData, name: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              />
                            ) : company.name}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {editingCompanyId === company.id ? (
                              <input 
                                type="text" 
                                value={editCompanyData.address || ''} 
                                onChange={(e) => setEditCompanyData({...editCompanyData, address: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              />
                            ) : (company.address || '-')}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {editingCompanyId === company.id ? (
                              <input 
                                type="text" 
                                value={editCompanyData.city || ''} 
                                onChange={(e) => setEditCompanyData({...editCompanyData, city: e.target.value})}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              />
                            ) : (company.city || '-')}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {editingCompanyId === company.id ? (
                              <input 
                                type="text" 
                                value={editCompanyData.state || ''} 
                                onChange={(e) => setEditCompanyData({...editCompanyData, state: e.target.value})}
                                className="w-16 px-2 py-1 border border-slate-300 rounded text-sm"
                                maxLength={2}
                              />
                            ) : (company.state || '-')}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {editingCompanyId === company.id ? (
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => company.id && saveCompany(company.id)}
                                  className="text-green-600 hover:text-green-800"
                                  title="Salvar"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setEditingCompanyId(null)}
                                  className="text-slate-400 hover:text-slate-600"
                                  title="Cancelar"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => {
                                  setEditingCompanyId(company.id || null);
                                  setEditCompanyData(company);
                                }}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Editar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          Nenhuma empresa cadastrada ainda. Importe XMLs para popular o cadastro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Weekly Control Tab */}
        {false && activeTab === 'weekly' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Controle Semanal de Conciliação</h2>
                  <p className="text-sm text-slate-500">Acompanhe o status das conciliações por semana para cada empresa.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-700">Competência:</label>
                  <select 
                    value={selectedCompetence} 
                    onChange={(e) => setSelectedCompetence(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Array.from(new Set(reconciliationResults.map(r => r.competence))).sort((a, b) => String(b).localeCompare(String(a))).map(comp => (
                      <option key={comp || 'unknown-comp'} value={comp}>{comp || 'Desconhecida'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Empresa</th>
                      <th className="px-4 py-3 font-medium text-center">Semana 1</th>
                      <th className="px-4 py-3 font-medium text-center">Semana 2</th>
                      <th className="px-4 py-3 font-medium text-center">Semana 3</th>
                      <th className="px-4 py-3 font-medium text-center">Semana 4</th>
                      <th className="px-4 py-3 font-medium text-center">Fechamento Final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {companies.length > 0 ? (
                      companies.map((company, idx) => {
                        const controlId = `${selectedCompetence.replace('/', '-')}_${company.cnpj.replace(/[^\d]/g, '')}`;
                        const control = weeklyControls[controlId] || { s1: false, s2: false, s3: false, s4: false, final: false };
                        
                        const handleToggle = async (field: 's1' | 's2' | 's3' | 's4' | 'final') => {
                          const newValue = !control[field];
                          try {
                            await setDoc(doc(db, "weekly_controls", controlId), {
                              competence: selectedCompetence,
                              cnpj: company.cnpj,
                              companyName: company.name,
                              [field]: newValue,
                              updatedAt: new Date().toISOString()
                            }, { merge: true });
                            
                            setWeeklyControls(prev => ({
                              ...prev,
                              [controlId]: { ...control, [field]: newValue }
                            }));
                          } catch (e) {
                            console.error("Erro ao atualizar controle semanal:", e);
                            alert("Erro ao atualizar status.");
                          }
                        };

                        return (
                          <tr key={company.id || company.cnpj || `comp-weekly-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[250px]" title={`${company.cnpj} - ${company.name}`}>
                              <div className="text-xs text-slate-500">{company.cnpj}</div>
                              <div>{company.name}</div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" checked={control.s1} onChange={() => handleToggle('s1')} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" checked={control.s2} onChange={() => handleToggle('s2')} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" checked={control.s3} onChange={() => handleToggle('s3')} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" checked={control.s4} onChange={() => handleToggle('s4')} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="checkbox" checked={control.final} onChange={() => handleToggle('final')} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          Nenhuma empresa cadastrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Fechamento Tab */}
        {activeTab === 'fechamento' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Fechamento Mensal</h2>
              <p className="text-sm text-slate-500 mb-6">Trave a competência de uma empresa para evitar novas conciliações ou alterações.</p>
              
              <div className="flex flex-wrap gap-4 items-end mb-8">
                <button
                  onClick={async () => {
                    if (!selectedCompetence || !reconciliationCompany) {
                      alert("Selecione a competência e a empresa no topo da página para fechar o mês.");
                      return;
                    }
                    
                    const isAlreadyClosed = closedMonths.some(cm => cm.cnpj === reconciliationCompany && cm.competence === selectedCompetence);
                    if (isAlreadyClosed) {
                      alert("Este mês já está fechado para esta empresa.");
                      return;
                    }

                    const compConf = companies.find(c => c.cnpj === reconciliationCompany);
                    const companyName = compConf ? (compConf.identifier || compConf.name) : reconciliationCompany;
                    if (!confirm(`Tem certeza que deseja FECHAR o mês ${selectedCompetence} para a empresa ${companyName}? Isso impedirá novas conciliações para este período.`)) return;

                    try {
                      const newClosedMonth = {
                        cnpj: reconciliationCompany,
                        competence: selectedCompetence,
                        closedAt: new Date().toISOString()
                      };
                      const docRef = await addDoc(collection(db, "closed_months"), newClosedMonth);
                      setClosedMonths(prev => [...prev, { ...newClosedMonth, id: docRef.id }]);
                      alert("Mês fechado com sucesso!");
                    } catch (err) {
                      console.error("Erro ao fechar mês:", err);
                      alert("Erro ao fechar o mês.");
                    }
                  }}
                  disabled={!selectedCompetence || !reconciliationCompany}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  Fechar Mês ({selectedCompetence})
                </button>
              </div>

              <h3 className="text-md font-semibold text-slate-800 mb-4">Meses Fechados</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-medium">Competência</th>
                      <th className="px-4 py-3 font-medium">Empresa</th>
                      <th className="px-4 py-3 font-medium">Data de Fechamento</th>
                      <th className="px-4 py-3 font-medium text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closedMonths.length > 0 ? (
                      closedMonths.map((cm, idx) => {
                        const company = companies.find(c => c.cnpj === cm.cnpj);
                        return (
                          <tr key={cm.id || `closed-month-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">{cm.competence}</td>
                            <td className="px-4 py-3 text-slate-600">{company ? `${company.identifier || company.name} (${company.cnpj})` : cm.cnpj}</td>
                            <td className="px-4 py-3 text-slate-600">{new Date(cm.closedAt).toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={async () => {
                                  if (!confirm("Tem certeza que deseja reabrir este mês? Isso permitirá novas conciliações.")) return;
                                  try {
                                    if (cm.id) {
                                      await deleteDoc(doc(db, "closed_months", cm.id));
                                      setClosedMonths(prev => prev.filter(item => item.id !== cm.id));
                                    }
                                  } catch (err) {
                                    console.error("Erro ao reabrir mês:", err);
                                    alert("Erro ao reabrir o mês.");
                                  }
                                }}
                                className="text-red-600 hover:text-red-800 text-xs font-medium bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                              >
                                Reabrir
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          Nenhum mês fechado ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Admin Tab */}
        {activeTab === 'admin' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
            {!user ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-col items-center mb-8">
                  <div className="bg-slate-100 p-4 rounded-full mb-4">
                    <Lock className="w-8 h-8 text-slate-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800">Acesso Restrito</h2>
                  <p className="text-slate-500 mt-2 text-center">Área exclusiva para administração do sistema.</p>
                </div>
                
                {authError && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100">
                    {authError}
                  </div>
                )}

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthError("");
                  try {
                    await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
                  } catch (err: any) {
                    setAuthError("Credenciais inválidas. Tente novamente.");
                  }
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                    <input 
                      type="email" 
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                    <input 
                      type="password" 
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div className="flex justify-end">
                    <button 
                      type="button"
                      onClick={async () => {
                        if (!loginEmail) {
                          setAuthError("Digite seu e-mail para recuperar a senha.");
                          return;
                        }
                        try {
                          await sendPasswordResetEmail(auth, loginEmail);
                          setAuthError("E-mail de recuperação enviado!");
                        } catch (err) {
                          setAuthError("Erro ao enviar e-mail de recuperação.");
                        }
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition-colors"
                  >
                    Entrar
                  </button>
                </form>
              </div>
            ) : requirePasswordChange ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 mb-2">Troca de Senha Obrigatória</h2>
                <p className="text-slate-500 mb-6 text-sm">Por motivos de segurança, você precisa alterar sua senha no primeiro acesso.</p>
                
                {authError && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100">
                    {authError}
                  </div>
                )}

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthError("");
                  if (newPassword.length < 6) {
                    setAuthError("A nova senha deve ter pelo menos 6 caracteres.");
                    return;
                  }
                  try {
                    if (auth.currentUser) {
                      await updatePassword(auth.currentUser, newPassword);
                      await setDoc(doc(db, "users", auth.currentUser.uid), { requirePasswordChange: false }, { merge: true });
                      setRequirePasswordChange(false);
                      alert("Senha alterada com sucesso!");
                    }
                  } catch (err: any) {
                    setAuthError("Erro ao alterar senha. Tente fazer login novamente.");
                  }
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nova Senha</label>
                    <input 
                      type="password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Salvar Nova Senha
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Painel Administrativo</h2>
                    <p className="text-sm text-slate-500 mt-1">Logado como: {user.email}</p>
                  </div>
                  <button 
                    onClick={() => signOut(auth)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                </div>

                {/* Danger Zone */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-red-100 p-2 rounded-full text-red-600 shrink-0">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div className="w-full">
                      <h3 className="text-lg font-semibold text-red-800">Excluir XMLs em Lote (Em Aberto)</h3>
                      <p className="text-sm text-red-600 mt-1 mb-4">
                        Exclui permanentemente as notas fiscais importadas (XML/PDF) que ainda <strong>não foram conciliadas (em aberto)</strong>, dentro de um período específico de emissão.
                      </p>
                      <div className="flex flex-col sm:flex-row items-end gap-4 mb-6">
                        <div className="w-full sm:w-auto">
                          <label className="block text-xs font-medium text-red-800 mb-1">Data Início</label>
                          <input 
                            type="date" 
                            value={batchDeleteStartDate}
                            onChange={(e) => setBatchDeleteStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>
                        <div className="w-full sm:w-auto">
                          <label className="block text-xs font-medium text-red-800 mb-1">Data Fim</label>
                          <input 
                            type="date" 
                            value={batchDeleteEndDate}
                            onChange={(e) => setBatchDeleteEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>
                        <button 
                          onClick={handleBatchDelete}
                          disabled={isBatchDeleting}
                          className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isBatchDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          Excluir Lote
                        </button>
                      </div>
                      
                      <hr className="border-red-200 my-6" />

                      <h3 className="text-lg font-semibold text-red-800">Apagar Todo o Banco de Dados</h3>
                      <p className="text-sm text-red-600 mt-1 mb-4">
                        Apagar o banco de dados removerá permanentemente todas as notas fiscais importadas e conciliações. Esta ação não pode ser desfeita.
                      </p>
                      <button
                        onClick={() => setShowClearDbModal(true)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                      >
                        Apagar Banco de Dados
                      </button>
                    </div>
                  </div>
                </div>

                {/* Integração */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-slate-200 p-2 rounded-full text-slate-600 shrink-0">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">Integração com ERP (API)</h3>
                      <p className="text-sm text-slate-600 mt-1 mb-4">
                        Para automatizar a importação do relatório do ERP, envie as especificações abaixo para o desenvolvedor do seu sistema. Ele poderá criar uma rotina que envia os dados diretamente para o banco de dados desta ferramenta.
                      </p>
                      
                      <div className="bg-white p-4 rounded border border-slate-200 text-xs font-mono text-slate-600 overflow-x-auto mb-4">
                        <h4 className="font-bold text-slate-800 mb-2">Endpoint (Firebase Cloud Function / Webhook a ser criado):</h4>
                        <p className="mb-2">POST https://[sua-url-firebase]/api/import-erp-report</p>
                        
                        <h4 className="font-bold text-slate-800 mb-2">Headers:</h4>
                        <p className="mb-2">Authorization: Bearer [API_KEY]<br/>Content-Type: application/json</p>
                        
                        <h4 className="font-bold text-slate-800 mb-2">Body (JSON):</h4>
                        <pre className="text-blue-600">
{`{
  "competence": "03/2025",
  "companyCnpj": "12345678000199", // CNPJ da empresa tomadora
  "invoices": [
    {
      "numero": "1234",
      "fornecedor": "RAZAO SOCIAL DO FORNECEDOR",
      "emissao": "2025-03-15",
      "valorLiquido": 1000.00,
      "iss": 50.00,
      "pis": 6.50,
      "cofins": 30.00,
      "csll": 10.00,
      "irrf": 15.00,
      "inss": 0.00
    }
  ]
}`}
                        </pre>
                      </div>
                      <p className="text-sm text-slate-600">
                        O desenvolvedor do ERP pode usar a biblioteca oficial do Firebase Admin SDK para inserir os dados diretamente no Firestore na coleção <code>reconciliations</code>, ou você pode solicitar a criação de uma Cloud Function para receber este JSON.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Drilldown Modal */}
      {drilldownInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setDrilldownInvoice(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-500" />
                Relatório Estruturado da Nota
              </h3>
              <button 
                onClick={() => setDrilldownInvoice(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nota Fiscal</p>
                  <p className="font-semibold text-slate-800 mt-1">{drilldownInvoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Emissão</p>
                  <p className="font-semibold text-slate-800 mt-1">{formatDate(drilldownInvoice.issueDate)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fornecedor</p>
                  <p className="font-semibold text-slate-800 mt-1 truncate" title={drilldownInvoice.providerName}>
                    {drilldownInvoice.providerName}
                  </p>
                </div>
              </div>
              
              {/* RESUMO FINANCEIRO DA NOTA */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b border-slate-200 pb-1">Resumo Financeiro da Nota</h4>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50"><td className="py-2 px-2 text-slate-600 font-medium">Valor Bruto</td><td className="py-2 px-2 text-right font-semibold text-slate-800">{formatCurrency(drilldownInvoice.serviceValue)}</td></tr>
                    <tr className="hover:bg-slate-50"><td className="py-2 px-2 text-slate-600 font-medium text-red-600">Total de Retenções</td><td className="py-2 px-2 text-right font-semibold text-red-600">{formatCurrency(drilldownInvoice.retentions.total)}</td></tr>
                    <tr className="bg-green-50/50"><td className="py-3 px-2 text-green-800 font-bold rounded-l-lg">Valor Líquido a Pagar</td><td className="py-3 px-2 text-right font-bold text-green-700 rounded-r-lg text-lg">{formatCurrency(drilldownInvoice.serviceValue - drilldownInvoice.retentions.total)}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* RELATÓRIO DE RETENÇÕES MUNICIPAIS E PREVIDENCIÁRIAS */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b border-slate-200 pb-1">Retenções Municipais e Previdenciárias</h4>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-2 text-slate-600 font-medium">ISS Retido</td>
                      <td className="py-2 px-2 text-right font-semibold text-slate-800">
                        <span className="text-xs font-normal text-slate-500 mr-2">({drilldownInvoice.retentions.iss > 0 ? "Sim" : "Não"})</span>
                        {formatCurrency(drilldownInvoice.retentions.iss)}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2 px-2 text-slate-600 font-medium">INSS Retido</td>
                      <td className="py-2 px-2 text-right font-semibold text-slate-800">{formatCurrency(drilldownInvoice.retentions.inss)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* RELATÓRIO DE RETENÇÕES FEDERAIS (RECEITA FEDERAL) */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b border-slate-200 pb-1">Retenções Federais (Receita Federal)</h4>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50"><td className="py-2 px-2 text-slate-600 font-medium">IRRF</td><td className="py-2 px-2 text-right font-semibold text-slate-800">{formatCurrency(drilldownInvoice.retentions.ir)}</td></tr>
                    <tr className="bg-slate-100/50"><td className="py-3 px-2 text-slate-700 font-semibold">PCC (CSRF)</td><td className="py-3 px-2 text-right font-bold text-slate-800">{formatCurrency(drilldownInvoice.retentions.pis + drilldownInvoice.retentions.cofins + drilldownInvoice.retentions.csll)}</td></tr>
                    <tr className="hover:bg-slate-50"><td className="py-1.5 px-2 pl-6 text-slate-500 text-xs font-medium">↳ PIS</td><td className="py-1.5 px-2 text-right font-medium text-slate-600 text-xs">{formatCurrency(drilldownInvoice.retentions.pis)}</td></tr>
                    <tr className="hover:bg-slate-50"><td className="py-1.5 px-2 pl-6 text-slate-500 text-xs font-medium">↳ COFINS</td><td className="py-1.5 px-2 text-right font-medium text-slate-600 text-xs">{formatCurrency(drilldownInvoice.retentions.cofins)}</td></tr>
                    <tr className="hover:bg-slate-50"><td className="py-1.5 px-2 pl-6 text-slate-500 text-xs font-medium">↳ CSLL</td><td className="py-1.5 px-2 text-right font-medium text-slate-600 text-xs">{formatCurrency(drilldownInvoice.retentions.csll)}</td></tr>
                  </tbody>
                </table>
              </div>

            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-right shrink-0">
              <button 
                onClick={() => setDrilldownInvoice(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Side-by-Side Modal */}
      {showDiffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setShowDiffModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Comparativo de Divergências
              </h3>
              <button 
                onClick={() => setShowDiffModal(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Fechar (Esc)"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50 relative flex-1">
              <div className="grid grid-cols-2 gap-6 relative">
                
                {/* ERP Panel */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-bold uppercase">Base</span>
                    <h4 className="font-bold text-slate-800 text-lg">Sistema ERP</h4>
                  </div>
                  
                  {showDiffModal.systemInvoice ? (
                    <div className="space-y-4">
                      {/* Basic Info */}
                      <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase mb-1 tracking-wider">Identificação</div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2">
                          <div className="text-sm text-slate-800 font-medium mb-1 truncate">{showDiffModal.systemInvoice.fornecedor}</div>
                          <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500">Nota: <span className="font-semibold text-slate-700">{showDiffModal.systemInvoice.numero}</span></span>
                           <span className="text-slate-500">Emissão: <span className="font-semibold text-slate-700">{showDiffModal.systemInvoice.emissao}</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Values */}
                      <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase mb-1 tracking-wider">Valores e Retenções</div>
                        <ul className="space-y-1.5 text-sm">
                          <li className="flex justify-between p-2 rounded hover:bg-slate-50 transition-colors">
                            <span className="text-slate-600 font-medium">Valor Bruto</span>
                            <span className="font-semibold text-slate-800">{formatCurrency(showDiffModal.systemInvoice.valorServico || 0)}</span>
                          </li>
                          <li className="flex justify-between p-2 rounded hover:bg-slate-50 transition-colors">
                            <span className="text-slate-600">ISS</span>
                            <span className="font-medium text-slate-700">{formatCurrency(showDiffModal.systemInvoice.issRetido)}</span>
                          </li>
                          <li className="flex justify-between p-2 rounded hover:bg-slate-50 transition-colors">
                            <span className="text-slate-600">INSS</span>
                            <span className="font-medium text-slate-700">{formatCurrency(showDiffModal.systemInvoice.inss)}</span>
                          </li>
                          <li className="flex justify-between p-2 rounded hover:bg-slate-50 transition-colors">
                            <span className="text-slate-600">IRRF</span>
                            <span className="font-medium text-slate-700">{formatCurrency(showDiffModal.systemInvoice.irrf)}</span>
                          </li>
                          <li className="flex justify-between p-2 rounded hover:bg-slate-50 transition-colors">
                            <span className="text-slate-600">PIS</span>
                            <span className="font-medium text-slate-700">{formatCurrency(showDiffModal.systemInvoice.pis)}</span>
                          </li>
                          <li className="flex justify-between p-2 rounded hover:bg-slate-50 transition-colors">
                            <span className="text-slate-600">COFINS</span>
                            <span className="font-medium text-slate-700">{formatCurrency(showDiffModal.systemInvoice.cofins)}</span>
                          </li>
                          <li className="flex justify-between p-2 rounded hover:bg-slate-50 transition-colors">
                            <span className="text-slate-600">CSLL</span>
                            <span className="font-medium text-slate-700">{formatCurrency(showDiffModal.systemInvoice.csll)}</span>
                          </li>
                          <li className="flex justify-between p-2 rounded bg-slate-100 border border-slate-200 font-semibold mt-2">
                            <span className="text-slate-700">Valor Líquido</span>
                            <span className="text-slate-800">{formatCurrency(showDiffModal.systemInvoice.valorLiquido)}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">Dados não encontrados</div>
                  )}
                </div>

                {/* XML Panel */}
                <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold uppercase">XML Recebido</span>
                    <h4 className="font-bold text-blue-900 text-lg">Documento Fiscal</h4>
                  </div>
                  
                  {showDiffModal.xmlInvoice ? (
                    <div className="space-y-4">
                      {/* Basic Info */}
                      <div>
                        <div className="text-xs font-semibold text-blue-400 uppercase mb-1 tracking-wider">Identificação</div>
                        <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 mb-2">
                          <div className="text-sm text-blue-900 font-medium mb-1 truncate">{showDiffModal.xmlInvoice.providerName}</div>
                          <div className="flex justify-between items-center text-xs">
                           <span className="text-blue-600">Nota: <span className="font-semibold text-blue-800">{showDiffModal.xmlInvoice.invoiceNumber}</span></span>
                           <span className="text-blue-600">Emissão: <span className="font-semibold text-blue-800">{formatDate(showDiffModal.xmlInvoice.issueDate)}</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Values */}
                      {(() => {
                        const sInv = showDiffModal.systemInvoice;
                        const xInv = showDiffModal.xmlInvoice;
                        
                        const DiffValue = ({ sysVal, xmlVal, label }: { sysVal: number, xmlVal: number, label: string }) => {
                          const diff = Math.abs(sysVal - xmlVal);
                          const isDiff = diff > 0.05; // allow minimal rounding variation
                          return (
                            <li className={`flex justify-between p-2 rounded transition-colors ${isDiff ? 'bg-amber-50 border border-amber-100' : 'hover:bg-slate-50'}`}>
                              <span className={`font-medium ${isDiff ? 'text-amber-700' : 'text-slate-600'}`}>{label}</span>
                              <div className="flex items-center gap-3">
                                <span className={isDiff ? 'font-bold text-amber-900' : 'font-medium text-slate-700'}>{formatCurrency(xmlVal)}</span>
                                {isDiff && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold">Δ {formatCurrency(diff)}</span>}
                              </div>
                            </li>
                          );
                        }

                        return (
                          <div>
                            <div className="text-xs font-semibold text-blue-400 uppercase mb-1 tracking-wider">Valores e Retenções</div>
                            <ul className="space-y-1.5 text-sm">
                              <DiffValue sysVal={sInv?.valorServico || 0} xmlVal={xInv.serviceValue} label="Valor Bruto" />
                              <DiffValue sysVal={sInv?.issRetido || 0} xmlVal={xInv.retentions.iss} label="ISS" />
                              <DiffValue sysVal={sInv?.inss || 0} xmlVal={xInv.retentions.inss} label="INSS" />
                              <DiffValue sysVal={sInv?.irrf || 0} xmlVal={xInv.retentions.ir} label="IRRF" />
                              <DiffValue sysVal={sInv?.pis || 0} xmlVal={xInv.retentions.pis} label="PIS" />
                              <DiffValue sysVal={sInv?.cofins || 0} xmlVal={xInv.retentions.cofins} label="COFINS" />
                              <DiffValue sysVal={sInv?.csll || 0} xmlVal={xInv.retentions.csll} label="CSLL" />
                              <li className={`flex justify-between p-2 rounded border font-semibold mt-2 ${Math.abs((sInv?.valorLiquido || 0) - (xInv.serviceValue - xInv.retentions.total)) > 0.05 ? 'bg-amber-100 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900'}`}>
                                <span>Valor Líquido</span>
                                <span>{formatCurrency(xInv.serviceValue - xInv.retentions.total)}</span>
                              </li>
                            </ul>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">XML não vinculado</div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-white border-t border-slate-200 text-right shrink-0 flex justify-between items-center">
              <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Os campos destacados divergem entre o registro do ERP e o arquivo XML original.</span>
              <button 
                onClick={() => setShowDiffModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white shadow-sm rounded-lg font-medium transition-colors"
              >
                Fechar Comparativo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dados do XML Modal (Não Lançado) */}
      {showXmlDetailsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onClick={() => setShowXmlDetailsModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex-none px-6 py-5 border-b border-slate-100 bg-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Dados do XML para ERP</h3>
                <p className="text-sm text-slate-500 mt-1">Utilize as informações abaixo para o lançamento.</p>
              </div>
              <button onClick={() => setShowXmlDetailsModal(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="block text-xs font-medium text-slate-500 uppercase mb-1">Fornecedor</span>
                  <span className="block text-sm font-bold text-slate-800">{showXmlDetailsModal.providerName}</span>
                  <span className="block text-xs text-slate-600 mt-0.5">{showXmlDetailsModal.providerCnpj}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <span className="block text-xs font-medium text-slate-500 uppercase mb-1">Número da Nota / Data</span>
                  <span className="block text-sm font-bold text-slate-800">Nº {showXmlDetailsModal.invoiceNumber}</span>
                  <span className="block text-xs text-slate-600 mt-0.5">Emissão: {formatDate(showXmlDetailsModal.issueDate)}</span>
                </div>
              </div>

              <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Valores Principais</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-blue-100/50">
                    <span className="text-slate-600 font-medium">Valor do Serviço</span>
                    <span className="font-bold text-slate-800 text-lg">{formatCurrency(showXmlDetailsModal.serviceValue)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-blue-100/50">
                    <span className="text-slate-600 font-medium text-red-600">(-) Total de Retenções</span>
                    <span className="font-bold text-red-600">{formatCurrency(showXmlDetailsModal.retentions.total)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-800 font-bold">Valor Líquido a Pagar</span>
                    <span className="font-bold text-blue-700 text-xl">{formatCurrency(showXmlDetailsModal.serviceValue - showXmlDetailsModal.retentions.total)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Ret. Municipais/Previdenciárias</h4>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex justify-between"><span className="font-medium">ISS</span> <span>{formatCurrency(showXmlDetailsModal.retentions.iss)} <span className="text-[10px] text-slate-400">({showXmlDetailsModal.retentions.iss > 0 ? "Retido" : "Não"})</span></span></li>
                    <li className="flex justify-between"><span className="font-medium">INSS</span> <span>{formatCurrency(showXmlDetailsModal.retentions.inss)}</span></li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Retenções Federais</h4>
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex justify-between"><span className="font-medium">IRRF</span> <span>{formatCurrency(showXmlDetailsModal.retentions.ir)}</span></li>
                    <li className="flex justify-between"><span className="font-medium">PIS</span> <span>{formatCurrency(showXmlDetailsModal.retentions.pis)}</span></li>
                    <li className="flex justify-between"><span className="font-medium">COFINS</span> <span>{formatCurrency(showXmlDetailsModal.retentions.cofins)}</span></li>
                    <li className="flex justify-between"><span className="font-medium">CSLL</span> <span>{formatCurrency(showXmlDetailsModal.retentions.csll)}</span></li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="flex-none px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
               <button 
                onClick={() => setShowXmlDetailsModal(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-medium transition-colors"
              >
                Pronto, verificado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Justify Modal */}
      {showJustifyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => {
          setShowJustifyModal(false);
          setJustifyResultId(null);
          setJustificationText("");
        }}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-blue-600" />
              <h3 className="font-semibold text-slate-800">Justificar e Conciliar</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Informe a justificativa para alterar o status desta nota de <strong>Divergente</strong> para <strong>Conciliado</strong>.
              </p>
              <div>
                <textarea
                  value={justificationText}
                  onChange={(e) => setJustificationText(e.target.value)}
                  placeholder="Ex: Diferença de centavos devido a arredondamento..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px] text-sm"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowJustifyModal(false);
                  setJustifyResultId(null);
                  setJustificationText("");
                }}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors text-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={handleJustify}
                disabled={!justificationText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
              >
                Salvar e Conciliar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Confirm Modal */}
      {showImportConfirmModal && pendingImportFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setShowImportConfirmModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
              <Upload className="w-6 h-6 text-blue-600" />
              <h3 className="font-semibold text-slate-800">Confirmar Importação</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Você está conciliando a empresa <strong>{
                  (() => {
                    const comp = companies.find(c => c.cnpj === reconciliationCompany);
                    return comp ? (comp.identifier || comp.name) : reconciliationCompany;
                  })()
                }</strong>.
              </p>
              <p className="text-sm text-slate-600">
                Confirma a importação do arquivo <strong>{pendingImportFile.name}</strong> para cruzar os dados?
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowImportConfirmModal(false);
                  setPendingImportFile(null);
                }}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors text-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (pendingImportFile) {
                    processSystemFile(pendingImportFile);
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Confirmar Importação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear DB Modal */}
      {showClearDbModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => {
          setShowClearDbModal(false);
          setClearDbConfirmText("");
        }}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-red-100 bg-red-50 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h3 className="font-semibold text-red-800">Apagar Banco de Dados</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Esta ação excluirá <strong>todas as {invoices.length} notas fiscais</strong> cadastradas no sistema. Esta ação é irreversível.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Para confirmar, digite <strong>confirmo</strong> abaixo:
                </label>
                <input
                  type="text"
                  value={clearDbConfirmText}
                  onChange={(e) => setClearDbConfirmText(e.target.value)}
                  placeholder="confirmo"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowClearDbModal(false);
                  setClearDbConfirmText("");
                }}
                disabled={clearingDb}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleClearDatabase}
                disabled={clearingDb || clearDbConfirmText.toLowerCase() !== 'confirmo'}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {clearingDb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Apagar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Linking Drawer */}
      {linkingResultId && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50 animate-in fade-in duration-200" onClick={() => setLinkingResultId(null)}>
          <div className="bg-white shadow-2xl w-full max-w-2xl xl:max-w-4xl h-full overflow-hidden animate-in slide-in-from-right duration-300 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-purple-600" />
                <h3 className="font-semibold text-slate-800">Vincular XML Manualmente</h3>
              </div>
              <button onClick={() => { setLinkingResultId(null); setLinkSearchTerm(""); }} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">
                Selecione abaixo o XML correspondente para a nota <strong>{reconciliationResults.find(r => r.id === linkingResultId)?.systemInvoice?.numero}</strong> do fornecedor <strong>{reconciliationResults.find(r => r.id === linkingResultId)?.systemInvoice?.fornecedor}</strong>.
              </p>
              
              <div className="mb-4">
                <input 
                  type="text" 
                  placeholder="Buscar por fornecedor ou número da nota..." 
                  value={linkSearchTerm}
                  onChange={(e) => setLinkSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="max-h-[500px] overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-medium text-slate-600">Fornecedor</th>
                      <th className="px-4 py-2 font-medium text-slate-600">Nº Nota (XML)</th>
                      <th className="px-4 py-2 font-medium text-slate-600">Emissão</th>
                      <th className="px-4 py-2 font-medium text-slate-600">Valor Serviço</th>
                      <th className="px-4 py-2 font-medium text-slate-600">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const targetResult = reconciliationResults.find(r => r.id === linkingResultId);
                      if (!targetResult || !targetResult.systemInvoice) return null;
                      
                      const linkedXmlIds = new Set(
                        reconciliationResults
                          .filter(r => r.competence === selectedCompetence && r.xmlInvoice && r.status !== 'Não Lançado')
                          .map(r => r.xmlInvoice!.id)
                      );

                      const availableXmls = invoices.filter(inv => 
                        (!reconciliationCompany || inv.takerCnpj.replace(/[^\d]/g, '') === reconciliationCompany) &&
                        !linkedXmlIds.has(inv.id)
                      ).filter(inv => {
                        if (!linkSearchTerm) return true;
                        const term = linkSearchTerm.toLowerCase();
                        return inv.providerName.toLowerCase().includes(term) || 
                               inv.invoiceNumber.includes(term);
                      });

                      if (availableXmls.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                              Nenhum XML disponível encontrado.
                            </td>
                          </tr>
                        );
                      }

                      return availableXmls.map((xmlInv, idx) => (
                        <tr key={xmlInv.id || `available-xml-${idx}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium truncate max-w-[150px]" title={xmlInv.providerName}>
                            {xmlInv.providerName}
                          </td>
                          <td className="px-4 py-3 font-medium">{xmlInv.invoiceNumber}</td>
                          <td className="px-4 py-3">{formatDate(xmlInv.issueDate)}</td>
                          <td className="px-4 py-3">{formatCurrency(xmlInv.serviceValue)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={async () => {
                                if (!targetResult.systemInvoice) return;
                                
                                const sysInv = targetResult.systemInvoice;
                                
                                const divergences: string[] = [];
                                const errors: string[] = [];
                                const tolerance = 0.05;
                                
                                const sysCsrf = sysInv.pis + sysInv.cofins + sysInv.csll;
                                let xmlCsrf = xmlInv.retentions.pis + xmlInv.retentions.cofins + xmlInv.retentions.csll;
                                
                                // Regra: se a soma do sistema for igual à tag CSLL do XML, a tag CSLL contém o total (PCC)
                                const isCsllSumOfCsrf = Math.abs(sysCsrf - xmlInv.retentions.csll) <= tolerance && sysCsrf > 0;
                                
                                if (isCsllSumOfCsrf) {
                                  xmlCsrf = xmlInv.retentions.csll;
                                }

                                if (Math.abs(sysCsrf - xmlCsrf) > tolerance) {
                                  if (xmlCsrf > 0 && xmlCsrf < 10 && sysCsrf <= tolerance) {
                                    divergences.push(`PCC (CSRF) inferior a R$ 10,00 (${formatCurrency(xmlCsrf)}). Não há retenção no ERP.`);
                                  } else {
                                    if (Math.abs(sysInv.pis - xmlInv.retentions.pis) > tolerance) {
                                      divergences.push(`PIS divergente: Sist (${formatCurrency(sysInv.pis)}) vs XML (${formatCurrency(xmlInv.retentions.pis)})`);
                                      errors.push('PIS');
                                    }
                                    if (Math.abs(sysInv.cofins - xmlInv.retentions.cofins) > tolerance) {
                                      divergences.push(`COFINS divergente: Sist (${formatCurrency(sysInv.cofins)}) vs XML (${formatCurrency(xmlInv.retentions.cofins)})`);
                                      errors.push('COFINS');
                                    }
                                    if (Math.abs(sysInv.csll - xmlInv.retentions.csll) > tolerance) {
                                      divergences.push(`CSLL divergente: Sist (${formatCurrency(sysInv.csll)}) vs XML (${formatCurrency(xmlInv.retentions.csll)})`);
                                      errors.push('CSLL');
                                    }
                                  }
                                }

                                if (Math.abs(sysInv.irrf - xmlInv.retentions.ir) > tolerance) {
                                  if (xmlInv.retentions.ir > 0 && xmlInv.retentions.ir < 10 && sysInv.irrf <= tolerance) {
                                    divergences.push(`IRRF inferior a R$ 10,00 (${formatCurrency(xmlInv.retentions.ir)}). Não há retenção no ERP.`);
                                  } else {
                                    divergences.push(`IRRF divergente: Sist (${formatCurrency(sysInv.irrf)}) vs XML (${formatCurrency(xmlInv.retentions.ir)})`);
                                    errors.push('IRRF');
                                  }
                                }
                                if (Math.abs(sysInv.iss - xmlInv.retentions.iss) > tolerance) {
                                  divergences.push(`ISS divergente: Sist (${formatCurrency(sysInv.iss)}) vs XML (${formatCurrency(xmlInv.retentions.iss)})`);
                                  errors.push('ISS');
                                }
                                if (Math.abs(sysInv.inss - xmlInv.retentions.inss) > tolerance) {
                                  divergences.push(`INSS divergente: Sist (${formatCurrency(sysInv.inss)}) vs XML (${formatCurrency(xmlInv.retentions.inss)})`);
                                  errors.push('INSS');
                                }

                                const newStatus = errors.length > 0 ? 'Divergente' : 'Conciliado';
                                
                                const updatedResult: ReconciliationResult = {
                                  ...targetResult,
                                  xmlInvoice: xmlInv,
                                  status: newStatus,
                                  divergences,
                                  takerCnpj: xmlInv.takerCnpj,
                                  takerName: xmlInv.takerName,
                                  manuallyLinked: true,
                                };
                                
                                // Find if there's an existing "Não Lançado" result for this XML to delete it
                                const existingNaoLancado = reconciliationResults.find(r => r.xmlInvoice?.id === xmlInv.id && r.status === 'Não Lançado');

                                try {
                                  const batch = writeBatch(db);
                                  batch.set(doc(db, "reconciliations", targetResult.id), updatedResult, { merge: true });
                                  if (existingNaoLancado && existingNaoLancado.id) {
                                    batch.delete(doc(db, "reconciliations", existingNaoLancado.id));
                                  }
                                  if (xmlInv.id) {
                                    batch.update(doc(db, "invoices", xmlInv.id), { erpReconciled: true });
                                  }
                                  await batch.commit();
                                  
                                  setReconciliationResults(prev => {
                                    let newResults = prev.map(r => r.id === targetResult.id ? updatedResult : r);
                                    if (existingNaoLancado) {
                                      newResults = newResults.filter(r => r.id !== existingNaoLancado.id);
                                    }
                                    return newResults;
                                  });
                                  setInvoices(prev => prev.map(inv => inv.id === xmlInv.id ? { ...inv, erpReconciled: true } : inv));
                                  setLinkingResultId(null);
                                  setLinkSearchTerm("");
                                } catch (e) {
                                  console.error(e);
                                  alert("Erro ao vincular notas.");
                                }
                              }}
                              className="px-3 py-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md font-medium transition-colors"
                            >
                              Vincular
                            </button>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button 
                onClick={() => { setLinkingResultId(null); setLinkSearchTerm(""); }}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quick Company Modal */}
      {showQuickCompanyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setShowQuickCompanyModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
              <Building2 className="w-6 h-6 text-blue-600" />
              <h3 className="font-semibold text-slate-800">Cadastro Rápido de Empresa</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ *</label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={quickCompanyData.cnpj}
                  onChange={(e) => setQuickCompanyData({ ...quickCompanyData, cnpj: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razão Social *</label>
                <input
                  type="text"
                  placeholder="Nome Oficial da Empresa"
                  value={quickCompanyData.name}
                  onChange={(e) => setQuickCompanyData({ ...quickCompanyData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Identificador (Apelido)</label>
                <input
                  type="text"
                  placeholder="Ex: Matriz, Filial SP"
                  value={quickCompanyData.identifier}
                  onChange={(e) => setQuickCompanyData({ ...quickCompanyData, identifier: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => setShowQuickCompanyModal(false)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors text-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={handleQuickCompanyAdd}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
              >
                Salvar e Selecionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
