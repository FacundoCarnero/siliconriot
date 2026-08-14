// ============================================================
// Admin App — Silicon Riot
// Lógica del panel de administración: autenticación y CRUD
// de site_config + visualización de VIP Passes.
// ============================================================

import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ─── Refs del DOM ──────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const loginSection = $('loginSection');
const adminLayout = $('adminLayout');
const loginForm = $('loginForm');
const loginEmail = $('loginEmail');
const loginPassword = $('loginPassword');
const loginError = $('loginError');
const logoutBtn = $('logoutBtn');
const adminEmail = $('adminEmail');

// Site Config
const configForm = $('configForm');
const configStatus = $('configStatus');
const configFields = [
  'configHeroTagline', 'configHeroDesc', 'configCtaText',
  'configSpotifyUrl', 'configInstagramUrl', 'configYoutubeUrl', 'configBeaconsUrl',
  'configAppleMusicUrl', 'configAmazonMusicUrl', 'configYoutubeMusicUrl',
  'configFooterText', 'configAnnouncement', 'configMailTemplate',
  'configYtApiKey', 'configYtChannelId',
  'configSiteUrl',
  'configSpotifyClientId', 'configSpotifyClientSecret', 'configSpotifyArtistId',
].reduce((map, id) => { map[id] = $(id); return map; }, {});

// VIP Passes
const vipList = $('vipList');

// Dedications
const dedicationList = $('dedicationList');
const dashRecentDedications = $('dashRecentDedications');
const copyDedicationNamesBtn = $('copyDedicationNamesBtn');

// Dashboard
const dashVipCount = $('dashVipCount');
const dashVisits = $('dashVisits');
const dashAlbumCount = $('dashAlbumCount');
const dashConfigStatus = $('dashConfigStatus');
const dashRecentVip = $('dashRecentVip');
const dashYtSubs = $('dashYtSubs');
const dashYtViews = $('dashYtViews');
const dashYtVideos = $('dashYtVideos');
const dashPageSpeedScore = $('dashPageSpeedScore');
const dashPageSpeedMeta = $('dashPageSpeedMeta');
const dashSpotify = $('dashSpotify');
const dashSpotifyMeta = $('dashSpotifyMeta');
const refreshDashBtn = $('refreshDashBtn');

// ─── Sidebar Navigation ─────────────────────────────────────
const navItems = document.querySelectorAll('.nav-item');
const pages = {
  dashboard: $('pageDashboard'),
  config: $('pageConfig'),
  albums: $('pageAlbums'),
  vip: $('pageVip'),
  dedications: $('pageDedications'),
};

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    Object.entries(pages).forEach(([key, el]) => {
      el.classList.toggle('active', key === page);
    });
  });
});

// ─── Auth State ─────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    showDashboard(user);
  } else {
    showLogin();
  }
});

// ─── UI Helpers ─────────────────────────────────────────────
function showLogin() {
  loginSection.style.display = '';
  adminLayout.classList.remove('visible');
  loginForm.reset();
  loginError.textContent = '';
}

function showDashboard(user) {
  loginSection.style.display = 'none';
  adminLayout.classList.add('visible');
  adminEmail.textContent = user.email;

  loadSiteConfig();
  listenVIPPasses();
  listenDedications();
  listenAlbums();
  fetchVisitorCount();
  fetchYouTubeStats();
  fetchPageSpeedStats();
  fetchSpotifyStats();
}

// ─── Login / Logout ────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    const messages = {
      'auth/invalid-credential': 'Email o contraseña incorrectos.',
      'auth/invalid-email': 'El email no es válido.',
      'auth/user-disabled': 'Esta cuenta fue deshabilitada.',
      'auth/user-not-found': 'No hay usuario con ese email.',
      'auth/wrong-password': 'Contraseña incorrecta.',
    };
    loginError.textContent = messages[err.code] || 'Error al iniciar sesión.';
  }
});

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
  stopVIPListener();
  stopDedicationListener();
  window.location.href = 'index.html';
});

// ─── Forgot password ────────────────────────────────────────
const forgotPasswordBtn = $('forgotPasswordBtn');

forgotPasswordBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  loginError.classList.remove('success');
  const email = loginEmail.value.trim();

  if (!email) {
    loginError.textContent = 'Enter your email above to send the recovery link.';
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    loginError.classList.add('success');
    loginError.textContent = 'We sent a recovery link to ' + email + '. Check your inbox (and spam).';
  } catch (err) {
    const messages = {
      'auth/invalid-email': 'El email no es válido.',
      'auth/user-not-found': 'No hay ningún usuario registrado con ese email.',
    };
    loginError.textContent = messages[err.code] || 'Error al enviar el mail de recuperación.';
  }
});

// ─── Site Config (lectura + escritura) ─────────────────────
const SITE_CONFIG_REF    = doc(db, 'site_config', 'general');  // secrets, API keys
const SITE_CONFIG_PUBLIC = doc(db, 'site_config', 'public');   // datos visibles en el site

// Mapa campo del form → campo Firestore (datos PRIVADOS — site_config/general)
const PRIVATE_FIELD_MAP = {
  configYtApiKey: 'youtubeApiKey',
  configYtChannelId: 'youtubeChannelId',
  configSiteUrl: 'siteUrl',
  configSpotifyClientId: 'spotifyClientId',
  configSpotifyClientSecret: 'spotifyClientSecret',
  configSpotifyArtistId: 'spotifyArtistId',
};

