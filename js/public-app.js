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
const DEDICATIONS_COLLECTION = collection(db, 'dedications');
const FAN_WALL_COLLECTION = collection(db, 'fan_wall');

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
  { key: 'youtubeMusicUrl',el: () => document.querySelectorAll('[data-fb="youtubeMusicUrl"]'), apply: (els, v) => { if (v) els.forEach((link) => { link.href = v; }); } },
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

    // Capture the mail template from Firestore (no DOM element needed).
    if (data.mailTemplate) mailTemplate = data.mailTemplate;

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

// ─── 3. Dedications — submit con verificación por mail ────
// Expuesta al scope global para que el código inline
// de index.html pueda llamarla sin ser module.

// Worker (Cloudflare) que envía el mail de verificación via Resend.
const WORKER_URL = 'https://siliconriot-verify.ramusito.workers.dev/';

// Verification email template, editable from site_config/public.mailTemplate.
let mailTemplate = '';

/**
 * Hashea un string a SHA-256 en hex (crypto.subtle, async).
 * @param {string} text
 * @returns {Promise<string>}
 */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Default email template — same design as the original Worker email.
// Used when site_config/public.mailTemplate is empty or invalid.
const DEFAULT_MAIL_TEMPLATE = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;background:#0a0a0a;color:#e5e5e5;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#1a1a1a 0%,#0a0a0a 60%);padding:36px 36px 24px;text-align:center;border-bottom:1px solid #d4a843;">
      <img src="https://silicon-riot.com/assets/Silicon%20Riot%20Dorado.png" alt="SILICON RIOT" style="max-width:220px;max-height:70px;display:block;margin:0 auto 14px;" />
      <div style="letter-spacing:4px;color:#d4a843;font-size:11px;text-transform:uppercase;">Official Fan Community</div>
    </div>
    <div style="padding:32px 36px;text-align:center;">
      <div style="font-size:14px;color:#8a8782;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;">Be part of the song</div>
      <h2 style="font-size:22px;color:#f0ede8;margin:0 0 16px;letter-spacing:0.5px;">Hi <strong style="color:#d4a843;">{{name}}</strong>,</h2>
      <p style="font-size:14px;line-height:1.7;color:#b8b5ae;margin:0 0 24px;">Thanks for wanting to be part of a Silicon Riot song.<br/>Confirm your dedication by clicking the button below:</p>
      <a href="{{verifyUrl}}" style="display:inline-block;padding:14px 36px;background:#d4a843;color:#0a0a0a;text-decoration:none;font-weight:bold;border-radius:6px;letter-spacing:2px;font-size:13px;text-transform:uppercase;">Confirm Dedication</a>
    </div>
    <div style="padding:18px 36px;background:#111111;border-top:1px solid #222;">
      <p style="font-size:12px;color:#777;margin:0;text-align:center;line-height:1.6;">If this was not you, ignore this email.<br/>Your address is only used to confirm your dedication.<br/><span style="color:#d4a843;letter-spacing:2px;">SILICON RIOT</span></p>
    </div>
  </div>
