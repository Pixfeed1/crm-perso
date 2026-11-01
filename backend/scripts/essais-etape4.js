/* Essais de l'étape 4 (retouches après publication), par le même chemin que Claude (outils MCP -> backend).
   N'affiche aucun accès. Rapports complets dans un fichier JSON (chemin affiché à la fin).
   Usage, depuis backend/ :
     node scripts/essais-etape4.js [dossier de pixfeed.net, défaut ~/pixfeed.net]
   1. Redirection : surveillance des permaliens sur jurojin.net et pixfeed.net (active ? quels types ?).
   2. jurojin.net, SIMULATIONS seulement : repointer_liens, poser_etiquettes, modifier_media ; contrôle que rien
      n'a changé (date de modification des pages, journal).
   3. pixfeed.net, contenu de test : slug changé par « Remplacer l'original » (WP-CLI, même fonction que le
      bouton), 301 créée par Redirection, puis les trois outils en écriture réelle. Ensuite SUPPRESSION du contenu
      de test, de son média et de la redirection créée (et seulement eux). */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const { client } = require('../services/wpBrouillon/wp');
const { sonder } = require('../services/wpBrouillon/apresPublication');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const DOSSIER_PX = process.argv[2] || path.join(os.homedir(), 'pixfeed.net');
const IMAGE = path.join(__dirname, '..', '..', 'mcp_seo', 'test', 'brouillon-essai', 'images', 'vue-3.jpg');
const J = 'https://jurojin.net';
const ANCIEN = `${J}/motion-capture-pour-blender-les-meilleurs-outils-et-addons/`;
const NOUVEAU = `${J}/motion-capture-blender/`;
const rapports = {};
const SORTIE = path.join(os.tmpdir(), `essais-etape4-${Date.now()}.json`);

async function site(id) {
  const { rows } = await pool.query('SELECT id, domain, wp_base_url FROM seo_sites WHERE id = $1', [id]);
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  return { id, base, wp: client(id, base) };
}
const erreurs = (r) => [...(r.erreurs || []), ...(r.erreur ? [r.erreur] : [])].map((e) => `${e.source} : ${e.message}`);
const ligne = (r) => `${r.statut || 'ERREUR'}${erreurs(r).length ? `\n      ERREURS : ${erreurs(r).join('\n                ')}` : ''}`;
const avert = (r) => (r.avertissements || []).forEach((a) => console.log(`      avertissement : ${a.source} : ${a.message}`));