// Mapa campo del form → campo Firestore (datos PÚBLICOS — site_config/public)
const PUBLIC_FIELD_MAP = {
  configHeroTagline: 'heroTagline',
  configHeroDesc: 'heroDescription',
  configCtaText: 'ctaText',
  configSpotifyUrl: 'spotifyUrl',
  configInstagramUrl: 'instagramUrl',
  configYoutubeUrl: 'youtubeUrl',
  configBeaconsUrl: 'beaconsUrl',
  configFooterText: 'footerText',
  configAnnouncement: 'announcement',
  configMailTemplate: 'mailTemplate',
  configAppleMusicUrl: 'appleMusicUrl',
  configAmazonMusicUrl: 'amazonMusicUrl',
  configYoutubeMusicUrl: 'youtubeMusicUrl',
};

async function loadSiteConfig() {
  try {
    Object.keys(configFields).forEach((id) => { configFields[id].value = ''; });

    // Cargar datos privados
    const snapPriv = await getDoc(SITE_CONFIG_REF);
    if (snapPriv.exists()) {
      const data = snapPriv.data();
      Object.entries(PRIVATE_FIELD_MAP).forEach(([id, fireKey]) => {
        if (data[fireKey] !== undefined) configFields[id].value = data[fireKey];
      });
    }

    // Cargar datos públicos
    const snapPub = await getDoc(SITE_CONFIG_PUBLIC);
    if (snapPub.exists()) {
      const data = snapPub.data();
      Object.entries(PUBLIC_FIELD_MAP).forEach(([id, fireKey]) => {
        if (data[fireKey] !== undefined) configFields[id].value = data[fireKey];
      });
    }
  } catch (err) {
    configStatus.textContent = '✗ Error al cargar configuración.';
    configStatus.className = 'status-msg status-error';
  }
  updateDashConfigStatus();
}

async function updateDashConfigStatus() {
  if (!dashConfigStatus) return;
  try {
    const [snapPriv, snapPub] = await Promise.all([
      getDoc(SITE_CONFIG_REF),
      getDoc(SITE_CONFIG_PUBLIC),
    ]);
    const campos = [
      'heroTagline','heroDescription','ctaText','spotifyUrl','instagramUrl',
      'youtubeUrl','beaconsUrl','appleMusicUrl','amazonMusicUrl','youtubeMusicUrl','footerText','announcement','mailTemplate',
      'youtubeApiKey','youtubeChannelId','siteUrl','spotifyClientId',
      'spotifyClientSecret','spotifyArtistId',
    ];
    let filled = 0;
    const d1 = snapPriv.exists() ? snapPriv.data() : {};
    const d2 = snapPub.exists() ? snapPub.data() : {};
    campos.forEach(k => {
      const v = d1[k] ?? d2[k] ?? '';
      if (v && String(v).trim()) filled++;
    });
    dashConfigStatus.textContent = `${filled}/${campos.length} completados`;
    dashConfigStatus.style.color = filled > 5 ? 'var(--gold)' : 'var(--white-dim2)';
  } catch {
    dashConfigStatus.textContent = '—';
  }
}

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  configStatus.textContent = 'Guardando…';
  configStatus.className = 'status-msg';

  try {
    const now = serverTimestamp();

    // Guardar datos privados (admin-only)
    const privPayload = { updatedAt: now };
    Object.entries(PRIVATE_FIELD_MAP).forEach(([id, fireKey]) => {
      privPayload[fireKey] = configFields[id].value.trim();
    });
    await setDoc(SITE_CONFIG_REF, privPayload, { merge: true });

    // Guardar datos públicos
    const pubPayload = { updatedAt: now };
    Object.entries(PUBLIC_FIELD_MAP).forEach(([id, fireKey]) => {
      pubPayload[fireKey] = configFields[id].value.trim();
    });
    await setDoc(SITE_CONFIG_PUBLIC, pubPayload, { merge: true });

    configStatus.textContent = '✓ Configuración guardada.';
    configStatus.className = 'status-msg status-ok';
    updateDashConfigStatus();
  } catch (err) {
    configStatus.textContent = `✗ Error: ${err.message}`;
    configStatus.className = 'status-msg status-error';
  }
});

// ─── VIP Passes (en tiempo real) ───────────────────────────
let unsubVIP = null;

function listenVIPPasses() {
  unsubVIP = onSnapshot(
    query(collection(db, 'vip_passes'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      const total = snapshot.size;

      // Dashboard counter
      if (dashVipCount) dashVipCount.textContent = String(total).padStart(2, '0');

      // VIP page table
      if (snapshot.empty) {
        vipList.innerHTML =
          '<tr><td colspan="4" class="empty-state">Todavía no se generaron pases VIP.</td></tr>';
        if (dashRecentVip) dashRecentVip.innerHTML = '<tr><td colspan="3" class="empty-state">Sin datos aún.</td></tr>';
        return;
      }

      let vipHtml = '';
      let recentHtml = '';
      let i = 0;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate().toLocaleString()
          : '—';

        vipHtml += `
          <tr>
            <td>${data.passId || '—'}</td>
            <td>${data.name || '—'}</td>
            <td>${createdAt}</td>
            <td>
              <button class="btn-sm btn-danger" data-pass-id="${docSnap.id}" onclick="deleteVIPPass('${docSnap.id}')">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </td>
          </tr>`;

        if (i < 5) {
          recentHtml += `
          <tr>
            <td>${data.passId || '—'}</td>
            <td>${data.name || '—'}</td>
            <td>${createdAt}</td>
          </tr>`;
        }
        i++;
      });
      vipList.innerHTML = vipHtml;
      if (dashRecentVip) dashRecentVip.innerHTML = recentHtml;
    },
    (err) => {
      vipList.innerHTML = `<tr><td colspan="4" class="empty-state">Error al cargar VIP Passes.</td></tr>`;
      console.warn('[Admin] VIP pass listener error:', err);
    }
  );
}

