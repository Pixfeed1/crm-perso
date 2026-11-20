// Veille Reddit : tri sans IA, budget, accès (public, OAuth, une requête toutes les 2 s, pas de nouvelle tentative),
// dédoublonnage, commentaires suivis 48 h, mails (nouvelles, panne au 3e échec, rétablie, bilan), connecteur.
// Reddit est simulé au format de son API (listing JSON, objets t3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const V = require('../services/veilleReddit');

const L = V.regleListes(V.REGLES_DEPART);
const post = (name, p = {}) => ({ kind: 't3', data: { name, id: name.slice(3), subreddit: 'HungryArtists', author: 'client42', title: '', selftext: '', link_flair_text: null, over_18: false, permalink: `/r/HungryArtists/comments/${name.slice(3)}/x/`, created_utc: Date.now() / 1000 - 600, num_comments: 2, ...p } });
const listing = (...enfants) => ({ kind: 'Listing', data: { children: enfants } });

test('tri sans IA : « Hiring » dans l\'étiquette seulement, For Hire, NSFW, exclusions, mots entiers, budget', () => {
  const c = (p, e = '3D') => V.classer({ title: '', selftext: '', link_flair_text: null, over_18: false, ...p }, e, L);
  assert.deepEqual(c({ link_flair_text: 'Hiring', title: 'Need a stylized character for my indie game', selftext: 'Blender preferred' }), { statut: 'nouveau', raison: null, mot_cle: 'blender' });
  assert.deepEqual(c({ link_flair_text: 'For Hire', title: 'Hiring? 3D artist here' }), { statut: 'ecarte_auto', raison: 'type : For Hire (étiquette)' });
  assert.equal(c({ title: '[For Hire] 3D modeler looking for clients' }).raison, 'type : For Hire');
  assert.equal(c({ title: '[FH] Blender sculpts' }).raison, 'type : [FH]');
  assert.equal(c({ title: '[Hiring] figurine', over_18: true }).raison, 'exclusion : NSFW (contenu adulte)');
  assert.equal(c({ title: '[Hiring] 3D model NSFW' }).raison, 'exclusion : NSFW');
  assert.equal(c({ title: '[Hiring] 3D model', selftext: 'unpaid but great exposure' }).raison, 'exclusion : unpaid');
  assert.equal(c({ title: '[Hiring] 3D model', selftext: 'Paying $200, feel free to DM me. Free to message anytime.' }).statut, 'nouveau', '« feel free » n\'est pas du travail gratuit');
  assert.equal(c({ title: '[Hiring] 3D model', selftext: 'Looking for someone to do it for free' }).raison, 'exclusion : free');
  assert.equal(c({ title: '[Hiring] logo designer' }).raison, 'pas de mot-clé');
  assert.equal(c({ title: '[Hiring] need assets', selftext: 'several game props' }).mot_cle, 'asset', 'pluriels compris');
  assert.equal(c({ title: '[Hiring] help with my website' }, 'PixFeed').mot_cle, 'website');
  assert.equal(c({ title: '[Hiring] opposite day' }, 'PixFeed').raison, 'pas de mot-clé', '« site » en mot entier seulement');
  assert.equal(c({ title: '[Hiring] WordPress dev, send your portfolio' }, 'PixFeed').statut, 'nouveau', '« portfolio » ne rejette pas une offre');
  assert.equal(c({ title: 'Portfolio feedback please' }).raison, 'type : Portfolio');
  assert.equal(c({ title: 'Anyone know a good tutorial?' }).raison, 'type : pas une annonce (ni Hiring, Paid, Task, Looking for, [H])');
  for (const [s, attendu] of [['$500', ['$500', 500, 'USD']], ['500$', ['500$', 500, 'USD']], ['500 USD', ['500 USD', 500, 'USD']], ['€300', ['€300', 300, 'EUR']], ['300 EUR', ['300 EUR', 300, 'EUR']], ['$20-50 each', ['$20-50', 20, 'USD']], ['$15/hr', ['$15/hr', 15, 'USD']], ['$1,200', ['$1,200', 1200, 'USD']]]) {
    const b = V.budget(`Budget: ${s}`);
    assert.deepEqual([b.budget_texte, b.budget_min, b.devise], attendu, s);
  }
  assert.deepEqual(V.budget('[Hiring] 3D model', 'pay is $40'), { budget_texte: '$40', budget_min: 40, devise: 'USD' }, 'titre puis texte');
  assert.deepEqual(V.budget('Need a 3D model by Friday'), { budget_texte: null, budget_min: null, devise: null });
});

