const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Readable } = require("stream");
const awin = require("../src/sources/awin");
const { construire } = require("../src/catalogue");
const { appliquer } = require("../src/taches");

const selection = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/selection.json"), "utf8"));
const csv = fs.readFileSync(path.join(__dirname, "fixtures/flux-awin.csv"), "utf8");
const regles = awin.reglesCorrespondance(selection);
const lire = flux => awin.lireFlux({ flux, regles, marchand: "cdiscount", nomMarchand: "Cdiscount", source: "awin:test", releveLe: "2026-10-29" });

test("Awin : prix à virgule, produits reconditionnés et lignes sans lien écartés", async () => {
  const offres = await lire(csv);
  const gpu = offres.filter(o => o.id === "gpu-5070ti");
  assert.ok(gpu.length >= 1, "la 5070 Ti Ventus doit être reconnue (motifs de selection.json)");
  assert.ok(gpu.every(o => o.prix === 829.99));
  assert.ok(!offres.some(o => /reconditionn/i.test(o.produit)));
});

test("Awin : un lien d'achat piégé ou non https n'atteint jamais la page", async () => {
  const entete = "aw_deep_link,product_name,search_price,ean,in_stock,condition,merchant_name\n";
  const nom = "Carte graphique MSI GeForce RTX 5070 Ti 16G VENTUS 3X OC";
  const lignes = [
    `"javascript:alert(1)",${nom},829.99,4711377250000,1,new,Cdiscount`,
    `"https://www.awin1.com/pclick.php?p=1"" onmouseover=""alert(1)",${nom},829.99,4711377250000,1,new,Cdiscount`,
    `http://www.awin1.com/pclick.php?p=3,${nom},829.99,4711377250000,1,new,Cdiscount`,
    `https://www.awin1.com/pclick.php?p=4&a=0&m=1,${nom},829.99,4711377250000,1,new,Cdiscount`
  ];
  const offres = (await lire(entete + lignes.join("\n"))).filter(o => o.id === "gpu-5070ti");
  assert.deepEqual(offres.map(o => o.lien), ["https://www.awin1.com/pclick.php?p=4&a=0&m=1"]);
  assert.equal(awin.lienSur(" https://ok.example/a?b=1 "), "https://ok.example/a?b=1");
  assert.equal(awin.lienSur("https://x.example/<script>"), null);
});

test("Awin : flux gzip lu en continu", async () => {
  const offres = await lire(Readable.from([zlib.gzipSync(csv)]).pipe(zlib.createGunzip()));
  assert.ok(offres.length > 0);
});

test("Awin : liste des flux, seuls les flux retenus sont gardés", async () => {
  const liste = `Advertiser ID,Advertiser Name,Primary Region,Membership Status,Datafeed Format,Feed ID,Feed Name,Language,Vertical,Last Imported,Last Checked,No of products,URL
1,Cdiscount,FR,active,CSV,44863,Offre Propre,fr,Retail,2026-10-28,2026-10-29,1000,https://exemple.invalid/44863.csv.gz
2,Autre,FR,active,CSV,99999,Autre,fr,Retail,2026-10-28,2026-10-29,10,https://exemple.invalid/99999.csv.gz`;
  const r = await awin.listeFlux({ texte: liste });
  assert.deepEqual(Object.keys(r), ["44863"]);
});

test("catalogue : rupture du modèle retenu, bascule sur la réserve en stock", () => {
  const id = Object.keys(selection.composants).find(i => (selection.composants[i].modeles || []).length > 1);
  const s = selection.composants[id];
  const offres = [
    { id, rang: 0, marchand: "cdiscount", nom: "Cdiscount", prix: 500, en_stock: false, lien: "x" },
    { id, rang: 1, marchand: "fnac", nom: "Fnac", prix: 520, en_stock: true, lien: "y" }];
  const { C, alertes } = construire(selection, { offres, prixExemple: true, amazonTag: "" });
  assert.equal(C[id].modele, s.modeles[1].modele);
  assert.equal(C[id].bascule, true);
  assert.ok(alertes.some(a => a.niveau === "bascule" && a.id === id));
});

test("catalogue : lien Amazon sans prix quand l'ASIN et l'identifiant partenaire existent", () => {
  const sel = structuredClone(selection), id = "gpu-5070";
  sel.composants[id].modeles[0].asin = "B0TEST0000";
  const { C } = construire(sel, { offres: [{ id, rang: 0, marchand: "fnac", nom: "Fnac", prix: 600, en_stock: true, lien: "y" }], prixExemple: true, amazonTag: "jurojin-21" });
  const az = C[id].offres.find(o => o.marchand === "amazon");
  assert.equal(az.prix, null);
  assert.equal(az.lien, "https://www.amazon.fr/dp/B0TEST0000?tag=jurojin-21");
  assert.equal(C[id].prix, 600);
});

