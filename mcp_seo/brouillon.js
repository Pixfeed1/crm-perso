// mcp_seo/brouillon.js
// demander_depot, prepare_draft et les retouches après publication (repointer_liens, poser_etiquettes,
// modifier_media) : le serveur MCP ne parle pas à WordPress pour écrire ; il passe
// par le backend du CRM (seul à écrire, avec le compte dédié), avec le secret partagé OUTILS_MCP_SECRET
// (backend/.env, lu ici sans rien d'autre).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { compact, txt } from './live.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ENV = process.env.MCP_BACKEND_ENV || path.join(__dirname, '..', 'backend', '.env');
const BACKEND = (process.env.CRM_BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');

function secret() {
  if (process.env.OUTILS_MCP_SECRET) return process.env.OUTILS_MCP_SECRET;
  try { return dotenv.parse(fs.readFileSync(BACKEND_ENV)).OUTILS_MCP_SECRET || ''; } catch { return ''; }
}

async function backend(chemin, corps, delaiMs) {
  const s = secret();
  if (s.length < 32) return { erreur: { source: 'configuration', code: 'config', message: 'OUTILS_MCP_SECRET absent de backend/.env' } };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), delaiMs);
  try {
    const r = await fetch(`${BACKEND}/api/wp-brouillon/${chemin}`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'X-Outils-Secret': s }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { erreur: { source: 'backend du CRM', code: r.status, message: j.message || r.statusText } };
    return j;
  } catch (e) {
    return { erreur: { source: 'backend du CRM', code: e.name === 'AbortError' ? 'timeout' : 'réseau', message: txt(e.message) } };
  } finally { clearTimeout(t); }
}

export async function demanderDepot(siteId) {
  const j = await backend('depot', { site_id: siteId }, 15000);
  if (j.erreur) return { fetched_at: new Date().toISOString(), ...j };
  return compact({
    fetched_at: new Date().toISOString(),
    depot: j.depot, url_envoi: j.url_envoi, expire_le: j.expire_le,
    usage: `lien à usage unique, valable ${j.duree_minutes} min : un seul envoi, puis prepare_draft(depot=${j.depot})`,
    envoi: {
      linux_ou_mac: `cd "DOSSIER" && zip -r -X /tmp/lot-${j.depot}.zip . && curl -sS -F "lot=@/tmp/lot-${j.depot}.zip" "${j.url_envoi}"`,
      windows_powershell: `Compress-Archive -Path "DOSSIER\\*" -DestinationPath "$env:TEMP\\lot-${j.depot}.zip" -Force; curl.exe -sS -F "lot=@$env:TEMP\\lot-${j.depot}.zip" "${j.url_envoi}"`,
      note: 'DOSSIER = le dossier qui contient manifeste-wp.json. Réponse attendue : { depot, fichiers, octets, manifeste: true }.',
    },
  });
}

export async function prepareDraft(depot, simulation = true, creerEtiquettes = false, relecture = true) {
  const j = await backend('preparer', { depot, simulation, creer_etiquettes: creerEtiquettes, relecture }, 30 * 60 * 1000);
  if (j.erreur) return { fetched_at: new Date().toISOString(), depot, simulation, ...j };
  return compact(j);
}

// ---- retouches après publication : simulation par défaut, rapport du backend tel quel ----
async function retouche(chemin, corps) {
  const j = await backend(chemin, corps, 10 * 60 * 1000);
  if (j.erreur) return { fetched_at: new Date().toISOString(), ...corps, ...j };
  return compact(j);
}
export const repointerLiens = (siteId, ancienneUrl, nouvelleUrl, ancres = {}, simulation = true) =>
  retouche('liens', { site_id: siteId, ancienne_url: ancienneUrl, nouvelle_url: nouvelleUrl, ancres, simulation });
export const poserEtiquettes = (siteId, urls, ajouter = [], retirer = [], simulation = true) =>
  retouche('etiquettes', { site_id: siteId, urls, ajouter, retirer, simulation });
export const modifierMedia = (siteId, media, champs = {}, simulation = true) =>
  retouche('media', { site_id: siteId, media, ...champs, simulation });
