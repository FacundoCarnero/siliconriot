// ============================================================
// Public App — Silicon Riot
// Módulo ligero para el cliente público.
// Escucha en tiempo real site_config/general y expone
// funciones para guardar VIP Passes en Firestore.
// ============================================================

import { db } from './firebase-config.js';
import {
  doc,
  onSnapshot,
  collection,
  addDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ─── Referencias Firestore ─────────────────────────────────
const SITE_CONFIG_REF = doc(db, 'site_config', 'public');
const VIP_COLLECTION = collection(db, 'vip_passes');

// ─── Mapeo campo Firestore → elemento DOM ──────────────────
const FIELD_TO_EL = [
  { key: 'announcement',   el: () => document.getElementById('siteAnnouncement'),              apply: (el, v) => { el.textContent = v; el.style.display = v ? '' : 'none'; } },
  { key: 'heroTagline',    el: () => document.querySelector('[data-fb="heroTagline"]'),        apply: (el, v) => { el.textContent = v; } },
  { key: 'heroDescription',el: () => document.querySelector('[data-fb="heroDescription"]'),    apply: (el, v) => { el.textContent = v; } },
  { key: 'ctaText',        el: () => document.querySelector('[data-fb="ctaText"]'),            apply: (el, v) => { el.innerHTML = v ? `<i class="fa-solid fa-play"></i> ${v}` : el.innerHTML; } },
  { key: 'footerText',     el: () => document.querySelector('[data-fb="footerText"]'),         apply: (el, v) => { el.textContent = v; } },
  { key: 'spotifyUrl',     el: () => document.querySelectorAll('[data-firebase-spotify]'),     apply: (els, v) => { if (v) els.forEach((link) => { link.href = v; }); } },
  { key: 'instagramUrl',   el: () => document.querySelectorAll('[data-fb="instagramUrl"]'),    apply: (els, v) => { if (v) els.forEach((link) => { link.href = v; }); } },
  { key: 'youtubeUrl',     el: () => document.querySelectorAll('[data-fb="youtubeUrl"]'),      apply: (els, v) => { if (v) els.forEach((link) => { link.href = v; }); } },
  { key: 'beaconsUrl',     el: () => document.querySelectorAll('[data-fb="beaconsUrl"]'),      apply: (els, v) => { if (v) els.forEach((link) => { link.href = v; }); } },
  { key: 'appleMusicUrl',  el: () => document.querySelectorAll('[data-fb="appleMusicUrl"]'),   apply: (els, v) => { if (v) els.forEach((link) => { link.href = v; }); } },
  { key: 'amazonMusicUrl', el: () => document.querySelectorAll('[data-fb="amazonMusicUrl"]'),  apply: (els, v) => { if (v) els.forEach((link) => { link.href = v; }); } },
];

// ─── 1. Listener de site_config/general ────────────────────
// Escucha cambios en vivo y actualiza la UI.
onSnapshot(
  SITE_CONFIG_REF,
  (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();

    FIELD_TO_EL.forEach(({ key, el, apply }) => {
      const target = el();
      if (!target) return;
      const value = data[key];
      if (value !== undefined && value !== null) {
        apply(target, String(value).trim());
      }
    });

    // updatedAt — opcional, para debug
    const tsEl = document.getElementById('configUpdatedAt');
    if (tsEl && data.updatedAt?.toDate) {
      tsEl.textContent = data.updatedAt.toDate().toLocaleString();
    }
  },
  (error) => {
    console.warn('Firestore snapshot error (site_config):', error);
  }
);

// ─── 2. Guardar VIP Pass en Firestore ──────────────────────
// Expuesta al scope global para que el código inline
// de index.html pueda llamarla sin ser module.

/**
 * Guarda un VIP Pass generado en Firestore.
 * @param {string} name  - Nombre o alias del titular
 * @param {string} passId - ID único del pase (SR-YYYYMMDD-XXXX)
 * @returns {Promise<string|null>} ID del documento o null si falla
 */
async function saveVIPPassToFirestore(name, passId) {
  try {
    const docRef = await addDoc(VIP_COLLECTION, {
      name: name.trim().toUpperCase(),
      passId,
      createdAt: serverTimestamp(),
      source: 'web-public',
    });
    return docRef.id;
  } catch (err) {
    console.warn('Firebase saveVIPPass error:', err);
    return null;
  }
}

// ─── 3. Exponer al scope global ────────────────────────────
window.__firebaseReady = true;
window.__saveVIPPass = saveVIPPassToFirestore;

console.log('[PublicApp] Firebase listeners active.');
