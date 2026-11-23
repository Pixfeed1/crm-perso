// Prestataires en difficulté : homonymes et faux clients (non-régression sur les cas du passage du 23/11).
// Identité certaine (SIREN dans les mentions légales) inchangée ; site trouvé par le nom retenu seulement avec deux
// indices concordants, jamais citable ; institutions et plateformes jamais clientes ; « activité probablement reprise ».
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES [a-z_]+\(id\)( ON DELETE [A-Z ]+)?/g, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}
const PAGES = {
  // Astronome américain : anglais, .com sans adresse en France ; seul le nom correspond.
  'https://thomasnavarro.com/': '<html lang="en"><body><h1>Thomas Navarro</h1><p>I am a researcher in astronomy and astrophysics. My work focuses on the formation of the galaxies and the stars, and you can read my papers. About me, contact, publications and the research group of the university.</p><a href="https://orcid.org/0000">ORCID</a></body></html>',
  // Société népalaise.
  'https://nobins.com/': '<html lang="en"><body><h1>Nobins</h1><p>Nobin\'s is a trading company based in Kathmandu, Nepal. We are the best for you and your family, with our products and our team.</p></body></html>',
  // Cabinet espagnol.
  'https://aelys.com/': '<html lang="es"><body><h1>Aelys Abogados</h1><p>Despacho de abogados en Madrid. Contacte con nosotros para una consulta sobre derecho mercantil y fiscal.</p></body></html>',
  // Agence française trouvée par le nom : français, .fr, code postal du siège.
  'https://studio-lumiere.fr/': '<html lang="fr"><body><h1>Studio Lumière</h1><p>Agence web à Cergy : nous créons votre site et nous en assurons le suivi pour les entreprises du Val-d\'Oise. <a href="/mentions-legales">Mentions légales</a></p></body></html>',
  'https://studio-lumiere.fr/mentions-legales': '<p>Studio Lumière, 12 rue des Arts, 95000 Cergy, France. Tél. 01 23 45 67 89</p>',
};

