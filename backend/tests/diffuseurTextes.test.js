// Diffuseur : appel réel au SDK Anthropic vers un faux serveur local (aucun appel réseau).
// Vérifie la forme de la requête (modèle, image, schéma JSON, repli serveur) et la gestion
// d'une réponse conforme, d'un refus et d'une réponse coupée.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

let server; let recues = []; let reponses = [];
before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      recues.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
      const r = reponses.shift();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r));
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'cle-de-test';
});
after(() => { server.close(); delete process.env.ANTHROPIC_BASE_URL; delete process.env.ANTHROPIC_API_KEY; });

const message = (text, stop = 'end_turn', extra = {}) => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: stop, stop_sequence: null,
  content: text == null ? [] : [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 }, ...extra
});
const conforme = {
  description: 'Une ruelle sous la pluie.', alt: { fr: 'Ruelle sous la pluie.', en: 'Rainy alley.' },
  instagram: { fr: 'Une ruelle sous la pluie.', en: 'A rainy alley.' },
  pinterest: { titre_fr: 'Ruelle sous la pluie', titre_en: 'Rainy alley', description_fr: 'Rendu 3D nocturne.', description_en: 'Night 3D render.' },
  court: { fr: 'Une ruelle, la nuit.', en: 'An alley at night.' }, hashtags_fr: ['#ruelle'], hashtags_en: ['rain'], mots_cles: ['ruelle']
};
const input = { scene: { nom: 'Ruelle', notes: null }, assets: [{ nom: 'Rainy Alley' }], image: { asset_nom: 'Rainy Alley' }, imageBase64: 'QUJD' };

test('requête : modèle Sonnet 5.5, image base64, schéma JSON, repli serveur, identité MVaertan', async () => {
  const T = require('../services/diffuseurTextes');
  recues = []; reponses = [message(JSON.stringify(conforme))];
  const r = await T.rediger(input);
  assert.equal(r.essais, 1); assert.deepEqual(r.hashtags_fr, ['ruelle'], 'le # est retiré');
  const req = recues[0];
  assert.match(req.url, /\/v1\/messages/);
  assert.match(String(req.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
  assert.equal(req.body.model, 'claude-sonnet-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.deepEqual(req.body.output_config.format.schema.required, T.SCHEMA.required);
  assert.equal(req.body.output_config.effort, 'medium');
  assert.equal(req.body.thinking, undefined, 'pas de réglage de réflexion explicite');
  const [img, txt] = req.body.messages[0].content;
  assert.deepEqual(img, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  assert.match(txt.text, /Scène : Ruelle[\s\S]*Asset principal visible sur cette image : Rainy Alley/);
  assert.match(req.body.system, /MVaertan/); assert.doesNotMatch(req.body.system, /pix\s*feed/i);
});

test('refus du modèle et réponse coupée : erreurs claires, rien d\'inventé', async () => {
  const T = require('../services/diffuseurTextes');
  reponses = [message(null, 'refusal', { stop_details: { type: 'refusal', category: 'general_harms', explanation: null } })];
  await assert.rejects(T.rediger(input), /décliné cette image \(general_harms\)/);
  reponses = [message('{"description": "coup', 'max_tokens')];
  await assert.rejects(T.rediger(input), /Réponse coupée/);
});

test('clé absente : erreur 503 explicite, aucun appel', async () => {
  const T = require('../services/diffuseurTextes');
  const cle = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  recues = [];
  await assert.rejects(T.rediger(input), (e) => e.status === 503 && /ANTHROPIC_API_KEY manquante/.test(e.message));
  assert.equal(recues.length, 0);
  process.env.ANTHROPIC_API_KEY = cle;
});
