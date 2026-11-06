/* Essai réel du mode mise_a_jour PAR REMPLACEMENTS de prepare_draft (copie de travail, puis bouton
   « Remplacer l'original » dans WordPress). Le remplacement d'essai est NEUTRE : un passage unique du
   contenu est remplacé par lui-même, donc la copie a exactement le même texte que l'original.
   Rien n'est publié : l'original ne change que si vous cliquez vous-même « Remplacer l'original ».
   Usage, depuis backend/ :
     node scripts/essai-mise-a-jour.js 15 https://pixfeed.net/<page>/            simulation (rien écrit)
     node scripts/essai-mise-a-jour.js 15 https://pixfeed.net/<page>/ --ecrire   crée la copie de travail (brouillon)
     node scripts/essai-mise-a-jour.js 15 --nettoyer <id de la copie>            supprime cette copie (brouillon seulement) */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const { client } = require('../services/wpBrouillon/wp');
const depots = require('../services/wpBrouillon/depot');
const { preparer } = require('../services/wpBrouillon/preparer');
const R = require('../services/wpBrouillon/remplacements');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const [siteId, url] = [Number(process.argv[2]), process.argv[3]];

async function wpDuSite(id) {
  const s = (await pool.query('SELECT id, domain, wp_base_url FROM seo_sites WHERE id = $1', [id])).rows[0];
  if (!s) throw new Error(`site ${id} inconnu du CRM`);
  return client(id, String(s.wp_base_url || `https://${s.domain}`));
}

// Passage d'essai : un morceau de texte visible qui n'apparaît qu'une fois dans le contenu.
function passageUnique(raw) {
  for (const m of raw.matchAll(/<p[^>]*>([^<]{40,})<\/p>/g)) {
    const t = m[1].slice(0, 40);
    if (R.compter(raw, t) === 1) return t;
  }
  for (let i = 0; i + 30 < raw.length; i += 50) { const t = raw.slice(i, i + 30); if (!/[<>[\]]/.test(t) && R.compter(raw, t) === 1) return t; }
  return null;
}

(async () => {
  if (!siteId) throw new Error('usage : node scripts/essai-mise-a-jour.js <site_id> <url> [--ecrire] | <site_id> --nettoyer <id>');
  const wp = await wpDuSite(siteId);
  if (process.argv.includes('--nettoyer')) {
    const id = Number(process.argv[process.argv.indexOf('--nettoyer') + 1]);
    const types = Object.values(await wp('wp/v2/types'));
    for (const t of types.filter((x) => x.rest_base)) {
      const p = await wp(`wp/v2/${t.rest_base}/${id}`, { params: { context: 'edit', _fields: 'id,status,title' } }).catch(() => null);
      if (!p) continue;
      if (p.status !== 'draft') { console.log(`#${id} est « ${p.status} », pas un brouillon : rien supprimé.`); break; }
      await wp(`wp/v2/${t.rest_base}/${id}`, { methode: 'DELETE', params: { force: true } });
      console.log(`Copie de travail #${id} (brouillon « ${p.title && p.title.raw} ») supprimée. L'original n'a pas été touché.`);
      break;
    }
    return;
  }
  if (!url) throw new Error('adresse de la page à essayer manquante');
  const ecrire = process.argv.includes('--ecrire');
  const inv = await wp('outils-site/v1/inventaire');
  console.log(`Site ${siteId} : Rewrite & Republish ${inv.rewrite_republish ? 'présent' : "absent -> copie de travail + bouton « Remplacer l'original »"}`);
  const slug = decodeURI(new URL(url).pathname).replace(/\/+$/, '').split('/').pop();
  let orig = null, type = null;
  for (const t of inv.types) {
    const l = await wp(`wp/v2/${t.rest_base}`, { params: { slug, status: 'publish', context: 'edit', _fields: 'id,link,title,content,modified_gmt' } }).catch(() => []);
    orig = l.find((x) => x.link.replace(/\/+$/, '') === url.replace(/\/+$/, ''));
    if (orig) { type = t.type; break; }
  }
  if (!orig) throw new Error(`aucun contenu publié à ${url}`);
  const raw = orig.content.raw;
  const sha = R.sha256(raw);
  const passage = passageUnique(raw);
  if (!passage) throw new Error('aucun passage unique trouvé pour le remplacement neutre');
  console.log(`Page : #${orig.id} (${type}) « ${orig.title.raw} », ${Array.from(raw).length} caractères, sha256 ${sha}`);
  console.log(`Remplacement neutre : « ${passage} » -> lui-même\n`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'essai-maj-'));
  const fichier = path.join(tmp, 'manifeste-wp.json');
  fs.writeFileSync(fichier, JSON.stringify({ site_id: siteId, type, mode: 'mise_a_jour', url_origine: url, slug, titre: orig.title.raw, base_sha256: sha, remplacements: [{ avant: passage, apres: passage, occurrences: 1 }] }));
  const d = await depots.creer(db, siteId);
  await depots.recevoir(db, d.jeton, [{ fieldname: 'fichiers', originalname: 'manifeste-wp.json', path: fichier, size: fs.statSync(fichier).size }]);
  fs.rmSync(tmp, { recursive: true, force: true });
  const r = await preparer(db, { depot: d.depot, simulation: !ecrire, relecture: false });
  console.log(`Statut : ${r.statut}`);
  for (const a of r.actions) console.log(`  · ${a.quoi}${a.methode ? ` (${a.methode})` : ''}${a.avant ? `\n      avant : ${a.avant}\n      après : ${a.apres}` : ''}`);
  for (const e of r.erreurs) console.log(`  BLOQUANT ${e.source} : ${e.message}`);
  for (const a of r.avertissements) if (a.source !== 'relecture') console.log(`  attention ${a.source} : ${a.message}`);
  if (ecrire && !r.erreurs.length) {
    const rb = inv.types.find((x) => x.type === type).rest_base;
    const copie = await wp(`wp/v2/${rb}/${r.id}`, { params: { context: 'edit', _fields: 'id,status,content' } });
    const apres = await wp(`wp/v2/${rb}/${orig.id}`, { params: { context: 'edit', _fields: 'content' } });
    console.log(`\nCopie de travail #${copie.id} (${copie.status}, méthode ${r.methode}) : contenu ${copie.content.raw === raw ? 'IDENTIQUE à l\'original' : 'DIFFÉRENT de l\'original (à regarder)'}.`);
    console.log(`Original #${orig.id} : ${R.sha256(apres.content.raw) === sha ? 'inchangé' : 'MODIFIÉ (anormal)'}.`);
    console.log(`\nDans WordPress, la copie #${copie.id} montre l'encadré « Copie de travail » avec le bouton « Remplacer l'original ».`);
    console.log(`Pour supprimer la copie sans rien toucher d'autre : node scripts/essai-mise-a-jour.js ${siteId} --nettoyer ${copie.id}`);
  } else if (!ecrire) console.log('\nSIMULATION : rien écrit. Pour créer la copie de travail : ajouter --ecrire');
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; }).finally(() => pool.end());
