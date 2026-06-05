// backend/controllers/subscriptionController.js
//
// Abonnements libres : facturation récurrente Stripe pour n'importe quel client/montant.
// Réutilise la plomberie Stripe partagée (maintenanceBillingService) — aucune duplication.

const maintenanceBillingService = require('../services/maintenanceBillingService');
const emailService = require('../services/emailService');
const conditionsService = require('../services/conditionsService');

// 'interval' est un mot réservé PostgreSQL -> colonne billing_interval, exposée 'interval'.
const SELECT_WITH_CLIENT = `
  SELECT s.id, s.client_id, s.label, s.amount_eur,
         s.billing_interval AS interval, s.interval_count,
         s.stripe_customer_id, s.stripe_subscription_id, s.billing_pay_token,
         s.billing_status, s.billing_cancel_at,
         s.cond_intro, s.cond_included, s.cond_excluded, s.cond_modalites, s.created_at,
         c.name AS client_name, c.email AS client_email
  FROM subscriptions s
  LEFT JOIN crm_clients c ON s.client_id = c.id
`;

const formatEur = (amount) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(amount) || 0);

// Libellé de période pour le PDF de conditions (ex. "/ mois", "/ an", "/ tous les 2 mois").
function periodLabel(interval, intervalCount) {
  const count = Math.max(parseInt(intervalCount, 10) || 1, 1);
  if (count === 1) return interval === 'year' ? '/ an' : '/ mois';
  return interval === 'year' ? `/ tous les ${count} ans` : `/ tous les ${count} mois`;
}

// Convertit les pièces jointes reçues du front (base64) en pièces jointes nodemailer.
function parseClientAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && a.filename && a.contentBase64)
    .map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, 'base64'),
      contentType: a.contentType || undefined
    }));
}

