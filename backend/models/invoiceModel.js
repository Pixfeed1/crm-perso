// backend/models/invoiceModel.js

/**
 * Génère un numéro de facture unique
 */
const generateInvoiceNumber = async (db) => {
  return new Promise((resolve, reject) => {
    const year = new Date().getFullYear();
    const query = `
      SELECT invoice_number
      FROM invoices
      WHERE invoice_number ILIKE $1
      ORDER BY invoice_number DESC
      LIMIT 1
    `;

    db.pool.query(query, [`FACT-${year}-%`], (err, result) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors de la génération du numéro:', err);
        return reject(err);
      }

      let nextNumber = 1;
      if (result.rows && result.rows.length > 0) {
        const lastNumber = result.rows[0].invoice_number;
        const match = lastNumber.match(/FACT-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      const invoiceNumber = `FACT-${year}-${String(nextNumber).padStart(4, '0')}`;
      resolve(invoiceNumber);
    });
  });
};

/**
 * Récupère toutes les factures
 */
const getAllInvoices = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        i.*,
        c.name as client_company,
        c.email as client_company_email,
        q.quote_number
      FROM invoices i
      LEFT JOIN crm_clients c ON i.client_id = c.id
      LEFT JOIN quotes q ON i.quote_id = q.id
      ORDER BY i.issue_date DESC
    `;

    db.all(query, [], (err, invoices) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors de la récupération des factures:', err);
        reject(err);
      } else {
        resolve(invoices || []);
      }
    });
  });
};

/**
 * Récupère une facture par son ID
 */
const getInvoiceById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        i.*,
        c.name as client_company,
        c.email as client_company_email,
        c.address as client_company_address,
        q.quote_number
      FROM invoices i
      LEFT JOIN crm_clients c ON i.client_id = c.id
      LEFT JOIN quotes q ON i.quote_id = q.id
      WHERE i.id = $1
    `;

    db.pool.query(query, [id], (err, result) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors de la récupération de la facture:', err);
        return reject(err);
      }
      resolve(result.rows[0] || null);
    });
  });
};

/**
 * Récupère les factures impayées
 */
const getUnpaidInvoices = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        i.*,
        c.name as client_company,
        c.email as client_company_email
      FROM invoices i
      LEFT JOIN crm_clients c ON i.client_id = c.id
      WHERE i.payment_status IN ('pending', 'overdue', 'relance1', 'relance2')
      AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date ASC
    `;

    db.all(query, [], (err, invoices) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors de la récupération des factures impayées:', err);
        reject(err);
      } else {
        resolve(invoices || []);
      }
    });
  });
};

/**
 * Crée une nouvelle facture
 */
const createInvoice = async (db, invoiceData) => {
  const {
    quote_id,
    client_id,
    client_name,
    client_email,
    client_address,
    client_siret,
    items = [],
    cgv,
    tva_rate = 20.00,
    tva_applicable = true,
    acompte_type = 'none',
    acompte_value = 0,
    escompte_percent = 0,
    escompte_days = 0,
    payment_terms_days = 30,
    notes
  } = invoiceData;

  try {
    // Générer le numéro de facture
    const invoice_number = await generateInvoiceNumber(db);

    // Calculer les totaux
    let total_ht = 0;
    items.forEach(item => {
      total_ht += (item.quantity || 0) * (item.unit_price || 0);
    });

    const tva_amount = tva_applicable ? (total_ht * (tva_rate / 100)) : 0;
    const total_ttc = total_ht + tva_amount;

    // Calculer l'acompte
    let acompte_amount = 0;
    if (acompte_type === 'percent') {
      acompte_amount = total_ttc * (acompte_value / 100);
    } else if (acompte_type === 'fixed') {
      acompte_amount = acompte_value;
    }

    // Calculer les dates
    const issue_date = new Date();
    const due_date = new Date();
    due_date.setDate(due_date.getDate() + payment_terms_days);

    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO invoices (
          invoice_number, quote_id, client_id, client_name, client_email, client_address, client_siret,
          status, payment_status, total_ht, total_ttc, tva_rate, tva_amount, tva_applicable,
          items, cgv, acompte_type, acompte_value, acompte_amount,
          escompte_percent, escompte_days, payment_terms_days, notes,
          issue_date, due_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
        ) RETURNING id
      `;

      const params = [
        invoice_number, quote_id, client_id, client_name, client_email, client_address, client_siret,
        'draft', 'pending', total_ht, total_ttc, tva_rate, tva_amount, tva_applicable,
        JSON.stringify(items), cgv, acompte_type, acompte_value, acompte_amount,
        escompte_percent, escompte_days, payment_terms_days, notes,
        issue_date, due_date
      ];

      db.pool.query(query, params, (err, result) => {
        if (err) {
          console.error('[InvoiceModel] Erreur lors de la création de la facture:', err);
          return reject(err);
        }
        resolve({ id: result.rows[0].id, invoice_number });
      });
    });
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * Créer une facture à partir d'un devis
 */
