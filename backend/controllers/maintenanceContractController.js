// backend/controllers/maintenanceContractController.js
const maintenanceContractModel = require('../models/maintenanceContractModel');
const maintenanceBillingService = require('../services/maintenanceBillingService');
const emailService = require('../services/emailService');
const conditionsService = require('../services/conditionsService');
const contratMaintenance = require('../services/contratMaintenance');

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

const formatEur = (amount) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(amount) || 0);

/**
 * Contrôleur pour la gestion des contrats de maintenance WordPress
 */
const maintenanceContractController = {
  /**
   * Récupérer tous les contrats de maintenance
   */
  getAllContracts: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const contracts = await maintenanceContractModel.getAllContracts(db);
      res.json(contracts);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la récupération des contrats:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer les statistiques des contrats
   */
  getStats: async (req, res) => {
    const db = req.app.locals.db;

    try {
      const stats = await maintenanceContractModel.getStats(db);
      res.json(stats);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la récupération des stats:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Récupérer un contrat spécifique avec ses interventions et rapports
   */
  getContractById: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const contract = await maintenanceContractModel.getContractById(db, id);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la récupération du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Créer un nouveau contrat de maintenance
   */
  createContract: async (req, res) => {
    const db = req.app.locals.db;
    const {
      client_id, site_name, site_url, contract_start_date, monthly_amount, plan, report_frequency, billing_day,
      status, wordpress_version, php_version, hosting_provider, admin_url,
      pagespeed_mobile, pagespeed_desktop, plugins_count, notes
    } = req.body;

    if (!site_name) {
      return res.status(400).json({ message: 'Le nom du site est requis' });
    }

    try {
      const contract = await maintenanceContractModel.createContract(db, {
        client_id, site_name, site_url, contract_start_date, monthly_amount, plan, report_frequency, billing_day,
        status, wordpress_version, php_version, hosting_provider, admin_url,
        pagespeed_mobile, pagespeed_desktop, plugins_count, notes
      });

      res.status(201).json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la création du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour un contrat de maintenance
   */
  updateContract: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const updateData = req.body;

    try {
      const contract = await maintenanceContractModel.updateContract(db, id, updateData);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la mise à jour du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Mettre à jour les scores PageSpeed d'un contrat
   */
  updatePageSpeed: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { mobile, desktop } = req.body;

    if (mobile === undefined || desktop === undefined) {
      return res.status(400).json({ message: 'Les scores mobile et desktop sont requis' });
    }

    try {
      const contract = await maintenanceContractModel.updatePageSpeed(db, id, mobile, desktop);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.json(contract);
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la mise à jour PageSpeed:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Supprimer un contrat de maintenance
   */
  deleteContract: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const contract = await maintenanceContractModel.deleteContract(db, id);

      if (!contract) {
        return res.status(404).json({ message: 'Contrat non trouvé' });
      }

      res.status(204).send();
    } catch (error) {
      console.error('[MaintenanceContract] Erreur lors de la suppression du contrat:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * Crée une Checkout Session Stripe (prélèvement SEPA mensuel) pour le contrat
   * et renvoie l'URL de paiement.
   */
  createBillingCheckout: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      // Lien COURT sur notre domaine. La session Stripe est créée au clic via /pay/:token.
      const { url } = await maintenanceBillingService.ensurePayLink(db, id);
      res.json({ url });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[MaintenanceContract] Erreur création lien de paiement:', error);
      }
      res.status(status).json({ message: error.message || 'Erreur lors de la création du prélèvement' });
    }
  },

  /**
   * Génère le lien COURT (/pay/:token) et l'envoie au client par email.
   * La session Stripe n'est créée qu'au clic du client sur le lien.
   */
  sendBillingLink: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    const { message = '', includeConditions = true, attachments: clientAttachments } = req.body || {};

    try {
      const { url } = await maintenanceBillingService.ensurePayLink(db, id);

      // Récupérer les coordonnées + la formule (plan) et le montant pour les conditions
      const { rows } = await db.pool.query(
        `SELECT mc.plan, mc.site_url, mc.monthly_amount,
                c.name AS client_name, c.email AS client_email
         FROM maintenance_contracts mc
         LEFT JOIN crm_clients c ON mc.client_id = c.id
         WHERE mc.id = $1`,
        [id]
      );
      const contract = rows[0];
      if (!contract) {
        return res.status(404).json({ message: 'Contrat de maintenance introuvable.' });
      }
      if (!contract.client_email) {
        return res.status(400).json({ message: "Le client de ce contrat n'a pas d'adresse email." });
      }

      // Pièces jointes : conditions de la formule (auto) + éventuelles pièces ajoutées
      const attachments = parseClientAttachments(clientAttachments);
      if (includeConditions !== false) {
        const { type, label } = conditionsService.maintenanceConditions(contract.plan);
        try {
          const pdf = await conditionsService.renderConditionsPdf(type, {
            client_name: contract.client_name || '',
            site_url: contract.site_url || '',
            price: formatEur(contract.monthly_amount),
            date: new Date().toLocaleDateString('fr-FR')
          });
          attachments.push({
            filename: `Conditions_Maintenance_${label}.pdf`,
            content: pdf,
            contentType: 'application/pdf'
          });
        } catch (pdfErr) {
          console.error('[MaintenanceContract] Échec génération PDF conditions (lien envoyé sans conditions):', pdfErr.message);
        }
      }

      const signature = await emailService.getSelectedSignature(db);
      await emailService.sendMaintenanceBillingLink({
        to: contract.client_email,
        clientName: contract.client_name,
        url,
        signature,
        message,
        attachments
      });
      res.json({ success: true, sentTo: contract.client_email });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[MaintenanceContract] Erreur envoi lien prélèvement:', error);
      }
      res.status(status).json({ message: error.message || "Erreur lors de l'envoi du lien" });
    }
  },

  /**
   * Route PUBLIQUE (sans auth) : GET /pay/:token
   * Crée une session Checkout Stripe fraîche et redirige (302) vers session.url.
   */
  payRedirect: async (req, res) => {
    const db = req.app.locals.db;
    // token via /pay/:token (params.token) ou via la route racine hex (params[0])
    const token = req.params.token || req.params[0];

    try {
      const { url } = await maintenanceBillingService.createCheckoutByPayToken(db, token);
      return res.redirect(302, url);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status === 404) {
        return res.status(404).send('Lien de paiement invalide ou expiré.');
      }
      console.error('[MaintenanceContract] Erreur redirection lien de paiement:', error);
      return res.status(500).send('Une erreur est survenue lors de la préparation du paiement. Veuillez réessayer.');
    }
  },

  /**
   * Résilie l'abonnement Stripe du contrat (immédiat ou en fin de période).
   */
  cancelBilling: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const immediate = req.body && req.body.immediate === true;

    try {
      const result = await maintenanceBillingService.cancelSubscriptionForContract(db, id, { immediate });
      res.json({ success: true, ...result });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[MaintenanceContract] Erreur résiliation prélèvement:', error);
      }
      res.status(status).json({ message: error.message || 'Erreur lors de la résiliation' });
    }
  },

  /**
   * Réactive un abonnement dont la résiliation en fin de période était programmée.
   */
  resumeBilling: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
      const result = await maintenanceBillingService.resumeSubscriptionForContract(db, id);
      res.json({ success: true, ...result });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        console.error('[MaintenanceContract] Erreur réactivation prélèvement:', error);
      }
      res.status(status).json({ message: error.message || 'Erreur lors de la réactivation' });
    }
  }
};

