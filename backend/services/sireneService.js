/**
 * Service SIRENE - Recherche d'entreprises via l'API INSEE
 *
 * Documentation API: https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=V3&provider=insee
 *
 * Fonctionnalités:
 * - Recherche par activité (code NAF/APE)
 * - Recherche par localisation (ville, département, région, DOM-TOM)
 * - Filtrage par taille d'entreprise
 * - Récupération données officielles INSEE: SIRET, adresse, secteur, effectifs
 */

const axios = require('axios');

class SireneService {
  constructor() {
    // Clés API INSEE (OAuth2)
    this.consumerKey = process.env.INSEE_CONSUMER_KEY || '';
    this.consumerSecret = process.env.INSEE_CONSUMER_SECRET || '';

    // URLs de l'API INSEE
    this.authUrl = 'https://api.insee.fr/token';
    this.baseUrl = 'https://api.insee.fr/entreprises/sirene/V3';

    // Token OAuth2 (renouvelé automatiquement)
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Vérifie si le service est configuré avec les clés API
   */
  isConfigured() {
    return this.consumerKey !== '' && this.consumerSecret !== '';
  }

  /**
   * Obtient un token d'accès OAuth2
   */
  async getAccessToken() {
    // Si token valide, le retourner
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.isConfigured()) {
      throw new Error('API SIRENE non configurée. Veuillez ajouter INSEE_CONSUMER_KEY et INSEE_CONSUMER_SECRET dans .env');
    }

    try {
      const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

      const response = await axios.post(
        this.authUrl,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      this.accessToken = response.data.access_token;
      // Expiration: expires_in est en secondes, on retire 60s de marge
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

      console.log('[SIRENE] Token OAuth2 obtenu avec succès');
      return this.accessToken;

    } catch (error) {
      console.error('[SIRENE] Erreur obtention token:', error.response?.data || error.message);
      throw new Error('Impossible d\'obtenir le token SIRENE: ' + (error.response?.data?.error_description || error.message));
    }
  }

  /**
   * Teste la connexion à l'API SIRENE
   */
  async testConnection() {
    try {
      if (!this.isConfigured()) {
        return false;
      }

      await this.getAccessToken();

      // Test avec une recherche simple
      const token = await this.getAccessToken();
      const response = await axios.get(`${this.baseUrl}/siret?q=denominationUniteLegale:entreprise`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: {
          nombre: 1 // Juste 1 résultat pour tester
        },
        timeout: 10000
      });

      return response.status === 200;

    } catch (error) {
      console.error('[SIRENE] Erreur test connexion:', error.message);
      return false;
    }
  }

