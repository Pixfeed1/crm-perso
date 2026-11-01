/* Essais réels de prepare_draft, par le même chemin que Claude : outil demander_depot, envoi du dossier
   au lien reçu, outil prepare_draft. N'affiche aucun accès ni jeton.
   Usage, depuis backend/ :
     node scripts/essais-brouillon.js            essais (pixfeed.net : simulation, écriture, second appel ;
                                                 jurojin.net : mise à jour en simulation seulement)
     node scripts/essais-brouillon.js --nettoyer supprime le brouillon d'essai de pixfeed.net et ses fichiers */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const { client } = require('../services/wpBrouillon/wp');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const ESSAI = path.join(__dirname, '..', '..', 'mcp_seo', 'test', 'brouillon-essai');
const BLENDER = 'https://jurojin.net/motion-capture-pour-blender-les-meilleurs-outils-et-addons/';

async function site(id) {
  const { rows } = await pool.query('SELECT id, domain, wp_base_url, wp_auteur FROM seo_sites WHERE id = $1', [id]);
  const s = rows[0];
  return { ...s, base: String(s.wp_base_url || `https://${s.domain}`).replace(/\/+$/, ''), wp: client(id, String(s.wp_base_url || `https://${s.domain}`)) };
}

/** Auteur des articles : celui du CRM, sinon le signataire le plus fréquent des 20 derniers articles publiés. */
async function auteur(s) {
  if (s.wp_auteur) return `${s.wp_auteur} (réglé dans le CRM)`;
  const inv = await s.wp('outils-site/v1/inventaire');
  const posts = await s.wp('wp/v2/posts', { params: { per_page: 20, status: 'publish', _fields: 'author' } });
  const n = {}; for (const p of posts) n[p.author] = (n[p.author] || 0) + 1;
  const id = Number(Object.entries(n).sort((a, b) => b[1] - a[1])[0][0]);
  const a = inv.auteurs.find((x) => x.id === id && x.identifiant !== process.env[`WP_API_USER_${s.id}`]);
  if (!a) throw new Error(`auteur introuvable pour ${s.domain} : le régler dans le CRM (SEO > sites)`);
  await pool.query('UPDATE seo_sites SET wp_auteur = $1 WHERE id = $2', [a.identifiant, s.id]);
  return `${a.identifiant} (signataire de ${n[id]} des ${posts.length} derniers articles, enregistré dans le CRM)`;
}

/** Envoi d'un dossier au lien de dépôt, comme Claude : zip + curl si disponibles, sinon fichiers séparés. */
async function envoyer(dossier, url) {
  try {
    const zip = path.join(os.tmpdir(), `lot-essai-${Date.now()}.zip`);
    execFileSync('zip', ['-qr', '-X', zip, '.'], { cwd: dossier });
    const r = JSON.parse(execFileSync('curl', ['-sS', '-F', `lot=@${zip}`, url]).toString());
    fs.rmSync(zip, { force: true });
    return { ...r, methode: 'zip + curl' };
  } catch (e) {
    if (!/ENOENT|not found/i.test(String(e.message))) throw e;
    const form = new FormData();
    const parcourir = (d, rel = '') => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r2 = rel ? `${rel}/${f}` : f; if (fs.statSync(p).isDirectory()) parcourir(p, r2); else form.append('fichiers', new Blob([fs.readFileSync(p)]), r2); } };
    parcourir(dossier);
    const r = await fetch(url, { method: 'POST', body: form });
    return { ...(await r.json()), methode: 'fichiers séparés' };
  }
}

const ligne = (r) => `${r.statut}${r.erreurs && r.erreurs.length ? ` ; ERREURS : ${r.erreurs.map((e) => `${e.source} ${e.message}`).join(' | ')}` : ''}${r.erreur ? ` ; ERREUR ${r.erreur.source} ${r.erreur.message}` : ''}`;

