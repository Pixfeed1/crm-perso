// backend/models/settingsModel.js

/**
 * Model pour les paramètres de l'entreprise
 * Gère un seul enregistrement (id = 1)
 */
class SettingsModel {
  constructor(db) {
    this.db = db;
  }

  /**
   * Récupère les paramètres de l'entreprise
   */
  async getSettings() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          id,
          company_name,
          address,
          postal_code,
          city,
          country,
          siret,
          email,
          phone,
          logo_url,
          email_signature,
          created_at,
          updated_at
        FROM company_settings
        WHERE id = 1
      `;

      this.db.pool.query(query, (err, result) => {
        if (err) {
          console.error('[SettingsModel] Erreur lors de la récupération:', err);
          return reject(err);
        }

        if (result.rows && result.rows.length > 0) {
          resolve(result.rows[0]);
        } else {
          // Si aucun paramètre n'existe, créer un enregistrement par défaut
          this.createDefaultSettings()
            .then(settings => resolve(settings))
            .catch(error => reject(error));
        }
      });
    });
  }

  /**
   * Crée un enregistrement de paramètres par défaut
   */
  async createDefaultSettings() {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO company_settings (company_name, country)
        VALUES ('Mon Entreprise', 'France')
        RETURNING *
      `;

      this.db.pool.query(query, (err, result) => {
        if (err) {
          console.error('[SettingsModel] Erreur lors de la création des paramètres par défaut:', err);
          return reject(err);
        }
        resolve(result.rows[0]);
      });
    });
  }

  /**
   * Met à jour les paramètres de l'entreprise
   */
  async updateSettings(settingsData) {
    return new Promise((resolve, reject) => {
      const {
        company_name,
        address,
        postal_code,
        city,
        country,
        siret,
        email,
        phone,
        logo_url,
        email_signature
      } = settingsData;

      const query = `
        UPDATE company_settings
        SET
          company_name = COALESCE($1, company_name),
          address = COALESCE($2, address),
          postal_code = COALESCE($3, postal_code),
          city = COALESCE($4, city),
          country = COALESCE($5, country),
          siret = COALESCE($6, siret),
          email = COALESCE($7, email),
          phone = COALESCE($8, phone),
          logo_url = COALESCE($9, logo_url),
          email_signature = COALESCE($10, email_signature),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
        RETURNING *
      `;

      const values = [
        company_name,
        address,
        postal_code,
        city,
        country,
        siret,
        email,
        phone,
        logo_url,
        email_signature
      ];

      this.db.pool.query(query, values, (err, result) => {
        if (err) {
          console.error('[SettingsModel] Erreur lors de la mise à jour:', err);
          return reject(err);
        }

        if (result.rows && result.rows.length > 0) {
          resolve(result.rows[0]);
        } else {
          reject(new Error('Impossible de mettre à jour les paramètres'));
        }
      });
    });
  }

  /**
   * Met à jour uniquement le logo
   */
  async updateLogo(logoUrl) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE company_settings
        SET
          logo_url = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
        RETURNING *
      `;

      this.db.pool.query(query, [logoUrl], (err, result) => {
        if (err) {
          console.error('[SettingsModel] Erreur lors de la mise à jour du logo:', err);
          return reject(err);
        }
        resolve(result.rows[0]);
      });
    });
  }
}

module.exports = SettingsModel;
