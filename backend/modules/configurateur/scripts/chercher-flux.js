/* Cherche des produits dans les flux Awin retenus, pour régler les motifs de data/selection.json.
   Une recherche = des mots qui doivent tous figurer dans le nom (accents, majuscules et espaces ignorés :
   « 2x48 ddr5 » trouve « Kit 2 x 48 Go DDR5 »). N'affiche ni l'adresse des flux ni la clé.
   Usage, depuis backend/ : node modules/configurateur/scripts/chercher-flux.js "2x48 ddr5" "a620m" */
require("dotenv").config();
const { Readable } = require("stream");
const { parse } = require("csv-parse");
const config = require("../src/config");
const awin = require("../src/sources/awin");

const MAX = 15;
const plat = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "");
const recherches = process.argv.slice(2).map(q => ({ q, mots: q.split(/\s+/).filter(Boolean).map(plat), trouves: [], total: 0 }));
if (!recherches.length) { console.error('Usage : node modules/configurateur/scripts/chercher-flux.js "2x48 ddr5" "a620m"'); process.exit(1); }

(async () => {
  const liste = await awin.listeFlux();
  for (const f of config.fluxAwin) {
    const info = liste[f.id];
    if (!info) { console.log(`Flux ${f.id} (${f.nom}) absent de la liste`); continue; }
    process.stderr.write(`Lecture du flux ${f.id} (${f.nom}, ${info.produits} produits)…\n`);
    const r = await fetch(info.url);
    if (!r.ok) { console.log(`Flux ${f.id} : HTTP ${r.status}`); continue; }
    const lignes = (await awin.ouvrirFlux(Readable.fromWeb(r.body)))
      .pipe(parse({ columns: h => h.map(x => String(x).trim().toLowerCase()), relax_quotes: true, relax_column_count: true, skip_empty_lines: true }));
    for await (const l of lignes) {
      const nom = l.product_name || l.title;
      if (!nom) continue;
      const n = plat(nom);
      for (const x of recherches) if (x.mots.every(m => n.includes(m))) {
        x.total++;
        if (x.trouves.length < MAX) x.trouves.push(`${f.nom} | ${l.search_price || l.store_price || "?"} € | stock ${l.in_stock ?? l.stock_status ?? "?"} | ${l.condition || "?"} | EAN ${l.ean || l.product_gtin || "-"} | ${nom}`);
      }
    }
  }
  for (const x of recherches) {
    console.log(`\n« ${x.q} » : ${x.total} produit(s)${x.total > MAX ? `, ${MAX} premiers` : ""}`);
    for (const t of x.trouves) console.log("  " + t);
  }
})().catch(e => { console.error("Erreur :", e.message); process.exit(1); });
