// backend/models/paymentModel.js

/**
 * Récupère tous les paiements
 */
const getAllPayments = (db) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.*,
        i.invoice_number,
        i.client_name,
        i.total_ttc as invoice_total,
        c.name as client_company
      FROM payments p
      INNER JOIN invoices i ON p.invoice_id = i.id
      LEFT JOIN crm_clients c ON i.client_id = c.id
      ORDER BY p.payment_date DESC
    `;

    db.all(query, [], (err, payments) => {
      if (err) {
        console.error('[PaymentModel] Erreur lors de la récupération des paiements:', err);
        reject(err);
      } else {
        resolve(payments || []);
      }
    });
  });
};

/**
 * Récupère un paiement par son ID
 */
const getPaymentById = (db, id) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.*,
        i.invoice_number,
        i.client_name,
        i.total_ttc as invoice_total
      FROM payments p
      INNER JOIN invoices i ON p.invoice_id = i.id
      WHERE p.id = $1
    `;

    db.pool.query(query, [id], (err, result) => {
      if (err) {
        console.error('[PaymentModel] Erreur lors de la récupération du paiement:', err);
        return reject(err);
      }
      resolve(result.rows[0] || null);
    });
  });
};

/**
 * Récupère tous les paiements d'une facture
 */
const getPaymentsByInvoice = (db, invoiceId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT *
      FROM payments
      WHERE invoice_id = $1
      ORDER BY payment_date DESC, created_at DESC
    `;

    db.pool.query(query, [invoiceId], (err, result) => {
      if (err) {
        console.error('[PaymentModel] Erreur lors de la récupération des paiements de la facture:', err);
        return reject(err);
      }
      resolve(result.rows || []);
    });
  });
};

/**
 * Récupère les paiements d'un client
 */
const getPaymentsByClient = (db, clientId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT
        p.*,
        i.invoice_number,
        i.total_ttc as invoice_total
      FROM payments p
      INNER JOIN invoices i ON p.invoice_id = i.id
      WHERE i.client_id = $1
      ORDER BY p.payment_date DESC
    `;

    db.pool.query(query, [clientId], (err, result) => {
      if (err) {
        console.error('[PaymentModel] Erreur lors de la récupération des paiements du client:', err);
        return reject(err);
      }
      resolve(result.rows || []);
    });
  });
};

/**
 * Crée un nouveau paiement
 */
const createPayment = async (db, paymentData) => {
  return new Promise(async (resolve, reject) => {
    const {
      invoice_id,
      amount,
      payment_date,
      payment_method,
      reference,
      status = 'completed',
      notes,
      created_by
    } = paymentData;

    const query = `
      INSERT INTO payments (
        invoice_id, amount, payment_date, payment_method,
        reference, status, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      invoice_id,
      amount,
      payment_date || new Date(),
      payment_method,
      reference,
      status,
      notes,
      created_by
    ];

    try {
      const result = await db.pool.query(query, values);
      const payment = result.rows[0];

      // Mettre à jour le statut de paiement de la facture
      await updateInvoicePaymentStatus(db, invoice_id);

      resolve(payment);
    } catch (err) {
      console.error('[PaymentModel] Erreur lors de la création du paiement:', err);
      reject(err);
    }
  });
};

/**
 * Met à jour un paiement
 */
const updatePayment = async (db, id, paymentData) => {
  return new Promise(async (resolve, reject) => {
    const {
      amount,
      payment_date,
      payment_method,
      reference,
      status,
      notes
    } = paymentData;

    const query = `
      UPDATE payments
      SET
        amount = COALESCE($1, amount),
        payment_date = COALESCE($2, payment_date),
        payment_method = COALESCE($3, payment_method),
        reference = COALESCE($4, reference),
        status = COALESCE($5, status),
        notes = COALESCE($6, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;

    const values = [amount, payment_date, payment_method, reference, status, notes, id];

    try {
      const result = await db.pool.query(query, values);
      const payment = result.rows[0];

      if (!payment) {
        return reject(new Error('Paiement non trouvé'));
      }

      // Mettre à jour le statut de paiement de la facture
      await updateInvoicePaymentStatus(db, payment.invoice_id);

      resolve(payment);
    } catch (err) {
      console.error('[PaymentModel] Erreur lors de la mise à jour du paiement:', err);
      reject(err);
    }
  });
};

/**
 * Supprime un paiement
 */
const deletePayment = async (db, id) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Récupérer l'invoice_id avant la suppression
      const paymentResult = await db.pool.query('SELECT invoice_id FROM payments WHERE id = $1', [id]);
      if (paymentResult.rows.length === 0) {
        return reject(new Error('Paiement non trouvé'));
      }
      const invoiceId = paymentResult.rows[0].invoice_id;

      // Supprimer le paiement
      const deleteQuery = 'DELETE FROM payments WHERE id = $1 RETURNING *';
      const result = await db.pool.query(deleteQuery, [id]);

      if (result.rows.length === 0) {
        return reject(new Error('Paiement non trouvé'));
      }

      // Mettre à jour le statut de paiement de la facture
      await updateInvoicePaymentStatus(db, invoiceId);

      resolve({ success: true, payment: result.rows[0] });
    } catch (err) {
      console.error('[PaymentModel] Erreur lors de la suppression du paiement:', err);
      reject(err);
    }
  });
};

