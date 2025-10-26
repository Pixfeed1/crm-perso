// backend/controllers/uploadController.js
/**
 * Contrôleur pour la gestion des uploads de fichiers
 */

const quoteModel = require('../models/quoteModel');
const invoiceModel = require('../models/invoiceModel');
const path = require('path');
const fs = require('fs').promises;

/**
 * Upload de fichiers pour un devis
 * POST /api/quotes/:id/upload
 */
const uploadQuoteFiles = async (req, res) => {
  const db = req.app.locals.db;
  const quoteId = req.params.id;

  try {
    // Vérifier que des fichiers ont été uploadés
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    // Récupérer le devis actuel
    const quote = await quoteModel.getQuoteById(db, quoteId);
    if (!quote) {
      // Supprimer les fichiers uploadés si le devis n'existe pas
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    // Préparer les nouvelles entrées de fichiers
    const newFiles = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedAt: new Date().toISOString()
    }));

    // Récupérer les fichiers existants
    let existingFiles = [];
    try {
      existingFiles = typeof quote.additional_files === 'string'
        ? JSON.parse(quote.additional_files)
        : (quote.additional_files || []);
    } catch (e) {
      existingFiles = [];
    }

    // Fusionner avec les nouveaux fichiers
    const updatedFiles = [...existingFiles, ...newFiles];

    // Mettre à jour la base de données
    await new Promise((resolve, reject) => {
      const query = `
        UPDATE quotes
        SET additional_files = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      db.pool.query(query, [JSON.stringify(updatedFiles), quoteId], (err, result) => {
        if (err) return reject(err);
        resolve(result.rows[0]);
      });
    });

    res.status(200).json({
      message: 'Fichiers uploadés avec succès',
      files: newFiles,
      totalFiles: updatedFiles.length
    });
  } catch (error) {
    console.error('Erreur upload fichiers devis:', error);
    // Nettoyer les fichiers en cas d'erreur
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
    }
    res.status(500).json({ message: 'Erreur lors de l\'upload des fichiers', error: error.message });
  }
};

/**
 * Upload de fichiers pour une facture
 * POST /api/invoices/:id/upload
 */
const uploadInvoiceFiles = async (req, res) => {
  const db = req.app.locals.db;
  const invoiceId = req.params.id;

  try {
    // Vérifier que des fichiers ont été uploadés
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    // Récupérer la facture actuelle
    const invoice = await invoiceModel.getInvoiceById(db, invoiceId);
    if (!invoice) {
      // Supprimer les fichiers uploadés si la facture n'existe pas
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
      return res.status(404).json({ message: 'Facture non trouvée' });
    }

    // Préparer les nouvelles entrées de fichiers
    const newFiles = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedAt: new Date().toISOString()
    }));

    // Récupérer les fichiers existants
    let existingFiles = [];
    try {
      existingFiles = typeof invoice.additional_files === 'string'
        ? JSON.parse(invoice.additional_files)
        : (invoice.additional_files || []);
    } catch (e) {
      existingFiles = [];
    }

    // Fusionner avec les nouveaux fichiers
    const updatedFiles = [...existingFiles, ...newFiles];

    // Mettre à jour la base de données
    await new Promise((resolve, reject) => {
      const query = `
        UPDATE invoices
        SET additional_files = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      db.pool.query(query, [JSON.stringify(updatedFiles), invoiceId], (err, result) => {
        if (err) return reject(err);
        resolve(result.rows[0]);
      });
    });

    res.status(200).json({
      message: 'Fichiers uploadés avec succès',
      files: newFiles,
      totalFiles: updatedFiles.length
    });
  } catch (error) {
    console.error('Erreur upload fichiers facture:', error);
    // Nettoyer les fichiers en cas d'erreur
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
    }
    res.status(500).json({ message: 'Erreur lors de l\'upload des fichiers', error: error.message });
  }
};

/**
 * Supprimer un fichier d'un devis
 * DELETE /api/quotes/:id/files/:filename
 */
const deleteQuoteFile = async (req, res) => {
  const db = req.app.locals.db;
  const { id: quoteId, filename } = req.params;

  try {
    const quote = await quoteModel.getQuoteById(db, quoteId);
    if (!quote) {
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    // Récupérer les fichiers existants
    let existingFiles = [];
    try {
      existingFiles = typeof quote.additional_files === 'string'
        ? JSON.parse(quote.additional_files)
        : (quote.additional_files || []);
    } catch (e) {
      existingFiles = [];
    }

    // Trouver le fichier à supprimer
    const fileToDelete = existingFiles.find(f => f.filename === filename);
    if (!fileToDelete) {
      return res.status(404).json({ message: 'Fichier non trouvé' });
    }

    // Supprimer le fichier physique
    await fs.unlink(fileToDelete.path).catch(() => {});

    // Retirer le fichier de la liste
    const updatedFiles = existingFiles.filter(f => f.filename !== filename);

    // Mettre à jour la base de données
    await new Promise((resolve, reject) => {
      const query = `
        UPDATE quotes
        SET additional_files = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      db.pool.query(query, [JSON.stringify(updatedFiles), quoteId], (err, result) => {
        if (err) return reject(err);
        resolve(result.rows[0]);
      });
    });

    res.status(200).json({ message: 'Fichier supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression fichier devis:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du fichier', error: error.message });
  }
};

/**
 * Supprimer un fichier d'une facture
 * DELETE /api/invoices/:id/files/:filename
 */
const deleteInvoiceFile = async (req, res) => {
  const db = req.app.locals.db;
  const { id: invoiceId, filename } = req.params;

  try {
    const invoice = await invoiceModel.getInvoiceById(db, invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: 'Facture non trouvée' });
    }

    // Récupérer les fichiers existants
    let existingFiles = [];
    try {
      existingFiles = typeof invoice.additional_files === 'string'
        ? JSON.parse(invoice.additional_files)
        : (invoice.additional_files || []);
    } catch (e) {
      existingFiles = [];
    }

    // Trouver le fichier à supprimer
    const fileToDelete = existingFiles.find(f => f.filename === filename);
    if (!fileToDelete) {
      return res.status(404).json({ message: 'Fichier non trouvé' });
    }

    // Supprimer le fichier physique
    await fs.unlink(fileToDelete.path).catch(() => {});

    // Retirer le fichier de la liste
    const updatedFiles = existingFiles.filter(f => f.filename !== filename);

    // Mettre à jour la base de données
    await new Promise((resolve, reject) => {
      const query = `
        UPDATE invoices
        SET additional_files = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      db.pool.query(query, [JSON.stringify(updatedFiles), invoiceId], (err, result) => {
        if (err) return reject(err);
        resolve(result.rows[0]);
      });
    });

    res.status(200).json({ message: 'Fichier supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression fichier facture:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du fichier', error: error.message });
  }
};

/**
 * Télécharger un fichier
 * GET /api/uploads/:filename
 */
const downloadFile = async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '..', 'uploads', filename);

  try {
    // Vérifier que le fichier existe
    await fs.access(filePath);

    // Envoyer le fichier
    res.download(filePath);
  } catch (error) {
    console.error('Erreur téléchargement fichier:', error);
    res.status(404).json({ message: 'Fichier non trouvé' });
  }
};

module.exports = {
  uploadQuoteFiles,
  uploadInvoiceFiles,
  deleteQuoteFile,
  deleteInvoiceFile,
  downloadFile
};
