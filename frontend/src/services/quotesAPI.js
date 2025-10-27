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
    return apiRequest('/quotes');
  },

  /**
   * Récupère un devis par son ID
   */
  getById: async (id) => {
    return apiRequest(`/quotes/${id}`);
  },

  /**
   * Crée un nouveau devis
   */
  create: async (quoteData) => {
    return apiRequest('/quotes', 'POST', quoteData);
  },

  /**
   * Met à jour un devis
   */
  update: async (id, quoteData) => {
    return apiRequest(`/quotes/${id}`, 'PUT', quoteData);
  },

  /**
   * Change le statut d'un devis
   */
  updateStatus: async (id, status) => {
    return apiRequest(`/quotes/${id}/status`, 'PATCH', { status });
  },

  /**
   * Supprime un devis
   */
  delete: async (id) => {
    return apiRequest(`/quotes/${id}`, 'DELETE');
  },

  /**
   * Envoie un devis par email
   */
  sendEmail: async (id, emailData) => {
    return apiRequest(`/quotes/${id}/send`, 'POST', emailData);
  },

  /**
   * Signe un devis électroniquement
   */
  signQuote: async (id, signatureData) => {
    return apiRequest(`/quotes/${id}/sign`, 'POST', signatureData);
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
    return apiRequest('/invoices');
  },

  /**
   * Récupère une facture par son ID
   */
  getById: async (id) => {
    return apiRequest(`/invoices/${id}`);
  },

  /**
   * Récupère les factures impayées
   */
  getUnpaid: async () => {
    return apiRequest('/invoices/unpaid');
  },

  /**
   * Crée une nouvelle facture
   */
  create: async (invoiceData) => {
    return apiRequest('/invoices', 'POST', invoiceData);
  },

  /**
   * Crée une facture à partir d'un devis
   */
  createFromQuote: async (quoteId) => {
    return apiRequest(`/invoices/from-quote/${quoteId}`, 'POST');
  },

  /**
   * Met à jour une facture
   */
  update: async (id, invoiceData) => {
    return apiRequest(`/invoices/${id}`, 'PUT', invoiceData);
  },

  /**
   * Marque une facture comme payée
   */
  markAsPaid: async (id) => {
    return apiRequest(`/invoices/${id}/paid`, 'PATCH');
  },

  /**
   * Met à jour le statut de paiement
   */
  updatePaymentStatus: async (id, payment_status, reminder_count) => {
    return apiRequest(`/invoices/${id}/payment-status`, 'PATCH', {
      payment_status,
      reminder_count
    });
  },

  /**
   * Supprime une facture
   */
  delete: async (id) => {
    return apiRequest(`/invoices/${id}`, 'DELETE');
  },

  /**
   * Envoie une facture par email
   */
  sendEmail: async (id, emailData) => {
    return apiRequest(`/invoices/${id}/send`, 'POST', emailData);
  }
};
