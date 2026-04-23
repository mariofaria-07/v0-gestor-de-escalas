import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = firebaseConfig.apiKey ? initializeApp(firebaseConfig) : (function() {
  const msg = "ERRO CRÍTICO: .env.local está ausente! O Firebase (Login e Banco de Dados) não vai funcionar.";
  console.error(msg);
  if (typeof window !== "undefined") alert(msg);
  return initializeApp({ apiKey: 'mock' }); // previne crash total da pagina para exibir o erro
})();
export const db = getFirestore(app);
export const auth = getAuth(app);