test("validation : seuls les changements acceptés sont appliqués", () => {
  const sel = structuredClone(selection);
  const out = appliquer(sel, [
    { type: "pourquoi", id: "gpu-5070", detail: { texte: "Nouveau texte." } },
    { type: "retrait", id: "gpu-5060" }], { 0: true, 1: false });
  assert.equal(out.composants["gpu-5070"].pourquoi, "Nouveau texte.");
  assert.ok(out.composants["gpu-5060"]);
});

test("catalogue : un modèle en stock qui n'entre dans aucune machine cède la place à la réserve suivante", () => {
  const sel = structuredClone(selection), id = "gpu-5090";
  // le retenu devient impossible à alimenter, la réserve reste normale
  sel.composants[id].modeles[0].caracteristiques = { ...sel.composants[id].modeles[0].caracteristiques, tdp: 2000 };
  sel.composants[id].modeles[1].caracteristiques = { ...sel.composants[id].modeles[1].caracteristiques, tdp: 575 };
  const offres = [0, 1].map(rang => ({ id, rang, marchand: "fnac", nom: "Fnac", prix: 2500, en_stock: true, lien: "y" }));
  const { C, alertes } = construire(sel, { offres, prixExemple: true, amazonTag: "" });
  assert.equal(C[id].modele, sel.composants[id].modeles[1].modele);
  assert.ok(alertes.some(a => a.niveau === "incompatible" && a.id === id));
});

test("catalogue : si aucun modèle ne convient, la puce est écartée sans faire échouer le calcul", () => {
  const sel = structuredClone(selection), id = "gpu-5090";
  sel.composants[id].modeles.forEach(m => { m.caracteristiques = { ...m.caracteristiques, tdp: 2000 }; });
  const { C } = construire(sel, { prixExemple: true, amazonTag: "" });
  assert.equal(C[id], undefined);
});

test("Awin : un flux pas mis à jour depuis plus de 48 h est écarté, les offres sont datées du flux", async () => {
  const fetchImpl = async () => new Response(csv);
  const liste = {
    "44863": { url: "https://exemple.invalid/a.csv", maj: "2026-10-29 02:10:00" },
    "88636": { url: "https://exemple.invalid/b.csv", maj: "2026-10-25 02:10:00" },
    "116908": { url: "https://exemple.invalid/c.csv", maj: "n'importe quoi" }
  };
  const r = await awin.releverOffres(selection, { fetchImpl, liste, maintenant: new Date("2026-10-30T03:30:00Z") });
  assert.deepEqual(r.ecartes.sort(), ["116908", "88636"]);
  assert.ok(r.offres.length > 0 && r.offres.every(o => o.source === "awin:44863" && o.releve_le === "2026-10-29T02:10:00.000Z"));
});

test("Awin : flux compressé reconnu à sa signature, adresse sans .gz ni Content-Encoding (forme réelle des flux Awin)", async () => {
  const fetchImpl = async () => new Response(zlib.gzipSync(csv), { headers: { "content-type": "application/x-gzip" } });
  const liste = { "44863": { url: "https://exemple.invalid/datafeed/download/fid/44863/format/csv/compression/gzip/columns/a%2Cb/", maj: "2026-10-29 20:28:21" } };
  const r = await awin.releverOffres(selection, { fetchImpl, liste, maintenant: new Date("2026-10-30T03:30:00Z") });
  assert.ok(r.offres.some(o => o.id === "gpu-5070ti" && o.prix === 829.99));
  const brut = await awin.releverOffres(selection, { fetchImpl: async () => new Response(csv), liste, maintenant: new Date("2026-10-30T03:30:00Z") });
  assert.equal(brut.offres.length, r.offres.length, "un flux non compressé reste lu tel quel");
});

test("Awin : liste des flux au format réel (en-têtes et date « Last Imported » du compte)", async () => {
  const texte = 'Advertiser ID,Advertiser Name,Primary Region,Membership Status,Datafeed Format,Feed ID,Feed Name,Language,Vertical,Last Imported,Last Checked,No of products,URL\n'
    + '6948,Cdiscount FR,FR,active,Awin,88636,Cdiscount FR - Flux High-Tech,French,Fashion,2026-10-29 20:03:56,2026-10-29 19:55:31,370266,https://exemple.invalid/fid/88636/\n'
    + '1,Autre,FR,Not Joined,Awin,1234,Autre,French,Fashion,2026-10-29 20:03:56,2026-10-29 19:55:31,10,https://exemple.invalid/fid/1234/\n';
  const l = await awin.listeFlux({ texte });
  assert.deepEqual(Object.keys(l), ["88636"]);
  assert.equal(l["88636"].produits, 370266);
  assert.equal(awin.dateFlux(l["88636"].maj).toISOString(), "2026-10-29T20:03:56.000Z");
});

