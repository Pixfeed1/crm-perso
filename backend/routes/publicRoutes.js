// backend/routes/publicRoutes.js
/**
 * Routes publiques (sans authentification)
 */

const express = require('express');
const router = express.Router();
const quoteModel = require('../models/quoteModel');

// GET /api/public/quotes/:id - Récupérer un devis (public, pour signature client)
router.get('/quotes/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const quote = await quoteModel.getQuoteById(db, id);
    if (!quote) {
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    // Retourner uniquement les données nécessaires (sans infos sensibles)
    res.json({
      id: quote.id,
      quote_number: quote.quote_number,
      title: quote.title,
      client_name: quote.client_name,
      client_email: quote.client_email,
      client_address: quote.client_address,
      items: quote.items,
      total_ht: quote.total_ht,
      total_ttc: quote.total_ttc,
      tva_rate: quote.tva_rate,
      tva_amount: quote.tva_amount,
      discount_type: quote.discount_type,
      discount_value: quote.discount_value,
      discount_amount: quote.discount_amount,
      tva_regime: quote.tva_regime,
      payment_methods: quote.payment_methods,
      cgv: quote.cgv,
      additional_info: quote.additional_info,
      validity_days: quote.validity_days,
      status: quote.status,
      signed_at: quote.signed_at,
      signed_by: quote.signed_by,
      created_at: quote.created_at
    });
  } catch (error) {
    console.error('Erreur récupération devis public:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
