// ─────────────────────────────────────────────────────────────
// Silicon Riot — Verification Email + Visitor Counter Worker
//
// Routes:
//   POST  /         Send a verification email via Resend.
//                   Body: { to, name?, verifyUrl?, html? }. The
//                   email HTML is built on the front (editable
//                   template in Firestore) and passed as-is to
//                   Resend. If html is missing, a minimal fallback
//                   is used (backward compatibility only).
//   GET   /visit    Increment the global visitor counter once per
//                   browser session. Strongly consistent: backed by
//                   a Durable Object that persists the count.
//   GET   /visits   Return the current visitor count (admin only).
//
// Secrets (Settings → Variables and Secrets):
//   RESEND_API_KEY  → re_xxxx (your Resend API key)
//
// Deploy: `wrangler deploy` (see wrangler.toml for the Durable
// Object binding and migration). Requires a Cloudflare login.
// ─────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

// ─── Durable Object: global visitor counter ──────────────────
// A single instance (idFromName('global')) owns the counter for the
// whole site. Storage transactions serialize concurrent requests, so
// the increment is atomic and the count survives restarts.
export class VisitCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/increment')) {
      const { count } = await this.state.storage.transaction(async (txn) => {
        const current = (await txn.get('count')) || 0;
        const next = current + 1;
        await txn.put('count', next);
        return { count: next };
      });
      return json({ count });
    }

    if (url.pathname.endsWith('/value')) {
      const count = (await this.state.storage.get('count')) || 0;
      return json({ count });
    }

    return json({ error: 'Not found' }, 404);
  }
}

export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Basic anti-spam: only accept the origin of the site.
    // Empty origin (curl, bots) is allowed; foreign origins are not.
    const origin = request.headers.get('Origin') || '';
    if (origin && !origin.includes('silicon-riot.com')) {
      return json({ error: 'Forbidden origin' }, 403);
    }

    const url = new URL(request.url);

    // GET /visit — increment the global visitor counter.
    if (request.method === 'GET' && url.pathname === '/visit') {
      const id = env.VISIT_COUNTER.idFromName('global');
      return env.VISIT_COUNTER.get(id).fetch('https://durable-object/increment');
    }

    // GET /visits — return the current count for the admin dashboard.
    if (request.method === 'GET' && (url.pathname === '/visitor-count' || url.pathname === '/visits')) {
      const id = env.VISIT_COUNTER.idFromName('global');
      return env.VISIT_COUNTER.get(id).fetch('https://durable-object/value');
    }

    // ── Email verification (POST /) — preserved unchanged ──
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    try {
      const { to, name = '', verifyUrl = '', html } = await request.json();

      if (!to) {
        return json({ error: 'Missing field: to' }, 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return json({ error: 'Invalid email' }, 400);
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Silicon Riot <noreply@silicon-riot.com>',
          to: [to],
          subject: 'Confirm your dedication on Silicon Riot',
          html: html || `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;background:#0a0a0a;color:#e5e5e5;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;text-align:center;">
              <div style="background:linear-gradient(135deg,#1a1a1a,#0a0a0a);padding:28px;border-bottom:1px solid #d4a843;">
                <img src="https://silicon-riot.com/assets/Silicon%20Riot%20Dorado.png" alt="SILICON RIOT" style="max-width:180px;display:block;margin:0 auto;" />
              </div>
              <div style="padding:32px;">
                <h2 style="color:#f0ede8;margin:0 0 14px;">Hi ${(name || '').replace(/[<>&]/g, '')},</h2>
                <p style="color:#b8b5ae;line-height:1.7;margin:0 0 22px;">Confirm your dedication by clicking the button below:</p>
                <a href="${verifyUrl}" style="display:inline-block;padding:14px 36px;background:#d4a843;color:#0a0a0a;text-decoration:none;font-weight:bold;border-radius:6px;letter-spacing:2px;font-size:13px;text-transform:uppercase;">Confirm Dedication</a>
              </div>
            </div>
          `,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ ok: false, error: data.message || 'Resend error', status: res.status }, res.status);
      }
      return json({ ok: true, id: data.id });
    } catch (err) {
      return json({ ok: false, error: String(err) }, 500);
    }
  },
};
