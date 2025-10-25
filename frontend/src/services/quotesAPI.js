// src/services/quotesAPI.js
import { apiRequest } from './api';

/**
 * Service API pour la gestion des devis
 */
export const quotesAPI = {
  /**
   * Récupère tous les devis
   */
  getAll: async () => {
    return apiRequest('GET', '/quotes');
  },

  /**
   * Récupère un devis par son ID
   */
  getById: async (id) => {
    return apiRequest('GET', `/quotes/${id}`);
  },

  /**
   * Crée un nouveau devis
   */
  create: async (quoteData) => {
    return apiRequest('POST', '/quotes', quoteData);
  },

  /**
   * Met à jour un devis
   */
  update: async (id, quoteData) => {
    return apiRequest('PUT', `/quotes/${id}`, quoteData);
  },

  /**
   * Change le statut d'un devis
   */
  updateStatus: async (id, status) => {
    return apiRequest('PATCH', `/quotes/${id}/status`, { status });
  },

  /**
   * Supprime un devis
   */
  delete: async (id) => {
    return apiRequest('DELETE', `/quotes/${id}`);
  }
};

/**
 * Service API pour la gestion des factures
 */
export const invoicesAPI = {
  /**
   * Récupère toutes les factures
   */
  getAll: async () => {
    return apiRequest('GET', '/invoices');
  },

  /**
   * Récupère une facture par son ID
   */
  getById: async (id) => {
    return apiRequest('GET', `/invoices/${id}`);
  },

  /**
   * Récupère les factures impayées
   */
  getUnpaid: async () => {
    return apiRequest('GET', '/invoices/unpaid');
  },

  /**
   * Crée une nouvelle facture
   */
  create: async (invoiceData) => {
    return apiRequest('POST', '/invoices', invoiceData);
  },

  /**
   * Crée une facture à partir d'un devis
   */
  createFromQuote: async (quoteId) => {
    return apiRequest('POST', `/invoices/from-quote/${quoteId}`);
  },

  /**
   * Met à jour une facture
   */
  update: async (id, invoiceData) => {
    return apiRequest('PUT', `/invoices/${id}`, invoiceData);
  },

  /**
   * Marque une facture comme payée
   */
  markAsPaid: async (id) => {
    return apiRequest('PATCH', `/invoices/${id}/paid`);
  },

  /**
   * Met à jour le statut de paiement
   */
  updatePaymentStatus: async (id, payment_status, reminder_count) => {
    return apiRequest('PATCH', `/invoices/${id}/payment-status`, {
      payment_status,
      reminder_count
    });
  },

  /**
   * Supprime une facture
   */
  delete: async (id) => {
    return apiRequest('DELETE', `/invoices/${id}`);
  }
};
