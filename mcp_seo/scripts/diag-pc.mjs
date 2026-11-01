// Diagnostic sur le PC Windows (lecture seule) : ce que l'app Claude lance pour « crm-seo », la liste d'outils
// reçue EXACTEMENT par ce chemin (même commande, mêmes arguments, en stdio comme l'app), et les fichiers de l'app
// qui gardent une copie de la liste. N'affiche jamais de jeton. Ne modifie rien.
// Usage : node diag-pc.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const NOUVEAUX = ['repointer_liens', 'poser_etiquettes', 'modifier_media'];
const masquer = (s) => String(s)
  .replace(/(Bearer\s*:?\s*)[^\s"',]+/gi, '$1***')
  .replace(/((?:TOKEN|KEY|SECRET|PASSWORD)[A-Z_]*\s*[=:]\s*"?)[^\s"]+/gi, '$1***');
const A = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const L = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

// 1. les fichiers de configuration (classique et version « package » Windows)
const configs = [path.join(A, 'Claude', 'claude_desktop_config.json')];
try {
  for (const d of fs.readdirSync(path.join(L, 'Packages'))) if (/claude/i.test(d)) configs.push(path.join(L, 'Packages', d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
} catch { /* pas de dossier Packages */ }
let entree = null;
console.log('== 1. Configuration');
for (const f of configs) {
  if (!fs.existsSync(f)) { console.log(`   ${f} : absent`); continue; }
  const st = fs.statSync(f);
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`   ${f} : illisible (${e.message})`); continue; }
  const e = j.mcpServers && j.mcpServers['crm-seo'];
  console.log(`   ${f} (modifié le ${st.mtime.toLocaleString('fr-FR')}) : serveurs ${Object.keys(j.mcpServers || {}).join(', ') || 'aucun'}`);
  if (!e) continue;
  console.log(`      crm-seo -> commande : ${masquer(e.command)}`);
  console.log(`      arguments : ${masquer(JSON.stringify(e.args || []))}`);
  if (e.env) console.log(`      variables : ${Object.keys(e.env).join(', ')}`);
  if (/\.(cmd|bat)$/i.test(e.command) && fs.existsSync(e.command)) console.log(`      contenu de ${path.basename(e.command)} :\n${masquer(fs.readFileSync(e.command, 'utf8')).split(/\r?\n/).filter(Boolean).map((l) => `         ${l}`).join('\n')}`);
  if (!entree) entree = { ...e, fichier: f };
}
if (!entree) { console.log('   AUCUNE entrée crm-seo : l\'app ne lance pas ce serveur depuis ces fichiers.'); }

// 2. tools/list par le même chemin que l'app : même commande, mêmes arguments, stdio
async function listeParLeMemeChemin(e) {
  return new Promise((ok) => {
    const shell = /\.(cmd|bat)$/i.test(e.command) || process.platform === 'win32';
    const args = (e.args || []).map((a) => (shell && /[\s"]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a));
    const cmd = shell && /\s/.test(e.command) ? `"${e.command}"` : e.command;
    const p = spawn(cmd, args, { shell, env: { ...process.env, ...(e.env || {}) }, windowsHide: true });
    let tampon = '', erreurs = '';
    const attente = new Map();
    const envoyer = (id, method, params) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }) + '\n');
    let fini = false;
    const fin = (r) => {
      if (fini) return; fini = true; clearTimeout(t);
      // arrête aussi le mcp-remote lancé par le .cmd (sinon il resterait en route)
      try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }); else p.kill(); } catch { /* déjà fini */ }
      ok(r);
    };
    const t = setTimeout(() => fin({ erreur: `pas de réponse en 90 s ; messages du programme : ${masquer(erreurs).slice(-600)}` }), 90000);
    p.stdout.on('data', (b) => {
      tampon += b.toString();
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const l = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
        if (!l.startsWith('{')) continue;
        let m; try { m = JSON.parse(l); } catch { continue; }
        if (m.id && attente.has(m.id)) attente.get(m.id)(m);
      }
    });
    p.stderr.on('data', (b) => { erreurs += b.toString(); });
    p.on('exit', (c) => fin({ erreur: `le programme s'est arrêté (code ${c}) ; messages : ${masquer(erreurs).slice(-600)}` }));
    const appel = (id, method, params) => new Promise((r) => { attente.set(id, r); envoyer(id, method, params); });
    (async () => {
      const init = await appel(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'diag-pc', version: '1' } });
      envoyer(null, 'notifications/initialized', {});
      const liste = await appel(2, 'tools/list', {});
      fin({ init, liste });
    })();
  });
}

if (entree) {
  console.log('\n== 2. tools/list par le chemin de l\'app (peut prendre jusqu\'à une minute)');
  const r = await listeParLeMemeChemin(entree);
  if (r.erreur) console.log(`   ERREUR : ${r.erreur}`);
  else if (r.liste.error) console.log(`   ERREUR du serveur : ${r.liste.error.message}`);
  else {
    const outils = r.liste.result.tools;
    const si = r.init.result && r.init.result.serverInfo;
    console.log(`   serveur : ${si ? `${si.name} ${si.version}` : '?'} ; ${outils.length} outils reçus`);
    console.log(`   noms : ${outils.map((x) => x.name).join(', ')}`);
    console.log(`   nouveaux de l'étape 4 : ${NOUVEAUX.map((n) => `${n} ${outils.some((x) => x.name === n) ? 'OUI' : 'non'}`).join(' ; ')}`);
    const g = outils.find((x) => x.name === 'get_site_resources');
    console.log(`   inputSchema de get_site_resources : ${g ? JSON.stringify(g.inputSchema) : 'outil absent'}`);
  }
}

// 3. copies de la liste d'outils gardées par l'app (fichiers qui citent get_site_resources)
console.log('\n== 3. Fichiers de l\'app qui gardent une copie de la liste d\'outils');
const racines = [path.join(A, 'Claude'), path.join(os.homedir(), '.mcp-auth')];
try { for (const d of fs.readdirSync(path.join(L, 'Packages'))) if (/claude/i.test(d)) racines.push(path.join(L, 'Packages', d)); } catch { /* rien */ }
const trouves = [];
const parcourir = (d, prof = 0) => {
  if (prof > 8) return;
  let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    const p = path.join(d, it.name);
    if (it.isDirectory()) { if (!/^(Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|Crashpad|ShaderCache|vm_bundles)$/i.test(it.name)) parcourir(p, prof + 1); continue; }
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.size > 60 * 1024 * 1024) continue;
    let b; try { b = fs.readFileSync(p); } catch { continue; }
    const s = b.toString('latin1');
    if (!s.includes('get_site_resources')) continue;
    trouves.push({ p, date: st.mtime, ko: Math.round(st.size / 1024), nouvelle: s.includes('etiquettes_recherche'), etape4: s.includes('repointer_liens') });
  }
};
for (const r of racines) if (fs.existsSync(r)) parcourir(r);
trouves.sort((a, b) => b.date - a.date);
if (!trouves.length) console.log('   aucun');
for (const f of trouves.slice(0, 25)) console.log(`   ${f.date.toLocaleString('fr-FR')}  ${String(f.ko).padStart(6)} Ko  fiche à jour : ${f.nouvelle ? 'oui' : 'NON'}  étape 4 : ${f.etape4 ? 'oui' : 'NON'}  ${f.p}`);
console.log('\nFin du diagnostic (rien modifié).');
