const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const blender = require("../src/sources/blenderOpenData");
const { construire } = require("../src/catalogue");
const { verifier, choisirReste, besoinAlim } = require("../src/moteur/compat");
const { assembler } = require("../src/moteur/assembler");
const { controler } = require("../src/controles");
const config = require("../src/config");

const lire = f => JSON.parse(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
const selection = lire("data/selection.json");
const donnees = lire("test/fixtures/blender-4.5.0.json");
const { scores, manquants } = blender.associer(selection, donnees);
const { C } = construire(selection, { scores, prixExemple: true, amazonTag: "" });
const data = assembler({ C, selection });

test("Blender Open Data : chaque puce mesurable a un score, la ligne la plus testée l'emporte", () => {
  assert.deepEqual(manquants, []);
  assert.ok(Math.abs(scores["cpu-9900x"].score - 500.98) < 0.1, "9900X : la ligne à 1 test (espaces en trop) ne doit pas gagner");
  assert.ok(scores["gpu-5090"].score > scores["gpu-5080"].score);
});

test("Blender Open Data : un appareil sous le minimum de tests est écarté", () => {
  const d = structuredClone(donnees);
  d.OPTIX = d.OPTIX.map(r => /5060 Ti/.test(r[0]) ? [r[0], r[1], 3] : r);
  assert.ok(blender.associer(selection, d).manquants.includes("gpu-5060ti"));
});

test("compatibilité : un APU n'est jamais associé à une carte graphique dédiée", () => {
  const reste = choisirReste("gpu-5070", "cpu-8600g", C, new Map());
  if (reste) assert.ok(verifier({ gpu: "gpu-5070", cpu: "cpu-8600g", ram: "ram-32", ssd: "ssd-1to", ...reste }, C).length > 0);
});

test("compatibilité : l'alimentation couvre la marge de 10 % et la recommandation du fabricant", () => {
  for (const cfg of data.configs) {
    const g = C[cfg.gpu], c = C[cfg.cpu], a = C[cfg.alim];
    if (g.inclus) continue;
    assert.ok(a.caracteristiques.watts >= besoinAlim(g, c), `${cfg.gpu} + ${cfg.cpu} sur ${cfg.alim}`);
  }
});

test("compatibilité : toutes les machines publiées passent toutes les vérifications", () => {
  for (const cfg of data.configs) assert.deepEqual(verifier(cfg, C), [], JSON.stringify(cfg));
});

test("format : 183 profils, paliers triés, dans le budget", () => {
  assert.equal(data.format, "configurateur-pc/1");
  assert.equal(Object.keys(data.profils).length, 183);
  const cout = cfg => Object.values(cfg).reduce((t, id) => t + data.composants[id].prix, 0);
  for (const [k, p] of Object.entries(data.profils)) {
    assert.ok(p.paliers.length > 0, k);
    p.paliers.forEach((x, i) => {
      assert.ok(cout(data.configs[x.config]) <= x.budget, `${k} @${x.budget}`);
      if (i) assert.ok(x.budget > p.paliers[i - 1].budget, k);
    });
  }
});

// Règles ajoutées après la relecture avec les vrais prix (cartes, mémoire et SSD en forte hausse) :
// le moteur ne doit pas économiser là où le visiteur y perdrait. Vérifiées avec les prix d'exemple et avec des prix chers.
function reglesTenues(d) {
  const K = d.composants, pb = [];
  const P = require("../src/moteur/profils").P;
  for (const [cle, pr] of Object.entries(d.profils)) {
    const [logiciel, projet] = cle.split("|");
    let go = 0, to = 0;
    for (const p of pr.paliers) {
      const c = d.configs[p.config], g = K[c.ram].caracteristiques.go, t = K[c.ssd].caracteristiques.to;
      if (g < go) pb.push(`${cle} : mémoire en baisse à ${p.budget} €`);
      if (t < to) pb.push(`${cle} : stockage en baisse à ${p.budget} €`);
      go = g; to = t;
      if (P[logiciel] && P[logiciel].dediee && K[c.gpu].integree) pb.push(`${cle} : sans carte graphique à ${p.budget} €`);
      if (P[logiciel] && P[logiciel].dedieeLourd && projet === "lourd" && K[c.gpu].integree) pb.push(`${cle} : sans carte graphique en projets lourds à ${p.budget} €`);
      if (P[logiciel] && P[logiciel].nvidia && !K[c.gpu].integree && !/^Nvidia/.test(K[c.gpu].puce)) pb.push(`${cle} : carte non Nvidia à ${p.budget} €`);
      if (projet === "lourd" && t < 1) pb.push(`${cle} : moins d'1 To à ${p.budget} €`);
      if (logiciel === "jeu" && K[c.ssd].caracteristiques.gen === 5) pb.push(`${cle} : SSD Gen5 à ${p.budget} €`);
    }
  }
  return pb;
}

test("règles : 3D et vidéo avec carte dédiée, 1 To pour les projets lourds, pas de Gen5 en jeu, mémoire et stockage jamais en baisse", () => {
  assert.deepEqual(reglesTenues(data), []);
  // même chose quand la mémoire, les SSD et les cartes coûtent très cher (situation de 2026)
  const cher = structuredClone(selection);
  for (const c of Object.values(cher.composants)) if (c.prix_exemple && ["ram", "ssd", "gpu"].includes(c.categorie)) c.prix_exemple *= c.categorie === "ram" ? 4 : 1.8;
  const { C: Ccher } = construire(cher, { scores, prixExemple: true, amazonTag: "" });
  assert.deepEqual(reglesTenues(assembler({ C: Ccher, selection: cher })), []);
});

test("rendu GPU : Blender, Maya, Cinema 4D, 3ds Max, KeyShot et Houdini sur Nvidia seulement ; Fusion et AutoCAD lourds avec carte dédiée", () => {
  const P = require("../src/moteur/profils").P;
  for (const l of ["blender", "maya", "cinema4d", "3dsmax", "keyshot", "houdini", "daz"]) assert.equal(P[l].nvidia, true, l);
  for (const l of ["fusion", "autocad"]) assert.equal(P[l].dedieeLourd, true, l);
  for (const [cle, pr] of Object.entries(data.profils)) {
    const [l, projet] = cle.split("|");
    for (const x of pr.paliers) {
      const g = data.composants[data.configs[x.config].gpu];
      if (P[l] && P[l].nvidia) assert.match(g.puce, /^Nvidia/, `${cle} @${x.budget}`);
      if (["fusion", "autocad"].includes(l) && projet === "lourd") assert.ok(!C[data.configs[x.config].gpu].integree, `${cle} @${x.budget}`);
    }
  }
});

test("contrôles : chaque règle d'usage enfreinte bloque la publication", () => {
  const K = C;                                                   // tout le catalogue : une pièce écartée par les règles n'est pas publiée
  const trouver = f => Object.keys(K).find(id => f(K[id], C[id]));
  const igpu = trouver((k, c) => c && c.integree), amd = trouver(k => k.categorie === "gpu" && /^AMD/.test(k.puce));
  const petitSsd = trouver(k => k.categorie === "ssd" && k.caracteristiques.to < 1), gen5 = trouver(k => k.categorie === "ssd" && k.caracteristiques.gen === 5);
  const cas = [
    ["blender|leger|-", c => { c.gpu = amd; }, /non Nvidia/],
    ["houdini|lourd|-", c => { c.gpu = igpu; }, /graphique intégrée interdite/],
    ["fusion|lourd|-", c => { c.gpu = igpu; }, /graphique intégrée interdite/],
    ["photoshop|lourd|-", c => { c.ssd = petitSsd; }, /moins d'1 To/],
    ["jeu|solo|1440", c => { c.ssd = gen5; }, /Gen5/]
  ];
  for (const [cle, trafic, motif] of cas) {
    const d = structuredClone(data), p = d.profils[cle].paliers.at(-1);
    d.configs.push({ ...d.configs[p.config] }); p.config = d.configs.length - 1;
    trafic(d.configs[p.config]);
    const r = controler(d, C);
    assert.ok(!r.ok && r.erreurs.some(e => motif.test(e)), `${cle} : ${r.erreurs.slice(0, 3).join(" | ")}`);
  }
});

test("Daz : uniquement des cartes Nvidia", () => {
  for (const [k, p] of Object.entries(data.profils)) if (k.startsWith("daz|"))
    for (const x of p.paliers) assert.match(data.configs[x.config].gpu, /^gpu-50/, k);
});

test("option deux machines : au moins 10 % et 100 € de moins, au plus 5 % plus lente, jamais moins de mémoire", () => {
  const cout = cfg => Object.values(cfg).reduce((t, id) => t + data.composants[id].prix, 0);
  let n = 0;
  for (const p of Object.values(data.profils)) for (const x of p.paliers) if (x.alternative) {
    n++;
    const m = data.configs[x.config], a = data.configs[x.alternative.config];
    assert.ok(cout(a) <= cout(m) * 0.9 && cout(a) <= cout(m) - 100);
    assert.ok(x.alternative.ecart_pct <= config.alternative.perteMaxPct);
    assert.ok(C[a.ram].caracteristiques.go >= C[m.ram].caracteristiques.go);
  }
  assert.ok(n > 0, "aucune alternative produite : règle à vérifier");
});

test("contrôles : le fichier d'essai passe, une machine trafiquée bloque la publication", () => {
  assert.equal(controler(data, C).ok, true);
  const faux = structuredClone(data);
  faux.configs[0] = { ...faux.configs[0], alim: "alim-550", gpu: "gpu-5090" };
  faux.composants["gpu-5090"] = faux.composants["gpu-5090"] || data.composants["gpu-5090"];
  const r = controler(faux, C);
  assert.equal(r.ok, false);
});

test("contrôles : une variation de prix de plus de 30 % bloque", () => {
  const avant = structuredClone(data), id = Object.keys(data.composants).find(i => data.composants[i].prix > 100);
  avant.composants[id].prix = Math.round(data.composants[id].prix * 2);
  const r = controler(data, C, avant);
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.some(e => e.startsWith(id)));
});

test("réserves affichées : seulement celles qui conviennent à toutes les machines publiées de la puce", () => {
  const { reservesSures } = require("../src/moteur/assembler");
  const id = "gpu-5070ti", c = C[id];
  const machines = data.configs.filter(cfg => cfg.gpu === id);
  assert.ok(machines.length > 0);
  const gpuMaxMin = Math.min(...machines.map(cfg => C[cfg.boitier].caracteristiques.gpuMax));
  const avecTropLongue = { ...c, reserves: [...c.reserves, { modele: "Modèle trop long", caracteristiques: { longueur: gpuMaxMin + 1 } }] };
  const r = reservesSures(id, avecTropLongue, selection, data.configs, C).map(x => x.modele);
  assert.ok(!r.includes("Modèle trop long"));
  for (const m of r) assert.ok(c.reserves.some(x => x.modele === m));
});
