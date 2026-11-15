// mcp_seo/charte.js
// get_charte : la charte de rédaction et l'identité d'un site, telles qu'en base du CRM (table charte_versions,
// écrite seulement par le backend : interface ou modifier_charte). LECTURE SEULE. C'est la seule version qui fait
// foi : prepare_draft exige identite_version = la version en cours, et ses contrôles et sa relecture la relisent.

const SOURCE = 'base du CRM, table charte_versions (charte de rédaction et identité du site)';

export async function versionCharte(pool, siteId) {
  const { rows } = await pool.query('SELECT MAX(version)::int AS v FROM charte_versions WHERE site_id = $1', [siteId]).catch(() => ({ rows: [] }));
  return rows[0] && rows[0].v ? rows[0].v : null;
}

// Règles regroupées par section, dans l'ordre de la charte.
function sections(regles) {
  const out = [];
  for (const r of regles || []) {
    const g = out.find((x) => x.section === r.section);
    if (g) g.regles.push({ cle: r.cle, texte: r.texte });
    else out.push({ section: r.section, titre: r.section_titre, regles: [{ cle: r.cle, texte: r.texte }] });
  }
  return out;
}

// La fiche complète (get_charte) ou l'essentiel pour écrire (section identite de get_site_resources).
function fiche(row, { complete }) {
  const { commun: C, site: S } = row.contenu;
  const base = {
    source: SOURCE, site_id: row.site_id, domaine: row.domain, nom: S.nom,
    identite_version: row.version, version_du: row.created_at, version_par: row.auteur, ...(row.motif ? { version_motif: row.motif } : {}),
    usage: `reporter identite_version: ${row.version} dans le manifeste du dépôt (prepare_draft refuse une autre version) ; modifier_charte pour changer une règle, un exemple, l'identité ou un réglage`,
    registre: S.registre, identite: S.identite,
    charte: sections(C.regles), exemples: C.exemples || [],
  };
  if (!complete) return base;
  const K = C.controles || {};
  return {
    ...base,
    controles: {
      note: 'appliqués par prepare_draft à chaque dépôt ; listes et seuils communs aux deux sites, effets et noms propres à ce site',
      liste_noire: K.liste_noire, intertitres_images: K.intertitres_images, connecteurs: K.connecteurs,
      comparaisons_fin: K.comparaisons_fin, symetries: K.symetries, date_isolee: K.date_isolee, mots_vides: K.mots_vides, ia_motifs: K.ia_motifs,
      seuils: K.seuils, effets: (S.controles || {}).effets, autre_site: (S.controles || {}).autre_site, mots_signales: (S.controles || {}).mots_signales,
    },
  };
}

/** get_charte : version en cours (ou version=n), avec historique=true la liste des versions (date, auteur, motif, changements). */
export async function getCharte(pool, siteId, { version = null, historique = false } = {}) {
  const fetched_at = new Date().toISOString();
  const { rows } = await pool.query(
    `SELECT v.site_id, v.version, v.contenu, v.auteur, v.motif, v.created_at, s.domain
       FROM charte_versions v LEFT JOIN seo_sites s ON s.id = v.site_id
      WHERE v.site_id = $1 AND ($2::int IS NULL OR v.version = $2) ORDER BY v.version DESC LIMIT 1`, [siteId, version]);
  if (!rows[0]) return { fetched_at, site_id: siteId, erreur: { source: SOURCE, code: 404, message: version ? `version ${version} introuvable pour le site ${siteId}` : `aucune charte pour le site ${siteId}` } };
  const out = { fetched_at, ...fiche(rows[0], { complete: true }) };
  const enCours = await versionCharte(pool, siteId);
  if (rows[0].version !== enCours) out.attention = `version ${rows[0].version} affichée ; la version en cours est la ${enCours} (c'est elle que prepare_draft exige)`;
  if (historique) {
    const h = await pool.query('SELECT version, auteur, origine, motif, changements, retour_de, created_at FROM charte_versions WHERE site_id = $1 ORDER BY version DESC LIMIT 100', [siteId]);
    out.historique = h.rows.map((v) => ({ version: v.version, le: v.created_at, par: v.auteur, origine: v.origine, ...(v.motif ? { motif: v.motif } : {}), ...(v.retour_de ? { retour_a: v.retour_de } : {}), changements: v.changements || [] }));
  }
  return out;
}

/** Section « identite » de get_site_resources : identité, registre, charte et exemples de la version en cours. */
export async function identiteSite(pool, siteId) {
  const { rows } = await pool.query(
    `SELECT v.site_id, v.version, v.contenu, v.auteur, v.motif, v.created_at, s.domain
       FROM charte_versions v LEFT JOIN seo_sites s ON s.id = v.site_id WHERE v.site_id = $1 ORDER BY v.version DESC LIMIT 1`, [siteId]).catch((e) => ({ rows: [], e }));
  if (!rows[0]) return { source: SOURCE, erreur: { source: SOURCE, code: 404, message: `aucune charte pour le site ${siteId}` } };
  return { ...fiche(rows[0], { complete: false }), controles: 'liste noire, seuils et effets : get_charte' };
}