function stopVIPListener() {
  if (unsubVIP) {
    unsubVIP();
    unsubVIP = null;
  }
}

// ─── Eliminar VIP Pass ─────────────────────────────────────
// Expuesta al global porque es llamada desde el onclick en el HTML.
window.deleteVIPPass = async (passId) => {
  if (!confirm('¿Eliminar este VIP Pass?')) return;

  try {
    await deleteDoc(doc(db, 'vip_passes', passId));
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
};

// ─── Dedications (en tiempo real) ──────────────────────────
let unsubDedications = null;
let dedicationsData = []; // datos actuales para el copiado de nombres

function listenDedications() {
  unsubDedications = onSnapshot(
    query(collection(db, 'dedications'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      dedicationsData = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Ocultar dedications sin verificar por mail
        if (data.status === 'sin_verificar') return;

        dedicationsData.push({ _id: docSnap.id, ...data });
      });
      renderDedications();
    },
    (err) => {
      if (dedicationList) dedicationList.innerHTML = `<tr><td colspan="7" class="empty-state">Error loading dedications.</td></tr>`;
      console.warn('[Admin] Dedications listener error:', err);
    }
  );
}

// ─── Opciones del selector de track por dedication ──────────
// Lista todos los tracks de albumsData como "Album — Track";
// el valor es "albumId:trackIdx" ('' = sin asignar).
function dedicationTrackOptions(selectedRef) {
  if (!albumsData.length) {
    return '<option value="">No albums loaded</option>';
  }
  let html = '<option value="">— Not assigned —</option>';
  albumsData.forEach((album) => {
    const albumTitle = album.title || 'Sin título';
    (album.tracks || []).forEach((t, idx) => {
      const val = album._id + ':' + idx;
      const selected =
        selectedRef && selectedRef.albumId === album._id && selectedRef.trackIdx === idx;
      html +=
        `<option value="${val}"${selected ? ' selected' : ''}>` +
        `${escHtml(albumTitle)} — ${escHtml(t.title || ('Track ' + (idx + 1)))}</option>`;
    });
  });
  return html;
}

// ─── Render de la tabla de dedications ─────────────────────
// Se llama desde el snapshot de dedications y también desde el
// snapshot de albums, para repoblar los selectores si albumsData
// llega después que las dedications (race de carga).
function renderDedications() {
  let dedicationHtml = '';
  let recentHtml = '';
  let i = 0;

  dedicationsData.forEach((data) => {
    const createdAt = data.createdAt?.toDate
      ? data.createdAt.toDate().toLocaleString()
      : '—';
    const status = data.status || 'pendiente';
    const statusOptions = [
      ['pendiente', 'Pending'],
      ['en produccion', 'In production'],
      ['publicado', 'Published'],
    ].map(([val, label]) =>
      `<option value="${val}" ${status === val ? 'selected' : ''}>${label}</option>`
    ).join('');

    const isPublished = status === 'publicado';
    const trackOptions = dedicationTrackOptions(data.collabRef || null);

    dedicationHtml += `
      <tr>
        <td>${escHtml(data.name) || '—'}</td>
        <td>${escHtml(data.message) || '—'}</td>
        <td>${escHtml(data.email) || '—'}</td>
        <td>
          <select class="status-select" onchange="setDedicationTrack('${data._id}', this.value)" ${isPublished ? '' : 'disabled'}>
            ${trackOptions}
          </select>
        </td>
        <td>
          <select class="status-select" onchange="setDedicationStatus('${data._id}', this.value)">
            ${statusOptions}
          </select>
        </td>
        <td>${createdAt}</td>
        <td>
          <button class="btn-sm btn-danger" onclick="deleteDedication('${data._id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>`;

    if (i < 5) {
      recentHtml += `
      <tr>
        <td>${escHtml(data.name) || '—'}</td>
        <td>${status === 'publicado' ? 'Published' : status === 'en produccion' ? 'In production' : 'Pending'}</td>
        <td>${createdAt}</td>
      </tr>`;
    }
    i++;
  });

  if (!dedicationsData.length) {
    dedicationHtml =
      '<tr><td colspan="7" class="empty-state">No dedications yet.</td></tr>';
    if (dashRecentDedications) dashRecentDedications.innerHTML = '<tr><td colspan="3" class="empty-state">No data yet.</td></tr>';
  } else if (dashRecentDedications) {
    dashRecentDedications.innerHTML = recentHtml;
  }
  if (dedicationList) dedicationList.innerHTML = dedicationHtml;
}

function stopDedicationListener() {
  if (unsubDedications) {
    unsubDedications();
    unsubDedications = null;
  }
}

