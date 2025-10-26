const poleEmploiService = require('../services/poleEmploiService');
const googleJobsService = require('../services/googleJobsService');

/**
 * Controller pour les fonctionnalités de prospection
 * Intègre : France Travail (Pôle Emploi), Google Jobs, Data.gouv, BOAMP, etc.
 */

/**
 * Test de connexion à Pôle Emploi
 * Utile pour vérifier que les credentials sont valides
 */
exports.testPoleEmploi = async (req, res) => {
  try {
    const isConnected = await poleEmploiService.testConnection();

    if (isConnected) {
      res.json({
        success: true,
        message: 'Connexion à Pôle Emploi réussie',
        configured: poleEmploiService.isConfigured()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Impossible de se connecter à Pôle Emploi',
        configured: poleEmploiService.isConfigured()
      });
    }
  } catch (error) {
    console.error('[Prospection] Erreur test Pôle Emploi:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      configured: poleEmploiService.isConfigured()
    });
  }
};

/**
 * Test de connexion à Google Jobs
 * Utile pour vérifier que la clé API JSearch est valide
 */
exports.testGoogleJobs = async (req, res) => {
  try {
    const isConnected = await googleJobsService.testConnection();

    if (isConnected) {
      res.json({
        success: true,
        message: 'Connexion à Google Jobs réussie',
        configured: googleJobsService.isConfigured()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Impossible de se connecter à Google Jobs',
        configured: googleJobsService.isConfigured()
      });
    }
  } catch (error) {
    console.error('[Prospection] Erreur test Google Jobs:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      configured: googleJobsService.isConfigured()
    });
  }
};

/**
 * Recherche d'opportunités via Pôle Emploi
 *
 * @route GET /api/prospection/pole-emploi/search
 * @query keywords - Mots-clés de recherche (ex: "refonte site", "développeur")
 * @query department - Code département (optionnel, ex: "75")
 * @query commune - Code INSEE commune (optionnel)
 * @query distance - Distance en km autour de la commune (défaut: 10)
 * @query typeContrat - Type de contrat: CDI, CDD, etc. (optionnel)
 * @query experience - Niveau: D (débutant), E (expérimenté), S (senior) (optionnel)
 */
