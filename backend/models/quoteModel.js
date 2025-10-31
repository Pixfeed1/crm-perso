// backend/models/quoteModel.js

/**
 * Convertit les chaînes vides en NULL pour les champs numériques/dates
 * Utilisé pour éviter l'erreur PostgreSQL "invalid input syntax for integer: ''"
 */
const sanitizeValue = (value) => {
  if (value === '' || value === undefined) {
    return null;
  }
  return value;
};

/**
 * Génère un numéro de devis unique
 */
const generateQuoteNumber = async (db) => {
  return new Promise((resolve, reject) => {
    const year = new Date().getFullYear();
    const query = `
      SELECT quote_number
      FROM quotes
      WHERE quote_number ILIKE $1
      ORDER BY quote_number DESC
      LIMIT 1
    `;

    db.pool.query(query, [`DEV-${year}-%`], (err, result) => {
      if (err) {
        console.error('[QuoteModel] Erreur lors de la génération du numéro:', err);
        return reject(err);
      }

      let nextNumber = 1;
      if (result.rows && result.rows.length > 0) {
        const lastNumber = result.rows[0].quote_number;
        const match = lastNumber.match(/DEV-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      const quoteNumber = `DEV-${year}-${String(nextNumber).padStart(4, '0')}`;
      resolve(quoteNumber);
    });
  });
};

/**
 * Récupère tous les devis
 */
const getAllQuotes = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        q.*,
        c.name as client_company,
        c.email as client_company_email
      FROM quotes q
      LEFT JOIN crm_clients c ON q.client_id = c.id
      ORDER BY q.issue_date DESC
    `;

    db.pool.query(query, [], (err, result) => {
      if (err) {
        console.error('[QuoteModel] Erreur lors de la récupération des devis:', err);
        reject(err);
      } else {
        resolve(result.rows || []);
      }
    });
  });
};

/**
 * Récupère un devis par son ID
 */
const getQuoteById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        q.*,
        c.name as client_company,
        c.email as client_company_email,
        c.address as client_company_address
      FROM quotes q
      LEFT JOIN crm_clients c ON q.client_id = c.id
      WHERE q.id = $1
    `;

    db.pool.query(query, [id], (err, result) => {
      if (err) {
        console.error('[QuoteModel] Erreur lors de la récupération du devis:', err);
        return reject(err);
      }
      resolve(result.rows[0] || null);
    });
  });
};

/**
 * Crée un nouveau devis
 */