`;

/**
 * Builds the verification email HTML from the Firestore template
 * (mailTemplate), or falls back to the built-in default.
 * The name is sanitized to avoid HTML injection.
 * @param {string} name - Fan name or alias
 * @param {string} verifyUrl - Verification link
 * @returns {string}
 */
function buildMailHTML(name, verifyUrl) {
  const template =
    typeof mailTemplate === 'string' && mailTemplate.includes('{{name}}')
      ? mailTemplate
      : DEFAULT_MAIL_TEMPLATE;
  return template
    .replaceAll('{{name}}', (name || '').replace(/[<>&]/g, ''))
    .replaceAll('{{verifyUrl}}', verifyUrl);
}

/**
 * Saves a dedication (status 'sin_verificar' + token hash)
 * y dispara el mail de verificación vía Worker.
 * @param {string} displayName - Nombre para el ticker/admin: "ADRIAN T."
 * @param {string} firstName   - Primer nombre, para el saludo del mail
 * @param {string} message     - Frase o idea para la canción (opcional)
 * @param {string} email       - Mail del fan (solo para confirmar)
 * @returns {Promise<{ok:boolean, docId?:string, error?:string}>}
 */
async function submitDedication(displayName, firstName, message, email) {
  const emailClean = email.trim().toLowerCase();
  const rawToken = crypto.randomUUID();

  try {
    const verificationTokenHash = await sha256Hex(rawToken);
    const docRef = await addDoc(DEDICATIONS_COLLECTION, {
      name: displayName.trim().toUpperCase(),
      message: message.trim(),
      email: emailClean,
      status: 'sin_verificar',
      verificationTokenHash,
      createdAt: serverTimestamp(),
      source: 'web-public',
    });

    const verifyUrl =
      'https://silicon-riot.com/verify.html?id=' + encodeURIComponent(docRef.id) +
      '&token=' + encodeURIComponent(rawToken) +
      '&name=' + encodeURIComponent(displayName.trim().toUpperCase()) +
      '&msg=' + encodeURIComponent(message.trim());

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: emailClean, name: firstName.trim(), html: buildMailHTML(firstName.trim(), verifyUrl) }),
    });

    if (!res.ok) {
      console.warn('[PublicApp] Worker mail error:', res.status, await res.text().catch(() => ''));
      return { ok: false, docId: docRef.id, error: 'Could not send the confirmation email.' };
    }

    return { ok: true, docId: docRef.id };
  } catch (err) {
    console.warn('Firebase submitDedication error:', err);
    return { ok: false, error: 'Error sending. Try again.' };
  }
}

// ─── 3b. Fan Wall Ticker ────────────────────────────────────
// Muestra las ideas/frases que mandaron los fans (solo las
// verificadas por email) en un banner deslizante.
// Lee la colección pública fan_wall (sin email, sin auth).

function escTicker(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_META = {
  'pendiente':      { label: 'PENDING',        cls: 'pending' },
  'en produccion':  { label: 'IN PRODUCTION',  cls: 'in-production' },
  'publicado':      { label: 'PUBLISHED',      cls: 'published' },
};

// Dedications de ejemplo — solo decorativas (no viven en Firestore).
// Se mezclan con las reales para que el Fan Wall se vea vivo.
const SAMPLE_DEDICATIONS = [
  { label: 'ADRIAN T.: A laser sunset over the city',    status: 'pendiente' },
  { label: 'CAROLINA M.: Synthesizers at 3am',           status: 'pendiente' },
  { label: 'DANIEL R.: The ghost in the machine',        status: 'publicado' },
  { label: 'SOFIA L.: Chrome hearts and neon rain',      status: 'en produccion' },
  { label: 'MARCUS K.: Fade to the final frontier',      status: 'publicado' },
  { label: 'ISABEL C.: Drive through a storm of pixels', status: 'en produccion' },
  { label: 'TOMAS G.: The radio speaks my name',         status: 'publicado' },
];

function statusBadge(status) {
  const meta = STATUS_META[status];
  if (!meta) return '';
  return `<span class="dedication-status ${meta.cls}">${meta.label}</span>`;
}

function renderTicker(items) {
  const ticker = document.getElementById('dedicationTicker');
  const track  = document.getElementById('dedicationTrack');
  if (!ticker || !track) return;

  // Mezcla: ejemplos decorativos + dedications reales.
  // Los ejemplos van primeros; si hay reales, se intercalan detrás.
  const mixed = [...SAMPLE_DEDICATIONS, ...items];

  const html = mixed
    .map((item) => {
      const { label, status } = item;
      const idx = label.indexOf(': ');
      if (idx === -1) return `<span class="dedication-item"><strong>${escTicker(label)}</strong>${statusBadge(status)}</span>`;
      const name = label.slice(0, idx);
      const msg  = label.slice(idx + 2);
      return `<span class="dedication-item"><strong>${escTicker(name)}</strong>: ${escTicker(msg)}${statusBadge(status)}</span>`;
    })
    .join('');

  // Duplicado para que el loop translateX(-50%) sea continuo.
  // La etiqueta fija "// YOUR IDEAS" vive en el HTML, no acá.
  track.innerHTML = html + '<span style="display:inline-block;width:3rem;"></span>' + html;
  ticker.classList.add('active');
}

// Render inicial: muestra los ejemplos decorativos de inmediato,
// sin esperar a Firestore. Cuando llegan las reales, se mezclan.
renderTicker([]);

onSnapshot(
  FAN_WALL_COLLECTION,
  (snapshot) => {
    const items = [];
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.status === 'sin_verificar') return; // ocultar no verificadas
      if (!d.name) return;
      const label = d.message && String(d.message).trim()
        ? d.name + ': ' + String(d.message).trim()
        : d.name;
      items.push({ label, status: d.status || 'pendiente' });
    });
    renderTicker(items);
  },
  (err) => { console.warn('[PublicApp] Fan wall ticker error:', err); }
);

// ─── 4. Exponer al scope global ────────────────────────────
window.__firebaseReady = true;
window.__saveVIPPass = saveVIPPassToFirestore;
window.__submitDedication = submitDedication;

console.log('[PublicApp] Firebase listeners active.');
