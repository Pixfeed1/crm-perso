// mcp_seo/campagnes.js
// Campagnes de prospection par email : mêmes fonctions que l'onglet Campagnes du CRM, par le backend (secret
// partagé OUTILS_MCP_SECRET). Claude lit et prépare tout ; la validation des lignes, la programmation des envois,
// la reprise d'une campagne en pause et la suppression restent à Marc, dans l'interface.
// Les réécritures en nombre et les réanalyses tournent sur le serveur du CRM (clé API du CRM) : réponse courte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { compact, txt } from './live.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ENV = process.env.MCP_BACKEND_ENV || path.join(__dirname, '..', 'backend', '.env');
const BACKEND = () => (process.env.CRM_BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const secret = () => process.env.OUTILS_MCP_SECRET || (() => { try { return dotenv.parse(fs.readFileSync(BACKEND_ENV)).OUTILS_MCP_SECRET || ''; } catch { return ''; } })();

export async function campagnes(action, corps = {}, delaiMs = 120000) {
  const s = secret();
  if (s.length < 32) return { erreur: { source: 'configuration', code: 'config', message: 'OUTILS_MCP_SECRET absent de backend/.env' } };
  try {
    const r = await fetch(`${BACKEND()}/api/campagnes-connecteur/${action}`, { method: 'POST', signal: AbortSignal.timeout(delaiMs), headers: { 'Content-Type': 'application/json', 'X-Outils-Secret': s }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { refus: true, code: r.status, message: j.message || r.statusText };
    return compact({ fetched_at: new Date().toISOString(), ...j });
  } catch (e) {
    return { erreur: { source: 'backend du CRM', code: e.name === 'TimeoutError' ? 'timeout' : 'réseau', message: txt(e.message) } };
  }
}