/**
 * Met à jour le statut de paiement d'une facture
 * Calcule automatiquement amount_paid, amount_remaining et payment_status
 */
const updateInvoicePaymentStatus = async (db, invoiceId) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Récupérer le total de la facture
      const invoiceResult = await db.pool.query(
        'SELECT total_ttc FROM invoices WHERE id = $1',
        [invoiceId]
      );

      if (invoiceResult.rows.length === 0) {
        return reject(new Error('Facture non trouvée'));
      }

      const totalTtc = parseFloat(invoiceResult.rows[0].total_ttc) || 0;

      // Calculer le total des paiements
      const paymentsResult = await db.pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total_paid
         FROM payments
         WHERE invoice_id = $1 AND status = 'completed'`,
        [invoiceId]
      );

      const totalPaid = parseFloat(paymentsResult.rows[0].total_paid) || 0;
      const amountRemaining = Math.max(0, totalTtc - totalPaid);

      // Déterminer le statut de paiement
      let paymentStatus;
      if (totalPaid === 0) {
        paymentStatus = 'pending';
      } else if (totalPaid >= totalTtc) {
        paymentStatus = 'paid';
      } else {
        paymentStatus = 'partial';
      }

      // Vérifier si la facture est en retard
      const dueDateResult = await db.pool.query(
        'SELECT due_date FROM invoices WHERE id = $1',
        [invoiceId]
      );

      if (dueDateResult.rows.length > 0 && dueDateResult.rows[0].due_date) {
        const dueDate = new Date(dueDateResult.rows[0].due_date);
        const now = new Date();
        if (now > dueDate && paymentStatus !== 'paid') {
          paymentStatus = 'overdue';
        }
      }

      // Mettre à jour la facture
      const updateQuery = `
        UPDATE invoices
        SET
          amount_paid = $1,
          amount_remaining = $2,
          payment_status = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;

      const result = await db.pool.query(updateQuery, [totalPaid, amountRemaining, paymentStatus, invoiceId]);
      resolve(result.rows[0]);
    } catch (err) {
      console.error('[PaymentModel] Erreur lors de la mise à jour du statut de paiement:', err);
      reject(err);
    }
  });
};

/**
 * Récupère les statistiques de trésorerie
 */
const getTreasuryStats = (db, startDate, endDate) => {
  return new Promise(async (resolve, reject) => {
    try {
      const query = `
        SELECT
          COALESCE(SUM(p.amount), 0) as total_received,
          COUNT(p.id) as payment_count,
          COALESCE(SUM(CASE WHEN p.payment_date >= $1 AND p.payment_date <= $2 THEN p.amount ELSE 0 END), 0) as period_received
        FROM payments p
        WHERE p.status = 'completed'
      `;

      const result = await db.pool.query(query, [startDate, endDate]);
      const stats = result.rows[0];

      // Récupérer le montant total des factures impayées
      const unpaidQuery = `
        SELECT COALESCE(SUM(amount_remaining), 0) as total_unpaid
        FROM invoices
        WHERE payment_status IN ('pending', 'partial', 'overdue')
      `;

      const unpaidResult = await db.pool.query(unpaidQuery);
      stats.total_unpaid = parseFloat(unpaidResult.rows[0].total_unpaid) || 0;

      // Récupérer le montant total des factures en retard
      const overdueQuery = `
        SELECT COALESCE(SUM(amount_remaining), 0) as total_overdue
        FROM invoices
        WHERE payment_status = 'overdue'
      `;

      const overdueResult = await db.pool.query(overdueQuery);
      stats.total_overdue = parseFloat(overdueResult.rows[0].total_overdue) || 0;

      resolve(stats);
    } catch (err) {
      console.error('[PaymentModel] Erreur lors de la récupération des statistiques:', err);
      reject(err);
    }
  });
};

/**
 * Récupère les paiements pour un graphique de trésorerie
 */
const getPaymentsForChart = (db, startDate, endDate) => {
  return new Promise(async (resolve, reject) => {
    try {
      const query = `
        SELECT
          payment_date,
          SUM(amount) as total_amount,
          COUNT(*) as payment_count
        FROM payments
        WHERE payment_date >= $1 AND payment_date <= $2
          AND status = 'completed'
        GROUP BY payment_date
        ORDER BY payment_date ASC
      `;

      const result = await db.pool.query(query, [startDate, endDate]);
      resolve(result.rows || []);
    } catch (err) {
      console.error('[PaymentModel] Erreur lors de la récupération des paiements pour le graphique:', err);
      reject(err);
    }
  });
};

module.exports = {
  getAllPayments,
  getPaymentById,
  getPaymentsByInvoice,
  getPaymentsByClient,
  createPayment,
  updatePayment,
  deletePayment,
  updateInvoicePaymentStatus,
  getTreasuryStats,
  getPaymentsForChart
};
