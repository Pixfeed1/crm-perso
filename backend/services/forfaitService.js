// Offre de correction au forfait (version B « forfait » du test A/B des emails par la preuve).
// Un prix fixe HT par défaut constaté, réglable dans l'interface (Campagnes > test A/B). Seuls les défauts
// actifs et chiffrés entrent dans le test : les autres (erreur serveur, mobile…) gardent leur question,
// hors test, parce qu'ils peuvent cacher n'importe quoi. Après la correction : trois mois de suivi sans
// frais, puis une proposition que le client accepte ou non ; jamais d'abonnement qui démarre tout seul.
const err = (status, message) => Object.assign(new Error(message), { status });

const MOIS_SUIVI = 3;
// preuve (clé du catalogue des emails par la preuve) : libellé, prix HT, ce que comprend la correction.
const DEFAUTS = [
  { preuve: 'ssl_expire', libelle: 'Certificat SSL expiré', prix_ht: 90, actif: true, contenu: "renouveler le certificat, mettre en place son renouvellement automatique et vérifier que toutes les pages s'ouvrent en https" },
  { preuve: 'ssl_invalide', libelle: 'Certificat SSL mal installé', prix_ht: 90, actif: true, contenu: "installer un certificat valide pour votre adresse et vérifier que toutes les pages s'ouvrent en https, sans avertissement" },
  { preuve: 'http_non_securise', libelle: 'Site resté en HTTP', prix_ht: 90, actif: true, contenu: 'installer le certificat et rediriger toutes les adresses vers la version sécurisée, avec le cadenas' },
  { preuve: 'invisible_google', libelle: 'Site bloqué pour Google (noindex, robots.txt)', prix_ht: 90, actif: true, contenu: 'retirer le blocage, vérifier que Google peut de nouveau parcourir le site et lui demander de le réexaminer' },
  { preuve: 'titre_defaut', libelle: 'Titre par défaut', prix_ht: 90, actif: true, contenu: 'remplacer le titre par défaut par un titre qui présente votre activité, avec sa description pour Google' },
  { preuve: 'accueil_404', libelle: "Page d'accueil en erreur 404", prix_ht: 150, actif: true, contenu: "remettre la page d'accueil en ligne et vérifier que les pages principales s'affichent" },
  { preuve: 'mentions_404', libelle: 'Mentions légales absentes', prix_ht: 150, actif: true, contenu: 'créer la page des mentions légales à partir des informations que vous me donnez, et la relier au lien du bas de page' },
  { preuve: 'erreur_serveur', libelle: 'Erreur serveur', prix_ht: null, actif: false, contenu: '' },
  { preuve: 'mobile', libelle: 'Site inadapté au mobile', prix_ht: null, actif: false, contenu: '' },
  { preuve: 'nom_mal_orthographie', libelle: 'Nom mal orthographié', prix_ht: null, actif: false, contenu: '' },
];

const prets = new WeakSet();   // une seule création par connexion à la base
async function assurerTable(q) {
  if (prets.has(q)) return;
  await q.query(`
    CREATE TABLE IF NOT EXISTS forfaits_correction (
      preuve     TEXT PRIMARY KEY,
      libelle    TEXT NOT NULL,
      prix_ht    INTEGER,
      contenu    TEXT,
      actif      BOOLEAN DEFAULT FALSE,
      ordre      INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`);
  for (const [i, d] of DEFAUTS.entries()) {
    await q.query('INSERT INTO forfaits_correction (preuve, libelle, prix_ht, contenu, actif, ordre) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (preuve) DO NOTHING',
      [d.preuve, d.libelle, d.prix_ht, d.contenu, d.actif, i]);
  }
  prets.add(q);
}

async function lister(db) {
  await assurerTable(db.pool);
  const { rows } = await db.pool.query('SELECT preuve, libelle, prix_ht, contenu, actif, updated_at FROM forfaits_correction ORDER BY ordre, preuve');
  return { forfaits: rows, mois_suivi: MOIS_SUIVI, taxe: 'HT' };
}

// Défauts proposés au forfait : { preuve: { prix_ht, contenu } }, actifs et chiffrés seulement.
async function carte(db) {
  const { forfaits } = await lister(db);
  return Object.fromEntries(forfaits.filter((f) => f.actif && f.prix_ht > 0 && String(f.contenu || '').trim()).map((f) => [f.preuve, { prix_ht: f.prix_ht, contenu: f.contenu.trim() }]));
}

async function modifier(db, preuve, { prix_ht: prix, contenu, actif } = {}) {
  await assurerTable(db.pool);
  const ex = (await db.pool.query('SELECT * FROM forfaits_correction WHERE preuve = $1', [preuve])).rows[0];
  if (!ex) throw err(404, `défaut « ${preuve} » inconnu`);
  const n = { prix_ht: ex.prix_ht, contenu: ex.contenu, actif: ex.actif };
  if (prix !== undefined) {
    if (prix === null || prix === '') n.prix_ht = null;
    else { const p = Number(prix); if (!Number.isInteger(p) || p < 1 || p > 100000) throw err(400, 'prix : un nombre entier d\'euros HT'); n.prix_ht = p; }
  }
  if (contenu !== undefined) {
    const c = String(contenu || '').replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '');
    if (/[?]/.test(c)) throw err(400, 'contenu : pas de point d\'interrogation, l\'email garde une seule question');
    if (c.length > 300) throw err(400, 'contenu : 300 caractères au plus');
    n.contenu = c;
  }
  if (actif !== undefined) n.actif = !!actif;
  if (n.actif && (!n.prix_ht || !String(n.contenu || '').trim())) throw err(400, 'pour proposer ce défaut au forfait, il faut un prix et ce que comprend la correction');
  await db.pool.query('UPDATE forfaits_correction SET prix_ht = $2, contenu = $3, actif = $4, updated_at = NOW() WHERE preuve = $1', [preuve, n.prix_ht, n.contenu, n.actif]);
  return lister(db);
}

module.exports = { MOIS_SUIVI, DEFAUTS, assurerTable, lister, carte, modifier };