function wpCli(dossier, args) {
  let cmd = ['wp'];
  try { execFileSync('wp', ['--version'], { stdio: 'ignore' }); } catch { cmd = ['php', path.join(os.homedir(), 'wp-cli.phar')]; }
  return execFileSync(cmd[0], [...cmd.slice(1), `--path=${dossier}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function surveillance(s) {
  const e = await s.wp('outils-site/v1/redirection').catch((x) => ({ erreur: x.code === 404 ? 'mu-plugin publication-site.php absent' : x.message }));
  if (e.erreur) return `ERREUR ${e.erreur}`;
  if (!e.active) return 'Redirection absente ou inactive';
  const v = e.surveillance || {};
  return `Redirection ${e.version || '?'} ; surveillance des permaliens : ${v.active ? `OUI, types : ${v.types.join(', ')}${v.corbeille ? ' (+ mise à la corbeille)' : ''} ; groupe « ${v.groupe && v.groupe.nom} »` : `NON${v.groupe ? '' : ' (aucun groupe choisi)'}${v.types && v.types.length ? '' : ' (aucun type coché)'}`}`;
}

(async () => {
  const mcp = await import('../../mcp_seo/brouillon.js');
  const ju = await site(2), px = await site(15);

  console.log('== 1. Surveillance des permaliens (Redirection)');
  console.log(`   jurojin.net : ${await surveillance(ju)}`);
  console.log(`   pixfeed.net : ${await surveillance(px)}`);

  console.log('\n== 2. jurojin.net, SIMULATIONS seulement');
  const { rows: [{ n: journalAvant }] } = await pool.query('SELECT count(*)::int AS n FROM seo_wp_journal WHERE site_id = 2 AND simulation = false');
  const ancres = {
    'https://jurojin.net/test-perception-neuron-3-avis-complet-et-verdict-2026/': 'motion capture dans Blender',
    'https://jurojin.net/guide-achat/comparatif-combinaisons-mocap-2026-guide-dachat-complet/': 'Motion capture dans Blender : importer, retargeter et nettoyer sans patiner',
  };
  const rl = rapports.jurojin_repointer_liens = await mcp.repointerLiens(2, ANCIEN, NOUVEAU, ancres, true);
  console.log(`   repointer_liens : ${ligne(rl)}`);
  if (rl.resume) console.log(`      ${rl.resume.pages} page(s), ${rl.resume.liens} lien(s), ${rl.resume.ancres} ancre(s) changée(s)`);
  for (const p of rl.pages || []) console.log(`      #${p.id} ${p.titre} : ${p.occurrences} lien(s)${p.ancres ? ` ; ancre « ${p.ancres[0].avant} » → « ${p.ancres[0].apres} »` : ''} ; date : ${p.date_modification && p.date_modification.page}`);
  for (const m of rl.metadonnees || []) console.log(`      métadonnée #${m.post_id} ${m.cle}${m.note ? ` : ${m.note}` : ''}`);
  avert(rl);

  const urls = ['https://jurojin.net/motion-capture-ia-le-guide-des-solutions-gratuites/', 'https://jurojin.net/guide-achat/comparatif-combinaisons-mocap-2026-guide-dachat-complet/',
    'https://jurojin.net/test-rokoko-smartsuit-pro-ii-avis-complet-et-verdict-2026/', 'https://jurojin.net/test-perception-neuron-3-avis-complet-et-verdict-2026/', 'https://jurojin.net/motion-capture-tout-savoir-sur-la-capture-de-mouvement/'];
  const pe = rapports.jurojin_poser_etiquettes = await mcp.poserEtiquettes(2, urls, [1343], [], true);
  console.log(`   poser_etiquettes (mocap 1343) : ${ligne(pe)}`);
  for (const c of pe.contenus || []) console.log(`      ${c.id ? `#${c.id} ${c.type}` : '?'} ${c.titre || c.url} : ${c.changement || '-'}`);
  avert(pe);

  const article = (await ju.wp('wp/v2/posts', { params: { slug: 'motion-capture-pour-blender-les-meilleurs-outils-et-addons', _fields: 'id,featured_media,modified_gmt' } }))[0];
  if (!article || !article.featured_media) console.log("   modifier_media : article motion capture ou image à la une introuvable");
  else {
    const mm = rapports.jurojin_modifier_media = await mcp.modifierMedia(2, String(article.featured_media), { alt: 'Motion capture dans Blender : importer, retargeter et nettoyer' }, true);
    console.log(`   modifier_media (image à la une #${article.featured_media}) : ${ligne(mm)}`);
    if (mm.champs) console.log(`      alt : « ${mm.champs.alt.avant} » → « ${mm.champs.alt.apres} »`);
    console.log(`      insertions dans les contenus : ${(mm.insertions || []).length}${(mm.insertions || []).length ? ` (${mm.insertions.map((x) => `#${x.id}${x.ancien_alt_en_dur ? ' ancien alt en dur' : ''}`).join(', ')})` : ''}`);
    avert(mm);
  }
  const vues = (rl.pages || []).map((p) => ({ lien: p.lien, avant: p.modifie_le }));
  const relus = vues.length ? (await ju.wp('outils-site/v1/resoudre', { methode: 'POST', corps: { urls: vues.map((v) => v.lien) } }).catch(() => ({ contenus: [] }))).contenus : [];
  const apresDates = vues.map((v) => { const c = relus.find((x) => x.url === v.lien); return !!c && String(c.modifie).replace(/Z$/, '') === String(v.avant).replace(/Z$/, ''); });
  const { rows: [{ n: journalApres }] } = await pool.query('SELECT count(*)::int AS n FROM seo_wp_journal WHERE site_id = 2 AND simulation = false');
  console.log(`   contrôle : écritures journalisées sur jurojin.net ${journalAvant} → ${journalApres} ; dates de modification inchangées : ${apresDates.filter(Boolean).length}/${apresDates.length} → ${journalAvant === journalApres && apresDates.every(Boolean) ? 'RIEN ÉCRIT' : 'ATTENTION'}`);

  console.log('\n== 3. pixfeed.net, contenu de test (écritures réelles, puis suppression)');
  const etat = await px.wp('outils-site/v1/redirection').catch(() => ({}));
  const ts = Date.now().toString(36);
  const cree = { posts: [], media: [], redirections: [] };
  try {
    // image et étiquette existante
    const media = await px.wp('wp/v2/media', { methode: 'POST', corps: fs.readFileSync(IMAGE), entetes: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="essai-outils-${ts}.jpg"` } });
    cree.media.push(media.id);
    await px.wp(`wp/v2/media/${media.id}`, { methode: 'POST', corps: { alt_text: 'Ancien alt essai' } });
    const tag = (await px.wp('wp/v2/tags', { params: { per_page: 1, orderby: 'count', order: 'desc', _fields: 'id,name' } }))[0];
    const noindex = { outils_yoast: { noindex: true } };
    // B : la page dont le slug change ; A : la page qui la cite et insère l'image
    const B = await px.wp('wp/v2/posts', { methode: 'POST', corps: { title: `Essai outils B ${ts} (à supprimer)`, slug: `essai-outils-${ts}-b`, status: 'publish', content: '<!-- wp:paragraph --><p>Page de test.</p><!-- /wp:paragraph -->', ...noindex } });
    cree.posts.push(B.id);
    const ancienB = B.link;
    const A = await px.wp('wp/v2/posts', { methode: 'POST', corps: { title: `Essai outils A ${ts} (à supprimer)`, slug: `essai-outils-${ts}-a`, status: 'publish', ...noindex,
      content: `<!-- wp:paragraph --><p>Lire <a href="${ancienB}">la page B</a> ou <a href="${new URL(ancienB).pathname.replace(/\/$/, '')}">son adresse relative</a>.</p><!-- /wp:paragraph -->\n<!-- wp:image {"id":${media.id}} --><figure class="wp-block-image"><img src="${media.source_url}" alt="Ancien alt essai" class="wp-image-${media.id}"/></figure><!-- /wp:image -->` } });
    cree.posts.push(A.id);
    console.log(`   créés : A #${A.id}, B #${B.id} (publiés, noindex), média #${media.id}`);

    // « Remplacer l'original » : copie de travail avec nouveau slug, puis la même fonction que le bouton
    const copie = await px.wp('outils-site/v1/copie-de-travail', { methode: 'POST', corps: { original: B.id, slug: `essai-outils-${ts}-b-nouveau` } });
    const sortie = wpCli(DOSSIER_PX, ['--user=lecture-seo', 'eval', `$r = outils_remplacer_original(${Number(copie.id)}); echo is_wp_error($r) ? 'ERREUR ' . $r->get_error_message() : 'OK ' . $r;`]);
    const B2 = await px.wp(`wp/v2/posts/${B.id}`, { params: { _fields: 'id,link,slug' } });
    console.log(`   Remplacer l'original : ${sortie} ; slug ${new URL(ancienB).pathname} → ${new URL(B2.link).pathname}`);
    const red = await px.wp('outils-site/v1/redirection', { params: { source: ancienB } });
    cree.redirections.push(...(red.redirections || []).map((x) => x.id));
    const s1 = await sonder(ancienB);
    const rx = (red.redirections || [])[0];
    console.log(`   Redirection : ${rx ? `301 créée (#${rx.id} ${rx.source} → ${rx.cible}, ${rx.code}, ${rx.active ? 'active' : 'inactive'})` : `AUCUNE redirection créée${etat.surveillance && !etat.surveillance.active ? ' (surveillance inactive)' : ''}`}`);
    console.log(`   contrôle HTTP : ${ancienB} → ${s1.code} ${s1.vers || ''} ${s1.code === 301 && s1.vers && new URL(s1.vers).pathname === new URL(B2.link).pathname ? '(OK, un seul saut)' : ''}`);

    // les trois outils en écriture réelle
    const rlp = rapports.pixfeed_repointer_liens = await mcp.repointerLiens(15, ancienB, B2.link, { [A.link]: 'nouvelle ancre essai' }, false);
    const contA = (await px.wp(`wp/v2/posts/${A.id}`, { params: { context: 'edit', _fields: 'content,modified_gmt' } })).content.raw;
    console.log(`   repointer_liens (réel) : ${ligne(rlp)} ; A contient l'ancienne adresse : ${contA.includes(new URL(ancienB).pathname.replace(/\/$/, '')) ? 'OUI (problème)' : 'non'} ; nouvelle ancre : ${contA.includes('>nouvelle ancre essai</a>') ? 'oui' : 'NON'}`);
    const pep = rapports.pixfeed_poser_etiquettes = await mcp.poserEtiquettes(15, [A.link], [tag.id], [], false);
    const pep2 = await mcp.poserEtiquettes(15, [A.link], [], [tag.id], false);
    console.log(`   poser_etiquettes (réel, « ${tag.name} » ajoutée puis retirée) : ${ligne(pep)} / ${ligne(pep2)} ; date de modification : ${(pep.contenus[0] || {}).date_modification || '?'}`);
    const mmp = rapports.pixfeed_modifier_media = await mcp.modifierMedia(15, media.source_url, { alt: 'Nouvel alt essai', legende: 'Légende essai' }, false);
    const relu = await px.wp(`wp/v2/media/${media.id}`, { params: { context: 'edit', _fields: 'alt_text' } });
    console.log(`   modifier_media (réel) : ${ligne(mmp)} ; alt relu : « ${relu.alt_text} » ; insertion avec l'ancien alt signalée : ${(mmp.insertions || []).some((x) => x.id === A.id && x.ancien_alt_en_dur) ? 'oui' : 'NON'}`);
  } catch (e) {
    console.log(`   ERREUR : ${e.message}`);
  } finally {
    // suppression du contenu de test, de son média et de la redirection créée (et seulement eux)
    for (const id of cree.posts) {
      const ok = await px.wp(`wp/v2/posts/${id}`, { methode: 'DELETE', params: { force: true } }).then(() => 'supprimé').catch((e) => e.message);
      console.log(`   nettoyage : article #${id} ${ok}`);
    }
    for (const id of cree.media) {
      const ok = await px.wp(`wp/v2/media/${id}`, { methode: 'DELETE', params: { force: true } }).then(() => 'supprimé').catch((e) => e.message);
      console.log(`   nettoyage : média #${id} ${ok}`);
    }
    for (const id of cree.redirections) {
      try {
        const r = wpCli(DOSSIER_PX, ['eval', `$r = Red_Item::get_by_id(${Number(id)}); if ($r && strpos($r->get_url(), '/essai-outils-${ts}-') === 0) { $r->delete(); echo 'supprimée'; } else { echo 'laissée (pas une redirection d essai)'; }`]);
        console.log(`   nettoyage : redirection #${id} ${r}`);
      } catch (e) { console.log(`   nettoyage : redirection #${id} ERREUR ${String(e.stderr || e.message).split('\n')[0]}`); }
    }
  }
  fs.writeFileSync(SORTIE, JSON.stringify(rapports, null, 2));
  console.log(`\nRapports complets : ${SORTIE}`);
  await pool.end();
})().catch(async (e) => { console.error('Erreur :', e.message); await pool.end().catch(() => {}); process.exit(1); });