exports.searchPoleEmploi = async (req, res) => {
  try {
    const { keywords, department, commune, distance, typeContrat, experience } = req.query;

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre "keywords" est requis'
      });
    }

    console.log(`[Prospection] Recherche Pôle Emploi: "${keywords}"`);

    // Construire les options de recherche
    const searchOptions = {};

    if (department) {
      searchOptions.departement = department;
    }

    if (commune) {
      searchOptions.commune = commune;
      searchOptions.distance = distance || 10;
    }

    if (typeContrat) {
      searchOptions.typeContrat = typeContrat;
    }

    if (experience) {
      searchOptions.experience = experience;
    }

    // Recherche via Pôle Emploi
    const opportunities = await poleEmploiService.searchOpportunities(keywords, searchOptions);

    res.json({
      success: true,
      source: 'pole-emploi',
      total: opportunities.length,
      opportunities: opportunities
    });

  } catch (error) {
    console.error('[Prospection] Erreur recherche Pôle Emploi:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Recherche d'opportunités multi-sources
 * (Pour l'instant uniquement Pôle Emploi, sera étendu avec Google Jobs, BOAMP, etc.)
 *
 * @route GET /api/prospection/search
 * @query keywords - Mots-clés de recherche
 * @query location - Localisation (département ou ville)
 * @query sources - Sources à interroger (séparées par virgules: pole-emploi,google-jobs,boamp)
 */
exports.searchOpportunities = async (req, res) => {
  try {
    const { keywords, location, sources } = req.query;

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre "keywords" est requis'
      });
    }

    console.log(`[Prospection] Recherche multi-sources: "${keywords}" (${location || 'France'})`);

    const requestedSources = sources ? sources.split(',') : ['pole-emploi'];
    const results = [];
    const errors = [];

    // Pôle Emploi
    if (requestedSources.includes('pole-emploi') && poleEmploiService.isConfigured()) {
      try {
        const searchOptions = {};

        // Si location est un code département (2 chiffres)
        if (location && /^\d{2}$/.test(location)) {
          searchOptions.departement = location;
        }
        // Si location est un code postal (5 chiffres), extraire le département
        else if (location && /^\d{5}$/.test(location)) {
          searchOptions.departement = location.substring(0, 2);
        }

        const opportunities = await poleEmploiService.searchOpportunities(keywords, searchOptions);

        results.push({
          source: 'pole-emploi',
          count: opportunities.length,
          opportunities: opportunities
        });

        console.log(`[Prospection] ✓ Pôle Emploi: ${opportunities.length} résultats`);

      } catch (error) {
        console.error('[Prospection] Erreur Pôle Emploi:', error);
        errors.push({
          source: 'pole-emploi',
          error: error.message
        });
      }
    }

    // Google Jobs
    if (requestedSources.includes('google-jobs') && googleJobsService.isConfigured()) {
      try {
        const searchOptions = {};

        // Construire la localisation pour Google Jobs
        if (location) {
          // Si c'est un code département ou postal français, ajouter "France"
          if (/^\d{2,5}$/.test(location)) {
            searchOptions.location = `France, ${location}`;
          } else {
            searchOptions.location = location;
          }
        }

        const opportunities = await googleJobsService.searchOpportunities(keywords, searchOptions);

        results.push({
          source: 'google-jobs',
          count: opportunities.length,
          opportunities: opportunities
        });

        console.log(`[Prospection] ✓ Google Jobs: ${opportunities.length} résultats`);

      } catch (error) {
        console.error('[Prospection] Erreur Google Jobs:', error);
        errors.push({
          source: 'google-jobs',
          error: error.message
        });
      }
    } else if (requestedSources.includes('google-jobs') && !googleJobsService.isConfigured()) {
      errors.push({
        source: 'google-jobs',
        error: 'Service Google Jobs non configuré. Ajoutez JSEARCH_API_KEY dans .env'
      });
    }

    // BOAMP (à implémenter)
    if (requestedSources.includes('boamp')) {
      errors.push({
        source: 'boamp',
        error: 'Service BOAMP pas encore implémenté'
      });
    }

    // Agréger tous les résultats
    const allOpportunities = results.flatMap(r => r.opportunities);

    // Dédoublonner par email et company_name+city
    const seen = new Map();
    const deduplicated = allOpportunities.filter(opp => {
      // Si email existe, l'utiliser comme clé
      if (opp.email) {
        const emailKey = opp.email.toLowerCase();
        if (seen.has(emailKey)) {
          return false;
        }
        seen.set(emailKey, true);
        return true;
      }

      // Sinon, utiliser company_name + city
      const key = `${(opp.company_name || '').toLowerCase()}-${(opp.city || '').toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.set(key, true);
      return true;
    });

    console.log(`[Prospection] Total: ${allOpportunities.length} opportunités, ${deduplicated.length} après dédoublonnage`);

    res.json({
      success: true,
      total: deduplicated.length,
      totalBeforeDedup: allOpportunities.length,
      opportunities: deduplicated,
      sources: results.map(r => ({ source: r.source, count: r.count })),
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('[Prospection] Erreur recherche multi-sources:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Récupère les détails d'une offre Pôle Emploi
 *
 * @route GET /api/prospection/pole-emploi/offer/:offerId
 * @params offerId - ID de l'offre Pôle Emploi
 */
exports.getPoleEmploiOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    if (!offerId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID de l\'offre est requis'
      });
    }

    console.log(`[Prospection] Récupération offre Pôle Emploi: ${offerId}`);

    const offer = await poleEmploiService.getOfferDetails(offerId);
    const lead = poleEmploiService.transformOfferToLead(offer);

    res.json({
      success: true,
      offer: offer,
      lead: lead
    });

  } catch (error) {
    console.error('[Prospection] Erreur récupération offre:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Importe une opportunité comme lead dans le CRM
 *
 * @route POST /api/prospection/import-lead
 * @body opportunity - Données de l'opportunité à importer
 */
exports.importOpportunityAsLead = async (req, res) => {
  try {
    const { opportunity } = req.body;

    if (!opportunity) {
      return res.status(400).json({
        success: false,
        message: 'Les données de l\'opportunité sont requises'
      });
    }

    // Vérifier que l'utilisateur est authentifié
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const db = req.db;

    // Vérifier si ce lead n'existe pas déjà
    let existingLead = null;

    if (opportunity.email) {
      existingLead = await new Promise((resolve, reject) => {
        db.get(
          'SELECT id, company_name FROM leads WHERE LOWER(email) = LOWER(?)',
          [opportunity.email],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
    }

    if (!existingLead && opportunity.company_name && opportunity.city) {
      existingLead = await new Promise((resolve, reject) => {
        db.get(
          'SELECT id, company_name FROM leads WHERE LOWER(company_name) = LOWER(?) AND LOWER(city) = LOWER(?)',
          [opportunity.company_name, opportunity.city],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
    }

    if (existingLead) {
      return res.status(409).json({
        success: false,
        message: 'Ce lead existe déjà dans le CRM',
        existingLead: existingLead
      });
    }

    // Créer le lead
    const leadData = {
      company_name: opportunity.company_name || 'Entreprise confidentielle',
      email: opportunity.email || null,
      phone: opportunity.phone || null,
      city: opportunity.city || null,
      postal_code: opportunity.postal_code || null,
      department: opportunity.department || null,
      country: opportunity.country || 'France',
      sector: opportunity.sector || null,
      website: opportunity.website || null,
      source: opportunity.source || 'prospection',
      status: opportunity.status || 'new',
      notes: opportunity.notes || '',
      user_id: userId
    };

    const leadId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO leads (
          company_name, email, phone, city, postal_code, department,
          country, sector, website, source, status, notes, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          leadData.company_name,
          leadData.email,
          leadData.phone,
          leadData.city,
          leadData.postal_code,
          leadData.department,
          leadData.country,
          leadData.sector,
          leadData.website,
          leadData.source,
          leadData.status,
          leadData.notes,
          leadData.user_id
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    console.log(`[Prospection] ✓ Lead créé: ${leadData.company_name} (ID: ${leadId})`);

    res.json({
      success: true,
      message: 'Lead créé avec succès',
      leadId: leadId,
      lead: { id: leadId, ...leadData }
    });

  } catch (error) {
    console.error('[Prospection] Erreur import lead:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
