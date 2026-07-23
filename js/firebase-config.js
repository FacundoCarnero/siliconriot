// ============================================================
// Firebase Config — Silicon Riot
// Inicializa Firebase App, Auth y Firestore (v10 ESM via CDN)
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ─── Configuración ─────────────────────────────────────────
// Reemplazá estos valores con los de tu proyecto en Firebase Console.
// https://console.firebase.google.com/ → Project Settings → General → Your apps → Web
const firebaseConfig = {
  apiKey: "AIzaSyDOt-Guoi0CmtE2tO5H5pCDTIlvQpYUBPc",
  authDomain: "siliconriot-ae86e.firebaseapp.com",
  projectId: "siliconriot-ae86e",
  storageBucket: "siliconriot-ae86e.firebasestorage.app",
  messagingSenderId: "907760728875",
  appId: "1:907760728875:web:54a3a4d38e5fb87b58636e",
  measurementId: "G-8TY409LQNG"
};

// ─── Inicialización ────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
