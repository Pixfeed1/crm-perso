// backend/routes/salesPipelineRoutes.js

/**
 * Routes pour le pipeline de ventes (Sales Pipeline)
 * Visualisation et analyse du processus commercial
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Appliquer le middleware d'authentification
router.use(authMiddleware);

/**
 * GET /api/sales-pipeline
 * Vue complète du pipeline de ventes avec leads par statut et valeurs estimées
 */
router.get('/', (req, res) => {
  const db = req.app.locals.db;

  const query = `
    SELECT
      l.status,
      COUNT(l.id) as lead_count,
      COUNT(DISTINCT l.id) as unique_leads,
      SUM(COALESCE(p.amount, 0)) as total_value,
      AVG(COALESCE(p.amount, 0)) as avg_value,
      MIN(l.created_at) as oldest_lead,
      MAX(l.created_at) as newest_lead,
      AVG(CAST((julianday('now') - julianday(l.created_at)) AS REAL)) as avg_age_days
    FROM leads l
    LEFT JOIN projects p ON l.converted_to_project_id = p.id
    WHERE l.status NOT IN ('archived')
    GROUP BY l.status
    ORDER BY
      CASE l.status
        WHEN 'new' THEN 1
        WHEN 'contacted' THEN 2
        WHEN 'qualified' THEN 3
        WHEN 'proposal_sent' THEN 4
        WHEN 'negotiation' THEN 5
        WHEN 'won' THEN 6
        WHEN 'lost' THEN 7
        ELSE 8
      END
  `;

  db.all(query, [], (err, stages) => {
    if (err) {
      console.error('[SalesPipeline] Erreur lors de la récupération du pipeline:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    // Calculer des métriques globales
    const totalLeads = stages.reduce((sum, stage) => sum + stage.lead_count, 0);
    const totalValue = stages.reduce((sum, stage) => sum + (stage.total_value || 0), 0);
    const activeLeads = stages
      .filter(s => !['won', 'lost'].includes(s.status))
      .reduce((sum, stage) => sum + stage.lead_count, 0);
    const activeValue = stages
      .filter(s => !['won', 'lost'].includes(s.status))
      .reduce((sum, stage) => sum + (stage.total_value || 0), 0);

    // Labels français pour les statuts
    const statusLabels = {
      'new': 'Nouveau',
      'contacted': 'Contacté',
      'qualified': 'Qualifié',
      'proposal_sent': 'Proposition envoyée',
      'negotiation': 'Négociation',
      'won': 'Gagné',
      'lost': 'Perdu'
    };

    res.json({
      stages: stages.map(stage => ({
        ...stage,
        label: statusLabels[stage.status] || stage.status,
        value_per_lead: stage.lead_count > 0 ? Math.round(stage.total_value / stage.lead_count) : 0,
        percentage: totalLeads > 0 ? Math.round((stage.lead_count / totalLeads) * 100) : 0
      })),
      summary: {
        total_leads: totalLeads,
        active_leads: activeLeads,
        total_value: Math.round(totalValue),
        active_value: Math.round(activeValue),
        won_count: stages.find(s => s.status === 'won')?.lead_count || 0,
        lost_count: stages.find(s => s.status === 'lost')?.lead_count || 0,
        win_rate: totalLeads > 0
          ? Math.round(((stages.find(s => s.status === 'won')?.lead_count || 0) / totalLeads) * 100)
          : 0
      }
    });
  });
});

/**
 * GET /api/sales-pipeline/conversion-rates
 * Calcule les taux de conversion entre chaque étape du pipeline
 */
router.get('/conversion-rates', (req, res) => {
  const db = req.app.locals.db;

  // Requête pour obtenir les mouvements entre statuts
  const query = `
    SELECT
      l.status,
      COUNT(l.id) as count,
      SUM(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) as won_count,
      SUM(CASE WHEN l.status = 'lost' THEN 1 ELSE 0 END) as lost_count
    FROM leads l
    WHERE l.status NOT IN ('archived')
    GROUP BY l.status
  `;

  db.all(query, [], (err, statusCounts) => {
    if (err) {
      console.error('[SalesPipeline] Erreur lors du calcul des taux de conversion:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    // Ordre du pipeline
    const pipelineOrder = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation'];

    const conversionRates = [];
    let previousCount = null;

    for (let i = 0; i < pipelineOrder.length; i++) {
      const currentStatus = pipelineOrder[i];
      const nextStatus = pipelineOrder[i + 1];

      const currentStage = statusCounts.find(s => s.status === currentStatus);
      const currentCount = currentStage?.count || 0;

      if (previousCount !== null && previousCount > 0) {
        const rate = Math.round((currentCount / previousCount) * 100);
        const dropoff = previousCount - currentCount;
        const dropoffRate = Math.round((dropoff / previousCount) * 100);

        conversionRates.push({
          from: pipelineOrder[i - 1],
          to: currentStatus,
          from_count: previousCount,
          to_count: currentCount,
          conversion_rate: rate,
          dropoff_count: dropoff,
          dropoff_rate: dropoffRate
        });
      }

      previousCount = currentCount;
    }

    // Taux de conversion global (new → won)
    const totalNew = statusCounts.find(s => s.status === 'new')?.count || 0;
    const totalWon = statusCounts.find(s => s.status === 'won')?.count || 0;
    const totalLost = statusCounts.find(s => s.status === 'lost')?.count || 0;
    const totalClosed = totalWon + totalLost;

    res.json({
      conversion_rates: conversionRates,
      overall: {
        total_new: totalNew,
        total_won: totalWon,
        total_lost: totalLost,
        total_closed: totalClosed,
        win_rate: totalClosed > 0 ? Math.round((totalWon / totalClosed) * 100) : 0,
        overall_conversion: totalNew > 0 ? Math.round((totalWon / totalNew) * 100) : 0
      }
    });
  });
});

/**
 * GET /api/sales-pipeline/forecast
 * Prévisions de revenus basées sur l'historique et le pipeline actuel
 */
router.get('/forecast', (req, res) => {
  const db = req.app.locals.db;
  const { months = 3 } = req.query;

  // Calculer le taux de conversion historique
  db.get(`
    SELECT
      COUNT(CASE WHEN status = 'won' THEN 1 END) as won_count,
      COUNT(CASE WHEN status IN ('won', 'lost') THEN 1 END) as closed_count,
      AVG(CASE WHEN status = 'won' THEN
        CAST((julianday(converted_at) - julianday(created_at)) AS REAL)
      END) as avg_conversion_days
    FROM leads
    WHERE created_at >= date('now', '-12 months')
  `, [], (err, historicalData) => {
    if (err) {
      console.error('[SalesPipeline] Erreur lors du calcul des prévisions:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    const winRate = historicalData.closed_count > 0
      ? historicalData.won_count / historicalData.closed_count
      : 0.25; // Taux par défaut de 25%

    // Pipeline actuel
    db.all(`
      SELECT
        l.status,
        COUNT(l.id) as count,
        SUM(COALESCE(p.amount, 5000)) as total_value
      FROM leads l
      LEFT JOIN projects p ON l.converted_to_project_id = p.id
      WHERE l.status NOT IN ('won', 'lost', 'archived')
      GROUP BY l.status
    `, [], (err, pipeline) => {
      if (err) {
        console.error('[SalesPipeline] Erreur lors de la récupération du pipeline:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      // Pondération par statut (probabilité de conversion)
      const statusWeights = {
        'new': 0.10,
        'contacted': 0.20,
        'qualified': 0.40,
        'proposal_sent': 0.60,
        'negotiation': 0.80
      };

      let weightedValue = 0;
      let conservativeValue = 0;
      let optimisticValue = 0;

      pipeline.forEach(stage => {
        const weight = statusWeights[stage.status] || 0.25;
        const stageValue = stage.total_value || 0;

        weightedValue += stageValue * weight;
        conservativeValue += stageValue * weight * 0.7;
        optimisticValue += stageValue * weight * 1.3;
      });

      // Revenus moyens mensuels historiques
      db.get(`
        SELECT
          AVG(monthly_revenue) as avg_monthly
        FROM (
          SELECT
            strftime('%Y-%m', r.date) as month,
            SUM(r.amount) as monthly_revenue
          FROM revenues r
          WHERE r.date >= date('now', '-12 months')
          GROUP BY month
        )
      `, [], (err, avgRevenue) => {
        if (err) {
          console.error('[SalesPipeline] Erreur lors du calcul des revenus moyens:', err);
          return res.status(500).json({ message: 'Erreur serveur' });
        }

        const monthlyAvg = avgRevenue?.avg_monthly || 0;

        res.json({
          forecast: {
            period_months: parseInt(months),
            weighted_forecast: Math.round(weightedValue),
            conservative_forecast: Math.round(conservativeValue),
            optimistic_forecast: Math.round(optimisticValue),
            monthly_avg_historical: Math.round(monthlyAvg),
            projected_monthly: Math.round(weightedValue / parseInt(months))
          },
          assumptions: {
            historical_win_rate: Math.round(winRate * 100),
            avg_conversion_days: Math.round(historicalData.avg_conversion_days || 30),
            active_opportunities: pipeline.reduce((sum, s) => sum + s.count, 0)
          },
          pipeline_breakdown: pipeline.map(stage => ({
            status: stage.status,
            count: stage.count,
            total_value: Math.round(stage.total_value),
            weight: statusWeights[stage.status] || 0.25,
            weighted_value: Math.round(stage.total_value * (statusWeights[stage.status] || 0.25))
          }))
        });
      });
    });
  });
});

/**
 * GET /api/sales-pipeline/velocity
 * Calcule la vélocité des ventes (temps moyen de conversion)
 */
router.get('/velocity', (req, res) => {
  const db = req.app.locals.db;

  const query = `
    SELECT
      l.status,
      COUNT(l.id) as count,
      AVG(CAST((julianday('now') - julianday(l.created_at)) AS REAL)) as avg_age_days,
      AVG(CASE WHEN l.converted_at IS NOT NULL THEN
        CAST((julianday(l.converted_at) - julianday(l.created_at)) AS REAL)
      END) as avg_conversion_days,
      MIN(CASE WHEN l.converted_at IS NOT NULL THEN
        CAST((julianday(l.converted_at) - julianday(l.created_at)) AS REAL)
      END) as fastest_conversion,
      MAX(CASE WHEN l.converted_at IS NOT NULL THEN
        CAST((julianday(l.converted_at) - julianday(l.created_at)) AS REAL)
      END) as slowest_conversion
    FROM leads l
    WHERE l.created_at >= date('now', '-12 months')
    GROUP BY l.status
  `;

  db.all(query, [], (err, velocityData) => {
    if (err) {
      console.error('[SalesPipeline] Erreur lors du calcul de la vélocité:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    // Vélocité globale
    db.get(`
      SELECT
        AVG(CAST((julianday(converted_at) - julianday(created_at)) AS REAL)) as overall_avg,
        COUNT(*) as converted_count
      FROM leads
      WHERE converted_at IS NOT NULL
        AND created_at >= date('now', '-12 months')
    `, [], (err, overall) => {
      if (err) {
        console.error('[SalesPipeline] Erreur lors du calcul de la vélocité globale:', err);
        return res.status(500).json({ message: 'Erreur serveur' });
      }

      res.json({
        by_status: velocityData.map(v => ({
          status: v.status,
          count: v.count,
          avg_age_days: Math.round(v.avg_age_days || 0),
          avg_conversion_days: Math.round(v.avg_conversion_days || 0),
          fastest_conversion: Math.round(v.fastest_conversion || 0),
          slowest_conversion: Math.round(v.slowest_conversion || 0)
        })),
        overall: {
          avg_conversion_days: Math.round(overall?.overall_avg || 0),
          converted_count: overall?.converted_count || 0,
          avg_conversion_weeks: Math.round((overall?.overall_avg || 0) / 7 * 10) / 10
        }
      });
    });
  });
});

/**
 * GET /api/sales-pipeline/sources
 * Performance des leads par source d'acquisition
 */
router.get('/sources', (req, res) => {
  const db = req.app.locals.db;

  const query = `
    SELECT
      l.source,
      COUNT(l.id) as total_leads,
      COUNT(CASE WHEN l.status = 'won' THEN 1 END) as won_count,
      COUNT(CASE WHEN l.status = 'lost' THEN 1 END) as lost_count,
      COUNT(CASE WHEN l.status NOT IN ('won', 'lost', 'archived') THEN 1 END) as active_count,
      SUM(COALESCE(p.amount, 0)) as total_revenue,
      AVG(COALESCE(p.amount, 0)) as avg_deal_size,
      AVG(CASE WHEN l.converted_at IS NOT NULL THEN
        CAST((julianday(l.converted_at) - julianday(l.created_at)) AS REAL)
      END) as avg_conversion_days
    FROM leads l
    LEFT JOIN projects p ON l.converted_to_project_id = p.id
    WHERE l.source IS NOT NULL
      AND l.created_at >= date('now', '-12 months')
    GROUP BY l.source
    ORDER BY total_leads DESC
  `;

  db.all(query, [], (err, sources) => {
    if (err) {
      console.error('[SalesPipeline] Erreur lors de l\'analyse des sources:', err);
      return res.status(500).json({ message: 'Erreur serveur' });
    }

    const totalLeads = sources.reduce((sum, s) => sum + s.total_leads, 0);

    res.json({
      sources: sources.map(source => {
        const closedCount = source.won_count + source.lost_count;
        const winRate = closedCount > 0 ? Math.round((source.won_count / closedCount) * 100) : 0;
        const conversionRate = source.total_leads > 0
          ? Math.round((source.won_count / source.total_leads) * 100)
          : 0;

        return {
          source: source.source,
          total_leads: source.total_leads,
          percentage_of_total: Math.round((source.total_leads / totalLeads) * 100),
          won_count: source.won_count,
          lost_count: source.lost_count,
          active_count: source.active_count,
          win_rate: winRate,
          conversion_rate: conversionRate,
          total_revenue: Math.round(source.total_revenue),
          avg_deal_size: Math.round(source.avg_deal_size),
          avg_conversion_days: Math.round(source.avg_conversion_days || 0),
          roi_score: Math.round((winRate * source.avg_deal_size) / 1000) // Score simplifié
        };
      }).sort((a, b) => b.roi_score - a.roi_score),
      summary: {
        total_sources: sources.length,
        total_leads: totalLeads,
        best_source: sources.length > 0
          ? sources.reduce((best, curr) =>
              (curr.won_count > best.won_count ? curr : best)
            ).source
          : null
      }
    });
  });
});

module.exports = router;