test('passages : dédoublonnage, commentaires, rythme, OAuth, erreurs sans nouvelle tentative, panne au 3e échec, mails, connecteur', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('veille_reddit', async ({ pool }) => {
    const db = { pool };
    await V.assurerTables(pool);
    // Deux sources actives seulement, pour un test lisible.
    await pool.query("UPDATE veille_reddit_sources SET actif = (valeur IN ('HungryArtists', '\"hiring\" wordpress'))");
    let horloge = Date.now();
    const pauses = [], appels = [], mails = [];
    let reponses = {};
    const http = async (url, opts = {}) => {
      appels.push({ url, opts, t: horloge });
      for (const [motifUrl, r] of Object.entries(reponses)) if (url.includes(motifUrl)) return typeof r === 'function' ? r(url) : r;
      return { status: 200, json: listing() };
    };
    const deps = { http, sleep: async (ms) => { pauses.push(ms); horloge += ms; }, maintenant: () => horloge, mail: async (sujet, texte) => { mails.push({ sujet, texte }); } };
    // Sans REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET : en pause, aucune requête, aucun mail, passage manuel refusé.
    delete process.env.REDDIT_CLIENT_ID; delete process.env.REDDIT_CLIENT_SECRET;
    assert.deepEqual(await V.tick(db, 'passage', deps), { en_pause: true });
    assert.deepEqual(await V.tick(db, 'bilan', deps), { en_pause: true });
    assert.throws(() => V.lancer(db), (e) => e.status === 409 && /en pause/.test(e.message));
    assert.match((await V.regles(db)).en_pause, /REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET/);
    assert.equal(appels.length + mails.length, 0, 'rien appelé, rien envoyé');
    V._reinitialiser();
    reponses = {
      '/r/HungryArtists/new': { status: 200, json: listing(
        post('t3_aaa', { link_flair_text: 'Hiring', title: 'Need a stylized 3D character for my VTuber debut', selftext: 'Budget $300, Blender or ZBrush. '.repeat(20) }),
        post('t3_bbb', { title: '[For Hire] Blender artist, commissions open' }),
        post('t3_ccc', { link_flair_text: 'Hiring', title: 'Spicy commission', over_18: true }),
      ) },
      '/search': { status: 200, json: listing(post('t3_ddd', { subreddit: 'forhire', title: '[Hiring] WordPress developer for a landing page', selftext: 'Paying 400 EUR' }), post('t3_aaa', { link_flair_text: 'Hiring', title: 'doublon venu par la recherche' })) },
    };
    let r = await V.passage(db, deps);
    assert.deepEqual([r.lus, r.nouveaux.length, r.ecartes, r.sources_ok, r.sources_ko], [5, 2, 2, 2, 0]);
    // URL et en-têtes : accès public, User-Agent, recherche triée par date sur 24 h.
    assert.match(appels[0].url, /^https:\/\/www\.reddit\.com\/r\/HungryArtists\/new\.json\?limit=100&raw_json=1$/);
    assert.match(appels[1].url, /^https:\/\/www\.reddit\.com\/search\.json\?q=%22hiring%22\+wordpress&sort=new&t=day&limit=100&raw_json=1$/);
    assert.match(appels[0].opts.headers['User-Agent'], /^pixfeed-crm\/1\.0 \(by u\/.+\)$/);
    assert.ok(appels.slice(1).every((a, i) => a.t - appels[i].t >= 2000), 'une requête toutes les 2 s au plus');
    let rows = (await pool.query('SELECT reddit_id, statut, raison_ecart, etiquette, budget_texte, budget_min, devise, mot_cle, url FROM veille_reddit ORDER BY reddit_id')).rows;
    assert.deepEqual(rows.map((x) => [x.reddit_id, x.statut, x.raison_ecart]), [['t3_aaa', 'nouveau', null], ['t3_bbb', 'ecarte_auto', 'type : For Hire'], ['t3_ccc', 'ecarte_auto', 'exclusion : NSFW (contenu adulte)'], ['t3_ddd', 'nouveau', null]]);
    assert.deepEqual([rows[0].etiquette, rows[0].budget_texte, Number(rows[0].budget_min), rows[0].url], ['3D', '$300', 300, 'https://www.reddit.com/r/HungryArtists/comments/aaa/x/']);
    assert.deepEqual([rows[3].etiquette, rows[3].budget_texte, rows[3].devise, rows[3].mot_cle], ['PixFeed', '400 EUR', 'EUR', 'wordpress']);
    // Un seul mail récapitulatif.
    assert.equal(mails.length, 1);
    assert.equal(mails[0].sujet, 'Reddit : 2 nouvelle(s) annonce(s)');
    assert.match(mails[0].texte, /\[3D\] r\/HungryArtists : Need a stylized 3D character[\s\S]*Budget : \$300 · 2 commentaire\(s\) · publiée il y a 10 min[\s\S]*https:\/\/www\.reddit\.com\/r\/HungryArtists\/comments\/aaa\/x\//);
    assert.ok(mails[0].texte.split('\n')[2].length <= 301, 'début du texte : 300 caractères');

    // Second passage : aucun doublon, aucun mail ; commentaires mis à jour (listing, puis by_id pour l'annonce non revue).
    reponses['/r/HungryArtists/new'] = { status: 200, json: listing(post('t3_aaa', { link_flair_text: 'Hiring', title: 'x', num_comments: 25 })) };
    reponses['/search'] = { status: 200, json: listing() };
    reponses['/by_id/'] = (url) => ({ status: 200, json: listing(post('t3_ddd', { num_comments: 7 })) });
    r = await V.passage(db, deps);
    assert.deepEqual([r.nouveaux.length, r.deja_vus, mails.length], [0, 1, 1]);
    assert.match(appels[appels.length - 1].url, /\/by_id\/t3_ddd\.json/);
    rows = (await pool.query("SELECT reddit_id, nb_commentaires FROM veille_reddit WHERE statut = 'nouveau' ORDER BY reddit_id")).rows;
    assert.deepEqual(rows.map((x) => [x.reddit_id, x.nb_commentaires]), [['t3_aaa', 25], ['t3_ddd', 7]]);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM veille_reddit')).rows[0].n, 4);

    // 429 partout : erreur notée, pas de nouvelle tentative ; panne signalée au 3e passage, pas avant ; une seule fois.
    reponses = { '/r/HungryArtists/new': { status: 429, json: {} }, '/search': { status: 503, json: {} } };
    const avant = appels.length;
    for (let i = 1; i <= 2; i++) { r = await V.passage(db, deps); assert.equal(r.panne, `échec ${i}/3`); }
    assert.equal(appels.length - avant, 4, 'une requête par source, sans nouvelle tentative');
    assert.equal(mails.length, 1, 'pas de mail de panne avant le 3e échec');
    r = await V.passage(db, deps);
    assert.equal(r.panne, 'panne signalée');
    assert.equal(mails[1].sujet, 'Veille Reddit en panne');
    assert.match(mails[1].texte, /Codes d'erreur : 429, 503/);
    await V.passage(db, deps);
    assert.equal(mails.length, 2, 'un seul mail par panne');
    assert.match((await pool.query("SELECT derniere_erreur FROM veille_reddit_sources WHERE valeur = 'HungryArtists'")).rows[0].derniere_erreur, /: 429$/);
    reponses = {};
    r = await V.passage(db, deps);
    assert.deepEqual([r.panne, mails[2].sujet], ['rétablie', 'Veille Reddit rétablie']);

    // OAuth si REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET : jeton une fois, appels sur oauth.reddit.com.
    process.env.REDDIT_CLIENT_ID = 'id-test'; process.env.REDDIT_CLIENT_SECRET = 'secret-test';
    try {
      V._reinitialiser();
      const n0 = appels.length;
      reponses = { access_token: { status: 200, json: { access_token: 'jeton-1', expires_in: 3600 } } };
      await V.passage(db, deps); await V.passage(db, deps);
      const faits = appels.slice(n0);
      assert.equal(faits.filter((a) => /access_token/.test(a.url)).length, 1, 'jeton renouvelé seulement à expiration');
      assert.match(faits[0].opts.headers.Authorization, /^Basic /);
      assert.equal(faits[0].opts.data, 'grant_type=client_credentials');
      const lu = faits.find((a) => /oauth\.reddit\.com\/r\/HungryArtists\/new\?/.test(a.url));
      assert.ok(lu && lu.opts.headers.Authorization === 'Bearer jeton-1');
    } finally { delete process.env.REDDIT_CLIENT_ID; delete process.env.REDDIT_CLIENT_SECRET; V._reinitialiser(); }

    // Écartées automatiquement : supprimées au bout de 14 jours ; suivi ; récupération.
    await pool.query("UPDATE veille_reddit SET cree_le = NOW() - INTERVAL '15 days' WHERE reddit_id = 't3_bbb'");
    reponses = {};
    await V.passage(db, deps);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM veille_reddit WHERE reddit_id = 't3_bbb'")).rows[0].n, 0);
    const ccc = (await pool.query("SELECT id FROM veille_reddit WHERE reddit_id = 't3_ccc'")).rows[0].id;
    assert.equal((await V.marquer(db, ccc, { statut: 'nouveau' })).raison_ecart, null, 'récupérée');

    // Connecteur Claude.ai : lister (texte complet), marquer, règles ; aucun outil n'écrit sur Reddit.
    const C = require('../services/campagneConnecteur');
    let l = await C.annoncesReddit(db, {});
    assert.deepEqual(l.annonces.map((a) => a.reddit_id).sort(), ['t3_aaa', 't3_ccc', 't3_ddd']);
    assert.ok(l.annonces.find((a) => a.reddit_id === 't3_aaa').texte.length > 300, 'texte complet');
    l = await C.annoncesReddit(db, { etiquette: 'PixFeed', mot_cle: 'word' });
    assert.deepEqual(l.annonces.map((a) => a.reddit_id), ['t3_ddd']);
    const aaa = (await pool.query("SELECT id FROM veille_reddit WHERE reddit_id = 't3_aaa'")).rows[0].id;
    assert.equal((await C.marquerReddit(db, { id: aaa, statut: 'repondu', note: 'proposé 350 $' })).statut, 'repondu');
    await assert.rejects(C.marquerReddit(db, { id: aaa, statut: 'nouveau' }), /vu, repondu ou ecarte/);
    assert.equal((await C.annoncesReddit(db, { statut: 'repondu' })).annonces[0].note, 'proposé 350 $');
    assert.equal((await C.annoncesReddit(db, { statut: 'tous', inclure_ecartees: true })).annonces.length, 3);
    const g = await C.reglesReddit(db);
    assert.ok(g.mots_cles['3D'].includes('blender') && g.exclusions.includes('unpaid') && g.type_garde.includes('Hiring'));
    assert.equal(g.sources.find((s) => s.valeur === 'slavelabour').actif, false, 'slavelabour désactivé par défaut');

    // Réglages depuis l'interface.
    const s = await V.ajouterSource(db, { type: 'forum', valeur: 'r/blenderhelp', etiquette: '3D' });
    assert.equal(s.valeur, 'blenderhelp');
    await assert.rejects(V.ajouterSource(db, { type: 'forum', valeur: 'pas un forum!', etiquette: '3D' }), /nom de forum/);
    await assert.rejects(V.ajouterRegle(db, { type: 'mot_cle', valeur: 'blender', etiquette: '3D' }), /déjà/);
    const rg = await V.ajouterRegle(db, { type: 'exclusion', valeur: 'tattoo' });
    await V.modifierRegle(db, rg.id, { actif: false });
    assert.ok((await C.reglesReddit(db)).desactivees.includes('exclusion : tattoo'));

    // Bilan de la semaine (un écart automatique de plus pour avoir une raison à compter).
    reponses = { '/r/HungryArtists/new': { status: 200, json: listing(post('t3_eee', { title: '[For Hire] ZBrush sculptor' })) } };
    await V.passage(db, deps);
    const b = await V.bilan(db, deps);
    assert.deepEqual(b.raisons, [{ raison: 'type : For Hire', n: 1 }]);
    assert.equal(mails[mails.length - 1].sujet, 'Veille Reddit : bilan de la semaine');
    assert.ok(b.lues >= 3 && b.raisons.length >= 1);
    assert.match(mails[mails.length - 1].texte, /Raisons d'écart les plus fréquentes :\n- /);
  });
});
