/* Appels à Claude du configurateur, vers un faux serveur local (aucun appel réseau, aucune clé réelle). */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

let serveur, recues = [], reponses = [];
test.before(async () => {
  serveur = http.createServer((req, res) => {
    let b = ""; req.on("data", c => { b += c; });
    req.on("end", () => { recues.push({ headers: req.headers, body: JSON.parse(b) }); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(reponses.shift())); });
  });
  await new Promise(ok => serveur.listen(0, "127.0.0.1", ok));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${serveur.address().port}`;
  process.env.CONFIGURATEUR_ANTHROPIC_API_KEY = "cle-de-test";
});
test.after(() => serveur.close());

const msg = (text, stop = "end_turn", extra = {}) => ({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: stop, stop_sequence: null,
  content: text == null ? [] : [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 }, ...extra });

test("ligne « pourquoi » : modèle léger, tiret cadratin retiré, refus signalé", async () => {
  const ia = require("../src/ia");
  reponses = [msg("Format court — idéal pour un boîtier compact.")];
  const t = await ia.redigerPourquoi({ puce: "RTX 5070", modele: "Ventus 2X", prix: 600, caracteristiques: {} }, { ancien: "Gaming X" });
  assert.equal(t, "Format court, idéal pour un boîtier compact.");
  assert.equal(recues[0].body.model, "claude-haiku-5-5");
  reponses = [msg(null, "refusal", { stop_details: { type: "refusal", category: "general_harms", explanation: null } })];
  await assert.rejects(ia.redigerPourquoi({ puce: "x", modele: "y", prix: 1, caracteristiques: {} }), /décliné la demande \(general_harms\)/);
});

test("proposition mensuelle : Sonnet 5.5, recherche web actuelle limitée aux domaines, repli serveur, sources exigées", async () => {
  const ia = require("../src/ia");
  recues = [];
  reponses = [msg('Voici : {"resume":"Rien de neuf","changements":[{"type":"asin","id":"gpu-a","detail":{"asin":"B0X"},"raison":"r","sources":["https://amazon.fr/x"]},{"type":"ajout","id":"gpu-b","detail":{},"raison":"sans source","sources":[]}]}')];
  const p = await ia.proposerSelection({ composants: { "gpu-a": { puce: "A", modeles: [{ modele: "M" }] } } }, { mesures: {}, offresParId: {}, alertes: [] });
  assert.equal(p.changements.length, 1, "un changement sans source est écarté");
  const r = recues[0];
  assert.equal(r.body.model, "claude-sonnet-5-5");
  assert.equal(r.body.fallbacks, "default");
  assert.match(String(r.headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
  assert.equal(r.body.tools[0].type, "web_search_20260209");
  assert.equal(r.body.tools[0].max_uses, 10);
  assert.ok(r.body.tools[0].allowed_domains.includes("opendata.blender.org"));
  reponses = [msg('{"resume":"coupé', "max_tokens")];
  await assert.rejects(ia.proposerSelection({ composants: {} }, { mesures: {}, offresParId: {}, alertes: [] }), /réponse coupée/);
});