// ─── Cambiar estado de una dedication ──────────────────────
async function setAlbumTrackCollab(albumId, trackIdx, collab) {
  const albumRef = doc(db, 'albums', albumId);
  const albumSnap = await getDoc(albumRef);
  const tracks = albumSnap.data()?.tracks;
  if (!albumSnap.exists() || !Array.isArray(tracks) || !tracks[trackIdx]) {
    throw new Error('Album track not found.');
  }
  const nextTracks = tracks.map((track, index) =>
    index === trackIdx ? { ...track, collab } : track
  );
  await updateDoc(albumRef, { tracks: nextTracks });
}

// Expuesta al global porque es llamada desde el onchange del select.
window.setDedicationStatus = async (id, status) => {
  try {
    await updateDoc(doc(db, 'dedications', id), { status });
  } catch (err) {
    alert('Error updating status: ' + err.message);
    return;
  }

  // Al pasar a 'publicado', reaplicar el crédito guardado (si hay
  // collabRef previo) por si el track quedó sin el nombre. Es
  // idempotente: sobreescribe con el mismo nombre del fan.
  if (status === 'publicado') {
    const dedication = dedicationsData.find((d) => d._id === id);
      const ref = dedication && dedication.collabRef;
    if (dedication && dedication.name && ref && ref.albumId && typeof ref.trackIdx === 'number') {
      try {
        await setAlbumTrackCollab(ref.albumId, ref.trackIdx, dedication.name);
      } catch (err) {
        console.warn('[Admin] collab reapply skipped:', err);
      }
    }
  }

  // Mirror the status into the public fan_wall copy so the ticker
  // badge stays in sync. Ignore failures: the doc may not exist yet
  // (dedications created before this feature) — the ticker still
  // falls back to 'pendiente'.
  try {
    await updateDoc(doc(db, 'fan_wall', id), { status });
  } catch (err) {
    console.warn('[Admin] fan_wall status sync skipped:', err);
  }
};

// ─── Asignar track a una dedication (crédito de colaboración) ──
// Expuesta al global porque es llamada desde el onchange del select.
// Guarda la referencia collabRef en la dedication y escribe el
// nombre del fan en albums/<albumId>/tracks[<idx>].collab. Seleccionar
// un valor vacío limpia la referencia y el crédito del track previo.
window.setDedicationTrack = async (id, value) => {
  const dedication = dedicationsData.find((d) => d._id === id);
  if (!dedication) return;

  let collabRef = null;
  let albumId = '';
  let trackIdx = -1;

  if (value) {
    const parts = value.split(':');
    albumId = parts[0] || '';
    trackIdx = parseInt(parts[1], 10);
    if (!albumId || isNaN(trackIdx) || trackIdx < 0) {
      alert('Invalid track selection.');
      return;
    }
    collabRef = { albumId, trackIdx };
  }

  const fanName = dedication.name || '';

  try {
    // `tracks` es un array de objetos: Firestore no permite actualizar
    // tracks.0.collab como un dotted path. Leemos, modificamos y guardamos
    // el array dentro de una transacción para no perder otros campos.
    await runTransaction(db, async (transaction) => {
      const dedicationRef = doc(db, 'dedications', id);
      const dedicationSnap = await transaction.get(dedicationRef);
      if (!dedicationSnap.exists()) throw new Error('Dedication not found.');

      const previous = dedicationSnap.data().collabRef;
      const albumIds = new Set();
      if (collabRef) albumIds.add(collabRef.albumId);
      if (previous?.albumId) albumIds.add(previous.albumId);

      const albumSnapshots = new Map();
      for (const currentAlbumId of albumIds) {
        const albumRef = doc(db, 'albums', currentAlbumId);
        albumSnapshots.set(currentAlbumId, {
          ref: albumRef,
          snap: await transaction.get(albumRef),
        });
      }

      if (collabRef) {
        const target = albumSnapshots.get(collabRef.albumId);
        const targetTracks = target?.snap.data()?.tracks;
        if (!target?.snap.exists() || !Array.isArray(targetTracks) || !targetTracks[trackIdx]) {
          throw new Error('Selected album track was not found.');
        }
        const nextTracks = targetTracks.map((track, index) =>
          index === trackIdx ? { ...track, collab: fanName } : track
        );
        transaction.update(target.ref, { tracks: nextTracks });
      }

      // Limpiar el crédito anterior si se cambió de track o se desasignó.
      if (
        previous?.albumId &&
        typeof previous.trackIdx === 'number' &&
        (!collabRef || previous.albumId !== collabRef.albumId || previous.trackIdx !== collabRef.trackIdx)
      ) {
        const previousAlbum = albumSnapshots.get(previous.albumId);
        const previousTracks = previousAlbum?.snap.data()?.tracks;
        if (previousAlbum?.snap.exists() && Array.isArray(previousTracks) && previousTracks[previous.trackIdx]) {
          const clearedTracks = previousTracks.map((track, index) =>
            index === previous.trackIdx ? { ...track, collab: '' } : track
          );
          transaction.update(previousAlbum.ref, { tracks: clearedTracks });
        }
      }

      transaction.update(dedicationRef, { collabRef });
    });
  } catch (err) {
    alert('Error updating track assignment: ' + err.message);
  }
};