// ─── Contrat PDF et conditions à télécharger ───────────────────────────────
// Les informations propres au contrat (raison sociale, représentant, devis…) sont enregistrées sur
// le contrat de maintenance ; celles du prestataire (forme juridique, mention TVA, tribunal) dans
// settings.contrat_prestataire, communes à tous les contrats.
const CHAMPS_CONTRAT = [...contratMaintenance.CHAMPS_CLIENT, ...contratMaintenance.CHAMPS_SERVICE, ...contratMaintenance.CHAMPS_DEVIS, 'date_signature'];

async function chargerPourContrat(db, id) {
  const { rows } = await db.pool.query(
    `SELECT mc.*, c.name AS client_name, c.email AS client_email, c.address AS client_address, c.siret AS client_siret, c.notes AS client_notes
     FROM maintenance_contracts mc LEFT JOIN crm_clients c ON mc.client_id = c.id WHERE mc.id = $1`, [id]);
  const contract = rows[0];
  if (!contract) throw Object.assign(new Error('Contrat de maintenance introuvable.'), { status: 404 });
  const client = { name: contract.client_name, address: contract.client_address, siret: contract.client_siret, notes: contract.client_notes };
  const company = (await db.pool.query('SELECT * FROM company_settings ORDER BY id LIMIT 1').catch(() => ({ rows: [] }))).rows[0] || {};
  const presta = (await db.pool.query("SELECT value FROM settings WHERE key = 'contrat_prestataire'").catch(() => ({ rows: [] }))).rows[0];
  const infos = { ...contratMaintenance.prefill(contract, client), ...(contract.contrat_infos || {}), ...((presta && presta.value) || {}) };
  return { contract, client, company, infos };
}

