// backend/controllers/webhookController.js

/**
 * Contrôleur pour la gestion des webhooks externes
 * Route publique (sans authentification) pour permettre aux systèmes externes d'envoyer des données
 */

/**
 * Webhook pour la maintenance WordPress
 * Reçoit les données de paiement Stripe via WordPress et crée automatiquement :
 * - Un client dans crm_clients
 * - Un projet maintenance associé dans projects
 *
 * @route POST /api/webhooks/maintenance
 * @access Public (pas d'authentification)
 */
const handleMaintenanceWebhook = async (req, res) => {
  const db = req.app.locals.db;

  console.log('[Webhook Maintenance] Réception des données:', JSON.stringify(req.body, null, 2));

  try {
    const {
      name,
      email,
      phone,
      company,
      source = 'stripe_maintenance_wordpress',
      notes,
      tags,
      status = 'active',
      lifetime_value = 0,
      contract_start_date,
      type = 'company',
      plan,
      plan_price,
      // Nouvelles infos Stripe
      stripe_customer_id,
      stripe_subscription_id,
      stripe_payment_intent_id,
      stripe_invoice_id,
      next_billing_date,
      subscription_status,
      invoice_url
    } = req.body;

    // Validation des données requises
    if (!name) {
      console.error('[Webhook Maintenance] Erreur: nom manquant');
      return res.status(400).json({
        success: false,
        error: 'Le nom du client est requis'
      });
    }

    if (!plan || !plan_price) {
      console.error('[Webhook Maintenance] Erreur: plan ou prix manquant');
      return res.status(400).json({
        success: false,
        error: 'Le plan et le prix sont requis'
      });
    }

    // 1. Créer le client dans crm_clients
    console.log('[Webhook Maintenance] Création du client...');

    // Enrichir les notes avec les IDs Stripe
    const enrichedNotes = `${notes || ''}\n\n--- INFORMATIONS STRIPE ---\nClient ID: ${stripe_customer_id || 'N/A'}\nSubscription ID: ${stripe_subscription_id || 'N/A'}\nPayment Intent: ${stripe_payment_intent_id || 'N/A'}\nInvoice ID: ${stripe_invoice_id || 'N/A'}\nProchaine facturation: ${next_billing_date ? new Date(next_billing_date).toLocaleDateString('fr-FR') : 'N/A'}${invoice_url ? '\nLien facture: ' + invoice_url : ''}`.trim();

    const clientQuery = `
      INSERT INTO crm_clients (
        name, company, type, email, phone,
        source, contract_start_date, lifetime_value,
        notes, tags, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id, name, email
    `;

    const clientResult = await db.pool.query(clientQuery, [
      name,
      company || null,
      type,
      email || null,
      phone || null,
      source,
      contract_start_date || new Date().toISOString(),
      lifetime_value,
      enrichedNotes,
      tags || null,
      status
    ]);

    const client = clientResult.rows[0];
    const clientId = client.id;

    console.log('[Webhook Maintenance] Client créé avec succès:', clientId, client.name);

    // 2. Créer le projet maintenance associé
    console.log('[Webhook Maintenance] Création du projet maintenance...');

    const projectName = `Maintenance WordPress - ${plan}`;
    const projectDescription = `Contrat de maintenance WordPress - Forfait ${plan}\nClient: ${name}\nPrix: ${plan_price}€/mois\nDébut: ${new Date(contract_start_date || Date.now()).toLocaleDateString('fr-FR')}\n\nTags: maintenance, wordpress, ${plan.toLowerCase()}, ${tags || ''}\n\n--- STRIPE ---\nClient: ${stripe_customer_id || 'N/A'}\nAbonnement: ${stripe_subscription_id || 'N/A'}\nStatut: ${subscription_status || 'active'}\nProchaine facturation: ${next_billing_date ? new Date(next_billing_date).toLocaleDateString('fr-FR') : 'N/A'}${invoice_url ? '\nFacture: ' + invoice_url : ''}\n\nSource: Stripe (WordPress)`;

    const projectQuery = `
      INSERT INTO projects (
        name, type, description, client_id, status,
        start_date, budget, progress, color,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id, name
    `;

    const projectResult = await db.pool.query(projectQuery, [
      projectName,
      'maintenance', // Type de projet
      projectDescription,
      clientId,
      'en-cours', // Statut: en cours (compatible frontend)
      contract_start_date || new Date().toISOString(),
      plan_price, // Budget mensuel
      0, // Progression initiale
      '#10B981' // Couleur verte pour maintenance
    ]);

    const project = projectResult.rows[0];
    const projectId = project.id;

    console.log('[Webhook Maintenance] Projet créé avec succès:', projectId, project.name);

    // 3. Créer le premier paiement (revenue) dans la trésorerie
    console.log('[Webhook Maintenance] Création du premier paiement...');

    const revenueDescription = `Paiement initial - Abonnement maintenance ${plan}`;
    const revenueNotes = `Stripe Invoice: ${stripe_invoice_id || 'N/A'}\nPayment Intent: ${stripe_payment_intent_id || 'N/A'}\nProchain paiement: ${next_billing_date ? new Date(next_billing_date).toLocaleDateString('fr-FR') : 'N/A'}`;

    const revenueQuery = `
      INSERT INTO revenues (
        amount, date, description, project_id, client_id,
        type, status, payment_method, invoice_number, notes,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id
    `;

    const revenueResult = await db.pool.query(revenueQuery, [
      plan_price,
      new Date().toISOString(),
      revenueDescription,
      projectId,
      clientId,
      'subscription', // Type
      'paid', // Statut (déjà payé via Stripe)
      'stripe',
      stripe_invoice_id || null,
      revenueNotes
    ]);

    const revenueId = revenueResult.rows[0].id;

    console.log('[Webhook Maintenance] Paiement créé avec succès:', revenueId);

    // 4. Retourner le succès avec les IDs
    return res.status(201).json({
      success: true,
      message: 'Client, projet et paiement créés avec succès',
      client_id: clientId,
      project_id: projectId,
      revenue_id: revenueId,
      client: {
        id: clientId,
        name: client.name,
        email: client.email
      },
      project: {
        id: projectId,
        name: project.name
      },
      revenue: {
        id: revenueId,
        amount: plan_price,
        status: 'paid'
      }
    });

  } catch (error) {
    console.error('[Webhook Maintenance] Erreur lors du traitement:', error);

    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du client et du projet',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Webhook pour les paiements mensuels récurrents
 * Appelé par WordPress après réception de invoice.payment_succeeded de Stripe
 * Crée un nouveau revenue dans la trésorerie
 *
 * @route POST /api/webhooks/stripe-payment
 * @access Public (pas d'authentification)
 */
const handleStripePayment = async (req, res) => {
  const db = req.app.locals.db;

  console.log('[Webhook Stripe Payment] Réception des données:', JSON.stringify(req.body, null, 2));

  try {
    const {
      stripe_customer_id,
      stripe_subscription_id,
      stripe_invoice_id,
      stripe_payment_intent_id,
      amount,
      plan,
      plan_price,
      next_billing_date,
      invoice_url,
      payment_date
    } = req.body;

    // Validation
    if (!stripe_subscription_id || !amount) {
      console.error('[Webhook Stripe Payment] Erreur: données manquantes');
      return res.status(400).json({
        success: false,
        error: 'subscription_id et amount sont requis'
      });
    }

    // 1. Trouver le projet maintenance correspondant via la description (qui contient l'ID subscription)
    console.log('[Webhook Stripe Payment] Recherche du projet...');

    const projectQuery = `
      SELECT p.id, p.name, p.client_id, p.budget
      FROM projects p
      WHERE p.type = 'maintenance'
        AND p.description LIKE $1
        AND p.status = 'en-cours'
      LIMIT 1
    `;

    const projectResult = await db.pool.query(projectQuery, [`%${stripe_subscription_id}%`]);

    if (projectResult.rows.length === 0) {
      console.error('[Webhook Stripe Payment] Projet non trouvé pour subscription:', stripe_subscription_id);
      return res.status(404).json({
        success: false,
        error: 'Projet maintenance non trouvé pour cet abonnement'
      });
    }

    const project = projectResult.rows[0];
    console.log('[Webhook Stripe Payment] Projet trouvé:', project.id, project.name);

    // 2. Créer le revenue (paiement mensuel)
    const revenueDescription = `Paiement mensuel - ${project.name}`;
    const revenueNotes = `Stripe Invoice: ${stripe_invoice_id || 'N/A'}\nPayment Intent: ${stripe_payment_intent_id || 'N/A'}\nProchain paiement: ${next_billing_date ? new Date(next_billing_date).toLocaleDateString('fr-FR') : 'N/A'}${invoice_url ? '\nFacture: ' + invoice_url : ''}`;

    const revenueQuery = `
      INSERT INTO revenues (
        amount, date, description, project_id, client_id,
        type, status, payment_method, invoice_number, notes,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id
    `;

    const revenueResult = await db.pool.query(revenueQuery, [
      amount || plan_price || project.budget,
      payment_date || new Date().toISOString(),
      revenueDescription,
      project.id,
      project.client_id,
      'subscription',
      'paid',
      'stripe',
      stripe_invoice_id || null,
      revenueNotes
    ]);

    const revenueId = revenueResult.rows[0].id;
    console.log('[Webhook Stripe Payment] Paiement créé:', revenueId);

    // 3. Mettre à jour la description du projet avec la nouvelle date de facturation
    if (next_billing_date) {
      await db.pool.query(
        `UPDATE projects SET updated_at = NOW() WHERE id = $1`,
        [project.id]
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Paiement mensuel enregistré avec succès',
      revenue_id: revenueId,
      project_id: project.id,
      amount: amount || plan_price || project.budget
    });

  } catch (error) {
    console.error('[Webhook Stripe Payment] Erreur:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement du paiement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Webhook pour les paiements échoués
 * Appelé par WordPress après réception de invoice.payment_failed de Stripe
 * Crée un revenue avec statut "failed" et peut déclencher des alertes
 *
 * @route POST /api/webhooks/stripe-payment-failed
 * @access Public (pas d'authentification)
 */
const handleStripePaymentFailed = async (req, res) => {
  const db = req.app.locals.db;

  console.log('[Webhook Stripe Payment Failed] Réception des données:', JSON.stringify(req.body, null, 2));

  try {
    const {
      stripe_customer_id,
      stripe_subscription_id,
      stripe_invoice_id,
      amount,
      plan,
      plan_price,
      failure_reason,
      next_retry_date
    } = req.body;

    // Validation
    if (!stripe_subscription_id) {
      console.error('[Webhook Stripe Payment Failed] Erreur: subscription_id manquant');
      return res.status(400).json({
        success: false,
        error: 'subscription_id est requis'
      });
    }

    // 1. Trouver le projet maintenance
    const projectQuery = `
      SELECT p.id, p.name, p.client_id, p.budget, c.name as client_name, c.email as client_email
      FROM projects p
      LEFT JOIN crm_clients c ON p.client_id = c.id
      WHERE p.type = 'maintenance'
        AND p.description LIKE $1
        AND p.status = 'en-cours'
      LIMIT 1
    `;

    const projectResult = await db.pool.query(projectQuery, [`%${stripe_subscription_id}%`]);

    if (projectResult.rows.length === 0) {
      console.error('[Webhook Stripe Payment Failed] Projet non trouvé');
      return res.status(404).json({
        success: false,
        error: 'Projet maintenance non trouvé'
      });
    }

    const project = projectResult.rows[0];
    console.log('[Webhook Stripe Payment Failed] Projet trouvé:', project.id, project.name);

    // 2. Créer un revenue avec statut "failed"
    const revenueDescription = `⚠️ ÉCHEC PAIEMENT - ${project.name}`;
    const revenueNotes = `Stripe Invoice: ${stripe_invoice_id || 'N/A'}\nRaison: ${failure_reason || 'Non spécifiée'}\nProchaine tentative: ${next_retry_date ? new Date(next_retry_date).toLocaleDateString('fr-FR') : 'N/A'}\nClient: ${project.client_name || 'N/A'}\nEmail: ${project.client_email || 'N/A'}`;

    const revenueQuery = `
      INSERT INTO revenues (
        amount, date, description, project_id, client_id,
        type, status, payment_method, invoice_number, notes,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id
    `;

    const revenueResult = await db.pool.query(revenueQuery, [
      amount || plan_price || project.budget,
      new Date().toISOString(),
      revenueDescription,
      project.id,
      project.client_id,
      'subscription',
      'failed', // Statut échec
      'stripe',
      stripe_invoice_id || null,
      revenueNotes
    ]);

    const revenueId = revenueResult.rows[0].id;
    console.log('[Webhook Stripe Payment Failed] Échec enregistré:', revenueId);

    // 3. Ajouter une note au client pour historique
    await db.pool.query(
      `UPDATE crm_clients
       SET notes = notes || $1, updated_at = NOW()
       WHERE id = $2`,
      [`\n\n⚠️ [${new Date().toLocaleDateString('fr-FR')}] Échec de paiement - ${failure_reason || 'Raison non spécifiée'}`, project.client_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Échec de paiement enregistré',
      revenue_id: revenueId,
      project_id: project.id,
      client_id: project.client_id,
      alert: true
    });

  } catch (error) {
    console.error('[Webhook Stripe Payment Failed] Erreur:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de l\'échec',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Webhook pour les annulations d'abonnement
 * Appelé par WordPress après réception de customer.subscription.deleted de Stripe
 * Met à jour le projet en "terminé" et le client en "inactif"
 *
 * @route POST /api/webhooks/stripe-cancel
 * @access Public (pas d'authentification)
 */
const handleStripeCancel = async (req, res) => {
  const db = req.app.locals.db;

  console.log('[Webhook Stripe Cancel] Réception des données:', JSON.stringify(req.body, null, 2));

  try {
    const {
      stripe_customer_id,
      stripe_subscription_id,
      cancellation_reason,
      canceled_at
    } = req.body;

    // Validation
    if (!stripe_subscription_id) {
      console.error('[Webhook Stripe Cancel] Erreur: subscription_id manquant');
      return res.status(400).json({
        success: false,
        error: 'subscription_id est requis'
      });
    }

    // 1. Trouver le projet maintenance
    const projectQuery = `
      SELECT p.id, p.name, p.client_id, c.name as client_name
      FROM projects p
      LEFT JOIN crm_clients c ON p.client_id = c.id
      WHERE p.type = 'maintenance'
        AND p.description LIKE $1
      LIMIT 1
    `;

    const projectResult = await db.pool.query(projectQuery, [`%${stripe_subscription_id}%`]);

    if (projectResult.rows.length === 0) {
      console.error('[Webhook Stripe Cancel] Projet non trouvé');
      return res.status(404).json({
        success: false,
        error: 'Projet maintenance non trouvé'
      });
    }

    const project = projectResult.rows[0];
    console.log('[Webhook Stripe Cancel] Projet trouvé:', project.id, project.name);

    // 2. Mettre à jour le projet : statut = "terminé" (compatible frontend)
    const cancelDate = canceled_at ? new Date(canceled_at) : new Date();
    const cancelNote = `\n\n--- RÉSILIATION ---\nDate: ${cancelDate.toLocaleDateString('fr-FR')}\nRaison: ${cancellation_reason || 'Non spécifiée'}`;

    await db.pool.query(
      `UPDATE projects
       SET status = 'terminé',
           end_date = $1,
           description = description || $2,
           updated_at = NOW()
       WHERE id = $3`,
      [cancelDate.toISOString(), cancelNote, project.id]
    );

    console.log('[Webhook Stripe Cancel] Projet terminé:', project.id);

    // 3. Mettre à jour le client : ajouter note de résiliation
    // On ne le passe pas en "inactif" automatiquement car il peut avoir d'autres projets
    await db.pool.query(
      `UPDATE crm_clients
       SET notes = notes || $1, updated_at = NOW()
       WHERE id = $2`,
      [`\n\n🔴 [${cancelDate.toLocaleDateString('fr-FR')}] Résiliation abonnement maintenance - ${cancellation_reason || 'Raison non spécifiée'}`, project.client_id]
    );

    console.log('[Webhook Stripe Cancel] Client mis à jour:', project.client_id);

    return res.status(200).json({
      success: true,
      message: 'Abonnement résilié avec succès',
      project_id: project.id,
      client_id: project.client_id,
      canceled_at: cancelDate.toISOString()
    });

  } catch (error) {
    console.error('[Webhook Stripe Cancel] Erreur:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la résiliation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  handleMaintenanceWebhook,
  handleStripePayment,
  handleStripePaymentFailed,
  handleStripeCancel
};