test('homonymes et faux clients : non-régression sur les cas du 23/11', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('prest_identite', async ({ pool }) => {
    const db = { pool };
    for (const t of ['crawl_jobs', 'crawl_results']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, source TEXT, type TEXT, phone TEXT, facebook_url TEXT, instagram_url TEXT, site_type TEXT, siren TEXT, sector TEXT, naf TEXT, effectif TEXT, city TEXT, postal_code TEXT, department TEXT, prestataire TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP)`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMP DEFAULT NOW())');
    const P = require('../services/prestataireService');
    const B = require('../services/prestatairesBodacc');
    await B.assurerTables(pool);
    const job = (await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('wordpress', 1, 'done') RETURNING id")).rows[0].id;
    const client = (domaine, prestataire, source = null) => pool.query('INSERT INTO crawl_results (job_id, domain, prestataire, prestataire_source, http_status) VALUES ($1, $2, $3, $4, 200)', [job, domaine, prestataire, source]);
    const procedure = { source: 'BODACC', type: 'procedure', niveau: 3, nature: "Jugement d'ouverture de liquidation judiciaire", date: '2026-11-20' };
    const radiation = { source: 'BODACC', type: 'radiation', niveau: 2, nature: 'radiation du registre du commerce', date: '2026-11-21' };
    const ajouter = (domaine, statut, gravite, source, siren, preuves) => pool.query('INSERT INTO prestataires (domaine, statut, gravite, siren_source, siren, nom, preuves, verifie_le) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())', [domaine, statut, gravite, source, siren, domaine.split('.')[0].toUpperCase(), JSON.stringify(preuves)]);
    // Guiltek : identité certaine, 16 sites clients (crédit en pied de page).
    await ajouter('guiltek.fr', 'procedure', 3, 'mentions légales du site', '800000001', [procedure]);
    for (let i = 1; i <= 16; i++) await client(`client-guiltek-${i}.fr`, 'guiltek.fr');
    // Les trois homonymes, trouvés par le nom, avec des « clients » lus dans leurs références.
    for (const [d, siren, nom, ville, cp, greffe] of [['thomasnavarro.com', '800000002', 'THOMAS NAVARRO', 'Versailles', '78000', 'Tribunal de commerce de Versailles'], ['nobins.com', '800000003', "NOBIN'S", 'Versailles', '78000', 'Tribunal de commerce de Versailles'], ['aelys.com', '800000004', 'AELYS', 'Bayonne', '64100', 'Tribunal de commerce de Bayonne']]) {
      await ajouter(d, 'ferme', 2, 'BODACC, site trouvé par le nom', siren, [radiation]);
      await pool.query('INSERT INTO prestataires_bodacc (siren, nom, ville, code_postal, tribunal, domaine, statut, nb_clients) VALUES ($1, $2, $3, $4, $5, $6, $7, 2)', [siren, nom, ville, cp, greffe, d, 'clients_trouves']);
      await client(`${d.split('.')[0]}-ref1.org`, d, 'références du prestataire');
      await client(`${d.split('.')[0]}-ref2.com`, d, 'références du prestataire');
    }
    // Agence française trouvée par le nom, avec des indices concordants : retenue, jamais citable.
    await ajouter('studio-lumiere.fr', 'ferme', 2, 'BODACC, site trouvé par le nom', '800000005', [radiation]);
    await pool.query("INSERT INTO prestataires_bodacc (siren, nom, ville, code_postal, tribunal, domaine) VALUES ('800000005', 'STUDIO LUMIERE', 'Cergy', '95000', 'Tribunal de commerce de Pontoise', 'studio-lumiere.fr')");
    // mooood.fr : vrais clients + plateformes lues dans ses références (dont une promue en prospect).
    await ajouter('mooood.fr', 'ferme', 2, 'mentions légales du site', '800000006', [radiation]);
    for (const d of ['boutique-a.fr', 'boutique-b.fr', 'resto-c.fr']) await client(d, 'mooood.fr', 'références du prestataire');
    await client('sortlist.fr', 'mooood.fr', 'références du prestataire');
    await client('trustindex.io', 'mooood.fr', 'références du prestataire');
    const sid = (await pool.query("SELECT id FROM crawl_results WHERE domain = 'sortlist.fr'")).rows[0].id;
    await pool.query("INSERT INTO leads (name, company, crawl_result_id, prestataire) VALUES ('Sortlist', 'sortlist.fr', $1, 'mooood.fr')", [sid]);
    // Tu Manges Où ? : fermé au registre, site à jour cette année.
    const annee = new Date().getFullYear();
    await ajouter('tumangesou.fr', 'a_verifier', 1, 'mentions légales du site', '800000007', [{ source: 'vérification du site', type: 'contradiction', niveau: 1, copyright: annee, nature: `fermé au registre, mais son site est à jour (copyright ${annee}) : activité probablement reprise` }, { source: 'SIRENE', type: 'cessee', niveau: 2, nature: 'entreprise cessée dans le répertoire SIRENE' }]);

    const r = await B.controlerIdentites(db, { page: async (u) => PAGES[u] || '' });
    assert.deepEqual(r.homonymes.sort(), ['aelys.com', 'nobins.com', 'thomasnavarro.com']);
    assert.deepEqual(r.controles.find((c) => c.domaine === 'studio-lumiere.fr').indices, ['site en français', 'domaine .fr', 'code postal du siège (95000)', 'raison sociale exacte sur le site']);
    assert.equal(r.faux_clients_detaches, 2);

    // 1. Les trois homonymes sortent de la liste par défaut ; raison dans les preuves ; références détachées.
    const l = await P.lister(db);
    const dans = l.prestataires.map((p) => p.domaine);
    for (const d of ['thomasnavarro.com', 'nobins.com', 'aelys.com']) assert.ok(!dans.includes(d), `${d} hors liste`);
    const tn = await P.detail(db, 'thomasnavarro.com');
    assert.deepEqual([tn.statut, tn.gravite, tn.clients.length], ['homonyme', 0, 0]);
    assert.match(tn.preuves[0].nature, /^homonyme probable : site trouvé par le nom, 1 indice\(s\) sur 4 : raison sociale exacte sur le site$/);
    assert.equal(l.totaux.homonyme, 3);
    assert.equal((await pool.query("SELECT statut FROM prestataires_bodacc WHERE siren = '800000004'")).rows[0].statut, 'homonyme');

    // 2. Guiltek inchangé : procédure, citable, 16 sites.
    const C = require('../services/campagneConnecteur');
    const g = await C.prestataires(db, { domaine: 'guiltek.fr' });
    assert.deepEqual([g.statut, g.citable_dans_un_email, g.clients.length], ['procedure', true, 16]);
    assert.equal(l.prestataires.find((p) => p.domaine === 'guiltek.fr').nb_clients, 16);
    assert.ok(await P.signalPourSite(db, 'guiltek.fr'));

    // 3. Trouvé par le nom, retenu : jamais citable, même avec une annonce de niveau 2.
    const sl = await C.prestataires(db, { domaine: 'studio-lumiere.fr' });
    assert.deepEqual([sl.statut, sl.citable_dans_un_email], ['ferme', false]);
    assert.match(sl.identite_indices, /4 indice\(s\) sur 4/);
    assert.equal(await P.signalPourSite(db, 'studio-lumiere.fr'), null);

    // 4. mooood.fr ne compte plus sortlist.fr ni trustindex.io (crawl et fiche prospect détachés).
    const m = await P.detail(db, 'mooood.fr');
    assert.deepEqual(m.clients.map((c) => c.domain).sort(), ['boutique-a.fr', 'boutique-b.fr', 'resto-c.fr']);
    assert.equal(l.prestataires.find((p) => p.domaine === 'mooood.fr').nb_clients, 3);
    assert.equal((await pool.query("SELECT prestataire FROM leads WHERE company = 'sortlist.fr'")).rows[0].prestataire, null);

    // 5. Fermé, site à jour : « à vérifier », affiché « activité probablement reprise ».
    const tm = l.prestataires.find((p) => p.domaine === 'tumangesou.fr');
    assert.deepEqual([tm.statut, tm.motif], ['a_verifier', 'activité probablement reprise']);
    assert.equal((await C.prestataires(db, {})).prestataires.find((p) => p.domaine === 'tumangesou.fr').motif, 'activité probablement reprise');

    // Vérification du lundi : un homonyme le reste ; deuxième contrôle : rien de plus.
    const v = await P.verifier(db, { domaines: ['nobins.com'] }, { pause: 0, detect: async (x) => x.map((d) => ({ domain: d, http_status: 200, title: 'Nobins' })), parSiren: async () => ({ found: true, etat: 'C' }), bodacc: async () => [] });
    assert.equal(v.resultats[0].statut, 'homonyme');
    assert.equal((await P.detail(db, 'nobins.com')).statut, 'homonyme');
    const r2 = await B.controlerIdentites(db, { page: async (u) => PAGES[u] || '' });
    assert.deepEqual([r2.controles.length, r2.faux_clients_detaches], [0, 0]);

    // Nouvelle annonce : site trouvé par le nom sans indices → homonyme d'emblée, aucune référence lue, pas de mail.
    const pagesLues = [];
    const mails = [];
    const res = await B.relever(db, {
      pause: 0, maintenant: () => new Date('2026-11-24T05:37:00Z'),
      get: async (url, params) => ({ results: params.offset === 0 && /2026-11-23/.test(params.where) ? [{ id: 'X1', dateparution: '2026-11-23', familleavis: 'radiation', registre: ['800000009'], commercant: 'GALAXIE WEB', tribunal: 'Tribunal de commerce de Lille' }] : [] }),
      parSiren: async (s) => ({ found: true, siren: s, naf: '62.01Z', raison_sociale: 'GALAXIE WEB', ville: 'Lille', code_postal: '59000' }),
      detect: async (x) => x.map((d) => (d === 'galaxieweb.com' ? { domain: d, http_status: '200', title: 'Galaxie Web Studio' } : { domain: d, http_status: '0' })),
      page: async (u) => { pagesLues.push(u); return u === 'https://galaxieweb.com/' ? '<html lang="en"><p>Galaxie Web is a design studio in Montreal, Canada.</p><a href="/portfolio">Portfolio</a></html>' : ''; },
      mail: async (s, t) => { mails.push(s); },
    }, { jours: 1 });
    assert.equal((await P.detail(db, 'galaxieweb.com')).statut, 'homonyme');
    assert.ok(!pagesLues.some((u) => /portfolio/.test(u)), 'références jamais lues pour un homonyme');
    assert.deepEqual([res.nouveaux.length, mails.length], [0, 0]);
  });
});
