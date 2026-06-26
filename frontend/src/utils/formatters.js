// src/utils/formatters.js
/**
 * Fonctions utilitaires pour le formatage des données
 */

/**
 * Formate une date en format français
 * @param {string} dateString - Date au format ISO
 * @param {object} options - Options de formatage Intl.DateTimeFormat
 * @returns {string} Date formatée
 */
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  const defaultOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options
  };

  return new Intl.DateTimeFormat('fr-FR', defaultOptions).format(date);
};

/**
 * Formate une valeur monétaire en euros
 * @param {number} value - Valeur à formater
 * @param {object} options - Options de formatage
 * @returns {string|null} Valeur formatée ou null si 0
 */
export const formatValue = (value, options = {}) => {
  if (!value || value === 0) return options.showZero ? '0 €' : null;

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    ...options
  }).format(value);
};

/**
 * Formate un montant (alias pour formatValue avec texte par défaut si 0)
 * @param {number} amount - Montant à formater
 * @returns {string} Montant formaté
 */
export const formatAmount = (amount) => {
  if (!amount || amount === 0) return '0 €';

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Formate un nombre avec séparateurs de milliers
 * @param {number} number - Nombre à formater
 * @returns {string} Nombre formaté
 */
export const formatNumber = (number) => {
  if (number === null || number === undefined) return '0';
  return new Intl.NumberFormat('fr-FR').format(number);
};

/**
 * Décode les entités HTML d'une chaîne (&rsquo; &amp; &eacute; &ndash; ...).
 * WordPress stocke les titres avec des entités ; on les rend lisibles à l'affichage.
 * Utilise un <textarea> (décode TOUTES les entités) avec un cache mémoire.
 * @param {string} str - Chaîne potentiellement encodée
 * @returns {string} Chaîne décodée
 */
const _htmlEntityCache = new Map();
export const decodeHtml = (str) => {
  if (!str || typeof str !== 'string') return str;
  if (str.indexOf('&') === -1) return str; // rien à décoder
  if (_htmlEntityCache.has(str)) return _htmlEntityCache.get(str);
  let decoded = str;
  try {
    const el = document.createElement('textarea');
    el.innerHTML = str;
    decoded = el.value;
  } catch (e) {
    decoded = str;
  }
  _htmlEntityCache.set(str, decoded);
  return decoded;
};

/**
 * Formate une date longue (avec mois complet)
 * @param {string} dateString - Date au format ISO
 * @returns {string} Date formatée
 */
export const formatLongDate = (dateString) => {
  return formatDate(dateString, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

/**
 * Formate une date courte (JJ/MM/AAAA)
 * @param {string} dateString - Date au format ISO
 * @returns {string} Date formatée
 */
export const formatShortDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR');
};