module.exports = {
  /**
   * GET /api/subscriptions - liste des abonnements (avec nom client).
   */
  getAllSubscriptions: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(`${SELECT_WITH_CLIENT} ORDER BY s.created_at DESC`);
      res.json(rows);
    } catch (error) {
      console.error('[Subscription] Erreur liste abonnements:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/subscriptions - crée un abonnement libre.
   */
  createSubscription: async (req, res) => {
    const db = req.app.locals.db;
    const {
      client_id, label, amount_eur, interval, interval_count,
      cond_intro = null, cond_included = null, cond_excluded = null, cond_modalites = null
    } = req.body || {};

    if (!client_id || !label || !amount_eur) {
      return res.status(400).json({ message: 'Client, libellé et montant sont obligatoires.' });
    }

    const amount = Number(amount_eur);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Le montant doit être supérieur à 0.' });
    }

    const billingInterval = interval === 'year' ? 'year' : 'month';
    const intervalCount = Math.max(parseInt(interval_count, 10) || 1, 1);

    try {
      const { rows } = await db.pool.query(
        `INSERT INTO subscriptions (client_id, label, amount_eur, billing_interval, interval_count, billing_status,
                                    cond_intro, cond_included, cond_excluded, cond_modalites)
         VALUES ($1, $2, $3, $4, $5, 'none', $6, $7, $8, $9) RETURNING id`,
        [client_id, label, amount, billingInterval, intervalCount, cond_intro, cond_included, cond_excluded, cond_modalites]
      );
      const created = await db.pool.query(`${SELECT_WITH_CLIENT} WHERE s.id = $1`, [rows[0].id]);
      res.status(201).json(created.rows[0]);
    } catch (error) {
      console.error('[Subscription] Erreur création abonnement:', error);
      res.status(500).json({ message: "Erreur lors de la création de l'abonnement" });
    }
  },

  /**
   * POST /api/subscriptions/:id/billing/checkout
   * Renvoie le lien COURT (pay.pixfeed.net/{token}). La session Stripe est créée au clic.
   */
  createBillingCheckout: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    try {
      const { url } = await maintenanceBillingService.ensureSubscriptionPayLink(db, id);
      res.json({ url });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[Subscription] Erreur création lien de paiement:', error);
      }
      res.status(status).json({ message: error.message || 'Erreur lors de la création du paiement' });
    }
  },

  /**
   * POST /api/subscriptions/:id/billing/send-link
   * Génère le lien court et l'envoie au client par email (signature des paramètres).
   */
  sendBillingLink: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { message = '', includeConditions = true, attachments: clientAttachments } = req.body || {};
    try {
      const { url } = await maintenanceBillingService.ensureSubscriptionPayLink(db, id);

      const { rows } = await db.pool.query(
        `SELECT s.label, s.amount_eur, s.billing_interval, s.interval_count,
                s.cond_intro, s.cond_included, s.cond_excluded, s.cond_modalites,
                c.name AS client_name, c.email AS client_email
         FROM subscriptions s LEFT JOIN crm_clients c ON s.client_id = c.id
         WHERE s.id = $1`,
        [id]
      );
      const sub = rows[0];
      if (!sub) {
        return res.status(404).json({ message: 'Abonnement introuvable.' });
      }
      if (!sub.client_email) {
        return res.status(400).json({ message: "Le client de cet abonnement n'a pas d'adresse email." });
      }

      // Pièces jointes : conditions de l'abonnement (auto) + éventuelles pièces ajoutées
      const attachments = parseClientAttachments(clientAttachments);
      if (includeConditions !== false) {
        try {
          const pdf = await conditionsService.renderConditionsPdf('abonnement', {
            label: sub.label,
            price: formatEur(sub.amount_eur),
            period: periodLabel(sub.billing_interval, sub.interval_count),
            date: new Date().toLocaleDateString('fr-FR'),
            client_name: sub.client_name || '',
            intro: sub.cond_intro || '',
            included: sub.cond_included || '',
            excluded: sub.cond_excluded || '',
            modalites: sub.cond_modalites || ''
          });
          attachments.push({
            filename: 'Conditions_Abonnement.pdf',
            content: pdf,
            contentType: 'application/pdf'
          });
        } catch (pdfErr) {
          console.error('[Subscription] Échec génération PDF conditions (lien envoyé sans conditions):', pdfErr.message);
        }
      }

      const signature = await emailService.getSelectedSignature(db);
      await emailService.sendSubscriptionLink({
        to: sub.client_email,
        clientName: sub.client_name,
        label: sub.label,
        url,
        signature,
        message,
        attachments
      });
      res.json({ success: true, sentTo: sub.client_email });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[Subscription] Erreur envoi lien:', error);
      }
      res.status(status).json({ message: error.message || "Erreur lors de l'envoi du lien" });
    }
  },

  /**
   * POST /api/subscriptions/:id/billing/cancel - résilie (body { immediate? }).
   */
  cancelBilling: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const immediate = req.body && req.body.immediate === true;
    try {
      const result = await maintenanceBillingService.cancelSubscription(db, id, { immediate });
      res.json({ success: true, ...result });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[Subscription] Erreur résiliation:', error);
      }
      res.status(status).json({ message: error.message || 'Erreur lors de la résiliation' });
    }
  },

  /**
   * POST /api/subscriptions/:id/billing/resume - réactive (annule la résiliation programmée).
   */
  resumeBilling: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    try {
      const result = await maintenanceBillingService.resumeSubscription(db, id);
      res.json({ success: true, ...result });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[Subscription] Erreur réactivation:', error);
      }
      res.status(status).json({ message: error.message || 'Erreur lors de la réactivation' });
    }
  },

  /**
   * DELETE /api/subscriptions/:id - supprime l'abonnement du CRM.
   */
  deleteSubscription: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    try {
      const result = await db.pool.query('DELETE FROM subscriptions WHERE id = $1 RETURNING id', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Abonnement introuvable.' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('[Subscription] Erreur suppression:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression' });
    }
  }
};
