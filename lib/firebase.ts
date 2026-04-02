import { initializeApp, getApps } from "firebase/app"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyD_aN8Uz1s9nU1ETSAQ6FdQLwmll4hIPus",
  authDomain: "gastos-pessoais-2026.firebaseapp.com",
  databaseURL: "https://gastos-pessoais-2026-default-rtdb.firebaseio.com",
  projectId: "gastos-pessoais-2026",
  storageBucket: "gastos-pessoais-2026.firebasestorage.app",
  messagingSenderId: "104931701304",
  appId: "1:104931701304:web:8a9c7ba145c8549b46accd",
  measurementId: "G-GX2B6BY240"
}

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const db = getFirestore(app)

export { db }
