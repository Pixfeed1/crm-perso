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
         to_char(s.first_billing_date, 'YYYY-MM-DD') AS first_billing_date,
         s.link_sent_at, s.link_sent_to,
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

// Date du premier prélèvement : 'YYYY-MM-DD' ou null. undefined = champ absent (non modifié).
function parseFirstBillingDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const str = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str) || isNaN(new Date(`${str}T00:00:00Z`).getTime())) {
    const err = new Error('Date du premier prélèvement invalide (format attendu AAAA-MM-JJ).');
    err.statusCode = 400;
    throw err;
  }
  return str;
}

// Libellé lisible du premier prélèvement pour l'email et le PDF de conditions.
function firstBillingLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
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
      client_id, label, amount_eur, interval, interval_count, first_billing_date,
      cond_intro = null, cond_included = null, cond_excluded = null, cond_modalites = null
    } = req.body || {};

    if (!client_id || !label || !amount_eur) {
      return res.status(400).json({ message: 'Client, libellé et montant sont obligatoires.' });
    }

    let firstBilling = null;
    try {
      firstBilling = parseFirstBillingDate(first_billing_date) ?? null;
    } catch (e) {
      return res.status(400).json({ message: e.message });
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
                                    cond_intro, cond_included, cond_excluded, cond_modalites, first_billing_date)
         VALUES ($1, $2, $3, $4, $5, 'none', $6, $7, $8, $9, $10) RETURNING id`,
        [client_id, label, amount, billingInterval, intervalCount, cond_intro, cond_included, cond_excluded, cond_modalites, firstBilling]
      );
      const created = await db.pool.query(`${SELECT_WITH_CLIENT} WHERE s.id = $1`, [rows[0].id]);
      res.status(201).json(created.rows[0]);
    } catch (error) {
      console.error('[Subscription] Erreur création abonnement:', error);
      res.status(500).json({ message: "Erreur lors de la création de l'abonnement" });
    }
  },

  /**
   * PUT /api/subscriptions/:id - modifie un abonnement.
   * Garde-fou Stripe : si le prélèvement est ACTIF, on autorise client/libellé/conditions
   * mais PAS le montant/périodicité (sinon l'affichage/PDF différerait du vrai prélèvement).
   */
  updateSubscription: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const {
      client_id, label, amount_eur, interval, interval_count, first_billing_date,
      cond_intro, cond_included, cond_excluded, cond_modalites
    } = req.body || {};

    if (!client_id || !label) {
      return res.status(400).json({ message: 'Client et libellé sont obligatoires.' });
    }
    let firstBilling;
    try {
      firstBilling = parseFirstBillingDate(first_billing_date);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
    try {
      const cur = await db.pool.query('SELECT billing_status FROM subscriptions WHERE id = $1', [id]);
      if (cur.rows.length === 0) {
        return res.status(404).json({ message: 'Abonnement introuvable.' });
      }
      const billingActive = cur.rows[0].billing_status === 'active';

      const fields = [
        'client_id = $1', 'label = $2',
        'cond_intro = $3', 'cond_included = $4', 'cond_excluded = $5', 'cond_modalites = $6',
        'updated_at = NOW()'
      ];
      const params = [
        client_id, label,
        cond_intro ?? null, cond_included ?? null, cond_excluded ?? null, cond_modalites ?? null
      ];

      // Montant / périodicité : éditables UNIQUEMENT si Stripe n'est pas déjà actif.
      if (!billingActive) {
        if (amount_eur !== undefined) {
          const amount = Number(amount_eur);
          if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Le montant doit être supérieur à 0.' });
          }
          params.push(amount);
          fields.push(`amount_eur = $${params.length}`);
        }
        if (interval !== undefined) {
          params.push(interval === 'year' ? 'year' : 'month');
          fields.push(`billing_interval = $${params.length}`);
        }
        if (interval_count !== undefined) {
          params.push(Math.max(parseInt(interval_count, 10) || 1, 1));
          fields.push(`interval_count = $${params.length}`);
        }
        // Une fois Stripe actif, la date du premier prélèvement est passée : plus modifiable.
        if (firstBilling !== undefined) {
          params.push(firstBilling);
          fields.push(`first_billing_date = $${params.length}`);
        }
      }

      params.push(id);
      await db.pool.query(`UPDATE subscriptions SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
      const updated = await db.pool.query(`${SELECT_WITH_CLIENT} WHERE s.id = $1`, [id]);
      res.json({ ...updated.rows[0], amount_locked: billingActive });
    } catch (error) {
      console.error('[Subscription] Erreur mise à jour:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour' });
    }
  },

  /**
   * GET /api/subscriptions/:id/preview - aperçu (lecture seule) de ce que recevra le client :
   * destinataire, sujet + corps de l'email, et le PDF de conditions rendu en HTML.
   * Ne crée AUCUNE session Stripe (utilise le lien existant si présent, sinon un placeholder).
   */
  previewSubscription: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const message = (req.query && req.query.message) || '';
    const includeConditions = !(req.query && (req.query.includeConditions === 'false' || req.query.includeConditions === false));
    try {
      const { rows } = await db.pool.query(
        `SELECT s.label, s.amount_eur, s.billing_interval, s.interval_count, s.billing_pay_token,
                s.cond_intro, s.cond_included, s.cond_excluded, s.cond_modalites,
                to_char(s.first_billing_date, 'YYYY-MM-DD') AS first_billing_date,
                c.name AS client_name, c.email AS client_email
         FROM subscriptions s LEFT JOIN crm_clients c ON s.client_id = c.id
         WHERE s.id = $1`,
        [id]
      );
      const sub = rows[0];
      if (!sub) {
        return res.status(404).json({ message: 'Abonnement introuvable.' });
      }
      const url = sub.billing_pay_token
        ? `https://pay.pixfeed.net/${sub.billing_pay_token}`
        : 'https://pay.pixfeed.net/(lien généré à l’envoi)';

      const signature = await emailService.getSelectedSignature(db);
      const email = emailService.buildSubscriptionLinkEmail({
        clientName: sub.client_name, url, label: sub.label, signature, message,
        firstBilling: firstBillingLabel(sub.first_billing_date)
      });

      let conditionsHtml = null;
      if (includeConditions) {
        try {
          conditionsHtml = await conditionsService.renderConditionsHtml('abonnement', {
            label: sub.label,
            price: formatEur(sub.amount_eur),
            period: periodLabel(sub.billing_interval, sub.interval_count),
            first_billing: firstBillingLabel(sub.first_billing_date),
            date: new Date().toLocaleDateString('fr-FR'),
            client_name: sub.client_name || '',
            intro: sub.cond_intro || '',
            included: sub.cond_included || '',
            excluded: sub.cond_excluded || '',
            modalites: sub.cond_modalites || ''
          });
        } catch (pdfErr) {
          conditionsHtml = null;
        }
      }

      res.json({
        recipient: sub.client_email || null,
        hasEmail: !!sub.client_email,
        subject: email.subject,
        emailHtml: email.html,
        conditionsHtml
      });
    } catch (error) {
      console.error('[Subscription] Erreur prévisualisation:', error);
      res.status(500).json({ message: 'Erreur lors de la prévisualisation' });
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
                to_char(s.first_billing_date, 'YYYY-MM-DD') AS first_billing_date,
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
            first_billing: firstBillingLabel(sub.first_billing_date),
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
        firstBilling: firstBillingLabel(sub.first_billing_date),
        signature,
        message,
        attachments
      });
      // Trace de l'envoi (affichée sur la carte).
      await db.pool.query(
        'UPDATE subscriptions SET link_sent_at = NOW(), link_sent_to = $1, updated_at = NOW() WHERE id = $2',
        [sub.client_email, id]
      );
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
