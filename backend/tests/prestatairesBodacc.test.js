// Agences web repérées directement au BODACC : tri par code NAF (cache), site retrouvé (SIREN sur le site, ou nom dans
// le titre), clients lus dans les pages de références et rattachés, mail, prestataires déjà connus, angle d'email.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');
const B = require('../services/prestatairesBodacc');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES [a-z_]+\(id\)( ON DELETE [A-Z ]+)?/g, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}
const annonce = (id, siren, famille, extra = {}) => ({ id, dateparution: '2026-11-22', familleavis: famille, familleavis_lib: famille === 'collective' ? 'Procédures collectives' : 'Radiations', tribunal: 'Tribunal de commerce de Pontoise', registre: [siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'), siren], url_complete: `https://www.bodacc.fr/annonce/${id}`, ...extra });

test('aides : liquidateur, domaines candidats, choix du site, références', async () => {
  assert.equal(B.liquidateur({ jugement: JSON.stringify({ complementJugement: 'Jugement prononçant la liquidation judiciaire, désignant liquidateur Me Jean Dupont, 3 rue X 95000 Cergy.' }) }), 'Liquidateur : Me Jean Dupont, 3 rue X 95000 Cergy');
  assert.equal(B.liquidateur({ jugement: JSON.stringify({ nature: 'Jugement de clôture' }) }), null);
  assert.deepEqual(B.domainesCandidats('SARL STUDIO WEB'), ['studioweb.fr', 'studioweb.com', 'studio-web.fr', 'studio-web.com', 'agencestudioweb.fr', 'agencestudioweb.com']);
  assert.deepEqual(B.choisirSite([{ domain: 'pixelnord.fr', http_status: '200', title: 'Pixel Nord, agence web', siren_site: '' }], '111222333', 'AGENCE PIXEL NORD'), { domaine: 'pixelnord.fr', source: 'nom dans le titre du site' });
  assert.equal(B.choisirSite([{ domain: 'pixelnord.fr', http_status: '200', title: 'Pixel Nord', parked: 'oui' }], '111222333', 'PIXEL NORD'), null, 'domaine parqué : non');
  assert.equal(B.choisirSite([{ domain: 'nord.fr', http_status: '200', title: 'Nord Immobilier' }], '111222333', 'PIXEL NORD'), null, 'tous les mots du nom');
  const pages = {
    'https://agence.fr/': '<nav><a href="/">Accueil</a><a href="/nos-realisations/">Nos réalisations</a><a href="/contact">Contact</a></nav><a href="https://www.facebook.com/agence">fb</a>',
    'https://agence.fr/nos-realisations/': '<a href="https://www.client1.fr/">Client 1</a><a href="https://client2.com">Client 2</a><a href="https://agence.fr/mentions">m</a><a href="https://fonts.googleapis.com/x">f</a><a href="https://blog.agence.fr/">blog</a><a href="mailto:x@y.fr">mail</a>',
  };
  const r = await B.clientsCites('agence.fr', { page: async (u) => pages[u] || '' });
  assert.deepEqual(r.clients.map((c) => c.domaine), ['client1.fr', 'client2.com']);
  assert.equal(r.clients[0].source, 'https://agence.fr/nos-realisations/');
});

test('relevé du BODACC : entreprises du web, site, clients, mail ; prestataires déjà connus ; email', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('prest_bodacc', async ({ pool }) => {
    const db = { pool };
    for (const t of ['crawl_jobs', 'crawl_results']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, source TEXT, type TEXT, phone TEXT, facebook_url TEXT, instagram_url TEXT, site_type TEXT, siren TEXT, sector TEXT, naf TEXT, effectif TEXT, city TEXT, postal_code TEXT, department TEXT, prestataire TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP)`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMP DEFAULT NOW())');
    const P = require('../services/prestataireService');
    await P.assurerTables(pool);
    const jugement = JSON.stringify({ famille: "Jugement d'ouverture", nature: "Jugement d'ouverture de liquidation judiciaire", date: '2026-11-18', complementJugement: 'désignant liquidateur SELARL MJ Synergie, 12 rue X 95000 Cergy.' });
    const ANNONCES = [
      annonce('A1', '732829320', 'collective', { commercant: 'AGENCE PIXEL NORD', jugement }),
      annonce('A2', '552100554', 'radiation', { commercant: 'BOULANGERIE MARTIN' }),
      annonce('A3', '443061841', 'collective', { commercant: 'NEBULEUSE DIGITALE', jugement }),
      annonce('A4', '732829320', 'radiation', { commercant: 'AGENCE PIXEL NORD' }),   // même entreprise, deux annonces
    ];
    const requetes = [];
    const NAF = { 732829320: { naf: '62.01Z', raison_sociale: 'AGENCE PIXEL NORD', naf_label: 'Programmation informatique', ville: 'Cergy', code_postal: '95000', dirigeant: 'Paul Nord' }, 552100554: { naf: '10.71C', raison_sociale: 'BOULANGERIE MARTIN' }, 443061841: { naf: '73.11Z', raison_sociale: 'NEBULEUSE DIGITALE', ville: 'Lyon' } };
    const parSirenAppels = [];
    const pages = {
      'https://agencepixelnord.fr/': '<a href="/references">Références</a>',
      'https://agencepixelnord.fr/references': '<a href="https://www.fleurs-cergy.fr">Fleurs</a> <a href="https://garage-osny.fr/">Garage</a> <a href="https://www.instagram.com/x">insta</a>',
      'https://agence-ferme.fr/': '<a href="/portfolio">Portfolio</a>',
      'https://agence-ferme.fr/portfolio': '<a href="https://cave-pontoise.fr">Cave</a>',
    };
    const mails = [];
    const deps = {
      pause: 0,
      maintenant: () => new Date('2026-11-23T05:37:00Z'),
      get: async (url, params) => { requetes.push(params); return { results: params.offset === 0 && /2026-11-22/.test(params.where) ? ANNONCES : [] }; },
      parSiren: async (s) => { parSirenAppels.push(s); return NAF[s] ? { found: true, siren: s, ...NAF[s] } : { found: false }; },
      detect: async (l) => l.map((d) => ({
        'agencepixelnord.fr': { domain: d, http_status: '200', title: 'Agence Pixel Nord', siren_site: '732829320' },
        'fleurs-cergy.fr': { domain: d, http_status: '200', platform: 'WordPress', title: 'Fleurs Cergy', https_final: 'non', final_url: 'http://fleurs-cergy.fr/', ssl_ok: 'oui', email: 'contact@fleurs-cergy.fr', analyse_le: new Date().toISOString() },
        'garage-osny.fr': { domain: d, http_status: '200', title: 'Garage Osny', email: 'garage@osny.fr', analyse_le: new Date().toISOString() },
        'cave-pontoise.fr': { domain: d, http_status: '200', title: 'Cave', analyse_le: new Date().toISOString() },
      }[d] || { domain: d, http_status: '0' })),
      page: async (u) => pages[u] || '',
      mail: async (sujet, texte) => { mails.push({ sujet, texte }); },
    };
    const r = await B.relever(db, deps, { jours: 1 });
    assert.deepEqual(r.jours, [{ jour: '2026-11-22', annonces: 4, web: 3 }]);
    assert.match(requetes[0].where, /dateparution = date'2026-11-22' AND \(familleavis = "collective" OR familleavis = "radiation"\)/);
    assert.deepEqual([...new Set(parSirenAppels)].sort(), ['443061841', '552100554', '732829320']);
    let rows = (await pool.query('SELECT * FROM prestataires_bodacc ORDER BY siren')).rows;
    assert.deepEqual(rows.map((x) => [x.siren, x.statut]), [['443061841', 'sans_site'], ['732829320', 'clients_trouves']], 'la boulangerie n\'est pas du web');
    const pn = rows[1];
    assert.deepEqual([pn.nom, pn.domaine, pn.domaine_source, pn.nb_clients, pn.liquidateur, pn.ville], ['AGENCE PIXEL NORD', 'agencepixelnord.fr', 'SIREN lu sur le site', 2, 'Liquidateur : SELARL MJ Synergie, 12 rue X 95000 Cergy', 'Cergy']);
    // Prestataire du signal : identité certaine, statut grave ; clients rattachés depuis ses références.
    const p = (await pool.query("SELECT * FROM prestataires WHERE domaine = 'agencepixelnord.fr'")).rows[0];
    assert.deepEqual([p.statut, p.gravite, p.siren, p.siren_source], ['procedure', 3, '732829320', 'mentions légales du site']);
    const d = await P.detail(db, 'agencepixelnord.fr');
    assert.deepEqual(d.clients.map((c) => c.domain).sort(), ['fleurs-cergy.fr', 'garage-osny.fr']);
    const cr = (await pool.query("SELECT prestataire, prestataire_source, prestataire_preuve_url FROM crawl_results WHERE domain = 'fleurs-cergy.fr'")).rows[0];
    assert.deepEqual(cr, { prestataire: 'agencepixelnord.fr', prestataire_source: 'références du prestataire', prestataire_preuve_url: 'https://agencepixelnord.fr/references' });
    // Un seul mail, les nouveaux du jour.
    assert.equal(mails.length, 1);
    assert.equal(mails[0].sujet, 'Prestataires web en difficulté : 2 nouveau(x) au BODACC');
    assert.match(mails[0].texte, /AGENCE PIXEL NORD \(Cergy, 95\)[\s\S]*Liquidateur : SELARL MJ Synergie[\s\S]*Site : agencepixelnord\.fr · 2 site\(s\) client\(s\)/);
    assert.match(mails[0].texte, /NEBULEUSE DIGITALE[\s\S]*Site non trouvé/);

    // Second relevé : jour déjà traité, rien refait ; NAF en cache.
    const n = parSirenAppels.length;
    const r2 = await B.relever(db, deps, { jours: 1 });
    assert.deepEqual([r2.jours, parSirenAppels.length, mails.length], [[], n, 1]);

    // Angle d'email : citable (SIREN lu sur le site, fait daté), formulé d'après les références.
    const proof = require('../services/proofEmailService');
    const ligne = (await pool.query("SELECT * FROM crawl_results WHERE domain = 'fleurs-cergy.fr'")).rows[0];
    ligne.prestataire_signal = await P.signalPourSite(db, ligne.prestataire);
    assert.ok(ligne.prestataire_signal, 'fait citable');
    const e = proof.buildProofEmail(ligne, { name: 'Fleurs', email: 'contact@fleurs-cergy.fr' });
    assert.equal(e.preuve, 'prestataire_difficulte');
    assert.match(e.body, /Agence Pixel Nord présente fleurs-cergy\.fr parmi les réalisations de son propre site\. Or le BODACC du 22 novembre 2026 publie, pour cette société, l'annonce « Jugement d'ouverture de liquidation judiciaire »/);
    assert.doesNotMatch(e.body, /pied de page/);
    assert.match(e.detail.brut, /site cité dans ses références : https:\/\/agencepixelnord\.fr\/references/);
    // Les clients deviennent des prospects comme pour les autres prestataires.
    assert.equal((await P.promouvoir(db, 'agencepixelnord.fr')).creees, 2);

    // Prestataire déjà connu (crawl) passé « fermé » : ses références lues une fois.
    await pool.query("INSERT INTO prestataires (domaine, statut, gravite) VALUES ('agence-ferme.fr', 'ferme', 2)");
    let pf = await B.portefeuillesEnAttente(db, deps);
    assert.deepEqual(pf.map((x) => [x.domaine, x.rattaches]), [['agence-ferme.fr', 1]]);
    pf = await B.portefeuillesEnAttente(db, deps);
    assert.deepEqual(pf, [], 'une seule fois');

    // Connecteur Claude.ai.
    const C = require('../services/campagneConnecteur');
    const a = await C.agencesBodacc(db, {});
    const ag = a.agences.find((x) => x.siren === '732829320');
    assert.deepEqual([ag.site, ag.sites_clients, ag.liquidateur, ag.activite], ['agencepixelnord.fr', 2, 'Liquidateur : SELARL MJ Synergie, 12 rue X 95000 Cergy', 'Programmation informatique']);
    assert.deepEqual((await C.agencesBodacc(db, { statut: 'sans_site' })).agences.map((x) => x.nom), ['NEBULEUSE DIGITALE']);
  });
});
