// Client de l'API REST WordPress d'un site suivi par le CRM, avec l'utilisateur dédié du site
// (WP_API_USER_<site_id> / WP_API_PASSWORD_<site_id> dans backend/.env, rôle Éditeur).
// Les identifiants ne sortent jamais : ni réponse, ni journal, ni message d'erreur.

const DELAI_MS = 60000;

function acces(siteId) {
  const user = process.env[`WP_API_USER_${siteId}`];
  const pass = process.env[`WP_API_PASSWORD_${siteId}`];
  if (!user || !pass) {
    const e = new Error(`accès WordPress non configuré pour le site ${siteId} (WP_API_USER_${siteId} / WP_API_PASSWORD_${siteId} dans backend/.env)`);
    e.code = 'config';
    throw e;
  }
  const propre = String(pass).replace(/\x1b\[[0-9;]*~?/g, '').replace(/[^A-Za-z0-9]/g, '');
  return 'Basic ' + Buffer.from(`${String(user).trim()}:${propre}`).toString('base64');
}

/** Message lisible d'une réponse en erreur : code HTTP + code et message WordPress. */
async function erreur(r, quoi) {
  let detail = r.statusText || '';
  try { const j = await r.json(); if (j && j.message) detail = `${j.code ? j.code + ' : ' : ''}${String(j.message).replace(/<[^>]+>/g, '')}`; } catch { /* corps non JSON */ }
  const e = new Error(`${quoi} : HTTP ${r.status} ${detail}`.trim());
  e.code = r.status;
  return e;
}

/**
 * Client lié à un site. base : adresse WordPress (seo_sites.wp_base_url).
 * wp(chemin, { methode, params, corps, entetes, brut }) ; chemin relatif à /wp-json/ (ex. 'wp/v2/posts').
 */
function client(siteId, base) {
  const auth = acces(siteId);
  const racine = String(base).replace(/\/+$/, '');
  return async function wp(chemin, { methode = 'GET', params = {}, corps, entetes = {}, brut = false } = {}) {
    const u = new URL(`${racine}/wp-json/${chemin.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, Array.isArray(v) ? v.join(',') : v);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DELAI_MS);
    try {
      const opts = { method: methode, signal: ctrl.signal, headers: { Authorization: auth, Accept: 'application/json', ...entetes } };
      if (corps !== undefined) {
        if (Buffer.isBuffer(corps) || corps instanceof Uint8Array) opts.body = corps;
        else { opts.body = JSON.stringify(corps); opts.headers['Content-Type'] = 'application/json'; }
      }
      const r = await fetch(u, opts);
      if (brut) return r;
      if (!r.ok) throw await erreur(r, `${methode} ${chemin}`);
      return r.status === 204 ? null : r.json();
    } catch (e) {
      if (e.name === 'AbortError') { const x = new Error(`${methode} ${chemin} : pas de réponse en ${DELAI_MS / 1000} s`); x.code = 'timeout'; throw x; }
      throw e;
    } finally { clearTimeout(t); }
  };
}

module.exports = { client, acces, erreur };
