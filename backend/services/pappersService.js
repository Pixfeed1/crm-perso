/**
 * Service Pappers - Enrichissement de données entreprises
 *
 * Documentation API: https://www.pappers.fr/api/documentation
 *
 * Plan gratuit: 100 requêtes/mois
 *
 * Fonctionnalités:
 * - Enrichissement par SIREN (téléphone, email, site web, dirigeants)
 * - Gestion du compteur de crédits (100/mois)
 * - Alertes quand crédits faibles (<10)
 * - Prévention des appels quand crédits épuisés
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class PappersService {
  constructor() {
    this.apiToken = process.env.PAPPERS_API_TOKEN || '';
    this.baseUrl = 'https://api.pappers.fr/v2';

    // Fichier de stockage du compteur de crédits
    this.creditsFilePath = path.join(__dirname, '../data/pappers-credits.json');

    // Limites
    this.monthlyLimit = 100;
    this.lowCreditsThreshold = 10;

    // Cache des crédits (pour éviter de lire le fichier à chaque fois)
    this.creditsCache = null;
  }

  /**
   * Vérifie si le service est configuré avec le token API
   */
  isConfigured() {
    return this.apiToken !== '';
  }

  /**
   * Teste la connexion à l'API Pappers
   */
  async testConnection() {
    try {
      if (!this.isConfigured()) {
        return false;
      }

      // Test avec une recherche simple
      const response = await axios.get(`${this.baseUrl}/recherche`, {
        params: {
          api_token: this.apiToken,
          q: 'test',
          par_page: 1
        },
        timeout: 10000
      });

      return response.status === 200;

    } catch (error) {
      console.error('[PAPPERS] Erreur test connexion:', error.message);
      return false;
    }
  }

  /**
   * Charge le compteur de crédits depuis le fichier
   */
  async loadCredits() {
    try {
      // Créer le dossier data s'il n'existe pas
      const dataDir = path.dirname(this.creditsFilePath);
      try {
        await fs.access(dataDir);
      } catch {
        await fs.mkdir(dataDir, { recursive: true });
      }

      // Lire le fichier de crédits
      try {
        const data = await fs.readFile(this.creditsFilePath, 'utf-8');
        this.creditsCache = JSON.parse(data);
      } catch {
        // Fichier n'existe pas, initialiser
        this.creditsCache = {
          used: 0,
          remaining: this.monthlyLimit,
          month: new Date().getMonth(),
          year: new Date().getFullYear(),
          last_reset: new Date().toISOString()
        };
        await this.saveCredits();
      }

      // Réinitialiser si on a changé de mois
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      if (this.creditsCache.month !== currentMonth || this.creditsCache.year !== currentYear) {
        console.log('[PAPPERS] Nouveau mois détecté, réinitialisation des crédits');
        this.creditsCache = {
          used: 0,
          remaining: this.monthlyLimit,
          month: currentMonth,
          year: currentYear,
          last_reset: new Date().toISOString()
        };
        await this.saveCredits();
      }

      return this.creditsCache;

    } catch (error) {
      console.error('[PAPPERS] Erreur chargement crédits:', error.message);
      throw error;
    }
  }

  /**
   * Sauvegarde le compteur de crédits dans le fichier
   */
  async saveCredits() {
    try {
      await fs.writeFile(
        this.creditsFilePath,
        JSON.stringify(this.creditsCache, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[PAPPERS] Erreur sauvegarde crédits:', error.message);
      throw error;
    }
  }

  /**
   * Obtient le statut des crédits
   */
  async getCreditsStatus() {
    await this.loadCredits();

    return {
      used: this.creditsCache.used,
      remaining: this.creditsCache.remaining,
      total: this.monthlyLimit,
      percentage: Math.round((this.creditsCache.remaining / this.monthlyLimit) * 100),
      is_low: this.creditsCache.remaining <= this.lowCreditsThreshold,
      is_depleted: this.creditsCache.remaining === 0,
      last_reset: this.creditsCache.last_reset,
      next_reset: this.getNextResetDate()
    };
  }

  /**
   * Calcule la date du prochain reset (1er du mois suivant)
   */
  getNextResetDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString();
  }

  /**
   * Consomme un crédit
   */
  async consumeCredit() {
    await this.loadCredits();

    if (this.creditsCache.remaining <= 0) {
      throw new Error('Crédits Pappers épuisés pour ce mois. Prochaine réinitialisation: ' + this.getNextResetDate());
    }

    this.creditsCache.used += 1;
    this.creditsCache.remaining -= 1;

    await this.saveCredits();

    console.log(`[PAPPERS] Crédit consommé. Restant: ${this.creditsCache.remaining}/${this.monthlyLimit}`);

    // Alerte si crédits faibles
    if (this.creditsCache.remaining <= this.lowCreditsThreshold && this.creditsCache.remaining > 0) {
      console.warn(`[PAPPERS] ⚠️ ATTENTION: Seulement ${this.creditsCache.remaining} crédits restants ce mois-ci`);
    }

    return this.creditsCache.remaining;
  }

  /**
   * Enrichit une entreprise par SIREN
   *
   * @param {string} siren - Numéro SIREN (9 chiffres)
   * @returns {Promise<Object>} Données enrichies
   */
  async enrichBySiren(siren) {
    try {
      if (!this.isConfigured()) {
        throw new Error('API Pappers non configurée. Veuillez ajouter PAPPERS_API_TOKEN dans .env');
      }

      // Vérifier les crédits disponibles
      const credits = await this.getCreditsStatus();
      if (credits.is_depleted) {
        throw new Error(`Crédits Pappers épuisés (0/${this.monthlyLimit}). Prochaine réinitialisation: ${new Date(credits.next_reset).toLocaleDateString('fr-FR')}`);
      }

      // Appel API
      const response = await axios.get(`${this.baseUrl}/entreprise`, {
        params: {
          api_token: this.apiToken,
          siren: siren
        },
        timeout: 15000
      });

      // Consommer un crédit
      await this.consumeCredit();

      if (!response.data) {
        throw new Error('Aucune donnée retournée par Pappers');
      }

      // Transformation des données
      return this.transformPappersData(response.data);

    } catch (error) {
      console.error('[PAPPERS] Erreur enrichissement:', error.response?.data || error.message);

      // Si erreur API mais pas de consommation de crédit, on ne décrémente pas
      if (error.response?.status === 404) {
        throw new Error('Entreprise non trouvée dans Pappers');
      }

      throw new Error('Erreur Pappers: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Transforme les données Pappers en format standardisé
   */
  transformPappersData(data) {
    // Extraction du téléphone
    let phone = null;
    if (data.siege && data.siege.telephone) {
      phone = data.siege.telephone;
    } else if (data.telephone) {
      phone = data.telephone;
    }

    // Extraction de l'email
    let email = null;
    if (data.siege && data.siege.email) {
      email = data.siege.email;
    } else if (data.email) {
      email = data.email;
    }

    // Extraction du site web
    let website = null;
    if (data.site_internet) {
      website = data.site_internet;
    }

    // Extraction des dirigeants
    const executives = [];
    if (data.representants && Array.isArray(data.representants)) {
      data.representants.slice(0, 5).forEach(rep => {
        if (rep.nom || rep.prenom) {
          executives.push({
            name: [rep.prenom, rep.nom].filter(Boolean).join(' '),
            role: rep.qualite || 'Dirigeant',
            date_prise_poste: rep.date_prise_de_poste || null
          });
        }
      });
    }

    // Effectifs précis
    let employees = null;
    if (data.effectif) {
      employees = parseInt(data.effectif);
    }

    // Chiffre d'affaires
    let revenue = null;
    if (data.finances && data.finances.length > 0) {
      const lastYear = data.finances[0];
      if (lastYear.chiffre_affaires) {
        revenue = parseInt(lastYear.chiffre_affaires);
      }
    }

    return {
      siren: data.siren,
      phone: phone,
      email: email,
      website: website,
      executives: executives,
      employees: employees,
      revenue: revenue,
      revenue_year: data.finances && data.finances.length > 0 ? data.finances[0].annee : null,

      // Informations complémentaires
      capital: data.capital ? parseInt(data.capital) : null,
      date_creation: data.date_creation || null,
      statut_rcs: data.statut_rcs || null,

      // Données brutes pour référence
      raw_data: {
        objet_social: data.objet_social || null,
        convention_collective: data.conventions_collectives?.[0]?.nom || null
      }
    };
  }

  /**
   * Enrichit plusieurs entreprises (avec gestion des crédits)
   *
   * @param {Array<string>} sirens - Liste de numéros SIREN
   * @param {number} maxEnrich - Nombre max à enrichir (pour préserver les crédits)
   * @returns {Promise<Array>} Données enrichies
   */
  async enrichMultiple(sirens, maxEnrich = 10) {
    try {
      const credits = await this.getCreditsStatus();

      // Limiter au nombre de crédits disponibles
      const toEnrich = Math.min(sirens.length, maxEnrich, credits.remaining);

      if (toEnrich === 0) {
        throw new Error('Aucun crédit disponible pour l\'enrichissement');
      }

      console.log(`[PAPPERS] Enrichissement de ${toEnrich} entreprises (${credits.remaining} crédits disponibles)`);

      const results = [];
      const errors = [];

      // Enrichir séquentiellement (pour gérer les crédits correctement)
      for (let i = 0; i < toEnrich; i++) {
        try {
          const enriched = await this.enrichBySiren(sirens[i]);
          results.push({
            siren: sirens[i],
            success: true,
            data: enriched
          });

          // Pause de 100ms entre chaque appel (rate limiting courtois)
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          errors.push({
            siren: sirens[i],
            success: false,
            error: error.message
          });
        }
      }

      return {
        enriched: results,
        errors: errors,
        credits_remaining: (await this.getCreditsStatus()).remaining,
        skipped: sirens.length - toEnrich
      };

    } catch (error) {
      console.error('[PAPPERS] Erreur enrichissement multiple:', error.message);
      throw error;
    }
  }
}

module.exports = new PappersService();