// ─── Eliminar dedication ───────────────────────────────────
// Expuesta al global porque es llamada desde el onclick en el HTML.
window.deleteDedication = async (id) => {
  if (!confirm('Delete this dedication?')) return;

  try {
    await deleteDoc(doc(db, 'dedications', id));
  } catch (err) {
    alert('Error deleting: ' + err.message);
    return;
  }

  // Also delete the public fan_wall copy (same doc id). Ignore
  // failures — old dedications may have no fan_wall doc at all.
  try {
    await deleteDoc(doc(db, 'fan_wall', id));
  } catch (err) {
    console.warn('[Admin] fan_wall delete sync skipped:', err);
  }
};

// ─── Copiar nombres de dedications publicadas ──────────────
if (copyDedicationNamesBtn) {
  copyDedicationNamesBtn.addEventListener('click', async () => {
    const published = dedicationsData.filter((d) => d.status === 'publicado');
    if (!published.length) {
      alert('No dedications with status "Published" to copy.');
      return;
    }
    const names = published.map((d) => d.name).join(', ');
    try {
      await navigator.clipboard.writeText(names);
      alert('Names copied: ' + names);
    } catch (err) {
      alert('Could not copy: ' + err.message);
    }
  });
}

// ─── Borrar dedications sin verificar ──────────────────────
// Elimina todas las dedications con status 'sin_verificar'
// (las que nunca confirmaron el mail). Expuesta al global.
window.deleteUnverifiedDedications = async () => {
  if (!confirm('Delete ALL unverified dedications? This cannot be undone.')) return;
  try {
    const q = query(collection(db, 'dedications'), where('status', '==', 'sin_verificar'));
    const snap = await getDocs(q);
    if (snap.empty) {
      alert('No unverified dedications found.');
      return;
    }
    let n = 0;
    for (const docSnap of snap.docs) {
      await deleteDoc(doc(db, 'dedications', docSnap.id));
      n++;
    }
    alert('Deleted ' + n + ' unverified dedication(s).');
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

// ─── Dashboard: visitas ────────────────────────────────────
async function fetchVisitorCount() {
  if (!dashVisits) return;
  try {
    const res = await fetch('https://api.counterapi.dev/v1/silicon-riot-official/visits/up');
    const data = await res.json();
    const count = data.count ?? data.value;
    if (count && !isNaN(count)) {
      dashVisits.textContent = String(count).padStart(5, '0');
    }
  } catch {
    dashVisits.textContent = '—';
  }
}

// ─── Dashboard: YouTube stats ──────────────────────────────
async function fetchYouTubeStats() {
  if (!dashYtSubs || !dashYtViews || !dashYtVideos) return;
  const snap = await getDoc(SITE_CONFIG_REF).catch(() => null);
  if (!snap?.exists()) return;
  const cfg = snap.data();
  const apiKey = cfg.youtubeApiKey?.trim();
  const channelId = cfg.youtubeChannelId?.trim();
  if (!apiKey || !channelId) {
    dashYtSubs.textContent = '—';
    dashYtViews.textContent = 'Configurar API';
    dashYtVideos.textContent = 'en Site Config';
    return;
  }
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`
    );
    const data = await res.json();
    if (data?.items?.[0]?.statistics) {
      const s = data.items[0].statistics;
      dashYtSubs.textContent = Number(s.subscriberCount || 0).toLocaleString();
      dashYtViews.textContent = Number(s.viewCount || 0).toLocaleString();
      dashYtVideos.textContent = Number(s.videoCount || 0).toLocaleString();
    } else {
      dashYtSubs.textContent = 'Error API';
      dashYtViews.textContent = data?.error?.message?.slice(0, 25) || 'Error';
      dashYtVideos.textContent = '—';
    }
  } catch {
    dashYtSubs.textContent = 'Error';
    dashYtViews.textContent = 'de conexión';
    dashYtVideos.textContent = '—';
  }
}

// ─── Dashboard: PageSpeed Insights ──────────────────────────
async function fetchPageSpeedStats() {
  if (!dashPageSpeedScore || !dashPageSpeedMeta) return;
  const snap = await getDoc(SITE_CONFIG_REF).catch(() => null);
  if (!snap?.exists()) return;
  const cfg = snap.data();
  const apiKey = cfg.youtubeApiKey?.trim();
  const siteUrl = cfg.siteUrl?.trim();
  if (!apiKey || !siteUrl) {
    dashPageSpeedScore.textContent = '—';
    dashPageSpeedMeta.textContent = 'Configurar Site URL + API Key';
    return;
  }
  try {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(siteUrl)}&key=${apiKey}&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO`
    );
    const data = await res.json();
    const lh = data?.lighthouseResult;
    if (!lh) {
      dashPageSpeedScore.textContent = 'Error API';
      dashPageSpeedMeta.textContent = data?.error?.message?.slice(0, 80) || 'Error';
      return;
    }
    const cats = lh.categories || {};
    const perf = Math.round((cats.performance?.score || 0) * 100);
    const acc  = Math.round((cats.accessibility?.score || 0) * 100);
    const bp   = Math.round((cats['best-practices']?.score || 0) * 100);
    const seo  = Math.round((cats.seo?.score || 0) * 100);

    dashPageSpeedScore.textContent = perf;
    dashPageSpeedScore.style.color = perf >= 90 ? 'var(--gold)' : perf >= 50 ? '#e6a817' : 'var(--red)';
    dashPageSpeedMeta.textContent = `Acc: ${acc} · Prácticas: ${bp} · SEO: ${seo}`;

    // Marcar la card con borde de color
    const card = document.getElementById('dashPageSpeedCard');
    if (card) {
      card.style.borderLeftColor = perf >= 90 ? 'var(--gold)' : perf >= 50 ? '#e6a817' : 'var(--red)';
    }
  } catch {
    dashPageSpeedScore.textContent = 'Error';
    dashPageSpeedMeta.textContent = 'de conexión';
  }
}
// ─── Dashboard: Spotify Stats ──────────────────────────────
async function fetchSpotifyStats() {
  if (!dashSpotify || !dashSpotifyMeta) return;
  const snap = await getDoc(SITE_CONFIG_REF).catch(() => null);
  if (!snap?.exists()) return;
  const cfg = snap.data();
  const clientId = cfg.spotifyClientId?.trim();
  const clientSecret = cfg.spotifyClientSecret?.trim();
  const artistId = cfg.spotifyArtistId?.trim();
  if (!clientId || !clientSecret || !artistId) {
    dashSpotify.textContent = '—';
    dashSpotifyMeta.textContent = 'Configurar Spotify en Site Config';
    return;
  }
  try {
    // 1. Obtener token de acceso
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret),
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      dashSpotify.textContent = 'Error';
      dashSpotifyMeta.textContent = (tokenData.error || 'auth error').slice(0, 40);
      return;
    }
    const bearer = 'Bearer ' + tokenData.access_token;

    const artistRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}`,
      { headers: { 'Authorization': bearer } }
    );
    const artistData = await artistRes.json();
    const followers = artistData?.followers?.total ?? null;
    const popularity = artistData?.popularity ?? null;

    if (followers !== null) {
      dashSpotify.textContent = Number(followers).toLocaleString();
      dashSpotify.style.color = 'var(--gold)';
      const genres = artistData?.genres?.slice(0, 3).join(', ') || '—';
      dashSpotifyMeta.textContent = `Pop: ${popularity}% · ${genres}`;
      return;
    }

    // 3. Fallback: contar tracks desde albums endpoint
    const albumsRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=10&market=ES`,
      { headers: { 'Authorization': bearer } }
    );
    const albumsData = await albumsRes.json();
    if (albumsData?.error) {
      dashSpotify.textContent = 'Sin métricas';
      dashSpotify.style.color = 'var(--white-dim)';
      dashSpotifyMeta.textContent = 'API de Spotify no disponible';
      return;
    }
    const items = albumsData?.items || [];
    let totalTracks = 0;
    items.forEach(a => { totalTracks += a?.total_tracks || 0; });
    if (totalTracks > 0) {
      dashSpotify.textContent = `${totalTracks} tracks`;
      dashSpotify.style.color = 'var(--gold)';
      dashSpotifyMeta.textContent = `en ${items.length} ${items.length === 1 ? 'álbum' : 'álbumes'}`;
    } else {
      dashSpotify.textContent = `${albumsData?.total || 0} lanzamientos`;
      dashSpotify.style.color = 'var(--white-dim)';
      dashSpotifyMeta.textContent = 'Verificar Spotify for Artists';
    }
  } catch (err) {
    dashSpotify.textContent = 'Error';
    dashSpotifyMeta.textContent = 'de conexión';
  }
}

