// backend/services/leadImportService.js

/**
 * Service d'import de leads depuis fichiers CSV/Excel
 *
 * Fonctionnalités :
 * - Validation des emails
 * - Détection des doublons
 * - Nettoyage des données (espaces, accents)
 * - Mapping intelligent des colonnes
 * - Import en masse avec rapport détaillé
 */

const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const { Readable } = require('stream');

class LeadImportService {
  /**
   * Mapping intelligent des colonnes
   * Suggère automatiquement les correspondances entre colonnes du fichier et champs BDD
   */
  static intelligentMapping(headers) {
    const mappings = {
      // Entreprise
      company_name: ['company_name', 'company', 'entreprise', 'société', 'societe', 'nom_entreprise', 'raison_sociale', 'raison sociale'],

      // Contact
      contact_firstname: ['contact_firstname', 'firstname', 'prenom', 'prénom', 'first_name', 'first name'],
      contact_lastname: ['contact_lastname', 'lastname', 'nom', 'last_name', 'last name', 'surname'],

      // Coordonnées
      email: ['email', 'e-mail', 'mail', 'email_pro', 'professional_email'],
      phone: ['phone', 'telephone', 'téléphone', 'tel', 'mobile', 'phone_number'],
      website: ['website', 'site_web', 'siteweb', 'site', 'url', 'web'],

      // Localisation
      city: ['city', 'ville', 'town', 'locality'],
      postal_code: ['postal_code', 'postcode', 'zip', 'code_postal', 'cp'],
      department: ['department', 'departement', 'département', 'dept'],
      country: ['country', 'pays', 'nation'],

      // Activité
      sector: ['sector', 'secteur', 'industrie', 'industry', 'naf', 'code_naf', 'ape'],

      // Tracking
      source: ['source', 'provenance', 'origin', 'canal'],
      status: ['status', 'statut', 'state', 'état', 'etat'],

      // Lead data
      notes: ['notes', 'note', 'commentaire', 'commentaires', 'comments', 'description']
    };

    const suggestions = {};

    headers.forEach(header => {
      const normalizedHeader = this.normalize(header);

      for (const [field, aliases] of Object.entries(mappings)) {
        if (aliases.some(alias => this.normalize(alias) === normalizedHeader)) {
          suggestions[header] = field;
          break;
        }
      }
    });

    return suggestions;
  }

