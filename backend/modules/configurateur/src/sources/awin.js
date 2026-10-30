/* Flux produits Awin.
   1. La liste des flux (AWIN_FEEDLIST_URL, CSV) donne, pour chaque flux, son numéro et son adresse de téléchargement.
   2. On télécharge seulement les flux retenus dans config.fluxAwin (CSV compressé en gzip), en flux continu.
   3. Chaque ligne est comparée aux modèles de la sélection : EAN d'abord, sinon mots-clés.
   Les colonnes varient selon le format du flux (« Awin » ou « Google ») : on lit l'en-tête et on cherche les noms connus. */
const zlib = require("zlib");
const { Readable } = require("stream");
const { parse } = require("csv-parse");
const config = require("../config");

const COLONNES = {
  nom: ["product_name", "title"],
  lien: ["aw_deep_link", "link", "deep_link"],
  prix: ["search_price", "store_price", "display_price", "price", "sale_price"],
  ean: ["ean", "product_gtin", "gtin", "upc"],
  mpn: ["mpn", "model_number", "product_model"],
  stock: ["in_stock", "availability", "stock_status"],
  etat: ["condition"],
  marchand: ["merchant_name"],
  majProduit: ["last_updated"],
  image: ["aw_image_url", "merchant_image_url", "large_image", "image_link", "aw_thumb_url"]
};
const choisir = (ligne, cles) => { for (const k of cles) if (ligne[k] !== undefined && ligne[k] !== "") return ligne[k]; return null; };
const prixNombre = v => { if (v == null) return null; const n = parseFloat(String(v).replace(/[^\d.,]/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const enStock = v => v == null ? true : /^(1|yes|y|true|in stock|in_stock|en stock|disponible)$/i.test(String(v).trim());
const neuf = v => v == null || /^(new|neuf|nouveau)$/i.test(String(v).trim());
const sansAccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Écritures équivalentes des marchands ramenées à une seule : « 2x48 » = « 2 x 48 », « 2To » = « 2 To », « 500go » = « 500 Go ».
const normaliser = s => sansAccent(s).replace(/(\d)\s*x\s*(\d)/g, "$1x$2").replace(/(\d)\s*(to|go|tb|gb)\b/g, "$1 $2");
// Lien d'achat sûr à insérer dans la page : https uniquement, sans espace ni guillemet ni chevron.
// Un flux marchand est une donnée externe : un lien malformé ou piégé (javascript:, guillemet qui
// ferme l'attribut href) ne doit jamais atteindre le HTML de jurojin.net.
const lienSur = v => { const s = String(v || "").trim(); return /^https:\/\/[^\s"'<>`\\]+$/i.test(s) ? s : null; };

/** Lit la liste des flux (CSV) et renvoie { [feedId]: url } pour les flux retenus. */
async function listeFlux({ url = config.awinFeedListUrl, fetchImpl = fetch, texte } = {}) {
  if (texte == null && !url) throw new Error("AWIN_FEEDLIST_URL absente du .env : impossible de lire la liste des flux Awin");
  const csv = texte ?? await (async () => {
    let r;
    try { r = await fetchImpl(url); } catch (e) { throw new Error(`Liste des flux Awin injoignable : ${e.cause?.code || e.message}`); }
    if (!r.ok) throw new Error(`Liste des flux Awin : HTTP ${r.status}`);
    return r.text();
  })();
  const lignes = await new Promise((ok, ko) => parse(csv, { columns: true, skip_empty_lines: true }, (e, d) => e ? ko(e) : ok(d)));
  const voulus = new Set(config.fluxAwin.map(f => f.id));
  const out = {};
  for (const l of lignes) {
    const id = String(l["Feed ID"] || "").replace(/^F/, "");
    if (voulus.has(id) || voulus.has(l["Feed ID"])) out[id] = { url: l.URL, marchand: l["Advertiser Name"], produits: +l["No of products"] || 0, maj: l["Last Imported"] };
  }
  return out;
}

/** Prépare les règles de correspondance de la sélection : une entrée par modèle (retenu et réserves). */
function reglesCorrespondance(selection) {
  const regles = [];
  for (const [id, c] of Object.entries(selection.composants)) {
    (c.modeles || []).forEach((m, rang) => {
      if (!m.correspondance) return;
      regles.push({ id, rang, modele: m.modele, ean: new Set((m.correspondance.ean || []).map(String)),
        motifs: (m.correspondance.motifs || []).map(normaliser), exclure: (m.correspondance.exclure || []).map(normaliser) });
    });
  }
  return regles;
}
function correspond(regle, p) {
  if (p.ean && regle.ean.has(String(p.ean))) return true;
  if (!regle.motifs.length) return false;
  const n = normaliser(p.nom);
  return regle.motifs.every(m => n.includes(m)) && !regle.exclure.some(m => n.includes(m));
}

/** Parcourt un flux CSV (gzip ou texte) et renvoie les offres trouvées pour la sélection. */
async function lireFlux({ flux, regles, marchand, nomMarchand, source, releveLe }) {
  const offres = [];
  const entree = typeof flux === "string" ? Readable.from([flux]) : flux;
  const parser = entree.pipe(parse({ columns: h => h.map(x => String(x).trim().toLowerCase()), relax_quotes: true, relax_column_count: true, skip_empty_lines: true }));
  for await (const l of parser) {
    const p = { nom: choisir(l, COLONNES.nom), ean: choisir(l, COLONNES.ean), prix: prixNombre(choisir(l, COLONNES.prix)),
      lien: lienSur(choisir(l, COLONNES.lien)), stock: enStock(choisir(l, COLONNES.stock)), neuf: neuf(choisir(l, COLONNES.etat)),
      image: COLONNES.image.map(k => lienSur(l[k])).find(Boolean) || null };   // première image en https, sinon aucune
    if (!p.nom || !p.prix || !p.lien || !p.neuf) continue;
    for (const r of regles) if (correspond(r, p)) offres.push({ id: r.id, rang: r.rang, modele: r.modele, marchand, nom: nomMarchand,
      produit: p.nom, ean: p.ean, prix: Math.round(p.prix * 100) / 100, en_stock: p.stock, lien: p.lien, image: p.image, releve_le: releveLe, source });
  }
  return offres;
}

/** Télécharge les flux retenus et renvoie toutes les offres correspondantes. */
/** Date de dernière mise à jour d'un flux selon Awin (« Last Imported »), ou null si illisible. */
function dateFlux(v) {
  if (!v) return null;
  const s = String(v).trim();
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T]?(\d{2}:\d{2}(:\d{2})?)?/);   // 28/10/2026 03:12
  const iso = fr ? `${fr[3]}-${fr[2]}-${fr[1]}T${fr[4] || "00:00"}` : s.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z");
  return isNaN(d) ? null : d;
}

/** Décompresse le flux s'il commence par la signature gzip (1f 8b), quels que soient l'adresse et les en-têtes :
    Awin envoie ses flux compressés à une adresse sans « .gz » et sans Content-Encoding,
    et fetch décompresse déjà de lui-même ceux qui annoncent Content-Encoding. */
async function ouvrirFlux(corps) {
  const it = corps[Symbol.asyncIterator]();
  const premier = await it.next();
  if (premier.done) return Readable.from([]);
  const tete = Buffer.from(premier.value);
  const tout = Readable.from((async function* () { yield tete; for (let x = await it.next(); !x.done; x = await it.next()) yield x.value; })());
  if (tete[0] !== 0x1f || tete[1] !== 0x8b) return tout;
  const gz = zlib.createGunzip();
  tout.on("error", e => gz.destroy(e));
  return tout.pipe(gz);
}

/** Télécharge les flux retenus et renvoie toutes les offres correspondantes.
    Un flux que le marchand n'a pas mis à jour depuis plus de config.fraicheurFluxHeures est écarté :
    ses prix ne sont plus ceux du jour. Les offres sont datées de la mise à jour du flux, pas de notre lecture. */
async function releverOffres(selection, { fetchImpl = fetch, liste, maintenant = new Date() } = {}) {
  const regles = reglesCorrespondance(selection);
  const flux = liste || await listeFlux({ fetchImpl });
  const toutes = [], erreurs = [], ecartes = [];
  for (const f of config.fluxAwin) {
    const info = flux[f.id];
    if (!info) { erreurs.push(`Flux ${f.id} (${f.nom}) absent de la liste Awin`); continue; }
    const maj = dateFlux(info.maj);
    if (!maj) { erreurs.push(`Flux ${f.id} (${f.nom}) : date de mise à jour illisible (« ${info.maj} »), flux écarté`); ecartes.push(f.id); continue; }
    const age = (maintenant - maj) / 3600e3;
    if (age > config.fraicheurFluxHeures) { erreurs.push(`Flux ${f.id} (${f.nom}) : pas mis à jour depuis ${Math.round(age)} h, flux écarté`); ecartes.push(f.id); continue; }
    const releveLe = maj.toISOString();
    try {
      const r = await fetchImpl(info.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toutes.push(...await lireFlux({ flux: await ouvrirFlux(Readable.fromWeb(r.body)), regles, marchand: f.marchand, nomMarchand: f.nom, source: `awin:${f.id}`, releveLe }));
    } catch (e) { erreurs.push(`Flux ${f.id} (${f.nom}) : ${e.message}`); }
  }
  return { offres: toutes, erreurs, ecartes };
}

module.exports = { listeFlux, reglesCorrespondance, correspond, lireFlux, releverOffres, dateFlux, lienSur, ouvrirFlux };