  /**
   * Recherche d'entreprises par critères
   *
   * @param {Object} criteria - Critères de recherche
   * @param {string} criteria.nafCode - Code NAF/APE (ex: "43.21A")
   * @param {string} criteria.city - Ville (ex: "Clichy")
   * @param {string} criteria.postalCode - Code postal (ex: "92110")
   * @param {string} criteria.department - Département (ex: "92", "2A", "971")
   * @param {string} criteria.region - Région (ex: "11" pour Île-de-France)
   * @param {string} criteria.companyName - Raison sociale (recherche partielle)
   * @param {number} criteria.minEmployees - Effectif minimum
   * @param {number} criteria.maxEmployees - Effectif maximum
   * @param {number} criteria.limit - Nombre max de résultats (défaut: 100, max: 1000)
   * @returns {Promise<Array>} Liste d'entreprises
   */
  async searchCompanies(criteria = {}) {
    try {
      const token = await this.getAccessToken();

      // Construction de la requête Q (query string)
      const qParts = [];

      // Code NAF
      if (criteria.nafCode) {
        qParts.push(`activitePrincipaleEtablissement:${criteria.nafCode}*`);
      }

      // Ville
      if (criteria.city) {
        qParts.push(`libelleCommuneEtablissement:"${criteria.city}"`);
      }

      // Code postal
      if (criteria.postalCode) {
        qParts.push(`codePostalEtablissement:${criteria.postalCode}`);
      }

      // Département
      if (criteria.department) {
        // Pour les codes postaux, on prend les 2-3 premiers caractères
        if (criteria.department.length === 2 || criteria.department.length === 3) {
          qParts.push(`codeCommuneEtablissement:${criteria.department}*`);
        }
      }

      // Raison sociale
      if (criteria.companyName) {
        qParts.push(`denominationUniteLegale:"${criteria.companyName}"`);
      }

      // Établissements actifs uniquement
      qParts.push('etatAdministratifEtablissement:A');

      // Jointure avec AND
      const q = qParts.join(' AND ');

      console.log('[SIRENE] Requête:', q);

      // Paramètres de la requête
      const params = {
        q: q,
        nombre: Math.min(criteria.limit || 100, 1000), // Max 1000 par requête INSEE
        debut: 0
      };

      // Effectifs (tri et filtrage post-requête car l'API ne supporte pas le filtrage direct)
      const response = await axios.get(`${this.baseUrl}/siret`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: params,
        timeout: 15000
      });

      if (!response.data || !response.data.etablissements) {
        return [];
      }

      // Transformation des résultats
      let companies = response.data.etablissements.map(etab => this.transformToCompany(etab));

      // Filtrage par effectifs si demandé
      if (criteria.minEmployees !== undefined || criteria.maxEmployees !== undefined) {
        companies = companies.filter(company => {
          const employees = company.employees || 0;
          if (criteria.minEmployees !== undefined && employees < criteria.minEmployees) {
            return false;
          }
          if (criteria.maxEmployees !== undefined && employees > criteria.maxEmployees) {
            return false;
          }
          return true;
        });
      }

      console.log(`[SIRENE] ${companies.length} entreprises trouvées`);
      return companies;

    } catch (error) {
      console.error('[SIRENE] Erreur recherche:', error.response?.data || error.message);
      throw new Error('Erreur lors de la recherche SIRENE: ' + (error.response?.data?.header?.message || error.message));
    }
  }

  /**
   * Transforme un établissement SIRENE en format standardisé
   */
  transformToCompany(etab) {
    const uniteLegale = etab.uniteLegale || {};
    const adresse = etab.adresseEtablissement || {};
    const periode = etab.periodesEtablissement?.[0] || {};

    // Extraction du nom de l'entreprise
    let companyName = uniteLegale.denominationUniteLegale ||
                      uniteLegale.denominationUsuelle1UniteLegale ||
                      periode.denominationUsuelleEtablissement ||
                      etab.denominationUsuelleEtablissement ||
                      'Entreprise sans dénomination';

    // Si personne physique, utiliser le nom/prénom
    if (!companyName || companyName === 'Entreprise sans dénomination') {
      if (uniteLegale.nomUniteLegale && uniteLegale.prenomUsuelUniteLegale) {
        companyName = `${uniteLegale.prenomUsuelUniteLegale} ${uniteLegale.nomUniteLegale}`;
      } else if (uniteLegale.nomUniteLegale) {
        companyName = uniteLegale.nomUniteLegale;
      }
    }

    // Construction de l'adresse complète
    const addressParts = [
      adresse.numeroVoieEtablissement,
      adresse.indiceRepetitionEtablissement,
      adresse.typeVoieEtablissement,
      adresse.libelleVoieEtablissement,
      adresse.complementAdresseEtablissement
    ].filter(Boolean);

    const fullAddress = addressParts.join(' ');

    // Tranche d'effectifs (code INSEE)
    const effectifsCode = uniteLegale.trancheEffectifsUniteLegale || '00';
    const employees = this.getEmployeesFromTranche(effectifsCode);

    // Catégorie juridique
    const categorieJuridique = uniteLegale.categorieJuridiqueUniteLegale || '';
    const legalForm = this.getLegalFormLabel(categorieJuridique);

    return {
      id: etab.siret,
      source: 'sirene',
      siret: etab.siret,
      siren: etab.siren,
      company_name: companyName,
      legal_form: legalForm,
      naf_code: etab.activitePrincipaleEtablissement || '',
      naf_label: periode.activitePrincipaleEtablissement || '',
      address: fullAddress,
      postal_code: adresse.codePostalEtablissement || '',
      city: adresse.libelleCommuneEtablissement || '',
      department: adresse.codeCommuneEtablissement?.substring(0, 2) || '',
      employees: employees,
      employees_range: this.getEmployeesRangeLabel(effectifsCode),
      creation_date: uniteLegale.dateCreationUniteLegale || null,
      state: etab.etatAdministratifEtablissement === 'A' ? 'Actif' : 'Fermé',

      // Informations complémentaires
      is_siege: etab.etablissementSiege === 'true' || etab.etablissementSiege === true,
      email: null, // À enrichir avec Pappers
      phone: null, // À enrichir avec Pappers
      website: null, // À enrichir avec Pappers

      // Données brutes pour référence
      raw_data: {
        categorie_juridique: categorieJuridique,
        tranche_effectifs: effectifsCode,
        nic: etab.nic,
        activite_principale_registre_metiers: periode.activitePrincipaleRegistreMetiersEtablissement
      }
    };
  }

  /**
   * Convertit le code tranche d'effectifs INSEE en nombre approximatif
   */
  getEmployeesFromTranche(code) {
    const tranches = {
      '00': 0,     // 0 salarié
      '01': 1,     // 1 ou 2 salariés
      '02': 3,     // 3 à 5 salariés
      '03': 8,     // 6 à 9 salariés
      '11': 12,    // 10 à 19 salariés
      '12': 25,    // 20 à 49 salariés
      '21': 75,    // 50 à 99 salariés
      '22': 150,   // 100 à 199 salariés
      '31': 300,   // 200 à 249 salariés
      '32': 375,   // 250 à 499 salariés
      '41': 750,   // 500 à 999 salariés
      '42': 1500,  // 1000 à 1999 salariés
      '51': 3500,  // 2000 à 4999 salariés
      '52': 7500,  // 5000 à 9999 salariés
      '53': 10000  // 10000 salariés et plus
    };

    return tranches[code] || 0;
  }

  /**
   * Retourne le label de la tranche d'effectifs
   */
  getEmployeesRangeLabel(code) {
    const labels = {
      '00': '0 salarié',
      '01': '1 ou 2 salariés',
      '02': '3 à 5 salariés',
      '03': '6 à 9 salariés',
      '11': '10 à 19 salariés',
      '12': '20 à 49 salariés',
      '21': '50 à 99 salariés',
      '22': '100 à 199 salariés',
      '31': '200 à 249 salariés',
      '32': '250 à 499 salariés',
      '41': '500 à 999 salariés',
      '42': '1000 à 1999 salariés',
      '51': '2000 à 4999 salariés',
      '52': '5000 à 9999 salariés',
      '53': '10000 salariés et plus'
    };

    return labels[code] || 'Non renseigné';
  }

  /**
   * Retourne le label de la forme juridique
   */
  getLegalFormLabel(code) {
    // Codes les plus courants (liste non exhaustive)
    const labels = {
      '1000': 'Entrepreneur individuel',
      '5498': 'EURL',
      '5499': 'SARL',
      '5505': 'SA à conseil d\'administration',
      '5510': 'SA à directoire',
      '5520': 'Société en commandite par actions',
      '5530': 'SAS',
      '5531': 'SASU',
      '5542': 'Société en nom collectif',
      '5543': 'Société en commandite simple',
      '5546': 'SARL d\'économie mixte',
      '5547': 'SA d\'économie mixte',
      '5552': 'Société civile',
      '5599': 'SA coopérative',
      '6540': 'Groupement d\'intérêt économique',
      '9220': 'Association déclarée',
      '9230': 'Association déclarée d\'insertion par l\'économique',
      '9240': 'Association intermédiaire'
    };

    return labels[code] || `Code ${code}`;
  }

  /**
   * Récupère les détails d'une entreprise par SIRET
   */
  async getCompanyBySiret(siret) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(`${this.baseUrl}/siret/${siret}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!response.data || !response.data.etablissement) {
        throw new Error('Établissement non trouvé');
      }

      return this.transformToCompany(response.data.etablissement);

    } catch (error) {
      console.error('[SIRENE] Erreur récupération SIRET:', error.message);
      throw new Error('Impossible de récupérer les informations du SIRET: ' + error.message);
    }
  }
}

module.exports = new SireneService();