  /**
   * Normalise une chaîne (minuscules, sans accents, sans espaces)
   */
  static normalize(str) {
    return str
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Nettoie une chaîne de caractères
   */
  static cleanString(str) {
    if (!str) return '';
    return str
      .toString()
      .trim()
      .replace(/\s+/g, ' '); // Remplace les espaces multiples par un seul
  }

  /**
   * Valide un email
   */
  static isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Nettoie un numéro de téléphone
   */
  static cleanPhone(phone) {
    if (!phone) return '';
    return phone
      .toString()
      .replace(/[^0-9+]/g, '')
      .trim();
  }

  /**
   * Parse un fichier CSV
   */
  static parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      const headers = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('headers', (headerList) => {
          headers.push(...headerList);
        })
        .on('data', (data) => {
          results.push(data);
        })
        .on('end', () => {
          resolve({ headers, data: results });
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Parse un fichier Excel
   */
  static parseExcel(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0]; // Première feuille
      const worksheet = workbook.Sheets[sheetName];

      // Convertir en JSON
      const data = XLSX.utils.sheet_to_json(worksheet);

      // Extraire les en-têtes
      const headers = data.length > 0 ? Object.keys(data[0]) : [];

      return { headers, data };
    } catch (error) {
      throw new Error(`Erreur lors de la lecture du fichier Excel: ${error.message}`);
    }
  }

  /**
   * Parse un fichier (détecte automatiquement le format)
   */
  static async parseFile(filePath, mimeType) {
    if (mimeType === 'text/csv' || filePath.endsWith('.csv')) {
      return await this.parseCSV(filePath);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      filePath.endsWith('.xlsx') ||
      filePath.endsWith('.xls')
    ) {
      return this.parseExcel(filePath);
    } else {
      throw new Error('Format de fichier non supporté. Utilisez CSV ou Excel (.xlsx, .xls)');
    }
  }

  /**
   * Valide une ligne de données
   */
  static validateRow(row, rowIndex) {
    const errors = [];

    // Email obligatoire et valide
    if (!row.email) {
      errors.push(`Ligne ${rowIndex + 2}: Email manquant`);
    } else if (!this.isValidEmail(row.email)) {
      errors.push(`Ligne ${rowIndex + 2}: Email invalide (${row.email})`);
    }

    // Nom de l'entreprise OU nom du contact obligatoire
    if (!row.company_name && !row.contact_lastname) {
      errors.push(`Ligne ${rowIndex + 2}: Nom d'entreprise ou nom de contact requis`);
    }

    return errors;
  }

  /**
   * Nettoie une ligne de données
   */
  static cleanRow(row) {
    const cleaned = {};

    // Nettoyer les champs texte
    ['company_name', 'contact_firstname', 'contact_lastname', 'city', 'country', 'sector', 'source', 'status', 'notes'].forEach(field => {
      cleaned[field] = this.cleanString(row[field]);
    });

    // Email en minuscules et sans espaces
    cleaned.email = row.email ? row.email.toString().toLowerCase().trim() : '';

    // Téléphone nettoyé
    cleaned.phone = this.cleanPhone(row.phone);

    // Code postal
    cleaned.postal_code = row.postal_code ? row.postal_code.toString().trim() : '';

    // Département
    cleaned.department = row.department ? row.department.toString().trim() : '';

    // Website
    cleaned.website = row.website ? row.website.toString().trim() : '';

    return cleaned;
  }

  /**
   * Vérifie si un lead existe déjà (doublon)
   */
  static async checkDuplicate(db, row) {
    // Vérifier par email (prioritaire)
    if (row.email) {
      const emailCheck = await new Promise((resolve, reject) => {
        db.get(
          'SELECT id, name, email FROM leads WHERE LOWER(email) = LOWER(?)',
          [row.email],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      if (emailCheck) {
        return {
          isDuplicate: true,
          reason: 'email',
          existing: emailCheck
        };
      }
    }

    // Vérifier par company_name + city
    if (row.company_name && row.city) {
      const companyCheck = await new Promise((resolve, reject) => {
        db.get(
          `SELECT id, name, company FROM leads
           WHERE LOWER(company) = LOWER(?)
           AND LOWER(name) LIKE LOWER(?)`,
          [row.company_name, `%${row.city}%`],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });

      if (companyCheck) {
        return {
          isDuplicate: true,
          reason: 'company+city',
          existing: companyCheck
        };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Mappe les données selon le mapping fourni
   */
  static mapRow(row, mapping) {
    const mapped = {};

    for (const [fileColumn, dbField] of Object.entries(mapping)) {
      if (row[fileColumn] !== undefined) {
        mapped[dbField] = row[fileColumn];
      }
    }

    return mapped;
  }

  /**
   * Importe les leads dans la base de données
   */
  static async importLeads(db, rows, mapping, options = {}) {
    const results = {
      total: rows.length,
      success: 0,
      duplicates: 0,
      errors: 0,
      details: {
        imported: [],
        duplicates: [],
        errors: []
      }
    };

    for (let i = 0; i < rows.length; i++) {
      try {
        // Mapper les colonnes
        const mappedRow = this.mapRow(rows[i], mapping);

        // Nettoyer les données
        const cleanedRow = this.cleanRow(mappedRow);

        // Valider
        const validationErrors = this.validateRow(cleanedRow, i);
        if (validationErrors.length > 0) {
          results.errors++;
          results.details.errors.push({
            row: i + 2,
            data: rows[i],
            errors: validationErrors
          });
          continue;
        }

        // Vérifier les doublons
        if (options.checkDuplicates !== false) {
          const duplicateCheck = await this.checkDuplicate(db, cleanedRow);
          if (duplicateCheck.isDuplicate) {
            results.duplicates++;
            results.details.duplicates.push({
              row: i + 2,
              data: rows[i],
              reason: duplicateCheck.reason,
              existing: duplicateCheck.existing
            });
            continue;
          }
        }

        // Créer le lead
        const lead = await this.createLead(db, cleanedRow);
        results.success++;
        results.details.imported.push({
          row: i + 2,
          id: lead.id,
          name: lead.name
        });

      } catch (error) {
        results.errors++;
        results.details.errors.push({
          row: i + 2,
          data: rows[i],
          errors: [error.message]
        });
      }
    }

    return results;
  }

  /**
   * Crée un lead dans la base de données
   */
  static createLead(db, data) {
    return new Promise((resolve, reject) => {
      // Construire le nom du lead
      const name = data.company_name ||
                  `${data.contact_firstname || ''} ${data.contact_lastname || ''}`.trim();

      // Type: company si company_name existe, sinon individual
      const type = data.company_name ? 'company' : 'individual';

      // Déterminer le statut (ou "nouveau" par défaut)
      const status = data.status || 'new';

      const query = `
        INSERT INTO leads (
          name, company, type, email, phone, status, source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const now = new Date().toISOString();
      const notes = this.buildNotes(data);

      db.run(
        query,
        [
          name,
          data.company_name || null,
          type,
          data.email,
          data.phone || null,
          status,
          data.source || 'import',
          notes,
          now,
          now
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            // Si c'est une entreprise avec un contact, créer aussi le contact
            if (type === 'company' && (data.contact_firstname || data.contact_lastname)) {
              const contactQuery = `
                INSERT INTO contacts (
                  lead_id, name, email, phone, position, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
              `;

              const contactName = `${data.contact_firstname || ''} ${data.contact_lastname || ''}`.trim();

              db.run(
                contactQuery,
                [
                  this.lastID,
                  contactName,
                  data.email,
                  data.phone || null,
                  null,
                  now
                ],
                (contactErr) => {
                  if (contactErr) {
                    console.error('Erreur lors de la création du contact:', contactErr);
                  }
                }
              );
            }

            resolve({
              id: this.lastID,
              name,
              email: data.email
            });
          }
        }
      );
    });
  }

  /**
   * Construit les notes à partir des données importées
   */
  static buildNotes(data) {
    const notes = [];

    if (data.city) notes.push(`Ville: ${data.city}`);
    if (data.postal_code) notes.push(`CP: ${data.postal_code}`);
    if (data.department) notes.push(`Département: ${data.department}`);
    if (data.country) notes.push(`Pays: ${data.country}`);
    if (data.sector) notes.push(`Secteur: ${data.sector}`);
    if (data.website) notes.push(`Site: ${data.website}`);
    if (data.notes) notes.push(`\n${data.notes}`);

    return notes.join('\n');
  }
}

module.exports = LeadImportService;
