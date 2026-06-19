// backend/controllers/objectifController.js
//
// Pilotage CA/MRR (module Objectif). Calculs en LECTURE SEULE à partir des données réelles :
// - MRR normalisé depuis subscriptions (billing_status = 'active')
// - CA réalisé depuis revenues (status = 'paid', année civile)
// Paramètres (cible, taux, seuils) lus depuis objectif_params (éditable, rien en dur).

// Récupère (ou crée par défaut) la ligne de paramètres d'une année.
async function getOrCreateParams(pool, annee) {
  const res = await pool.query('SELECT * FROM objectif_params WHERE annee = $1', [annee]);
  if (res.rows[0]) return res.rows[0];
  const ins = await pool.query(
    'INSERT INTO objectif_params (annee) VALUES ($1) ON CONFLICT (annee) DO NOTHING RETURNING *',
    [annee]
  );
  if (ins.rows[0]) return ins.rows[0];
  const again = await pool.query('SELECT * FROM objectif_params WHERE annee = $1', [annee]);
  return again.rows[0];
}

// Nombre de mois restants dans l'année civile (pour la projection run-rate).
function moisRestants(annee) {
  const now = new Date();
  const y = now.getFullYear();
  if (annee > y) return 12;
  if (annee < y) return 0;
  return Math.max(0, 11 - now.getMonth()); // mois pleins restants après le mois courant
}

const objectifController = {
  // GET /api/objectif/params?annee=2027
  getParams: async (req, res) => {
    const pool = req.app.locals.db.pool;
    const annee = parseInt(req.query.annee, 10) || new Date().getFullYear();
    try {
      const params = await getOrCreateParams(pool, annee);
      res.json(params);
    } catch (error) {
      console.error('[Objectif] getParams:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // PUT /api/objectif/params  { annee, cible_ca_eur, cible_mrr_eur, taux_urssaf, taux_impot_provision, plafond_micro, seuil_tva_base, seuil_tva_majore, ponctuel_prevu }
  updateParams: async (req, res) => {
    const pool = req.app.locals.db.pool;
    const b = req.body || {};
    const annee = parseInt(b.annee, 10);
    if (!annee) return res.status(400).json({ message: "L'année est requise" });

    const num = (v, def) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? def : Number(v));
    try {
      const current = await getOrCreateParams(pool, annee);
      const merged = {
        cible_ca_eur: num(b.cible_ca_eur, current.cible_ca_eur),
        cible_mrr_eur: num(b.cible_mrr_eur, current.cible_mrr_eur),
        taux_urssaf: num(b.taux_urssaf, current.taux_urssaf),
        taux_impot_provision: num(b.taux_impot_provision, current.taux_impot_provision),
        plafond_micro: num(b.plafond_micro, current.plafond_micro),
        seuil_tva_base: num(b.seuil_tva_base, current.seuil_tva_base),
        seuil_tva_majore: num(b.seuil_tva_majore, current.seuil_tva_majore),
        ponctuel_prevu: num(b.ponctuel_prevu, current.ponctuel_prevu)
      };
      const upd = await pool.query(
        `UPDATE objectif_params SET
           cible_ca_eur = $2, cible_mrr_eur = $3, taux_urssaf = $4, taux_impot_provision = $5,
           plafond_micro = $6, seuil_tva_base = $7, seuil_tva_majore = $8, ponctuel_prevu = $9,
           updated_at = NOW()
         WHERE annee = $1 RETURNING *`,
        [annee, merged.cible_ca_eur, merged.cible_mrr_eur, merged.taux_urssaf, merged.taux_impot_provision,
         merged.plafond_micro, merged.seuil_tva_base, merged.seuil_tva_majore, merged.ponctuel_prevu]
      );
      res.json(upd.rows[0]);
    } catch (error) {
      console.error('[Objectif] updateParams:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/objectif/summary?annee=2027
  getSummary: async (req, res) => {
    const pool = req.app.locals.db.pool;
    const annee = parseInt(req.query.annee, 10) || new Date().getFullYear();
    try {
      const params = await getOrCreateParams(pool, annee);

      // MRR normalisé (mensuel EUR) + clients actifs, sur les abos actifs.
      const normalize = `amount_eur / (CASE billing_interval WHEN 'year' THEN 12 WHEN 'quarter' THEN 3 ELSE 1 END * GREATEST(COALESCE(interval_count, 1), 1))`;
      const mrrRes = await pool.query(
        `SELECT COALESCE(SUM(${normalize}), 0)::float AS mrr,
                COUNT(DISTINCT client_id) AS clients
         FROM subscriptions WHERE billing_status = 'active'`
      );
      const mrr = Number(mrrRes.rows[0].mrr) || 0;
      const clients = parseInt(mrrRes.rows[0].clients, 10) || 0;

      // MRR à risque (impayés).
      const riskRes = await pool.query(
        `SELECT COALESCE(SUM(${normalize}), 0)::float AS v FROM subscriptions WHERE billing_status = 'past_due'`
      );
      const mrrARisque = Number(riskRes.rows[0].v) || 0;

      // Churn 3 mois (approximatif : abos résiliés sur 3 mois / base active+résiliés).
      const churnRes = await pool.query(
        `SELECT COUNT(*) AS c FROM subscriptions
         WHERE billing_status = 'canceled'
           AND COALESCE(date_fin, billing_cancel_at, updated_at) >= (NOW() - INTERVAL '3 months')`
      );
      const canceled3m = parseInt(churnRes.rows[0].c, 10) || 0;
      const churn3m = (clients + canceled3m) > 0 ? (canceled3m / (clients + canceled3m)) * 100 : 0;

      // CA réalisé : revenus encaissés (paid) sur l'année civile.
      const caRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS v FROM revenues
         WHERE status = 'paid' AND date >= $1::date AND date < $2::date`,
        [`${annee}-01-01`, `${annee + 1}-01-01`]
      );
      const caRealise = Number(caRes.rows[0].v) || 0;

      // Projection fin d'année (run-rate).
      const restants = moisRestants(annee);
      const ponctuelPrevu = Number(params.ponctuel_prevu) || 0;
      const caProjete = caRealise + mrr * restants + ponctuelPrevu;

      // Provisions fiscales (séparées) + net estimé.
      const tauxUrssaf = Number(params.taux_urssaf) || 0;
      const tauxImpot = Number(params.taux_impot_provision) || 0;
      const plafondMicro = Number(params.plafond_micro) || 0;
      const provisionUrssaf = caRealise * tauxUrssaf;
      const provisionImpot = caRealise * tauxImpot;
      const netEstime = caRealise - provisionUrssaf - provisionImpot;
      const basculeMicro = caRealise >= plafondMicro;

      res.json({
        annee,
        mrr,
        clients_actifs: clients,
        arpu: clients > 0 ? mrr / clients : 0,
        churn_3m: churn3m,
        churn_3m_approx: true,
        mrr_a_risque: mrrARisque,
        ca_realise: caRealise,
        ca_projete: caProjete,
        mois_restants: restants,
        provision_urssaf: provisionUrssaf,
        provision_impot: provisionImpot,
        net_estime: netEstime,
        cible_ca: Number(params.cible_ca_eur) || 0,
        cible_mrr: Number(params.cible_mrr_eur) || 0,
        bascule_micro: basculeMicro,
        seuils: {
          tva_base: Number(params.seuil_tva_base) || 0,
          tva_majore: Number(params.seuil_tva_majore) || 0,
          plafond_micro: plafondMicro
        },
        params
      });
    } catch (error) {
      console.error('[Objectif] getSummary:', error.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = objectifController;
