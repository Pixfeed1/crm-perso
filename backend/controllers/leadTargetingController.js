// backend/controllers/leadTargetingController.js
//
// Boucle de retour du ciblage : « qu'est-ce qui convertit ? ». Agrège les issues de
// prospection (contactés, emails ouverts, réponses, gagnés, refus) par dimension de
// ciblage (plateforme, type de site, département, secteur, angle d'approche) à partir
// de ce qui est DÉJÀ en base : interactions (échanges loggés + outreach), email_tracking
// (ouvertures) et leads.relation_status (issue commerciale). Lecture seule.

const DIMENSIONS = {
  platform: "COALESCE(NULLIF(l.platform, ''), 'inconnue')",
  site_type: "COALESCE(NULLIF(l.site_type, ''), 'inconnu')",
  department: "COALESCE(NULLIF(l.department, ''), 'inconnu')",
  sector: "COALESCE(NULLIF(l.sector, ''), 'inconnu')",
  source: "COALESCE(NULLIF(l.source, ''), 'inconnue')",
  prestataire: "COALESCE(NULLIF(l.prestataire, ''), 'aucun crédité')",
  angle: null // unnest de leads.angles (clés séparées par « | »)
};

const ANGLE_LABELS = {
  mentions_legales: 'Sans mentions légales', mobile: 'Non responsive', ssl_expire: 'SSL expiré',
  ssl_bientot: 'SSL expire bientôt', ssl_invalide: 'SSL invalide', http_non_securise: 'Servi en HTTP', version_obsolete: 'Version CMS obsolète',
  spf: 'Sans SPF', dmarc: 'Sans DMARC', rgpd: 'Sans politique de confidentialité', cookies: 'Sans bandeau cookies',
  meta_desc: 'SEO : meta description', h1: 'SEO : H1', analytics: "Sans mesure d'audience",
  serveur_expose: 'Version serveur exposée', copyright_fige: 'Copyright figé', erreur_serveur: 'Site en erreur (5xx)', accueil_404: 'Accueil introuvable (404)', titre_defaut: 'Titre par défaut',
  invisible_google: 'Invisible sur Google', cgv_absente: 'Sans CGV', retractation_absente: 'Sans rétractation',
  contenu_mixte: 'Contenu mixte', mentions_404: 'Mentions légales cassées', php_obsolete: 'PHP sans correctifs',
  nom_mal_orthographie: 'Nom mal écrit dans le titre', sitemap_vide: 'Sitemap vide', sitemap_absent: 'Sans sitemap',
  urls_non_reecrites: 'Adresses non réécrites', meta_desc_absurde: 'Description Google absurde'
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

const leadTargetingController = {
  // GET /api/leads/targeting-stats?by=platform|site_type|department|sector|source|angle
  getStats: async (req, res) => {
    const db = req.app.locals.db;
    const by = Object.prototype.hasOwnProperty.call(DIMENSIONS, req.query.by) ? req.query.by : 'platform';
    try {
      const dimExpr = by === 'angle' ? 'a.angle' : DIMENSIONS[by];
      const angleJoin = by === 'angle'
        ? "CROSS JOIN LATERAL unnest(string_to_array(COALESCE(l.angles, ''), ' | ')) AS a(angle)"
        : '';
      const angleWhere = by === 'angle' ? "AND a.angle <> ''" : '';
      const sql = `
        WITH contact AS (
          SELECT contact_id,
                 MIN(date) AS premier_contact,
                 bool_or(reached = 'joint' OR result LIKE 'outreach:%:responded') AS repondu_echange
          FROM interactions
          WHERE contact_type = 'lead'
            AND (type IN ('email', 'appel', 'sms', 'rdv') OR result LIKE 'outreach:%:sent')
          GROUP BY contact_id
        ),
        mail AS (
          SELECT contact_id, COUNT(*)::int AS emails, bool_or(open_count > 0) AS ouvert, bool_or(click_count > 0) AS clique
          FROM email_tracking WHERE contact_type = 'lead' GROUP BY contact_id
        ),
        base AS (
          SELECT l.id, l.relation_status, l.score,
                 (c.contact_id IS NOT NULL OR COALESCE(m.emails, 0) > 0) AS contacte,
                 COALESCE(m.ouvert, FALSE) AS ouvert,
                 COALESCE(m.clique, FALSE) AS clique,
                 (COALESCE(c.repondu_echange, FALSE) OR l.relation_status IN ('en_discussion', 'devis_envoye', 'gagne')) AS repondu,
                 (l.relation_status = 'gagne') AS gagne,
                 (l.relation_status IN ('pas_business', 'perdu')) AS refus,
                 ${dimExpr} AS groupe
          FROM leads l
          LEFT JOIN contact c ON c.contact_id = l.id
          LEFT JOIN mail m ON m.contact_id = l.id
          ${angleJoin}
          WHERE TRUE ${angleWhere}
        )
        SELECT groupe,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE contacte)::int AS contactes,
               COUNT(*) FILTER (WHERE ouvert)::int AS ouverts,
               COUNT(*) FILTER (WHERE clique)::int AS cliques,
               COUNT(*) FILTER (WHERE repondu)::int AS repondus,
               COUNT(*) FILTER (WHERE gagne)::int AS gagnes,
               COUNT(*) FILTER (WHERE refus)::int AS refus,
               ROUND(AVG(score))::int AS score_moyen
        FROM base
        GROUP BY groupe
        ORDER BY contactes DESC, total DESC, groupe ASC`;
      const { rows } = await db.pool.query(sql);
      const enrich = (r) => ({
        ...r,
        libelle: by === 'angle' ? (ANGLE_LABELS[r.groupe] || r.groupe) : r.groupe,
        taux_ouverture: pct(r.ouverts, r.contactes),
        taux_reponse: pct(r.repondus, r.contactes),
        taux_gagne: pct(r.gagnes, r.contactes),
        taux_refus: pct(r.refus, r.contactes),
        echantillon_faible: r.contactes < 5
      });
      const total = rows.reduce((acc, r) => {
        for (const k of ['total', 'contactes', 'ouverts', 'cliques', 'repondus', 'gagnes', 'refus']) acc[k] += r[k];
        return acc;
      }, { groupe: 'Tous', total: 0, contactes: 0, ouverts: 0, cliques: 0, repondus: 0, gagnes: 0, refus: 0, score_moyen: null });
      res.json({ by, dimensions: Object.keys(DIMENSIONS), rows: rows.map(enrich), global: enrich(total) });
    } catch (error) {
      console.error('[LeadTargeting] stats:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = leadTargetingController;
