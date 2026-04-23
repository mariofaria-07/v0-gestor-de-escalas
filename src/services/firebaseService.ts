import { collection, getDocs, query, orderBy, setDoc, doc, updateDoc, writeBatch, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { InvoiceData } from "../lib/parser";
import { Company, ReconciliationResult, ClosedMonth } from "../types";

export const FirebaseService = {
  async fetchInvoices(): Promise<InvoiceData[]> {
    const q = query(collection(db, "invoices"), orderBy("uploadDate", "desc"));
    const querySnapshot = await getDocs(q);
    const data: InvoiceData[] = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() } as InvoiceData);
    });
    return data;
  },

  async fetchCompanies(): Promise<Company[]> {
    const q = query(collection(db, "companies"));
    const querySnapshot = await getDocs(q);
    const data: Company[] = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() } as Company);
    });
    return data;
  },

  async fetchReconciliations(): Promise<ReconciliationResult[]> {
    const q = query(collection(db, "reconciliations"));
    const querySnapshot = await getDocs(q);
    const data: ReconciliationResult[] = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() } as ReconciliationResult);
    });
    return data;
  },

  async fetchClosedMonths(): Promise<ClosedMonth[]> {
    const q = query(collection(db, "closed_months"));
    const querySnapshot = await getDocs(q);
    const data: ClosedMonth[] = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() } as ClosedMonth);
    });
    return data;
  },

  async fetchAuditLogs(): Promise<any[]> {
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const data: any[] = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });
    return data;
  },

  async fetchWeeklyControls(): Promise<Record<string, any>> {
    const q = query(collection(db, "weekly_controls"));
    const querySnapshot = await getDocs(q);
    const data: Record<string, any> = {};
    querySnapshot.forEach((doc) => {
      data[doc.id] = doc.data();
    });
    return data;
  },

  async logAdminAction(userEmail: string, action: string, metadata: any) {
    try {
      const logRef = doc(collection(db, "audit_logs"));
      await setDoc(logRef, {
        action,
        userEmail: userEmail || 'Desconhecido',
        timestamp: new Date().toISOString(),
        ...metadata
      });
    } catch(err) {
      console.error("Failed to log action", err);
    }
  }
};