const createQuote = async (db, quoteData) => {
  const {
    // Champs existants
    client_id,
    client_name,
    client_email,
    client_address,
    client_siret,
    items = [],
    cgv,
    cgv_type = 'text',
    cgv_pdf = null,
    tva_rate = 20.00,
    tva_applicable = true,
    acompte_type = 'none',
    acompte_value = 0,
    escompte_percent = 0,
    escompte_days = 0,
    validity_days = 30,
    notes,
    // Nouveaux champs
    title = '',
    project_id = null,
    discount_type = 'none',
    discount_value = 0,
    payment_methods = [],
    payment_details = {},
    tva_regime = 'NORMAL',
    additional_info = '',
    additional_files = []
  } = quoteData;

  try {
    // Générer le numéro de devis
    const quote_number = await generateQuoteNumber(db);

    // Calculer les totaux
    let total_ht = 0;
    items.forEach(item => {
      total_ht += (item.quantity || 0) * (item.unit_price || 0);
    });

    // Calculer la remise
    let discount_amount = 0;
    if (discount_type === 'percent') {
      discount_amount = total_ht * (discount_value / 100);
    } else if (discount_type === 'fixed') {
      discount_amount = discount_value;
    }

    // Appliquer la remise au total HT
    const total_ht_after_discount = total_ht - discount_amount;

    // Calculer la TVA sur le montant après remise
    const tva_amount = tva_applicable ? (total_ht_after_discount * (tva_rate / 100)) : 0;
    const total_ttc = total_ht_after_discount + tva_amount;

    // Calculer l'acompte
    let acompte_amount = 0;
    if (acompte_type === 'percent') {
      acompte_amount = total_ttc * (acompte_value / 100);
    } else if (acompte_type === 'fixed') {
      acompte_amount = acompte_value;
    }

    // Calculer les dates
    const issue_date = new Date();
    const expiry_date = new Date();
    expiry_date.setDate(expiry_date.getDate() + validity_days);

    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO quotes (
          quote_number, client_id, client_name, client_email, client_address, client_siret,
          status, total_ht, total_ttc, tva_rate, tva_amount, tva_applicable,
          items, cgv, cgv_type, cgv_pdf, acompte_type, acompte_value, acompte_amount,
          escompte_percent, escompte_days, validity_days, notes,
          issue_date, expiry_date,
          title, project_id, discount_type, discount_value, discount_amount,
          payment_methods, payment_details, tva_regime, additional_info, additional_files
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
          $26, $27, $28, $29, $30, $31, $32, $33, $34, $35
        ) RETURNING id
      `;

      const params = [
        quote_number,
        sanitizeValue(client_id),
        client_name,
        sanitizeValue(client_email),
        sanitizeValue(client_address),
        sanitizeValue(client_siret),
        'draft',
        total_ht,
        total_ttc,
        tva_rate,
        tva_amount,
        tva_applicable,
        JSON.stringify(items),
        sanitizeValue(cgv),
        cgv_type,
        sanitizeValue(cgv_pdf),
        acompte_type,
        sanitizeValue(acompte_value),
        acompte_amount,
        sanitizeValue(escompte_percent),
        sanitizeValue(escompte_days),
        sanitizeValue(validity_days),
        sanitizeValue(notes),
        issue_date,
        expiry_date,
        sanitizeValue(title),
        sanitizeValue(project_id),
        discount_type,
        sanitizeValue(discount_value),
        discount_amount,
        JSON.stringify(payment_methods),
        JSON.stringify(payment_details),
        tva_regime,
        sanitizeValue(additional_info),
        JSON.stringify(additional_files)
      ];

      db.pool.query(query, params, (err, result) => {
        if (err) {
          console.error('[QuoteModel] Erreur lors de la création du devis:', err);
          return reject(err);
        }
        resolve({ id: result.rows[0].id, quote_number });
      });
    });
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * Met à jour un devis
 */
const updateQuote = (db, id, quoteData) => {
  return new Promise((resolve, reject) => {
    const {
      // Champs existants
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      status,
      items = [],
      cgv,
      cgv_type = 'text',
      cgv_pdf = null,
      tva_rate = 20.00,
      tva_applicable = true,
      acompte_type = 'none',
      acompte_value = 0,
      escompte_percent = 0,
      escompte_days = 0,
      validity_days = 30,
      notes,
      // Nouveaux champs
      title = '',
      project_id = null,
      discount_type = 'none',
      discount_value = 0,
      payment_methods = [],
      payment_details = {},
      tva_regime = 'NORMAL',
      additional_info = '',
      additional_files = []
    } = quoteData;

    // Calculer les totaux
    let total_ht = 0;
    items.forEach(item => {
      total_ht += (item.quantity || 0) * (item.unit_price || 0);
    });

    // Calculer la remise
    let discount_amount = 0;
    if (discount_type === 'percent') {
      discount_amount = total_ht * (discount_value / 100);
    } else if (discount_type === 'fixed') {
      discount_amount = discount_value;
    }

    // Appliquer la remise au total HT
    const total_ht_after_discount = total_ht - discount_amount;

    // Calculer la TVA sur le montant après remise
    const tva_amount = tva_applicable ? (total_ht_after_discount * (tva_rate / 100)) : 0;
    const total_ttc = total_ht_after_discount + tva_amount;

    // Calculer l'acompte
    let acompte_amount = 0;
    if (acompte_type === 'percent') {
      acompte_amount = total_ttc * (acompte_value / 100);
    } else if (acompte_type === 'fixed') {
      acompte_amount = acompte_value;
    }

    const query = `
      UPDATE quotes SET
        client_id = $1, client_name = $2, client_email = $3, client_address = $4, client_siret = $5,
        status = $6, total_ht = $7, total_ttc = $8, tva_rate = $9, tva_amount = $10, tva_applicable = $11,
        items = $12, cgv = $13, cgv_type = $14, cgv_pdf = $15, acompte_type = $16, acompte_value = $17, acompte_amount = $18,
        escompte_percent = $19, escompte_days = $20, validity_days = $21, notes = $22,
        title = $23, project_id = $24, discount_type = $25, discount_value = $26, discount_amount = $27,
        payment_methods = $28, payment_details = $29, tva_regime = $30, additional_info = $31, additional_files = $32,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $33
    `;

    const params = [
      sanitizeValue(client_id),
      client_name,
      sanitizeValue(client_email),
      sanitizeValue(client_address),
      sanitizeValue(client_siret),
      status,
      total_ht,
      total_ttc,
      tva_rate,
      tva_amount,
      tva_applicable,
      JSON.stringify(items),
      sanitizeValue(cgv),
      cgv_type,
      sanitizeValue(cgv_pdf),
      acompte_type,
      sanitizeValue(acompte_value),
      acompte_amount,
      sanitizeValue(escompte_percent),
      sanitizeValue(escompte_days),
      sanitizeValue(validity_days),
      sanitizeValue(notes),
      sanitizeValue(title),
      sanitizeValue(project_id),
      discount_type,
      sanitizeValue(discount_value),
      discount_amount,
      JSON.stringify(payment_methods),
      JSON.stringify(payment_details),
      tva_regime,
      sanitizeValue(additional_info),
      JSON.stringify(additional_files),
      id
    ];

    db.pool.query(query, params, (err, result) => {
      if (err) {
        console.error('[QuoteModel] Erreur lors de la mise à jour du devis:', err);
        return reject(err);
      }
      resolve({ id, changes: result.rowCount });
    });
  });
};

/**
 * Supprime un devis
 */
const deleteQuote = (db, id) => {
  return new Promise((resolve, reject) => {
    db.pool.query('DELETE FROM quotes WHERE id = $1', [id], (err, result) => {
      if (err) {
        console.error('[QuoteModel] Erreur lors de la suppression du devis:', err);
        return reject(err);
      }
      resolve({ changes: result.rowCount });
    });
  });
};

/**
 * Change le statut d'un devis
 */
const updateQuoteStatus = (db, id, status) => {
  return new Promise((resolve, reject) => {
    const query = 'UPDATE quotes SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';

    db.pool.query(query, [status, id], (err, result) => {
      if (err) {
        console.error('[QuoteModel] Erreur lors du changement de statut:', err);
        return reject(err);
      }
      resolve({ id, status, changes: result.rowCount });
    });
  });
};

/**
 * Met à jour l'historique d'envoi d'un devis
 */
const updateSendHistory = (db, id, sentTo) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE quotes
      SET
        sent_at = CURRENT_TIMESTAMP,
        sent_to = $1,
        sent_count = COALESCE(sent_count, 0) + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    db.pool.query(query, [sentTo, id], (err, result) => {
      if (err) {
        console.error('[QuoteModel] Erreur lors de la mise à jour de l\'historique d\'envoi:', err);
        return reject(err);
      }
      resolve({ id, changes: result.rowCount });
    });
  });
};

/**
 * Signer un devis
 */
const signQuote = (db, id, signatureData) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE quotes
      SET
        signed_at = $1,
        signed_by = $2,
        signature_data = $3,
        status = 'signed',
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    const { signed_by, signature_data } = signatureData;
    const signed_at = new Date().toISOString();

    db.pool.query(query, [signed_at, signed_by, signature_data, id], (err, result) => {
      if (err) {
        console.error('Erreur signature devis:', err);
        return reject(err);
      }
      if (result.rows.length === 0) {
        return reject(new Error('Devis non trouvé'));
      }
      resolve(result.rows[0]);
    });
  });
};

module.exports = {
  generateQuoteNumber,
  getAllQuotes,
  getQuoteById,
  createQuote,
  updateQuote,
  deleteQuote,
  updateQuoteStatus,
  updateSendHistory,
  signQuote
};
