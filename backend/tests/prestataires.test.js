// Signal « prestataire en difficulté ou disparu » : preuves BODACC / SIRENE / site, vérification, prospects,
// angle « prestataire » de l'email par la preuve dans une vraie campagne, fiche du prestataire.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');
const P = require('../services/prestataireService');
const proof = require('../services/proofEmailService');

const COLLECTIVE = { id: 'A202611040123', dateparution: '2026-11-04', familleavis: 'collective', familleavis_lib: 'Procédures collectives', tribunal: 'Tribunal de commerce de Pontoise', commercant: 'AGENCE X', registre: ['732 829 320', '732829320'], jugement: JSON.stringify({ famille: "Jugement d'ouverture", nature: "Jugement d'ouverture de liquidation judiciaire", date: '2026-10-28' }), url_complete: 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A202611040123' };

test('preuves : annonces BODACC, indices du site, conclusion', () => {
  const p = P.preuveBodacc(COLLECTIVE);
  assert.deepEqual([p.type, p.niveau, p.nature, p.date, p.tribunal], ['procedure', 3, "Jugement d'ouverture de liquidation judiciaire", '2026-11-04', 'Tribunal de commerce de Pontoise']);
  assert.equal(P.preuveBodacc({ familleavis: 'radiation', dateparution: '2026-01-02' }).niveau, 2);
  assert.equal(P.preuveBodacc({ familleavis: 'vente', dateparution: '2026-01-02' }).niveau, 1, 'cession : information, jamais dans un email');
  assert.equal(P.preuveBodacc({ familleavis: 'immatriculation' }), null);
  assert.equal(P.preuveBodacc({ familleavis: 'dpc', familleavis_lib: 'Dépôts des comptes' }), null);
  const maintenant = new Date('2026-11-16');
  const sig = (row, echecsAvant = 0, detectOk = true) => P.signauxSite(row, { maintenant, echecsAvant, detectOk });
  // Injoignable ou en erreur : rien à la première panne, un indice à la deuxième vérification de suite ; retour : remis à zéro.
  assert.deepEqual([sig(null).echecs, sig(null).preuves.length], [1, 0]);
  assert.match(sig(null, 1).preuves[0].nature, /injoignable lors de 2 vérifications de suite/);
  assert.match(sig({ http_status: 503 }, 1).preuves[0].nature, /en erreur \(503\) lors de 2 vérifications de suite/);
  assert.equal(sig({ http_status: 200 }, 3).echecs, 0);
  assert.deepEqual(sig(null, 1, false), { echecs: 1, preuves: [], faible: null }, 'analyse en panne : rien ne change');
  // Parqué : tout de suite ; copyright ancien : indice faible, jamais seul.
  assert.match(sig({ http_status: 200, parked: true }).preuves[0].nature, /parqué/);
  const vieux = sig({ http_status: 200, copyright_annee: 2023 });
  assert.deepEqual([vieux.preuves.length, vieux.faible.niveau, vieux.faible.faible], [0, 0, true]);
  assert.match(vieux.faible.nature, /non mis à jour \(copyright 2023\)/);
  assert.equal(sig({ http_status: 200, copyright_annee: 2025 }).faible, null);
  assert.equal(sig(null, 1).preuves[0].source, 'vérification du site', 'la source s\'affiche (plus « undefined »)');
  // Faux prestataires : hébergeurs, CMS, réseaux, outils, raccourcisseurs ; pas les noms qui les contiennent.
  for (const d of ['hostinger.com', 'hostinger.fr', 'ovh.net', 'o2switch.fr', 'ionos.fr', 'gandi.net', 'monsite.wixsite.com', 'squarespace.com', 'wordpress.org', 'fr.wordpress.com', 'boutique.myshopify.com', 'prestashop.com', 'maps.app.goo.gl', 'goo.gl', 'g.page', 'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'x.com', 'twitter.com', 'pinterest.fr', 'cloudflare.com', 'bit.ly', 'linktr.ee']) assert.equal(P.estExclu(d), true, d);
  for (const d of ['agence-x.fr', 'agence-google-ads.fr', 'pixel-x.com', 'wixel.fr', 'ovhgeek.fr']) assert.equal(P.estExclu(d), false, d);
  assert.deepEqual(P.conclure([{ niveau: 1 }, { niveau: 3 }]), { gravite: 3, statut: 'procedure' });
  assert.deepEqual(P.conclure([]), { gravite: 0, statut: 'actif' });
});

test('BODACC : annonces d\'un SIREN, au format de l\'API open data', async () => {
  let recu = null;
  const srv = http.createServer((req, res) => {
    recu = new URL(req.url, 'http://x');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total_count: 2, results: [COLLECTIVE, { ...COLLECTIVE, id: 'autre', registre: ['999999999'] }] }));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  process.env.BODACC_API_URL = `http://127.0.0.1:${srv.address().port}/records`;
  try {
    const l = await P.annoncesBodacc('732829320');
    assert.deepEqual(l.map((x) => x.id), ['A202611040123'], 'seules les annonces de ce SIREN');
    assert.equal(recu.searchParams.get('where'), 'registre="732829320" OR registre="732 829 320"');
    assert.equal(recu.searchParams.get('order_by'), 'dateparution desc');
  } finally { srv.close(); delete process.env.BODACC_API_URL; }
});

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES users\(id\)/, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}

test('vérification, liste, prospects, angle « prestataire » dans une campagne, fiche du prestataire', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('prestataires', async ({ pool }) => {
    const db = { pool };
    const S = require('../services/campaignService');
    const { typedResult, insertCrawlResult } = require('../controllers/crawlController');
    for (const t of ['crawl_jobs', 'crawl_results', 'campaigns', 'campaign_items', 'scheduled_emails']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, source TEXT, type TEXT, phone TEXT, facebook_url TEXT, instagram_url TEXT, site_type TEXT, siren TEXT, sector TEXT, naf TEXT, effectif TEXT, city TEXT, postal_code TEXT, department TEXT, prestataire TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, result TEXT, relation_status TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, relance_step INT, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMP DEFAULT NOW())');
    await pool.query('CREATE TABLE email_log (id SERIAL PRIMARY KEY, to_email TEXT, source VARCHAR(40), created_at TIMESTAMP DEFAULT NOW())');
    await pool.query('CREATE TABLE email_signatures (id SERIAL PRIMARY KEY, content TEXT, is_default BOOLEAN DEFAULT FALSE)');
    await pool.query('CREATE TABLE email_tracking (id SERIAL PRIMARY KEY, token TEXT, contact_type TEXT, contact_id INT, to_email TEXT, subject TEXT, opens INT DEFAULT 0)');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL, motif TEXT, source VARCHAR(30) DEFAULT 'fiche', created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    process.env.OUTREACH_SENDER_NAME = 'Marc';
    const job = (await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 4, 'done') RETURNING id")).rows[0].id;
    const maintenant = new Date().toISOString();
    const site = (domain, prestataire, extra = {}) => insertCrawlResult(db, job, typedResult({ domain, platform: 'PrestaShop', http_status: '200', final_url: `https://www.${domain}/`, https_final: 'oui', ssl_ok: 'oui', title: domain, email: `contact@${domain}`, analyse_le: maintenant, prestataire, ...extra }));
    const c1 = await site('fleurs-pontoise.fr', 'agence-x.fr');
    const c2 = await site('cave-cergy.fr', 'www.agence-x.fr', { https_final: 'non', final_url: 'http://www.cave-cergy.fr/' });   // a aussi une preuve « Non sécurisé »
    await site('velo-osny.fr', 'freelance-y.fr');
    await site('jardin-eragny.fr', 'ancienne-agence.fr');
    await site('bijoux-auvers.fr', 'agence-saine.fr');
    await pool.query("UPDATE crawl_results SET prestataire = 'www.agence-x.fr' WHERE id = $1", [c2]);
    await site('gite-vexin.fr', 'agence-figee.fr');
    await site('miel-vexin.fr', 'agence-parquee.fr');
    await site('pizza-osny.fr', 'hostinger.com');
    await site('coiffure-osny.fr', 'maps.app.goo.gl');
    await P.assurerTables(pool);
    await pool.query("INSERT INTO prestataires (domaine, statut, gravite) VALUES ('maps.app.goo.gl', 'abandon', 1), ('bit.ly', 'abandon', 1)");

    const inv = await P.inventaire(db);
    assert.deepEqual([inv.prestataires, inv.nouveaux, inv.retires.sort()], [6, 6, ['bit.ly', 'maps.app.goo.gl']], 'faux prestataires jamais ajoutés, anciens retirés');
    // Sources factices : site du prestataire, annuaire des entreprises, BODACC.
    const deps = {
      pause: 0,
      detect: async (l) => l.map((d) => ({
        'agence-x.fr': { domain: d, http_status: 200, title: 'Agence X', siren_site: '732829320', email: 'bonjour@agence-x.fr', phone: '0102030405', copyright_annee: 2026 },
        'freelance-y.fr': { domain: d, http_status: 0 },
        'ancienne-agence.fr': { domain: d, http_status: 200, title: 'Ancienne Agence', copyright_annee: 2026 },
        'agence-saine.fr': { domain: d, http_status: 200, title: 'Agence Saine', siren_site: '443061841', copyright_annee: 2026 },
        'agence-figee.fr': { domain: d, http_status: 200, copyright_annee: 2021 },
        'agence-parquee.fr': { domain: d, http_status: 200, parked: true, copyright_annee: 2020 },
      }[d])),
      parSiren: async (s) => ({ found: true, siren: s, raison_sociale: s === '732829320' ? 'AGENCE X' : 'AGENCE SAINE', etat: 'A' }),
      enrichMatch: async () => ({ found: true, match: 'sur', siren: '552100554', raison_sociale: 'ANCIENNE AGENCE', etat: 'C', date_fermeture: '2026-06-30' }),
      bodacc: async (s) => (s === '732829320' ? [COLLECTIVE, { familleavis: 'immatriculation', dateparution: '2019-03-01' }] : []),
    };
    let v = await P.verifier(db, {}, deps);
    let par = Object.fromEntries(v.resultats.map((x) => [x.domaine, x]));
    assert.deepEqual([par['freelance-y.fr'].statut, par['agence-figee.fr'].statut], ['actif', 'actif'], 'une seule panne, copyright seul : rien');
    assert.equal(par['agence-parquee.fr'].statut, 'abandon');
    const parquee = await P.detail(db, 'agence-parquee.fr');
    assert.deepEqual(parquee.preuves.map((x) => [x.niveau, x.source]), [[1, 'vérification du site'], [0, 'vérification du site']], 'copyright affiché parce que le domaine est parqué');
    assert.equal((await P.detail(db, 'agence-figee.fr')).preuves.length, 0);
    v = await P.verifier(db, { domaines: ['freelance-y.fr'] }, deps);          // deuxième vérification en échec
    par = { ...par, ...Object.fromEntries(v.resultats.map((x) => [x.domaine, x])) };
    assert.deepEqual([par['agence-x.fr'].statut, par['agence-x.fr'].gravite], ['procedure', 3]);
    assert.deepEqual([par['ancienne-agence.fr'].statut, par['ancienne-agence.fr'].gravite], ['ferme', 2]);
    assert.deepEqual([par['freelance-y.fr'].statut, par['freelance-y.fr'].siren], ['abandon', null]);
    assert.equal(par['agence-saine.fr'].statut, 'actif');

    // Sites clients enregistrés sous d'autres formes : URL complète dans un crawl, fiche rattachée à un crawl qui ne
    // cite pas le prestataire, fiche sans crawl ; le même site n'est compté qu'une fois.
    const c3 = await site('the-parquee.fr', 'https://www.agence-parquee.fr/mentions');
    const c4 = await site('olives-vexin.fr', null);
    await pool.query("INSERT INTO leads (company, website, crawl_result_id, prestataire) VALUES ('Olives', 'https://olives-vexin.fr', $1, 'HTTPS://agence-parquee.fr/'), ('The Parquée', 'the-parquee.fr', $2, 'agence-parquee.fr'), ('Sans crawl', 'https://www.thé-vexin.fr/', NULL, 'www.agence-parquee.fr')", [c4, c3]);
    assert.deepEqual((await P.detail(db, 'agence-parquee.fr')).clients.map((c) => c.domain).sort(), ['miel-vexin.fr', 'olives-vexin.fr', 'the-parquee.fr', 'thé-vexin.fr']);
    assert.equal((await P.inventaire(db)).nouveaux, 0, 'les autres formes ne créent pas de doublon');

    // Liste : par gravité, avec le nombre de sites clients (www., protocole et chemin compris).
    let l = await P.lister(db);
    assert.deepEqual(l.prestataires.map((p) => [p.domaine, p.nb_clients]), [['agence-x.fr', 2], ['ancienne-agence.fr', 1], ['agence-parquee.fr', 4], ['freelance-y.fr', 1]]);
    await pool.query("DELETE FROM leads WHERE prestataire ILIKE '%agence-parquee%'");
    await pool.query('DELETE FROM crawl_results WHERE id = ANY($1)', [[c3, c4]]);
    assert.deepEqual(l.totaux, { procedure: 1, ferme: 1, abandon: 2, actif: 2 });
    assert.ok(!l.prestataires.some((p) => /hostinger|goo\.gl/.test(p.domaine)));
    const d = await P.detail(db, 'agence-x.fr');
    assert.deepEqual([d.nom, d.siren_source, d.contact.email], ['AGENCE X', 'mentions légales du site', 'bonjour@agence-x.fr']);

    // Citable dans un email : identité certaine et fait daté seulement.
    assert.equal((await P.signalPourSite(db, 'www.agence-x.fr')).type, 'procedure');
    assert.equal(await P.signalPourSite(db, 'ancienne-agence.fr'), null, 'SIREN rapproché par le nom : jamais cité');
    assert.equal(await P.signalPourSite(db, 'freelance-y.fr'), null, 'indice : jamais cité');

    // Prospects puis campagne : l'email prend l'angle « prestataire », avant « Non sécurisé ».
    const pr = await P.promouvoir(db, 'agence-x.fr');
    assert.deepEqual([pr.creees, pr.lead_ids.length], [2, 2]);
    assert.match((await pool.query('SELECT notes, source FROM leads WHERE id = $1', [pr.lead_ids[0]])).rows[0].notes, /Prestataire crédité : AGENCE X \(agence-x\.fr\) : Jugement d'ouverture de liquidation judiciaire \(BODACC, 04\/11\/2026\)/);
    const camp = await S.createCampaign(db, { nom: 'Clients agence X', mode: 'preuve' });
    S.lancerReanalyse = () => {};
    const out = await P.versCampagne(db, 'agence-x.fr', camp.id);
    assert.equal(out.ajoutes, 2);
    const items = (await S.getCampaignFull(db, camp.id)).items;
    for (const it of items) {
      assert.equal(it.preuve_signal, 'prestataire_difficulte', it.raison || it.domain);
      assert.match(it.body, /indique que le site a été réalisé par Agence X\. Or le BODACC du 4 novembre 2026 publie, pour cette société, l'annonce « Jugement d'ouverture de liquidation judiciaire » \(Tribunal de commerce de Pontoise\)\./);
      assert.match(it.body, /Savez-vous aujourd'hui qui détient ces accès pour votre site \?/);
      assert.doesNotMatch(it.body, proof.FORMULES_INTERDITES);
      assert.match(it.subject, /^Le suivi de /);
    }
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM scheduled_emails')).rows[0].n, 0, 'rien de programmé');
    // Prestataire non citable : email habituel.
    const lAnc = (await P.promouvoir(db, 'ancienne-agence.fr')).lead_ids[0];
    const r = await S.addLeads(db, camp.id, [lAnc]);
    assert.equal(r.ajoutes, 1);
    const itAnc = (await S.getCampaignFull(db, camp.id)).items.find((x) => x.lead_id === lAnc);
    assert.notEqual(itAnc.preuve_signal, 'prestataire_difficulte');

    // Fiche du prestataire (reprise de portefeuille), une seule fois ; ignorer le retire de la liste.
    const f = await P.ficheDuPrestataire(db, 'agence-x.fr');
    assert.equal(f.deja, false);
    assert.deepEqual(await P.ficheDuPrestataire(db, 'agence-x.fr'), { lead_id: f.lead_id, deja: true });
    const fiche = (await pool.query('SELECT name, email, phone, source, notes FROM leads WHERE id = $1', [f.lead_id])).rows[0];
    assert.deepEqual([fiche.name, fiche.email, fiche.phone, fiche.source], ['AGENCE X', 'bonjour@agence-x.fr', '0102030405', 'Signal prestataire']);
    assert.match(fiche.notes, /message privé/);
    await P.ignorer(db, 'freelance-y.fr', { raison: 'pas pertinent' });
    l = await P.lister(db);
    assert.ok(!l.prestataires.some((p) => p.domaine === 'freelance-y.fr'));
    assert.equal(await P.signalPourSite(db, 'agence-saine.fr'), null);
  });
});
