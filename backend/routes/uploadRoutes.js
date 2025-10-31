// backend/routes/uploadRoutes.js
/**
 * Routes pour l'upload de fichiers
 */

const express = require('express');
const router = express.Router();
const upload = require('../config/multerConfig');
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');

// Toutes les routes sont protégées par authentification
router.use(authMiddleware);

// Upload de fichiers pour un devis (multiple files)
router.post('/quotes/:id', upload.array('files', 10), uploadController.uploadQuoteFiles);

// Upload de fichiers pour une facture (multiple files)
router.post('/invoices/:id', upload.array('files', 10), uploadController.uploadInvoiceFiles);

// Supprimer un fichier d'un devis
router.delete('/quotes/:id/files/:filename', uploadController.deleteQuoteFile);

// Supprimer un fichier d'une facture
router.delete('/invoices/:id/files/:filename', uploadController.deleteInvoiceFile);

// Télécharger un fichier
router.get('/:filename', uploadController.downloadFile);

module.exports = router;
