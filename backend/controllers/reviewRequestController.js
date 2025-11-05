// backend/controllers/reviewRequestController.js
const nodemailer = require('nodemailer');

/**
 * Contrôleur pour gérer les demandes d'avis clients
 */

// URLs des plateformes d'avis
const PLATFORM_URLS = {
  google: 'https://g.page/r/CS0zKDY9Gc7YEBE/review',
  facebook: 'https://www.facebook.com/Pixfeed',
  instagram: 'https://www.instagram.com/pixfeed05/'
};

/**
 * Template par défaut pour les demandes d'avis
 */
function getDefaultTemplate(platforms, clientName, contactName) {
  const platformNames = {
    google: 'Google',
    facebook: 'Facebook',
    instagram: 'Instagram'
  };

  const selectedPlatforms = platforms.map(p => platformNames[p] || p);
  const platformsList = selectedPlatforms.length > 1
    ? selectedPlatforms.slice(0, -1).join(', ') + ' et ' + selectedPlatforms[selectedPlatforms.length - 1]
    : selectedPlatforms[0];

  return {
    subject: `${contactName || clientName}, votre avis compte pour Pixfeed !`,
    body: `Bonjour ${contactName || clientName},

Merci d'avoir fait confiance à Pixfeed pour votre projet !

Votre satisfaction est notre priorité et votre avis nous aide à nous améliorer continuellement. Pourriez-vous prendre quelques instants pour partager votre expérience sur ${platformsList} ?

${platforms.includes('google') ? `
📍 Google My Business :
${PLATFORM_URLS.google}
` : ''}${platforms.includes('facebook') ? `
👍 Facebook :
${PLATFORM_URLS.facebook}
` : ''}${platforms.includes('instagram') ? `
📸 Instagram :
${PLATFORM_URLS.instagram}
` : ''}

Votre retour, qu'il soit positif ou constructif, nous est précieux et permet à d'autres clients de mieux nous connaître.

Merci d'avance pour votre temps !

Cordialement,
L'équipe Pixfeed`
  };
}

/**
 * Envoyer une demande d'avis
 */
exports.sendReviewRequest = async (req, res) => {
  const db = req.app.locals.db;

  try {
    const {
      client_id,
      contact_name,
      contact_email,
      platforms,
      custom_subject,
      custom_body
    } = req.body;

    // Validation
    if (!contact_email) {
      return res.status(400).json({
        error: 'L\'email du contact est requis'
      });
    }

    if (!platforms || platforms.length === 0) {
      return res.status(400).json({
        error: 'Au moins une plateforme doit être sélectionnée'
      });
    }

    // Récupérer les informations du client si client_id fourni
    let clientName = '';
    if (client_id) {
      const clientResult = await db.pool.query(
        'SELECT name FROM crm_clients WHERE id = $1',
        [client_id]
      );
      if (clientResult.rows.length > 0) {
        clientName = clientResult.rows[0].name;
      }
    }

    // Générer le template par défaut ou utiliser le personnalisé
    const template = custom_subject && custom_body
      ? { subject: custom_subject, body: custom_body }
      : getDefaultTemplate(platforms, clientName, contact_name);

    // Remplacer les variables dans le template
    let emailSubject = template.subject
      .replace(/{nom_client}/g, clientName)
      .replace(/{nom_contact}/g, contact_name || clientName)
      .replace(/{société}/g, clientName);

    let emailBody = template.body
      .replace(/{nom_client}/g, clientName)
      .replace(/{nom_contact}/g, contact_name || clientName)
      .replace(/{société}/g, clientName);

    // TODO: Configurer nodemailer avec les paramètres SMTP de l'utilisateur
    // Pour l'instant, on enregistre juste la demande dans la BDD

    // Enregistrer la demande dans la base de données
    const result = await db.pool.query(`
      INSERT INTO review_requests (
        client_id,
        contact_name,
        contact_email,
        platforms,
        email_subject,
        email_body,
        google_url,
        facebook_url,
        instagram_url,
        status,
        user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      client_id || null,
      contact_name,
      contact_email,
      platforms,
      emailSubject,
      emailBody,
      platforms.includes('google') ? PLATFORM_URLS.google : null,
      platforms.includes('facebook') ? PLATFORM_URLS.facebook : null,
      platforms.includes('instagram') ? PLATFORM_URLS.instagram : null,
      'pending', // On met en 'pending' au lieu de 'sent' car l'email n'est pas encore envoyé
      req.user?.id || null
    ]);

    res.status(201).json({
      success: true,
      message: 'Demande d\'avis enregistrée. L\'email sera envoyé prochainement.',
      data: result.rows[0],
      // Informations pour l'utilisateur
      info: {
        email_configured: false,
        note: 'Pour envoyer automatiquement les emails, configurez vos paramètres SMTP dans les Paramètres > Configuration emails'
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la demande d\'avis:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'envoi de la demande d\'avis',
      details: error.message
    });
  }
};

/**
 * Récupérer toutes les demandes d'avis
 */
exports.getAllReviewRequests = async (req, res) => {
  const db = req.app.locals.db;

  try {
    const result = await db.pool.query(`
      SELECT
        rr.*,
        c.name as client_name,
        c.email as client_email
      FROM review_requests rr
      LEFT JOIN crm_clients c ON rr.client_id = c.id
      ORDER BY rr.sent_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes d\'avis:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des demandes d\'avis',
      details: error.message
    });
  }
};

/**
 * Récupérer les demandes d'avis d'un client spécifique
 */
exports.getClientReviewRequests = async (req, res) => {
  const db = req.app.locals.db;
  const { clientId } = req.params;

  try {
    const result = await db.pool.query(
      'SELECT * FROM review_requests WHERE client_id = $1 ORDER BY sent_at DESC',
      [clientId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes d\'avis du client:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des demandes d\'avis',
      details: error.message
    });
  }
};

/**
 * Obtenir le template par défaut
 */
exports.getDefaultTemplate = async (req, res) => {
  try {
    const { platforms, client_name, contact_name } = req.query;
    const platformsArray = platforms ? platforms.split(',') : ['google'];

    const template = getDefaultTemplate(platformsArray, client_name, contact_name);

    res.json({
      template,
      platform_urls: PLATFORM_URLS
    });
  } catch (error) {
    console.error('Erreur lors de la génération du template:', error);
    res.status(500).json({
      error: 'Erreur lors de la génération du template',
      details: error.message
    });
  }
};

/**
 * Obtenir les statistiques des demandes d'avis
 */
exports.getReviewStats = async (req, res) => {
  const db = req.app.locals.db;

  try {
    const stats = await db.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked,
        COUNT(CASE WHEN status = 'reviewed' THEN 1 END) as reviewed,
        COUNT(CASE WHEN sent_at >= NOW() - INTERVAL '30 days' THEN 1 END) as last_30_days
      FROM review_requests
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des statistiques',
      details: error.message
    });
  }
};
