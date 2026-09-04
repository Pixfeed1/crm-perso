// backend/services/seoGoogleAuth.js
//
// Connexion Google (Search Console + Analytics) EN UN CLIC depuis le CRM.
//
// Pourquoi : le consentement passait par gsc_auth.py, un outil en ligne de commande qui
// suppose un navigateur sur la machine (donc un tunnel SSH depuis le serveur). Le meme
// resultat s'obtient comme chez Semrush : un bouton ouvre la fenetre Google, l'utilisateur
// accepte, Google renvoie le code au serveur, qui echange et stocke le refresh_token.
//
// Le jeton atterrit dans seo_oauth_tokens, exactement la ou gsc_auth.py l'ecrivait :
// le worker (Search Console, Analytics) ne voit aucune difference. Le client OAuth est
// celui de type « Application Web » deja utilise par la synchro agenda
// (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) ; il suffit d'y declarer l'URI de retour.
//
// Securite : le callback est PUBLIC (Google ne porte pas notre JWT), donc l'etat passe
// a Google est signe (HMAC + horodatage) et verifie au retour : un code arrivant sans
// etat valide est ignore.

const crypto = require('crypto');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];
const STATE_TTL_MS = 15 * 60 * 1000;

function frontendUrl() {
  return (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
}

function redirectUri() {
  // Le front et l'API partagent l'origine (crm.pixfeed.net, /api en reverse proxy).
  return process.env.SEO_GOOGLE_REDIRECT_URI || `${frontendUrl()}/api/seo/google/callback`;
}

function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.JWT_SECRET && frontendUrl());
}

function client() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri());
}

function sign(payload) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('hex');
}

// state = "<timestamp>.<signature>" : illisible sans le secret, perime apres STATE_TTL_MS.
function buildState() {
  const ts = String(Date.now());
  return `${ts}.${sign(ts)}`;
}

function verifyState(state) {
  if (!state || typeof state !== 'string') return false;
  const [ts, sig] = state.split('.');
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;
  const expected = sign(ts);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Date.now() - Number(ts) < STATE_TTL_MS;
}

function getAuthUrl() {
  return client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',           // force la remise d'un refresh_token, meme si deja autorise
    include_granted_scopes: true,
    scope: SCOPES,
    state: buildState(),
  });
}

// Echange le code contre les jetons et lit l'e-mail du compte.
async function exchangeCode(code) {
  const c = client();
  const { tokens } = await c.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google n’a pas renvoyé de refresh_token (consentement incomplet). Réessayer.');
  }
  c.setCredentials(tokens);
  let email = null;
  try {
    const { data } = await google.oauth2({ version: 'v2', auth: c }).userinfo.get();
    email = data.email || null;
  } catch (e) { /* l'e-mail est un libelle, pas une necessite */ }
  return { refresh_token: tokens.refresh_token, scope: tokens.scope || SCOPES.join(' '), email };
}

// Meme table et meme forme que gsc_auth.py : le worker lit la ligne la plus recente.
async function storeToken(pool, { email, refresh_token, scope }) {
  const upd = await pool.query(
    `UPDATE seo_oauth_tokens
        SET refresh_token = $1, client_id = $2, client_secret = $3, scope = $4,
            token_uri = 'https://oauth2.googleapis.com/token', updated_at = NOW()
      WHERE provider = 'google' AND COALESCE(account_email, '') = COALESCE($5, '')
      RETURNING id`,
    [refresh_token, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, scope, email]
  );
  if (upd.rows.length) return upd.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO seo_oauth_tokens (provider, account_email, scope, client_id, client_secret, refresh_token)
     VALUES ('google', $1, $2, $3, $4, $5) RETURNING id`,
    [email, scope, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, refresh_token]
  );
  return ins.rows[0].id;
}

module.exports = { SCOPES, configured, redirectUri, frontendUrl, getAuthUrl, buildState, verifyState, exchangeCode, storeToken };
