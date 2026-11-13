/* État du module netlinking après déploiement. Lecture seule, sauf --rattacher (une niche, sur demande).
     node scripts/verifier-netlinking.js                       niches sans site, dofollow sans lecture du rel,
                                                               colonne porte_type, garde-fou dofollow, niches par site
     node scripts/verifier-netlinking.js --rattacher 12 2      rattache la niche 12 au site 2 (seulement si elle n'a pas de site)
   N'affiche aucun mot de passe. */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const i = process.argv.indexOf('--rattacher');

(async () => {
  if (i > 0) {
    const [nicheId, siteId] = [Number(process.argv[i + 1]), Number(process.argv[i + 2])];
    const site = (await pool.query('SELECT id, domain FROM seo_sites WHERE id = $1', [siteId])).rows[0];
    if (!nicheId || !site) { console.log('Usage : --rattacher <niche_id> <site_id> (site suivi existant)'); process.exitCode = 1; return; }
    const r = await pool.query('UPDATE seo_niches SET site_id = $2, site_cible = COALESCE(NULLIF(site_cible, \'\'), $3) WHERE id = $1 AND site_id IS NULL RETURNING id, name', [nicheId, siteId, site.domain]);
    console.log(r.rows[0] ? `Niche ${r.rows[0].id} « ${r.rows[0].name} » rattachée à ${site.domain} (site ${siteId}).` : `Rien fait : la niche ${nicheId} n'existe pas ou a déjà un site.`);
    return;
  }
  const orphelines = (await pool.query("SELECT id, name, COALESCE(site_cible, '') AS site_cible, created_at FROM seo_niches WHERE site_id IS NULL ORDER BY id")).rows;
  console.log(`1. Niches sans site : ${orphelines.length}`);
  for (const n of orphelines) console.log(`   ${n.id} « ${n.name} » (site à linker : ${n.site_cible || 'vide'}, créée le ${new Date(n.created_at).toLocaleDateString('fr-FR')})  ->  --rattacher ${n.id} <site_id>`);
  const faux = (await pool.query('SELECT COUNT(*)::int AS n FROM seo_link_targets WHERE dofollow IS TRUE AND rel_verifie_le IS NULL')).rows[0].n;
  console.log(`2. Cibles dofollow = oui sans lecture du rel : ${faux}${faux ? ' (attendu 0 : le backend a-t-il redémarré ?)' : ' (correct)'}`);
  const col = (await pool.query("SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'seo_link_targets' AND column_name = 'porte_type'")).rows[0];
  console.log(`3. Colonne porte_type : ${col ? col.data_type + (col.character_maximum_length ? `(${col.character_maximum_length})` : '') : 'absente'}${col && col.data_type === 'text' ? ' (correct)' : ' (attendu text)'}`);
  const garde = (await pool.query("SELECT COUNT(*)::int AS n FROM pg_trigger WHERE tgname = 'seo_link_targets_dofollow_garde' AND NOT tgisinternal")).rows[0].n;
  console.log(`4. Garde-fou dofollow : ${garde ? 'en place' : 'ABSENT'}`);
  const niches = (await pool.query(`SELECT s.domain AS site, n.id, n.name,
      COUNT(t.id)::int AS cibles, COUNT(t.id) FILTER (WHERE t.dofollow IS TRUE)::int AS dofollow_oui,
      COUNT(t.id) FILTER (WHERE t.dofollow IS NULL)::int AS dofollow_inconnu
    FROM seo_niches n JOIN seo_sites s ON s.id = n.site_id LEFT JOIN seo_link_targets t ON t.niche_id = n.id
    GROUP BY s.domain, n.id ORDER BY s.domain, n.id`)).rows;
  console.log('5. Niches par site (cibles · dofollow oui · inconnu) :');
  for (const n of niches) console.log(`   ${n.site.padEnd(14)} ${String(n.id).padStart(4)} « ${n.name} » : ${n.cibles} · ${n.dofollow_oui} · ${n.dofollow_inconnu}`);
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; }).finally(() => pool.end());
