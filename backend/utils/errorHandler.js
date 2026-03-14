// backend/utils/errorHandler.js

/**
 * Gestion centralisee des erreurs serveur
 * - Log complet cote serveur pour debug
 * - Message simplifie cote client (sans infos sensibles)
 */

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Envoie une reponse d'erreur standardisee
 * @param {Response} res - Objet response Express
 * @param {Error} err - Erreur capturee
 * @param {string} context - Contexte de l'erreur (ex: "recuperation des leads")
 * @param {number} statusCode - Code HTTP (defaut 500)
 */
function handleError(res, err, context, statusCode = 500) {
  // Log complet serveur
  console.error(`[ERREUR] ${context}:`, err.message);
  if (isDev) {
    console.error(err.stack);
  }

  // Reponse client
  const response = {
    success: false,
    message: `Erreur lors de ${context}`,
    error: isDev ? err.message : undefined,
    code: err.code || undefined
  };

  return res.status(statusCode).json(response);
}

/**
 * Wrapper pour les controleurs async
 * Capture automatiquement les erreurs
 */
function asyncHandler(fn, context) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      handleError(res, err, context);
    });
  };
}

module.exports = {
  handleError,
  asyncHandler
};
