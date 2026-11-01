/* État du configurateur PC en un coup d'œil : clé Claude, relevé des prix, sélection de départ,
   publication des données, page publique. N'affiche aucune clé (seulement « présente » et son format).
   Usage, depuis backend/ : node modules/configurateur/scripts/etat.js [adresse de la page] */
require("dotenv").config();
const { Pool } = require("pg");

const PAGE = process.argv[2] || "https://jurojin.net/configurateur-pc/";
const pool = new Pool({ user: process.env.DB_USER || "postgres", host: process.env.DB_HOST || "localhost", database: process.env.DB_NAME || "mcrm_dev", password: process.env.DB_PASSWORD || "postgres", port: process.env.DB_PORT || 5432 });
const d = (x) => (x ? new Date(x).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "jamais");
const un = async (sql) => (await pool.query(sql).catch(() => ({ rows: [] }))).rows[0] || {};

(async () => {
  // clé Claude : essayée pour de vrai (liste des modèles, gratuite), jamais affichée
  const cle = process.env.CONFIGURATEUR_ANTHROPIC_API_KEY || "";
  const espace = process.env.CONFIGURATEUR_ANTHROPIC_WORKSPACE_ID || "";
  let etatCle = "ABSENTE (la proposition mensuelle est sautée)";
  if (cle) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": cle, "anthropic-version": "2023-06-01", ...(espace ? { "anthropic-workspace-id": espace } : {}) } });
      const j = await r.json().catch(() => ({}));
      const msg = (j.error && j.error.message) || "";
      etatCle = r.ok ? "présente et ACCEPTÉE par l'API"
        : /workspace/i.test(msg) ? `présente, mais il manque l'identifiant d'espace de travail (CONFIGURATEUR_ANTHROPIC_WORKSPACE_ID)${espace ? " ou il est faux" : ""}`
        : `présente mais REFUSÉE par l'API (HTTP ${r.status}${msg ? " : " + msg.slice(0, 120) : ""})`;
    } catch (e) { etatCle = `présente, API injoignable (${e.message})`; }
  }
  console.log(`1. Clé Claude          : ${etatCle}`);

  const nuit = await un("SELECT fin, statut FROM cfg_taches WHERE nom = 'nuit' ORDER BY debut DESC LIMIT 1");
  const offre = await un("SELECT max(releve_le) AS dernier, count(DISTINCT composant)::int AS composants FROM cfg_offres WHERE releve_le > now() - interval '2 days'");
  console.log(`2. Relevé des prix     : dernière tâche de nuit ${d(nuit.fin)} (${nuit.statut || "-"}), ${offre.composants || 0} composants relevés sur 48 h`);

  const sel = await un("SELECT validee_le, validee_par FROM cfg_selections WHERE statut = 'validee' AND validee_le IS NOT NULL ORDER BY validee_le DESC LIMIT 1");
  console.log(`3. Sélection de départ : ${sel.validee_le ? `validée le ${d(sel.validee_le)}${sel.validee_par ? " par " + sel.validee_par : ""}` : "PAS ENCORE VALIDÉE (bouton « Valider la sélection de départ » dans le CRM)"}`);

  const pub = await un("SELECT publie_le, statut, taille_ko FROM cfg_publications ORDER BY publie_le DESC LIMIT 1");
  console.log(`4. Publication données : ${pub.publie_le ? `${d(pub.publie_le)}, ${pub.statut}${pub.taille_ko ? ", " + pub.taille_ko + " Ko" : ""}` : "jamais"}`);

  const prop = await un("SELECT count(*)::int AS n FROM cfg_propositions WHERE statut = 'en_attente'");
  if (prop.n) console.log(`   Propositions à traiter dans le CRM : ${prop.n}`);

  try {
    const r = await fetch(`${PAGE}?crm_live=${Date.now()}`, { redirect: "follow" });
    const h = await r.text();
    const m = (re) => { const x = re.exec(h); return x ? x[1].replace(/\s+/g, " ").trim() : null; };
    const robots = m(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)/i);
    console.log(`5. Page publique       : HTTP ${r.status}${r.url.replace(/[?&]crm_live=\d+/, "") !== PAGE ? " (redirigée vers " + r.url.replace(/[?&]crm_live=\d+/, "") + ")" : ""}`);
    if (r.status === 200) {
      console.log(`   titre    : ${m(/<title>([^<]*)<\/title>/i) || "-"}`);
      console.log(`   méta     : ${m(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || "AUCUNE"}`);
      console.log(`   robots   : ${robots || "-"}${/noindex/i.test(robots || "") ? "  <- page NON indexable (brouillon ou réglage Yoast)" : ""}`);
      console.log(`   outil    : ${/cfg-pc|cfg-tool/.test(h) ? "présent" : "ABSENT de la page"}`);
    }
  } catch (e) { console.log(`5. Page publique       : injoignable (${e.message})`); }
  await pool.end();
})().catch(async (e) => { console.error("Erreur :", e.message); await pool.end().catch(() => {}); process.exit(1); });
