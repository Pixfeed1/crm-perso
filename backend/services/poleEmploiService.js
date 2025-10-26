const axios = require('axios');

/**
 * Service pour l'API Pôle Emploi
 * Documentation: https://pole-emploi.io/data/documentation
 *
 * Gère automatiquement:
 * - L'authentification OAuth2
 * - Le cache des tokens d'accès
 * - Le renouvellement automatique des tokens expirés
 */
class PoleEmploiService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.baseUrl = 'https://api.emploi-store.fr/partenaire';
    this.authUrl = 'https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=/partenaire';

    // Configuration depuis .env
    this.clientId = process.env.POLE_EMPLOI_CLIENT_ID;
    this.clientSecret = process.env.POLE_EMPLOI_CLIENT_SECRET;
    this.scope = process.env.POLE_EMPLOI_SCOPE || 'api_offresdemploiv2 o2dsoffre';
  }

  /**
   * Vérifie que les credentials sont configurés
   */
  isConfigured() {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Obtient un access token valide (réutilise le token en cache si valide)
   */
  async getAccessToken() {
    // Si le token existe et n'est pas expiré, le réutiliser
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > Date.now()) {
      console.log('[Pôle Emploi] Utilisation du token en cache');
      return this.accessToken;
    }

    console.log('[Pôle Emploi] Demande d\'un nouveau token...');

    if (!this.isConfigured()) {
      throw new Error('Credentials Pôle Emploi non configurés dans .env');
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('scope', this.scope);

      const response = await axios.post(this.authUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      // Le token expire généralement après 1499 secondes (~25 minutes)
      // On met une marge de sécurité de 60 secondes
      const expiresIn = (response.data.expires_in || 1499) - 60;
      this.tokenExpiry = Date.now() + (expiresIn * 1000);

      console.log(`[Pôle Emploi] ✓ Token obtenu (expire dans ${expiresIn}s)`);
      return this.accessToken;
    } catch (error) {
      console.error('[Pôle Emploi] Erreur lors de l\'obtention du token:', error.response?.data || error.message);
      throw new Error('Impossible d\'obtenir le token Pôle Emploi: ' + (error.response?.data?.error_description || error.message));
    }
  }

  /**
   * Effectue une requête API avec gestion automatique du token
   */
  async makeRequest(endpoint, params = {}) {
    const token = await this.getAccessToken();

    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params
      });

      return response.data;
    } catch (error) {
      // Si le token a expiré pendant la requête, réessayer une fois
      if (error.response?.status === 401) {
        console.log('[Pôle Emploi] Token expiré, renouvellement...');
        this.accessToken = null;
        this.tokenExpiry = null;

        const newToken = await this.getAccessToken();

        const retryResponse = await axios.get(`${this.baseUrl}${endpoint}`, {
          headers: {
            'Authorization': `Bearer ${newToken}`
          },
          params
        });

        return retryResponse.data;
      }

      throw error;
    }
  }

  /**
   * Recherche des offres d'emploi
   *
   * @param {Object} searchParams - Paramètres de recherche
   * @param {string} searchParams.keywords - Mots-clés (ex: "refonte site", "développeur web")
   * @param {string} searchParams.commune - Code INSEE de la commune (ex: "75056" pour Paris)
   * @param {string} searchParams.department - Code département (ex: "75", "69")
   * @param {string} searchParams.region - Code région
   * @param {number} searchParams.distance - Distance en km autour de la commune (défaut: 10)
   * @param {string} searchParams.typeContrat - Type de contrat: "CDI", "CDD", "MIS", "SAI", etc.
   * @param {string} searchParams.experience - Niveau d'expérience: "D" (débutant), "E" (expérimenté), "S" (senior)
   * @param {number} searchParams.range - Pagination: "0-149" (max 150 résultats par requête)
   * @returns {Promise<Object>} Résultats de recherche
   */
  async searchOffers(searchParams = {}) {
    if (!this.isConfigured()) {
      console.warn('[Pôle Emploi] Service non configuré, retour résultats vides');
      return { resultats: [], filtresPossibles: [] };
    }

    // Paramètres par défaut
    const params = {
      range: searchParams.range || '0-149',
      ...searchParams
    };

    // Nettoyer les paramètres vides
    Object.keys(params).forEach(key => {
      if (params[key] === undefined || params[key] === null || params[key] === '') {
        delete params[key];
      }
    });

    console.log('[Pôle Emploi] Recherche avec params:', params);

    try {
      const data = await this.makeRequest('/offresdemploi/v2/offres/search', params);

      console.log(`[Pôle Emploi] ✓ ${data.resultats?.length || 0} offres trouvées`);

      return {
        offers: data.resultats || [],
        total: data.resultats?.length || 0,
        filters: data.filtresPossibles || []
      };
    } catch (error) {
      console.error('[Pôle Emploi] Erreur lors de la recherche:', error.response?.data || error.message);
      throw new Error('Erreur lors de la recherche Pôle Emploi: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Récupère les détails complets d'une offre
   *
   * @param {string} offerId - ID de l'offre
   * @returns {Promise<Object>} Détails de l'offre
   */
  async getOfferDetails(offerId) {
    if (!this.isConfigured()) {
      throw new Error('Service Pôle Emploi non configuré');
    }

    console.log(`[Pôle Emploi] Récupération de l'offre ${offerId}...`);

    try {
      const data = await this.makeRequest(`/offresdemploi/v2/offres/${offerId}`);

      console.log(`[Pôle Emploi] ✓ Offre ${offerId} récupérée`);

      return data;
    } catch (error) {
      console.error(`[Pôle Emploi] Erreur lors de la récupération de l'offre ${offerId}:`, error.response?.data || error.message);
      throw new Error('Erreur lors de la récupération de l\'offre: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Transforme une offre Pôle Emploi en format CRM (lead potentiel)
   *
   * @param {Object} offer - Offre Pôle Emploi brute
   * @returns {Object} Lead formaté pour le CRM
   */
  transformOfferToLead(offer) {
    // Extraire les informations importantes
    const companyName = offer.entreprise?.nom || 'Entreprise confidentielle';
    const contactEmail = offer.contact?.courriel || null;
    const contactPhone = offer.contact?.telephone || null;

    // Localisation
    const location = offer.lieuTravail || {};
    const city = location.libelle || '';
    const postalCode = location.codePostal || '';
    const department = postalCode ? postalCode.substring(0, 2) : '';

    // Description du besoin
    const jobTitle = offer.intitule || '';
    const description = offer.description || '';
    const contract = offer.typeContrat || '';
    const experience = offer.experienceExige || '';
    const salary = offer.salaire?.libelle || '';

    // Compétences recherchées
    const skills = (offer.competences || []).map(c => c.libelle).join(', ');

    // Construire les notes avec toutes les infos utiles
    const notes = `
**Offre d'emploi détectée**
Poste: ${jobTitle}
Contrat: ${contract}
Expérience: ${experience}
${salary ? `Salaire: ${salary}` : ''}

**Besoins détectés:**
${description.substring(0, 500)}${description.length > 500 ? '...' : ''}

${skills ? `**Compétences recherchées:** ${skills}` : ''}

**Source:** Pôle Emploi (${offer.id})
**Date de publication:** ${offer.dateCreation || 'Non spécifiée'}
**URL:** https://candidat.pole-emploi.fr/offres/recherche/detail/${offer.id}
    `.trim();

    return {
      company_name: companyName,
      contact_firstname: null,
      contact_lastname: null,
      email: contactEmail,
      phone: contactPhone,
      city: city,
      postal_code: postalCode,
      department: department,
      country: 'France',
      sector: offer.secteurActivite || '',
      website: null,
      source: 'pole-emploi',
      status: 'new',
      notes: notes,

      // Métadonnées supplémentaires
      metadata: {
        offer_id: offer.id,
        job_title: jobTitle,
        contract_type: contract,
        experience_required: experience,
        salary: salary,
        skills: skills,
        publication_date: offer.dateCreation,
        url: `https://candidat.pole-emploi.fr/offres/recherche/detail/${offer.id}`
      }
    };
  }

  /**
   * Recherche d'opportunités business basées sur des mots-clés
   * Retourne directement des leads formatés pour le CRM
   *
   * @param {string} keywords - Mots-clés de recherche (ex: "refonte site", "développeur")
   * @param {Object} options - Options de recherche
   * @returns {Promise<Array>} Liste de leads potentiels
   */
  async searchOpportunities(keywords, options = {}) {
    const searchParams = {
      motsCles: keywords,
      ...options
    };

    const { offers } = await this.searchOffers(searchParams);

    // Transformer les offres en leads
    const leads = offers.map(offer => this.transformOfferToLead(offer));

    console.log(`[Pôle Emploi] ${leads.length} opportunités détectées pour "${keywords}"`);

    return leads;
  }

  /**
   * Recherche par département avec mots-clés
   *
   * @param {string} keywords - Mots-clés
   * @param {string} department - Code département (ex: "75", "69")
   * @returns {Promise<Array>} Liste de leads
   */
  async searchByDepartment(keywords, department) {
    return this.searchOpportunities(keywords, { departement: department });
  }

  /**
   * Recherche par commune avec mots-clés
   *
   * @param {string} keywords - Mots-clés
   * @param {string} communeCode - Code INSEE de la commune
   * @param {number} distance - Rayon en km (défaut: 10)
   * @returns {Promise<Array>} Liste de leads
   */
  async searchByCommune(keywords, communeCode, distance = 10) {
    return this.searchOpportunities(keywords, {
      commune: communeCode,
      distance: distance
    });
  }

  /**
   * Test de connexion à l'API
   * Utile pour vérifier que les credentials sont valides
   *
   * @returns {Promise<boolean>} true si la connexion réussit
   */
  async testConnection() {
    if (!this.isConfigured()) {
      console.error('[Pôle Emploi] Credentials non configurés');
      return false;
    }

    try {
      await this.getAccessToken();
      console.log('[Pôle Emploi] ✓ Connexion réussie');
      return true;
    } catch (error) {
      console.error('[Pôle Emploi] ✗ Échec de connexion:', error.message);
      return false;
    }
  }
}

// Export singleton
module.exports = new PoleEmploiService();
