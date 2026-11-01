// Provenance du trafic GA4 (backend, en direct) contre un faux Google : jeton OAuth puis batchRunReports.
// Vérifie les requêtes envoyées (période, filtre de canal), la mise en forme, le trafic parasite, et que le jeton ne sort pas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { hasDb, withSchema } = require('./helpers/db');
const { ensureSeoTables } = require('../scripts/autoInitDatabase');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };
let srv, base;
const recu = { lots: [], jetons: 0 };

function rep(dims, mets, rows) {
  return {
    dimensionHeaders: dims.map((name) => ({ name })), metricHeaders: mets.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: rows.map((r) => ({ dimensionValues: r.d.map((value) => ({ value })), metricValues: r.m.map((v) => ({ value: String(v) })) })),
    totals: [{ dimensionValues: [], metricValues: mets.map((_, i) => ({ value: String(rows.reduce((t, r) => t + Number(r.m[i]), 0)) })) }],
    rowCount: rows.length,
  };
}

before(async () => {
  srv = http.createServer((req, res) => {
    const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => {
      const corps = Buffer.concat(parts).toString();
      const json = (c, b) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
      if (req.url === '/token') { recu.jetons++; return json(200, { access_token: 'JETON-SECRET', expires_in: 3600 }); }
      if (req.headers.authorization !== 'Bearer JETON-SECRET') return json(401, { error: { message: 'non' } });
      const b = JSON.parse(corps);
      recu.lots.push(b.requests);
      const reports = b.requests.map((q) => {
        const dims = q.dimensions.map((d) => d.name), mets = q.metrics.map((m) => m.name);
        const v = (n) => mets.map((m) => ({ sessions: n, engagedSessions: Math.floor(n / 2), totalUsers: n - 1, activeUsers: n - 1, engagementRate: 0.5, userEngagementDuration: 30 * (n - 1), screenPageViews: 2 * n }[m]));
        if (dims[0] === 'hostName') return rep(dims, mets, [{ d: ['jurojin.net'], m: v(90) }, { d: ['jurojin-net.translate.goog'], m: v(3) }, { d: ['copie-louche.xyz'], m: v(5) }]);
        if (dims[0] === 'pageReferrer' && process.env.GA_FAUX_VIDE) return { dimensionHeaders: dims.map((name) => ({ name })), metricHeaders: mets.map((name) => ({ name })), totals: [{ dimensionValues: [{ value: 'RESERVED_TOTAL' }] }] };
        if (dims[0] === 'country' && dims[1] === 'browser') return rep(dims, mets, [{ d: ['Germany', '(not set)', '(not set)'], m: mets.map((x) => ({ sessions: 87, engagedSessions: 0, activeUsers: 87, userEngagementDuration: 0 }[x])) }, { d: ['France', 'Chrome', 'Windows'], m: mets.map((x) => ({ sessions: 20, engagedSessions: 16, activeUsers: 19, userEngagementDuration: 1500 }[x])) }]);
        if (dims[0] === 'date') return rep(dims, mets, [{ d: ['20261031', 'Direct'], m: mets.map((x) => ({ sessions: 111, engagedSessions: 8, totalUsers: 110 }[x])) }, { d: ['20261031', 'Organic Search'], m: mets.map((x) => ({ sessions: 20, engagedSessions: 16, totalUsers: 19 }[x])) }, { d: ['20261030', 'Direct'], m: mets.map((x) => ({ sessions: 50, engagedSessions: 5, totalUsers: 50 }[x])) }]);
        if (dims[0] === 'browser') return rep(dims, mets, [{ d: ['Chrome', 'Windows', 'desktop'], m: v(40) }, { d: ['(not set)', 'Linux', 'desktop'], m: v(12) }]);
        return rep(dims, mets, [{ d: dims.map((x) => `${x}-a`), m: v(20) }, { d: dims.map((x) => `${x}-b`), m: v(10) }]);
      });
      json(200, { reports });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  process.env.GA_DATA_API = base;
});
after(() => srv.close());

test('provenance GA4 : canal Direct sur 7 jours, sections, trafic parasite, jeton jamais renvoyé', opts, async () => {
  await withSchema('ga4prov', async ({ pool }) => {
    const c = await pool.connect(); try { await ensureSeoTables(c); } finally { c.release(); }
    await pool.query("INSERT INTO seo_sites (id, domain, ga_property_id) VALUES (2, 'jurojin.net', '260581486')");
    await pool.query("INSERT INTO seo_oauth_tokens (provider, scope, client_id, client_secret, refresh_token, token_uri) VALUES ('google', 'https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/analytics.readonly', 'id', 'secret', 'rt', $1)", [`${base}/token`]);
    const { provenance } = require('../services/ga4Provenance');
    const r = await provenance(pool, { site_id: 2, days: 7, canal: 'Direct' });
    // requêtes : 7 jours jusqu'à hier, filtre de canal partout, pas de section Referral pour le canal Direct
    const toutes = recu.lots.flat();
    assert.ok(toutes.every((q) => q.dateRanges[0].startDate === '7daysAgo' && q.dateRanges[0].endDate === 'yesterday'));
    assert.ok(toutes.every((q) => JSON.stringify(q.dimensionFilter).includes('"value":"Direct"')));
    assert.ok(!toutes.some((q) => q.dimensions[0].name === 'pageReferrer'));
    assert.equal(r.referents, undefined);
    assert.equal(r.sources.items[0].source, 'sessionSource-a');
    assert.equal(r.sources.items[0].support, 'sessionMedium-a');
    assert.equal(r.sources.items[0].taux_engagement_pct, 50);
    assert.equal(r.sources.items[0].duree_moyenne_engagement_s, 30);
    assert.equal(r.sources.total.sessions, 30);
    assert.equal(r.direct_navigateurs.items[1].navigateur, '(not set)');
    assert.deepEqual(r.hotes.items.map((h) => h.statut.split(' ')[0]), ['site', 'Google', 'PARASITE']);
    assert.deepEqual(r.trafic_parasite, { hotes: ['copie-louche.xyz'], sessions: 5 });
    assert.ok(!JSON.stringify(r).includes('JETON-SECRET'));
    // visiteurs engagés : total, jour par jour et par canal, robots probables
    assert.equal(r.visiteurs.sessions_brutes, 30); assert.equal(r.visiteurs.visites_engagees, 15);
    assert.deepEqual(r.par_jour.map((j) => [j.date, j.sessions, j.visites_engagees]), [['2026-10-31', 131, 24], ['2026-10-30', 50, 5]]);
    assert.deepEqual(r.par_jour[0].par_canal['Organic Search'], { sessions: 20, visites_engagees: 16, utilisateurs: 19 });
    assert.equal(r.par_jour[0].part_engagee_pct, 18.3);
    assert.deepEqual(r.visiteurs.robots_probables, { sessions: 87, groupes: [{ pays: 'Germany', navigateur: '(not set)', systeme: '(not set)', sessions: 87 }] });
    // sans canal : sections Referral présentes ; jeton réutilisé
    const t = await provenance(pool, { site_id: 2, days: 28 });
    assert.ok(t.referents && t.pages_referentes && t.direct_navigateurs);
    assert.equal(recu.jetons, 1);
    // section vide renvoyée sans lignes et avec un total sans valeurs : pas de plantage
    process.env.GA_FAUX_VIDE = '1';
    try {
      const v = await provenance(pool, { site_id: 2, days: 1 });
      assert.equal(v.pages_referentes.total_valeurs, 0); assert.deepEqual(v.pages_referentes.items, []);
    } finally { delete process.env.GA_FAUX_VIDE; }
    // propriété absente
    await pool.query("UPDATE seo_sites SET ga_property_id = NULL WHERE id = 2");
    await assert.rejects(provenance(pool, { site_id: 2 }), /propriété GA4 non renseignée/);
  });
});
