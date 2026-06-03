const poleEmploiService = require('../services/poleEmploiService');
const googleJobsService = require('../services/googleJobsService');
const sireneService = require('../services/sireneService');
const pappersService = require('../services/pappersService');

/**
 * Controller pour les fonctionnalités de prospection
 * Intègre : France Travail (Pôle Emploi), Google Jobs, SIRENE (INSEE), Pappers, Data.gouv, BOAMP, etc.
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
 *
 * @route GET /api/prospection/search
 * @query keywords - Mots-clés de recherche
 * @query location - Localisation (département ou ville)
 * @query sources - Sources à interroger (séparées par virgules: pole-emploi,google-jobs,boamp)
 * @query contractType - Type de contrat (CDI,CDD,MIS,SAI,FRA,LIB) - séparés par virgules
 * @query experience - Niveau d'expérience (D=débutant,E=expérimenté,S=senior)
 * @query datePosted - Date de publication (all,today,3days,week,month) - pour Google Jobs
 * @query minSalary - Salaire minimum (en euros annuels)
 * @query maxSalary - Salaire maximum (en euros annuels)
 */
exports.searchOpportunities = async (req, res) => {
  try {
    const { keywords, location, sources, contractType, experience, datePosted, minSalary, maxSalary } = req.query;

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre "keywords" est requis'
      });
    }

    console.log(`[Prospection] Recherche multi-sources: "${keywords}" (${location || 'France'})`);
    if (contractType || experience || datePosted || minSalary || maxSalary) {
      console.log(`[Prospection] Filtres: contrat=${contractType}, exp=${experience}, date=${datePosted}, salaire=${minSalary}-${maxSalary}`);
    }

    const requestedSources = sources ? sources.split(',') : ['pole-emploi'];
    const results = [];
    const errors = [];

    // Pôle Emploi
    if (requestedSources.includes('pole-emploi') && poleEmploiService.isConfigured()) {
      try {
        const searchOptions = {};

        // Localisation
        if (location && /^\d{2}$/.test(location)) {
          searchOptions.departement = location;
        }
        else if (location && /^\d{5}$/.test(location)) {
          searchOptions.departement = location.substring(0, 2);
        }

        // Filtres avancés
        if (contractType) {
          searchOptions.typeContrat = contractType;
        }
        if (experience) {
          searchOptions.experience = experience;
        }
        if (minSalary) {
          searchOptions.salaireMin = minSalary;
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

        // Filtre de date pour Google Jobs
        if (datePosted) {
          searchOptions.datePosted = datePosted; // all, today, 3days, week, month
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
          country, sector, website, source, status, notes, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

/**
 * Test de connexion à SIRENE (INSEE)
 * Utile pour vérifier que les credentials API INSEE sont valides
 */
exports.testSirene = async (req, res) => {
  try {
    const isConnected = await sireneService.testConnection();

    if (isConnected) {
      res.json({
        success: true,
        message: 'Connexion à l\'API SIRENE réussie',
        configured: sireneService.isConfigured()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Impossible de se connecter à l\'API SIRENE',
        configured: sireneService.isConfigured()
      });
    }
  } catch (error) {
    console.error('[Prospection] Erreur test SIRENE:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      configured: sireneService.isConfigured()
    });
  }
};

/**
 * Test de connexion à Pappers
 * Utile pour vérifier que le token API Pappers est valide
 */
exports.testPappers = async (req, res) => {
  try {
    const isConnected = await pappersService.testConnection();

    if (isConnected) {
      const creditsStatus = await pappersService.getCreditsStatus();
      res.json({
        success: true,
        message: 'Connexion à l\'API Pappers réussie',
        configured: pappersService.isConfigured(),
        credits: creditsStatus
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Impossible de se connecter à l\'API Pappers',
        configured: pappersService.isConfigured()
      });
    }
  } catch (error) {
    console.error('[Prospection] Erreur test Pappers:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      configured: pappersService.isConfigured()
    });
  }
};

/**
 * Obtient le statut des crédits Pappers
 *
 * @route GET /api/prospection/pappers/credits
 */
exports.getPappersCredits = async (req, res) => {
  try {
    const creditsStatus = await pappersService.getCreditsStatus();

    res.json({
      success: true,
      credits: creditsStatus
    });

  } catch (error) {
    console.error('[Prospection] Erreur récupération crédits Pappers:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Recherche d'entreprises via SIRENE (INSEE)
 *
 * @route GET /api/prospection/sirene/search
 * @query nafCode - Code NAF/APE (ex: "43.21A" pour plomberie)
 * @query city - Ville (ex: "Clichy")
 * @query postalCode - Code postal (ex: "92110")
 * @query department - Département (ex: "92", "2A", "971")
 * @query region - Région (ex: "11" pour Île-de-France)
 * @query companyName - Raison sociale (recherche partielle)
 * @query minEmployees - Effectif minimum
 * @query maxEmployees - Effectif maximum
 * @query limit - Nombre max de résultats (défaut: 100, max: 1000)
 */
exports.searchSirene = async (req, res) => {
  try {
    const {
      nafCode,
      city,
      postalCode,
      department,
      region,
      companyName,
      minEmployees,
      maxEmployees,
      limit
    } = req.query;

    // Validation: au moins un critère requis
    if (!nafCode && !city && !postalCode && !department && !region && !companyName) {
      return res.status(400).json({
        success: false,
        message: 'Au moins un critère de recherche est requis (nafCode, city, postalCode, department, region, ou companyName)'
      });
    }

    console.log(`[Prospection] Recherche SIRENE:`, req.query);

    const criteria = {
      nafCode,
      city,
      postalCode,
      department,
      region,
      companyName,
      minEmployees: minEmployees ? parseInt(minEmployees) : undefined,
      maxEmployees: maxEmployees ? parseInt(maxEmployees) : undefined,
      limit: limit ? parseInt(limit) : 100
    };

    const companies = await sireneService.searchCompanies(criteria);

    res.json({
      success: true,
      source: 'sirene',
      total: companies.length,
      companies: companies
    });

  } catch (error) {
    console.error('[Prospection] Erreur recherche SIRENE:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Enrichit une entreprise avec Pappers (consomme 1 crédit)
 *
 * @route POST /api/prospection/pappers/enrich
 * @body siren - Numéro SIREN (9 chiffres)
 */
exports.enrichWithPappers = async (req, res) => {
  try {
    const { siren } = req.body;

    if (!siren) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro SIREN est requis'
      });
    }

    // Validation format SIREN (9 chiffres)
    if (!/^\d{9}$/.test(siren)) {
      return res.status(400).json({
        success: false,
        message: 'Format SIREN invalide (doit être 9 chiffres)'
      });
    }

    console.log(`[Prospection] Enrichissement Pappers: SIREN ${siren}`);

    // Vérifier les crédits avant enrichissement
    const creditsBefore = await pappersService.getCreditsStatus();

    const enrichedData = await pappersService.enrichBySiren(siren);

    const creditsAfter = await pappersService.getCreditsStatus();

    res.json({
      success: true,
      data: enrichedData,
      credits: creditsAfter
    });

  } catch (error) {
    console.error('[Prospection] Erreur enrichissement Pappers:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Enrichit plusieurs entreprises avec Pappers
 *
 * @route POST /api/prospection/pappers/enrich-multiple
 * @body sirens - Array de numéros SIREN
 * @body maxEnrich - Nombre max à enrichir (optionnel, défaut: 10)
 */
exports.enrichMultipleWithPappers = async (req, res) => {
  try {
    const { sirens, maxEnrich } = req.body;

    if (!sirens || !Array.isArray(sirens)) {
      return res.status(400).json({
        success: false,
        message: 'Un tableau de numéros SIREN est requis'
      });
    }

    if (sirens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Le tableau de SIREN ne peut pas être vide'
      });
    }

    console.log(`[Prospection] Enrichissement multiple Pappers: ${sirens.length} entreprises`);

    const result = await pappersService.enrichMultiple(sirens, maxEnrich || 10);

    res.json({
      success: true,
      enriched: result.enriched,
      errors: result.errors,
      credits_remaining: result.credits_remaining,
      skipped: result.skipped
    });

  } catch (error) {
    console.error('[Prospection] Erreur enrichissement multiple Pappers:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