test("Awin : formats de date lus", () => {
  assert.equal(awin.dateFlux("28/10/2026 03:12").toISOString(), "2026-10-28T03:12:00.000Z");
  assert.equal(awin.dateFlux("2026-10-28T03:12:44+01:00").toISOString(), "2026-10-28T02:12:44.000Z");
  assert.equal(awin.dateFlux(""), null);
});

test("disparitions : une puce retirée est signalée avec sa raison", () => {
  const { disparitions } = require("../src/taches");
  const { assembler } = require("../src/moteur/assembler");
  const avant = assembler({ C: construire(selection, { prixExemple: true, amazonTag: "" }).C, selection });
  const sel = structuredClone(selection);
  sel.composants["gpu-5090"].modeles.forEach(m => { m.caracteristiques = { ...m.caracteristiques, tdp: 2000 }; });
  delete sel.composants["gpu-5080"].prix_exemple;                          // plus aucune offre
  const { C, alertes } = construire(sel, { prixExemple: true, amazonTag: "" });
  const apres = assembler({ C, selection: sel });
  const d = Object.fromEntries(disparitions(avant, apres, C, alertes).map(x => [x.id, x.raison]));
  assert.equal(d["gpu-5090"], "incompatible");
  assert.equal(d["gpu-5080"], "rupture");
  assert.equal(disparitions(avant, avant, C, []).length, 0);
});

test("messages d'erreur explicites : liste Awin non configurée, source injoignable", async () => {
  await assert.rejects(awin.listeFlux({ url: undefined }), /AWIN_FEEDLIST_URL absente du \.env/);
  const panne = async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); };
  await assert.rejects(awin.listeFlux({ url: "https://exemple.invalid/liste", fetchImpl: panne }), /Liste des flux Awin injoignable : ENOTFOUND/);
  const blender = require("../src/sources/blenderOpenData");
  await assert.rejects(blender.telecharger({ fetchImpl: panne }), /Blender Open Data CPU injoignable : ENOTFOUND/);
});

test("cache WP Rocket : sans numéro de page, WordPress retrouve les pages au modèle Configurateur PC", () => {
  const pub = require("../src/publication");
  const auto = pub.codeViderCache(undefined);
  assert.match(auto, /'meta_value' => 'configurateur-pc'/);
  assert.match(auto, /'s' => 'configurateur_pc'/);
  assert.match(auto, /rocket_clean_post\(\$i\)/);
  assert.doesNotMatch(auto, /\$ids = array\(\d/);
  assert.match(pub.codeViderCache("1234"), /^\$ids = array\(1234\);/);
  assert.match(pub.codeViderCache("1234; system('x')"), /^\$ids = array\(1234\);/, "seul le nombre est gardé");
});

test("Amazon : lien partenaire sans prix, jamais retenu comme meilleure offre, ASIN et identifiant vérifiés", () => {
  const id = Object.keys(selection.composants).find(i => { const c = selection.composants[i]; return !c.inclus_dans && !c.integree && !["gpu", "cpu"].includes(c.categorie) && (c.modeles || []).length; });
  const sel = structuredClone(selection);
  sel.composants[id].modeles[0].asin = "b0dxyz1234";
  const offres = [{ id, rang: 0, marchand: "fnac", nom: "Fnac", prix: 400, en_stock: true, lien: "https://www.awin1.com/x", releve_le: "2026-10-30" }];
  const ok = construire(sel, { offres, amazonTag: "jurojin-21" }).C[id];
  assert.equal(ok.prix, 400, "le prix vient du marchand, pas d'Amazon");
  assert.equal(ok.offres[0].marchand, "fnac");
  const amz = ok.offres.find(o => o.marchand === "amazon");
  assert.equal(amz.prix, null);
  assert.equal(amz.lien, "https://www.amazon.fr/dp/B0DXYZ1234?tag=jurojin-21");
  assert.ok(!construire(sel, { offres, amazonTag: "" }).C[id].offres.some(o => o.marchand === "amazon"), "sans identifiant : pas de lien");
  assert.ok(!construire(sel, { offres, amazonTag: "x\"><script>-21" }).C[id].offres.some(o => o.marchand === "amazon"), "identifiant piégé refusé");
  sel.composants[id].modeles[0].asin = "B0X\" onclick=\"";
  assert.ok(!construire(sel, { offres, amazonTag: "jurojin-21" }).C[id].offres.some(o => o.marchand === "amazon"), "ASIN invalide refusé");
});