(async () => {
  const mcp = await import('../../mcp_seo/brouillon.js');
  const nettoyer = process.argv.includes('--nettoyer');
  const px = await site(15);

  if (nettoyer) {
    const { rows } = await pool.query("SELECT DISTINCT post_id, fichiers FROM seo_wp_journal WHERE site_id = 15 AND simulation = false AND titre LIKE 'Essai : brouillon préparé par Claude%'");
    const posts = new Set(rows.map((r) => r.post_id)); const medias = new Set(rows.flatMap((r) => (r.fichiers || []).map((f) => f.id)));
    for (const id of posts) {
      const p = await px.wp(`wp/v2/posts/${id}`, { params: { context: 'edit', _fields: 'id,status' } }).catch(() => null);
      if (!p) { console.log(`brouillon #${id} : déjà supprimé`); continue; }
      if (p.status !== 'draft') { console.log(`#${id} n'est pas un brouillon (${p.status}) : laissé tel quel`); continue; }
      await px.wp(`wp/v2/posts/${id}`, { methode: 'DELETE', params: { force: true } });
      console.log(`brouillon #${id} supprimé`);
    }
    for (const id of medias) {
      const ok = await px.wp(`wp/v2/media/${id}`, { methode: 'DELETE', params: { force: true } }).then(() => true).catch((e) => (e.code === 404 ? 'déjà supprimé' : e.message));
      console.log(`média #${id} : ${ok === true ? 'supprimé' : ok}`);
    }
    await pool.end(); return;
  }

  console.log(`== auteur pixfeed.net : ${await auteur(px)}`);
  const ju = await site(2);
  console.log(`== auteur jurojin.net : ${await auteur(ju)}`);

  console.log('\n== 1. pixfeed.net, mode nouveau');
  const dep = await mcp.demanderDepot(15);
  if (dep.erreur) throw new Error(`${dep.erreur.source} : ${dep.erreur.message}`);
  const recu = await envoyer(ESSAI, dep.url_envoi);
  console.log(`   dépôt #${dep.depot} : ${recu.fichiers} fichiers reçus (${(recu.octets / 1024).toFixed(0)} Ko, ${recu.methode}), manifeste : ${recu.manifeste ? 'oui' : 'NON'}`);
  const sim = await mcp.prepareDraft(dep.depot, true);
  console.log(`   simulation : ${ligne(sim)}`);
  console.log(`      ${sim.actions.length} actions (${sim.actions.filter((a) => a.quoi === 'téléverser').length} fichiers à téléverser) ; blocs : ${Object.entries(sim.blocs || {}).map(([k, v]) => `${k.replace('core/', '')}×${v}`).join(', ')}`);
  console.log(`      intégrations : ${(sim.integrations || []).map((i) => `${i.url} → ${i.fournisseur}`).join(' ; ')}`);
  for (const a of sim.avertissements || []) console.log(`      avertissement : ${a.source} : ${a.message}`);
  const ec = await mcp.prepareDraft(dep.depot, false);
  console.log(`   écriture : ${ligne(ec)}`);
  if (ec.id) {
    console.log(`      brouillon #${ec.id} (${ec.statut_wordpress}) ; ${ec.fichiers.length} fichiers : ${ec.fichiers.map((f) => `${f.fichier}#${f.id}`).join(', ')}`);
    console.log(`      APERÇU : ${ec.lien_apercu}`);
    console.log(`      ÉDITION : ${ec.lien_edition}`);
  }
  const ec2 = await mcp.prepareDraft(dep.depot, false);
  console.log(`   second appel identique : ${ligne(ec2)} ; brouillon #${ec2.id} ${ec2.id === ec.id ? '(le même)' : '(DIFFÉRENT !)'} ; fichiers réutilisés : ${(ec2.fichiers || []).filter((f) => f.reutilise).length}/${(ec2.fichiers || []).length}`);

  console.log('\n== 2. jurojin.net, mise à jour de l\'article Blender, SIMULATION seulement');
  const avant = await ju.wp('wp/v2/posts', { params: { slug: 'motion-capture-pour-blender-les-meilleurs-outils-et-addons', context: 'edit', _fields: 'id,modified_gmt,title' } });
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'maj-essai-'));
  fs.writeFileSync(path.join(dossier, 'contenu.html'), '<!-- wp:paragraph -->\n<p>Contenu de simulation : rien ne doit être écrit sur jurojin.net.</p>\n<!-- /wp:paragraph -->\n');
  fs.writeFileSync(path.join(dossier, 'manifeste-wp.json'), JSON.stringify({ site_id: 2, type: 'post', mode: 'mise_a_jour', url_origine: BLENDER, slug: 'motion-capture-pour-blender-les-meilleurs-outils-et-addons', titre: avant[0] ? avant[0].title.raw : 'Motion capture pour Blender', contenu: 'contenu.html', yoast: { phrase_cle: 'motion capture blender' } }));
  const dep2 = await mcp.demanderDepot(2);
  const recu2 = await envoyer(dossier, dep2.url_envoi);
  const sim2 = await mcp.prepareDraft(dep2.depot, true);
  console.log(`   dépôt #${dep2.depot} (${recu2.fichiers} fichiers) ; simulation : ${ligne(sim2)}`);
  for (const a of sim2.actions || []) console.log(`      prévu : ${a.quoi}${a.methode ? ' — ' + a.methode : ''}`);
  const apres = await ju.wp('wp/v2/posts', { params: { slug: 'motion-capture-pour-blender-les-meilleurs-outils-et-addons', context: 'edit', _fields: 'id,modified_gmt' } });
  console.log(`   article Blender modifié le ${avant[0] && avant[0].modified_gmt} avant, ${apres[0] && apres[0].modified_gmt} après : ${avant[0] && apres[0] && avant[0].modified_gmt === apres[0].modified_gmt ? 'RIEN ÉCRIT' : 'ATTENTION, différent'}`);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM seo_wp_journal WHERE site_id = 2 AND simulation = false');
  console.log(`   écritures journalisées sur jurojin.net : ${rows[0].n}`);
  fs.rmSync(dossier, { recursive: true, force: true });
  await pool.end();
})().catch(async (e) => { console.error('Erreur :', e.message); await pool.end().catch(() => {}); process.exit(1); });
