/**
 * Controller pour les régimes de TVA
 * Gère la récupération des régimes de TVA disponibles
 */

/**
 * Récupère tous les régimes de TVA actifs
 *
 * @route GET /api/tva-regimes
 * @access Public (utilisé dans les formulaires)
 */
exports.getAllRegimes = async (req, res) => {
  try {
    const db = req.app.locals.db;

    const query = `
      SELECT
        id, code, label, category, taux, article_cgi,
        description, mention_legale, calcul_type, ordre
      FROM tva_regimes
      WHERE active = true
      ORDER BY ordre ASC, label ASC
    `;

    db.pool.query(query, [], (err, result) => {
      if (err) {
        console.error('[TVA Regimes] Erreur récupération:', err);
        return res.status(500).json({
          success: false,
          message: err.message
        });
      }

      const regimes = result.rows || [];

      // Grouper par catégorie pour faciliter l'affichage
      const groupedRegimes = {
        taux_normal: [],
        taux_reduit: [],
        taux_reduit_specifique: [],
        non_application: [],
        exoneration: [],
        autoliquidation: [],
        regime_particulier: []
      };

      regimes.forEach(regime => {
        if (groupedRegimes[regime.category]) {
          groupedRegimes[regime.category].push(regime);
        }
      });

      res.json({
        success: true,
        total: regimes.length,
        regimes: regimes,
        grouped: groupedRegimes
      });
    });

  } catch (error) {
    console.error('[TVA Regimes] Erreur récupération:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Récupère un régime de TVA par son code
 *
 * @route GET /api/tva-regimes/:code
 * @access Public
 */
exports.getRegimeByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const db = req.app.locals.db;

    const query = `
      SELECT
        id, code, label, category, taux, article_cgi,
        description, mention_legale, calcul_type, ordre
      FROM tva_regimes
      WHERE code = $1 AND active = true
    `;

    db.pool.query(query, [code], (err, result) => {
      if (err) {
        console.error('[TVA Regimes] Erreur récupération régime:', err);
        return res.status(500).json({
          success: false,
          message: err.message
        });
      }

      const regime = result.rows[0];

      if (!regime) {
        return res.status(404).json({
          success: false,
          message: `Régime de TVA "${code}" non trouvé`
        });
      }

      res.json({
        success: true,
        regime: regime
      });
    });

  } catch (error) {
    console.error('[TVA Regimes] Erreur récupération régime:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Récupère les régimes de TVA par catégorie
 *
 * @route GET /api/tva-regimes/category/:category
 * @access Public
 */
exports.getRegimesByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const db = req.app.locals.db;

    const query = `
      SELECT
        id, code, label, category, taux, article_cgi,
        description, mention_legale, calcul_type, ordre
      FROM tva_regimes
      WHERE category = $1 AND active = true
      ORDER BY ordre ASC, label ASC
    `;

    db.pool.query(query, [category], (err, result) => {
      if (err) {
        console.error('[TVA Regimes] Erreur récupération par catégorie:', err);
        return res.status(500).json({
          success: false,
          message: err.message
        });
      }

      const regimes = result.rows || [];

      res.json({
        success: true,
        category: category,
        total: regimes.length,
        regimes: regimes
      });
    });

  } catch (error) {
    console.error('[TVA Regimes] Erreur récupération par catégorie:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
