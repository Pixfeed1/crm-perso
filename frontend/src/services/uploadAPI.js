// src/services/uploadAPI.js
import { getAuthToken } from './authService';

// URL de base de l'API
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://crm.pixfeed.net'
  : 'http://localhost:5000';

/**
 * Service API pour l'upload et la gestion des fichiers
 */
export const uploadAPI = {
  /**
   * Upload de fichiers pour un devis
   */
  uploadQuoteFiles: async (quoteId, files) => {
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/upload/quotes/${quoteId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Erreur lors de l\'upload');
    }

    return response.json();
  },

  /**
   * Upload de fichiers pour une facture
   */
  uploadInvoiceFiles: async (invoiceId, files) => {
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/api/upload/invoices/${invoiceId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Erreur lors de l\'upload');
    }

    return response.json();
  },

  /**
   * Supprime un fichier d'un devis
   */
  deleteQuoteFile: async (quoteId, filename) => {
    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/api/upload/quotes/${quoteId}/files/${filename}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Erreur lors de la suppression');
    }

    return response.json();
  },

  /**
   * Supprime un fichier d'une facture
   */
  deleteInvoiceFile: async (invoiceId, filename) => {
    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/api/upload/invoices/${invoiceId}/files/${filename}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Erreur lors de la suppression');
    }

    return response.json();
  },

  /**
   * Obtient l'URL de téléchargement d'un fichier
   */
  getFileUrl: (filename) => {
    return `${API_BASE_URL}/uploads/${filename}`;
  }
};