const nettoyer = (v) => String(v == null ? '' : v).trim().slice(0, 500);

Object.assign(maintenanceContractController, {
  // GET /:id/contrat -> champs préremplis (fiche client, puis valeurs déjà enregistrées)
  getContrat: async (req, res) => {
    try {
      const { contract, infos } = await chargerPourContrat(req.app.locals.db, req.params.id);
      res.json({ infos, formule: conditionsService.maintenanceConditions(contract.plan), enregistre: !!contract.contrat_infos });
    } catch (e) {
      if (!e.status) console.error('[MaintenanceContract] getContrat:', e.message);
      res.status(e.status || 500).json({ message: e.status ? e.message : 'Erreur serveur' });
    }
  },

  // PUT /:id/contrat { ...champs } -> enregistre les champs du contrat et ceux du prestataire
  saveContrat: async (req, res) => {
    const db = req.app.locals.db;
    const b = req.body || {};
    try {
      await chargerPourContrat(db, req.params.id);
      const infos = Object.fromEntries(CHAMPS_CONTRAT.filter((k) => b[k] !== undefined).map((k) => [k, nettoyer(b[k])]));
      await db.pool.query('UPDATE maintenance_contracts SET contrat_infos = COALESCE(contrat_infos, \'{}\'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1', [req.params.id, JSON.stringify(infos)]);
      const presta = Object.fromEntries(contratMaintenance.CHAMPS_PRESTATAIRE.filter((k) => b[k] !== undefined).map((k) => [k, nettoyer(b[k])]));
      if (Object.keys(presta).length) {
        await db.pool.query(
          `INSERT INTO settings (key, value, description) VALUES ('contrat_prestataire', $1::jsonb, 'Forme juridique, mention TVA et tribunal repris dans les contrats de maintenance')
           ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(presta)]);
      }
      const { infos: tout } = await chargerPourContrat(db, req.params.id);
      res.json({ infos: tout });
    } catch (e) {
      if (!e.status) console.error('[MaintenanceContract] saveContrat:', e.message);
      res.status(e.status || 500).json({ message: e.status ? e.message : 'Erreur serveur' });
    }
  },

  // GET /:id/contrat/pdf -> contrat complet rempli (téléchargement)
  downloadContrat: async (req, res) => {
    try {
      const { contract, company, infos } = await chargerPourContrat(req.app.locals.db, req.params.id);
      const pdf = await contratMaintenance.renderPdf(contract, infos, company);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${contratMaintenance.nomFichier(contract, infos)}"`);
      res.send(Buffer.from(pdf));
    } catch (e) {
      console.error('[MaintenanceContract] downloadContrat:', e.message);
      res.status(e.status || 500).json({ message: e.status ? e.message : 'Génération du contrat impossible' });
    }
  },

  // GET /:id/conditions/pdf -> conditions de la formule (même document que celui joint au lien de paiement)
  downloadConditions: async (req, res) => {
    try {
      const { contract } = await chargerPourContrat(req.app.locals.db, req.params.id);
      const { type, label } = conditionsService.maintenanceConditions(contract.plan);
      const pdf = await conditionsService.renderConditionsPdf(type, {
        client_name: contract.client_name || '', site_url: contract.site_url || '',
        price: formatEur(contract.monthly_amount), date: new Date().toLocaleDateString('fr-FR')
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Conditions_Maintenance_${label}.pdf"`);
      res.send(Buffer.from(pdf));
    } catch (e) {
      console.error('[MaintenanceContract] downloadConditions:', e.message);
      res.status(e.status || 500).json({ message: e.status ? e.message : 'Génération des conditions impossible' });
    }
  }
});

module.exports = maintenanceContractController;