// ─── Dashboard: refresh button ─────────────────────────────
if (refreshDashBtn) {
  refreshDashBtn.addEventListener('click', () => {
    refreshDashBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    Promise.all([fetchVisitorCount(), fetchYouTubeStats(), fetchPageSpeedStats(), fetchSpotifyStats()]).finally(() => {
      setTimeout(() => {
        refreshDashBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Actualizar';
      }, 800);
    });
  });
}

// ============================================================
// Albums CRUD
// ============================================================
const ALBUMS_COLLECTION = collection(db, 'albums');
const albumsContainer = $('albumsContainer');
const addAlbumBtn = $('addAlbumBtn');
const albumStatus = $('albumStatus');

let albumsData = [];        // datos actuales de Firestore
let editingAlbum = null;    // id del álbum actualmente expandido

let unsubAlbums = null;
function listenAlbums() {
  if (unsubAlbums) return;
  unsubAlbums = onSnapshot(
    ALBUMS_COLLECTION,
    (snapshot) => {
      albumsData = [];
      snapshot.forEach((docSnap) => {
        albumsData.push({ _id: docSnap.id, ...docSnap.data() });
      });
      albumsData.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
      renderAlbums();
      // Si la tabla de dedications ya se renderizó sin albumsData,
      // repoblar los selectores de track con las opciones completas.
      renderDedications();
      if (dashAlbumCount) dashAlbumCount.textContent = albumsData.length;
    },
    (err) => {
      albumStatus.textContent = '✗ Error al cargar álbumes.';
      albumStatus.className = 'status-msg status-error';
    }
  );
}

function stopAlbumsListener() {
  if (unsubAlbums) { unsubAlbums(); unsubAlbums = null; }
}

