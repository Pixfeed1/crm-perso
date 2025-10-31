// backend/services/googleJobsService.js
const axios = require('axios');

/**
 * Service pour l'intégration Google Jobs via JSearch API (RapidAPI)
 *
 * Alternative gratuite pour rechercher des offres d'emploi sur Google Jobs.
 *
 * Configuration requise dans .env :
 * - JSEARCH_API_KEY : Clé RapidAPI pour JSearch (optionnel)
 *
 * Pour obtenir une clé gratuite (500 requêtes/mois) :
 * 1. Aller sur https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 * 2. S'inscrire gratuitement
 * 3. S'abonner au plan gratuit (Basic - 500 requêtes/mois)
 * 4. Copier la clé API dans JSEARCH_API_KEY
 */

class GoogleJobsService {
  constructor() {
    this.apiKey = process.env.JSEARCH_API_KEY || '';
    this.baseUrl = 'https://jsearch.p.rapidapi.com';

    // Headers pour RapidAPI
    this.headers = {
      'X-RapidAPI-Key': this.apiKey,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
    };
  }

  /**
   * Vérifie si le service est configuré
   */
  isConfigured() {
    return this.apiKey !== '';
  }

  /**
   * Test de connexion à l'API JSearch
   */
  async testConnection() {
    if (!this.isConfigured()) {
      console.log('[Google Jobs] API non configurée (JSEARCH_API_KEY manquant)');
      return false;
    }

    try {
      console.log('[Google Jobs] Test de connexion...');

      // Test simple avec une recherche basique
      const response = await axios.get(`${this.baseUrl}/search`, {
        headers: this.headers,
        params: {
          query: 'web developer',
          num_pages: 1
        },
        timeout: 10000
      });

      if (response.data && response.data.status === 'OK') {
        console.log('[Google Jobs] ✓ Connexion réussie');
        return true;
      }

      console.log('[Google Jobs] ✗ Réponse invalide');
      return false;

    } catch (error) {
      console.error('[Google Jobs] Erreur de connexion:', error.message);
      return false;
    }
  }

  /**
   * Recherche d'opportunités sur Google Jobs
   *
   * @param {string} keywords - Mots-clés de recherche
   * @param {object} options - Options de recherche
   * @returns {Promise<Array>} Liste d'opportunités
   */
  async searchOpportunities(keywords, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Google Jobs API non configurée. Ajoutez JSEARCH_API_KEY dans .env');
    }

    try {
      console.log(`[Google Jobs] Recherche: "${keywords}"`, options);

      // Construire la query
      let query = keywords;

      // Ajouter la localisation si fournie
      if (options.location) {
        query += ` in ${options.location}`;
      }

      // Paramètres de recherche
      const params = {
        query: query,
        page: 1,
        num_pages: 1,
        date_posted: options.datePosted || 'all' // all, today, 3days, week, month
      };

      // Si une localisation française est fournie
      if (options.location) {
        params.country = 'fr';
      }

      // Faire la requête
      const response = await axios.get(`${this.baseUrl}/search`, {
        headers: this.headers,
        params: params,
        timeout: 15000
      });

      if (!response.data || response.data.status !== 'OK') {
        console.log('[Google Jobs] Aucun résultat trouvé');
        return [];
      }

      const jobs = response.data.data || [];
      console.log(`[Google Jobs] ${jobs.length} offres trouvées`);

      // Transformer les résultats en format standardisé
      const opportunities = jobs.map(job => this.transformJobToOpportunity(job));

      return opportunities;

    } catch (error) {
      console.error('[Google Jobs] Erreur lors de la recherche:', error.message);

      if (error.response?.status === 429) {
        throw new Error('Limite de requêtes atteinte pour Google Jobs. Réessayez plus tard.');
      }

      if (error.response?.status === 403) {
        throw new Error('Clé API Google Jobs invalide. Vérifiez JSEARCH_API_KEY.');
      }

      throw new Error(`Erreur Google Jobs: ${error.message}`);
    }
  }

  /**
   * Transforme une offre Google Jobs en format opportunité standard
   */
  transformJobToOpportunity(job) {
    return {
      id: job.job_id,
      source: 'google-jobs',
      company_name: job.employer_name || 'Entreprise confidentielle',
      title: job.job_title || '',
      description: job.job_description || '',
      notes: this.buildNotes(job),
      city: this.extractCity(job.job_city, job.job_country),
      postal_code: job.job_postal_code || null,
      department: this.extractDepartment(job.job_postal_code),
      country: job.job_country || 'France',
      sector: this.extractSector(job.job_title),
      email: null, // Rarement disponible dans Google Jobs
      phone: null,
      website: job.employer_website || null,
      url: job.job_apply_link || job.job_google_link,
      contract_type: this.extractContractType(job.job_employment_type),
      salary: job.job_salary || null,
      posted_date: job.job_posted_at_datetime_utc || null,
      logo: job.employer_logo || null
    };
  }

  /**
   * Construit les notes à partir des détails de l'offre
   */
  buildNotes(job) {
    let notes = '';

    if (job.job_title) {
      notes += `Poste: ${job.job_title}\n\n`;
    }

    if (job.job_description) {
      // Limiter à 500 caractères
      const desc = job.job_description.substring(0, 500);
      notes += `${desc}${job.job_description.length > 500 ? '...' : ''}\n\n`;
    }

    if (job.job_highlights?.Qualifications) {
      notes += `Qualifications:\n${job.job_highlights.Qualifications.join('\n')}\n\n`;
    }

    if (job.job_highlights?.Responsibilities) {
      notes += `Responsabilités:\n${job.job_highlights.Responsibilities.join('\n')}\n\n`;
    }

    if (job.job_employment_type) {
      notes += `Type de contrat: ${job.job_employment_type}\n`;
    }

    if (job.job_salary) {
      notes += `Salaire: ${job.job_salary}\n`;
    }

    return notes.trim();
  }

  /**
   * Extrait la ville depuis les données de localisation
   */
  extractCity(city, country) {
    if (!city) return null;

    // Nettoyer la ville
    return city.split(',')[0].trim();
  }

  /**
   * Extrait le département depuis le code postal (France uniquement)
   */
  extractDepartment(postalCode) {
    if (!postalCode) return null;

    // Pour la France, le département = 2 premiers chiffres du code postal
    const match = postalCode.match(/^(\d{2})/);
    return match ? match[1] : null;
  }

  /**
   * Extrait le secteur depuis le titre du poste
   */
  extractSector(title) {
    if (!title) return null;

    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('develop') || lowerTitle.includes('program')) {
      return 'Développement informatique';
    }
    if (lowerTitle.includes('design') || lowerTitle.includes('graph')) {
      return 'Design / Graphisme';
    }
    if (lowerTitle.includes('market')) {
      return 'Marketing';
    }
    if (lowerTitle.includes('sales') || lowerTitle.includes('commercial')) {
      return 'Commercial / Vente';
    }
    if (lowerTitle.includes('data')) {
      return 'Data / Analytics';
    }

    return 'Autre';
  }

  /**
   * Extrait le type de contrat
   */
  extractContractType(employmentType) {
    if (!employmentType) return null;

    const mapping = {
      'FULLTIME': 'CDI',
      'PARTTIME': 'Temps partiel',
      'CONTRACTOR': 'Freelance',
      'INTERN': 'Stage',
      'TEMPORARY': 'CDD'
    };

    return mapping[employmentType] || employmentType;
  }
}

// Export singleton
module.exports = new GoogleJobsService();