const createInvoiceFromQuote = async (db, quoteId) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Récupérer le devis
      const quote = await getQuoteById(db, quoteId);
      if (!quote) {
        return reject(new Error('Devis introuvable'));
      }

      // Créer la facture avec les données du devis
      const invoiceData = {
        quote_id: quote.id,
        client_id: quote.client_id,
        client_name: quote.client_name,
        client_email: quote.client_email,
        client_address: quote.client_address,
        client_siret: quote.client_siret,
        items: typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items,
        cgv: quote.cgv,
        tva_rate: quote.tva_rate,
        tva_applicable: quote.tva_applicable,
        acompte_type: quote.acompte_type,
        acompte_value: quote.acompte_value,
        escompte_percent: quote.escompte_percent,
        escompte_days: quote.escompte_days,
        payment_terms_days: 30,
        notes: quote.notes
      };

      const result = await createInvoice(db, invoiceData);
      resolve(result);
    } catch (error) {
      console.error('[InvoiceModel] Erreur lors de la création de facture depuis devis:', error);
      reject(error);
    }
  });
};

// Helper pour récupérer un devis (pour createInvoiceFromQuote)
const getQuoteById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM quotes WHERE id = $1';
    db.pool.query(query, [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.rows[0] || null);
    });
  });
};

/**
 * Met à jour une facture
 */
const updateInvoice = (db, id, invoiceData) => {
  return new Promise((resolve, reject) => {
    const {
      client_id,
      client_name,
      client_email,
      client_address,
      client_siret,
      status,
      payment_status,
      items = [],
      cgv,
      tva_rate = 20.00,
      tva_applicable = true,
      acompte_type = 'none',
      acompte_value = 0,
      escompte_percent = 0,
      escompte_days = 0,
      payment_terms_days = 30,
      notes
    } = invoiceData;

    // Calculer les totaux
    let total_ht = 0;
    items.forEach(item => {
      total_ht += (item.quantity || 0) * (item.unit_price || 0);
    });

    const tva_amount = tva_applicable ? (total_ht * (tva_rate / 100)) : 0;
    const total_ttc = total_ht + tva_amount;

    // Calculer l'acompte
    let acompte_amount = 0;
    if (acompte_type === 'percent') {
      acompte_amount = total_ttc * (acompte_value / 100);
    } else if (acompte_type === 'fixed') {
      acompte_amount = acompte_value;
    }

    const query = `
      UPDATE invoices SET
        client_id = $1, client_name = $2, client_email = $3, client_address = $4, client_siret = $5,
        status = $6, payment_status = $7, total_ht = $8, total_ttc = $9, tva_rate = $10, tva_amount = $11, tva_applicable = $12,
        items = $13, cgv = $14, acompte_type = $15, acompte_value = $16, acompte_amount = $17,
        escompte_percent = $18, escompte_days = $19, payment_terms_days = $20, notes = $21,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $22
    `;

    const params = [
      client_id, client_name, client_email, client_address, client_siret,
      status, payment_status, total_ht, total_ttc, tva_rate, tva_amount, tva_applicable,
      JSON.stringify(items), cgv, acompte_type, acompte_value, acompte_amount,
      escompte_percent, escompte_days, payment_terms_days, notes,
      id
    ];

    db.pool.query(query, params, (err, result) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors de la mise à jour de la facture:', err);
        return reject(err);
      }
      resolve({ id, changes: result.rowCount });
    });
  });
};

/**
 * Marque une facture comme payée
 */
const markInvoiceAsPaid = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE invoices SET
        payment_status = 'paid',
        paid_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    db.pool.query(query, [id], (err, result) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors du marquage comme payée:', err);
        return reject(err);
      }
      resolve({ id, payment_status: 'paid', changes: result.rowCount });
    });
  });
};

/**
 * Met à jour le statut de paiement et le compteur de relances
 */
const updatePaymentStatus = (db, id, payment_status, reminder_count) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE invoices SET
        payment_status = $1,
        reminder_count = $2,
        last_reminder_date = CURRENT_DATE,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;

    db.pool.query(query, [payment_status, reminder_count, id], (err, result) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors de la mise à jour du statut de paiement:', err);
        return reject(err);
      }
      resolve({ id, payment_status, reminder_count, changes: result.rowCount });
    });
  });
};

/**
 * Supprime une facture
 */
const deleteInvoice = (db, id) => {
  return new Promise((resolve, reject) => {
    db.pool.query('DELETE FROM invoices WHERE id = $1', [id], (err, result) => {
      if (err) {
        console.error('[InvoiceModel] Erreur lors de la suppression de la facture:', err);
        return reject(err);
      }
      resolve({ changes: result.rowCount });
    });
  });
};

module.exports = {
  generateInvoiceNumber,
  getAllInvoices,
  getInvoiceById,
  getUnpaidInvoices,
  createInvoice,
  createInvoiceFromQuote,
  updateInvoice,
  markInvoiceAsPaid,
  updatePaymentStatus,
  deleteInvoice
};