function renderAlbums() {
  if (!albumsData.length) {
    albumsContainer.innerHTML = '<div class="empty-msg">No hay álbumes todavía.</div>';
    return;
  }

  let html = '';
  albumsData.forEach((album) => {
    const isOpen = editingAlbum === album._id;
    html += `
      <div class="album-item">
        <div class="album-head" data-album-id="${album._id}">
          <span class="title">${escHtml(album.title) || 'Sin título'}</span>
          <span class="meta">${album.tracks?.length || 0} tracks · ${album.year || '—'}</span>
          <span class="actions">
            <button class="btn btn-sm toggle-edit" data-album-id="${album._id}"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="btn btn-sm btn-danger delete-album" data-album-id="${album._id}"><i class="fa-solid fa-trash-can"></i></button>
          </span>
        </div>
        ${isOpen ? renderAlbumForm(album) : ''}
      </div>`;
  });
  albumsContainer.innerHTML = html;
}

function renderAlbumForm(album) {
  const tracks = album.tracks || [];
  const links = album.links || {};

  let tracksHtml = '';
  tracks.forEach((t, i) => {
    tracksHtml += `
      <div class="track-row">
        <span class="idx">${String(i+1).padStart(2,'0')}</span>
        <input class="input-sm track-title" value="${escHtml(t.title)}" placeholder="Título" style="flex:2;min-width:0;" />
        <input class="input-sm track-dur" value="${escHtml(t.duration)}" placeholder="3:42" style="width:55px;" />
        <input class="input-sm track-yt" value="${escHtml(t.ytId || '')}" placeholder="YouTube ID" style="flex:1;min-width:0;" />
        <button type="button" class="btn-sm btn-danger remove-track" style="padding:0.2rem 0.35rem;"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
  });

  return `
    <form class="album-editor" data-album-id="${album._id}">
      <div class="row-3">
        <div class="form-group" style="margin:0;">
          <label>Título</label>
          <input class="input-sm af-title" value="${escHtml(album.title || '')}" placeholder="Título del álbum" />
        </div>
        <div class="form-group" style="margin:0;">
          <label>Año</label>
          <input class="input-sm af-year" value="${escHtml(album.year || '')}" placeholder="2026" />
        </div>
        <div class="form-group" style="margin:0;">
          <label>Orden</label>
          <input class="input-sm af-order" value="${album.order ?? albumsData.length}" type="number" min="0" />
        </div>
      </div>
      <div class="form-group" style="margin:0;">
        <label>URL de la tapa</label>
        <input class="input-sm af-cover" value="${escHtml(album.cover || '')}" placeholder="assets/album-cover.jpg" />
      </div>

      <div class="section-label"><i class="fa-solid fa-link"></i> Streaming Links <hr /></div>
      <div class="row-2">
        <div class="form-group" style="margin:0;">
          <label>Spotify</label>
          <input class="input-sm af-link-spotify" value="${escHtml(links.spotify || '')}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label>Apple Music</label>
          <input class="input-sm af-link-apple" value="${escHtml(links.appleMusic || '')}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label>Amazon</label>
          <input class="input-sm af-link-amazon" value="${escHtml(links.amazon || '')}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label>YouTube Playlist</label>
          <input class="input-sm af-link-yt" value="${escHtml(links.youtube || '')}" />
        </div>
      </div>

      <div class="section-label"><i class="fa-solid fa-music"></i> Tracks <hr /></div>
      <div class="tracks-list">${tracksHtml}</div>
      <div><button type="button" class="btn-sm add-track"><i class="fa-solid fa-plus"></i> Track</button></div>

      <div class="editor-actions">
        <button type="submit" class="btn btn-gold-solid" style="flex:1;"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
        <button type="button" class="btn btn-sm cancel-edit">Cancelar</button>
      </div>
    </form>`;
}

// ─── Helpers ────────────────────────────────────────────────
function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Eventos (delegados) ────────────────────────────────────
albumsContainer.addEventListener('click', (e) => {
  const target = e.target.closest('[data-album-id]');
  if (!target) return;
  const id = target.dataset.albumId;

  // Botón editar
  if (e.target.closest('.toggle-edit')) {
    e.stopPropagation();
    editingAlbum = editingAlbum === id ? null : id;
    renderAlbums();
    return;
  }

  // Botón eliminar
  if (e.target.closest('.delete-album')) {
    e.stopPropagation();
    deleteAlbum(id);
    return;
  }

  // Click en la cabecera → toggle
  if (target.classList.contains('album-head')) {
    editingAlbum = editingAlbum === id ? null : id;
    renderAlbums();
  }
});

// Botón "Nuevo Álbum"
addAlbumBtn.addEventListener('click', () => {
  albumStatus.textContent = 'Escribí los datos y guardá.';
  albumStatus.className = 'status-msg info';

  const tempId = '__new__';
  // Crear un álbum vacío temporal en albumsData para que renderAlbums lo muestre
  const exists = albumsData.find((a) => a._id === tempId);
  if (exists) { editingAlbum = tempId; renderAlbums(); return; }

  albumsData.unshift({ _id: tempId, title: '', cover: '', year: '', order: 0, tracks: [], links: {} });
  editingAlbum = tempId;
  renderAlbums();
});

// ─── Guardar álbum ──────────────────────────────────────────
albumsContainer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.closest('.album-editor');
  if (!form) return;
  const albumId = form.dataset.albumId;
  const isNew = albumId === '__new__' || albumId === '';

  // Recolectar tracks preservando el collab existente por índice.
  // Filas nuevas/renombradas sin match no llevan crédito; las filas
  // eliminadas sueltan su crédito. Nunca se borra collab por error.
  const sourceAlbum = albumsData.find((a) => a._id === albumId);
  const sourceTracks = sourceAlbum?.tracks || [];
  const trackRows = form.querySelectorAll('.track-row');
  const tracks = [];
  trackRows.forEach((row, idx) => {
    const title = row.querySelector('.track-title')?.value.trim();
    const duration = row.querySelector('.track-dur')?.value.trim();
    const ytId = row.querySelector('.track-yt')?.value.trim();
    if (!title) return;

    const trackOut = { title, duration: duration || '—', ytId: ytId || '' };
    // Match primario por índice original (el orden de filas es el
    // orden original salvo que se hayan quitado/insertado filas).
    const src = sourceTracks[idx];
    if (src && src.title && src.title.trim().toLowerCase() === title.toLowerCase()) {
      trackOut.collab = src.collab || '';
    } else {
      // Fallback por identidad (título + ytId): evita que una fila
      // removida deslice el crédito hacia el track siguiente.
      const match = sourceTracks.find((t) =>
        t.title && t.title.trim().toLowerCase() === title.toLowerCase() &&
        (t.ytId || '') === (ytId || '')
      );
      trackOut.collab = (match && match.collab) || '';
    }
    tracks.push(trackOut);
  });

  // Recolectar campos
  const getVal = (sel) => form.querySelector(sel)?.value.trim() || '';
  const payload = {
    title: getVal('.af-title'),
    cover: getVal('.af-cover'),
    year: parseInt(getVal('.af-year')) || 2026,
    order: parseInt(getVal('.af-order')) || 0,
    tracks,
    links: {
      spotify: getVal('.af-link-spotify'),
      appleMusic: getVal('.af-link-apple'),
      amazon: getVal('.af-link-amazon'),
      youtube: getVal('.af-link-yt'),
    },
    updatedAt: serverTimestamp(),
  };

  if (!payload.title) {
    albumStatus.textContent = '✗ El título es obligatorio.';
    albumStatus.className = 'status-msg status-error';
    return;
  }

  albumStatus.textContent = 'Guardando…';
  albumStatus.className = 'status-msg';

  try {
    if (isNew) {
      const docRef = await addDoc(ALBUMS_COLLECTION, { ...payload, createdAt: serverTimestamp() });
      editingAlbum = docRef.id;
    } else {
      await setDoc(doc(db, 'albums', albumId), payload, { merge: true });
    }
    albumStatus.textContent = `✓ Álbum "${payload.title}" guardado.`;
    albumStatus.className = 'status-msg status-ok';
  } catch (err) {
    albumStatus.textContent = `✗ Error: ${err.message}`;
    albumStatus.className = 'status-msg status-error';
  }
});

// ─── Agregar track inline ───────────────────────────────────
albumsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.add-track');
  if (!btn) return;
  const form = btn.closest('.album-editor');
  if (!form) return;
  const list = form.querySelector('.tracks-list');
  const idx = list.querySelectorAll('.track-row').length;
  const row = document.createElement('div');
  row.className = 'track-row';
  row.innerHTML = `
    <span class="idx">${String(idx+1).padStart(2,'0')}</span>
    <input class="input-sm track-title" placeholder="Título" style="flex:2;min-width:0;" />
    <input class="input-sm track-dur" placeholder="3:42" style="width:55px;" />
    <input class="input-sm track-yt" placeholder="YouTube ID" style="flex:1;min-width:0;" />
    <button type="button" class="btn-sm btn-danger remove-track" style="padding:0.2rem 0.35rem;"><i class="fa-solid fa-xmark"></i></button>
  `;
  list.appendChild(row);
  updateTrackNumbers(form);
});

// ─── Eliminar track ─────────────────────────────────────────
albumsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-track');
  if (!btn) return;
  const row = btn.closest('.track-row');
  if (row) {
    row.remove();
    updateTrackNumbers(row.closest('.album-editor'));
  }
});

function updateTrackNumbers(form) {
  if (!form) return;
  form.querySelectorAll('.track-row').forEach((row, i) => {
    const num = row.querySelector('.idx');
    if (num) num.textContent = String(i + 1).padStart(2, '0');
  });
}

// ─── Cancelar edición ────────────────────────────────────────
albumsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.cancel-edit');
  if (!btn) return;
  const form = btn.closest('.album-editor');
  if (!form) return;
  const id = form.dataset.albumId;
  // Si era nuevo y cancelamos, lo sacamos
  if (id === '__new__') {
    albumsData = albumsData.filter((a) => a._id !== '__new__');
  }
  editingAlbum = null;
  renderAlbums();
});

// ─── Eliminar álbum ─────────────────────────────────────────
async function deleteAlbum(albumId) {
  if (albumId === '__new__') {
    albumsData = albumsData.filter((a) => a._id !== '__new__');
    editingAlbum = null;
    renderAlbums();
    return;
  }

  if (!confirm('¿Eliminar este álbum永久mente?')) return;
  try {
    await deleteDoc(doc(db, 'albums', albumId));
    if (editingAlbum === albumId) editingAlbum = null;
    albumStatus.textContent = '✓ Álbum eliminado.';
    albumStatus.className = 'status-msg status-ok';
  } catch (err) {
    albumStatus.textContent = `✗ Error: ${err.message}`;
    albumStatus.className = 'status-msg status-error';
  }
}

// ─── Limpiar listener al logout ────────────────────────────
// Se llama desde el click de logout antes de redirigir
logoutBtn.addEventListener('click', () => {
  stopAlbumsListener();
}, true);
