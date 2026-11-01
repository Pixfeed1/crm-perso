// Quels outils le serveur MCP sert-il vraiment ? Compare le service local (127.0.0.1:port) et l'adresse
// publique utilisée par l'app Claude. N'affiche jamais le jeton.
// Usage, depuis mcp_seo/ : node scripts/diag-outils.js [adresse publique]   (défaut https://mcp-seo.crm.pixfeed.net/mcp)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = process.argv[2] || 'https://mcp-seo.crm.pixfeed.net/mcp';
const LOCAL = `http://127.0.0.1:${process.env.MCP_SEO_PORT || 8790}/mcp`;
const TOKEN = process.env.MCP_SEO_TOKEN || '';
const ATTENDUS = ['get_live_page', 'get_page_dossier', 'check_urls', 'get_site_resources', 'demander_depot', 'prepare_draft'];

// outils déclarés dans le code déployé (server.js), pour comparer
const code = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.js'), 'utf8');
const dansLeCode = [...code.matchAll(/server\.tool\(\s*'([a-z_]+)'/g)].map((m) => m[1]);

async function liste(url) {
  const appel = async (id, method, params = {}) => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    const t = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 120)}`);
    const data = t.includes('data:') ? t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('') : t;
    return JSON.parse(data);
  };
  const init = await appel(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'diag', version: '1' } });
  const outils = await appel(2, 'tools/list');
  if (outils.error) throw new Error(outils.error.message);
  return { serveur: init.result && init.result.serverInfo, noms: outils.result.tools.map((x) => x.name) };
}

console.log(`code déployé (server.js) : ${dansLeCode.length} outils`);
for (const [nom, url] of [['service local', LOCAL], ['adresse publique', PUBLIC]]) {
  try {
    const r = await liste(url);
    const manquants = ATTENDUS.filter((x) => !r.noms.includes(x));
    console.log(`${nom.padEnd(16)} ${url} : ${r.noms.length} outils (${r.serveur ? r.serveur.name + ' ' + r.serveur.version : '?'})${manquants.length ? ' ; MANQUANTS : ' + manquants.join(', ') : ' ; les 6 nouveaux sont présents'}`);
  } catch (e) { console.log(`${nom.padEnd(16)} ${url} : ERREUR ${e.message}`); }
}
