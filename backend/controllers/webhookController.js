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
      plan_price
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
      notes || null,
      tags || null,
      status
    ]);

    const client = clientResult.rows[0];
    const clientId = client.id;

    console.log('[Webhook Maintenance] Client créé avec succès:', clientId, client.name);

    // 2. Créer le projet maintenance associé
    console.log('[Webhook Maintenance] Création du projet maintenance...');

    const projectName = `Maintenance WordPress - ${plan}`;
    const projectDescription = `Contrat de maintenance WordPress - Forfait ${plan}\nClient: ${name}\nPrix: ${plan_price}€/mois\nDébut: ${new Date(contract_start_date || Date.now()).toLocaleDateString('fr-FR')}\n\nTags: maintenance, wordpress, ${plan.toLowerCase()}, ${tags || ''}\n\nSource: Stripe (WordPress)`;

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
      'active', // Statut: actif
      contract_start_date || new Date().toISOString(),
      plan_price, // Budget mensuel
      0, // Progression initiale
      '#10B981' // Couleur verte pour maintenance
    ]);

    const project = projectResult.rows[0];
    const projectId = project.id;

    console.log('[Webhook Maintenance] Projet créé avec succès:', projectId, project.name);

    // 3. Retourner le succès avec les IDs
    return res.status(201).json({
      success: true,
      message: 'Client et projet maintenance créés avec succès',
      client_id: clientId,
      project_id: projectId,
      client: {
        id: clientId,
        name: client.name,
        email: client.email
      },
      project: {
        id: projectId,
        name: project.name
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

module.exports = {
  handleMaintenanceWebhook
};
