// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();

console.log('[AUTH ROUTES] Démarrage du chargement des routes d\'authentification');

// Vérifier que le module authController est correctement chargé
try {
    const authController = require('../controllers/authController');
    console.log('[AUTH ROUTES] Module authController chargé avec succès');
    console.log('[AUTH ROUTES] Fonctions disponibles dans authController:', Object.keys(authController));
    
    if (!authController.login) {
        console.error('[AUTH ROUTES] ERREUR: La fonction login n\'existe pas dans authController');
    } else {
        console.log('[AUTH ROUTES] Fonction login trouvée dans authController');
    }
    
    if (!authController.checkAuth) {
        console.error('[AUTH ROUTES] ERREUR: La fonction checkAuth n\'existe pas dans authController');
    } else {
        console.log('[AUTH ROUTES] Fonction checkAuth trouvée dans authController');
    }
    
    // Vérifier que le middleware d'authentification est disponible
    const authMiddleware = require('../middleware/authMiddleware');
    console.log('[AUTH ROUTES] Middleware d\'authentification chargé avec succès');

    // Log pour chaque requête reçue sur les routes d'authentification
    router.use((req, res, next) => {
        console.log(`[AUTH ROUTES] Requête ${req.method} reçue sur ${req.originalUrl} à ${new Date().toISOString()}`);
        console.log('[AUTH ROUTES] Corps de la requête:', JSON.stringify(req.body, null, 2));
        console.log('[AUTH ROUTES] En-têtes de la requête:', JSON.stringify(req.headers, null, 2));
        next();
    });

    // Route de connexion - seulement si login existe
    if (typeof authController.login === 'function') {
        router.post('/login', (req, res, next) => {
            console.log('[AUTH ROUTES] Tentative de connexion pour l\'utilisateur:', req.body.username || req.body.email || 'Identifiant non fourni');
            next();
        }, authController.login);
        console.log('[AUTH ROUTES] Route POST /login configurée');
    } else {
        // Fallback si login n'existe pas
        router.post('/login', (req, res) => {
            console.error('[AUTH ROUTES] Erreur: La fonction login n\'est pas disponible');
            res.status(500).json({ message: 'Erreur serveur: fonction de login non disponible' });
        });
        console.log('[AUTH ROUTES] Route POST /login fallback configurée');
    }

    // Route pour vérifier l'authentification - seulement si checkAuth existe
    if (typeof authController.checkAuth === 'function') {
        router.get('/check', (req, res, next) => {
            console.log('[AUTH ROUTES] Vérification d\'authentification demandée');
            next();
        }, authMiddleware, (req, res, next) => {
            console.log('[AUTH ROUTES] Authentification réussie par middleware, utilisateur identifié:', req.user ? req.user.id : 'ID non disponible');
            next();
        }, authController.checkAuth);
        console.log('[AUTH ROUTES] Route GET /check configurée');
    } else {
        // Fallback si checkAuth n'existe pas
        router.get('/check', (req, res) => {
            console.error('[AUTH ROUTES] Erreur: La fonction checkAuth n\'est pas disponible');
            res.status(500).json({ message: 'Erreur serveur: fonction de vérification non disponible' });
        });
        console.log('[AUTH ROUTES] Route GET /check fallback configurée');
    }

    // Route pour demander la réinitialisation du mot de passe
    if (typeof authController.forgotPassword === 'function') {
        router.post('/forgot-password', (req, res, next) => {
            console.log('[AUTH ROUTES] Demande de réinitialisation de mot de passe pour:', req.body.email || 'Email non fourni');
            next();
        }, authController.forgotPassword);
        console.log('[AUTH ROUTES] Route POST /forgot-password configurée');
    } else {
        router.post('/forgot-password', (req, res) => {
            console.error('[AUTH ROUTES] Erreur: La fonction forgotPassword n\'est pas disponible');
            res.status(500).json({ message: 'Erreur serveur: fonction de réinitialisation non disponible' });
        });
        console.log('[AUTH ROUTES] Route POST /forgot-password fallback configurée');
    }

    // Route pour réinitialiser le mot de passe
    if (typeof authController.resetPassword === 'function') {
        router.post('/reset-password', (req, res, next) => {
            console.log('[AUTH ROUTES] Réinitialisation du mot de passe demandée');
            next();
        }, authController.resetPassword);
        console.log('[AUTH ROUTES] Route POST /reset-password configurée');
    } else {
        router.post('/reset-password', (req, res) => {
            console.error('[AUTH ROUTES] Erreur: La fonction resetPassword n\'est pas disponible');
            res.status(500).json({ message: 'Erreur serveur: fonction de réinitialisation non disponible' });
        });
        console.log('[AUTH ROUTES] Route POST /reset-password fallback configurée');
    }

    // Logs de fin de requête
    router.use((req, res, next) => {
        const oldSend = res.send;
        res.send = function(data) {
            console.log(`[AUTH ROUTES] Réponse envoyée pour ${req.method} ${req.originalUrl} avec statut ${res.statusCode}`);
            if (res.statusCode >= 400) {
                console.error('[AUTH ROUTES] Erreur détectée dans la réponse:', data);
            }
            return oldSend.apply(res, arguments);
        };
        next();
    });

    // Log des erreurs
    router.use((err, req, res, next) => {
        console.error('[AUTH ROUTES] Erreur interceptée:', err);
        console.error('[AUTH ROUTES] Stack trace:', err.stack);
        next(err);
    });

} catch (error) {
    console.error('[AUTH ROUTES] ERREUR CRITIQUE lors du chargement des dépendances:', error);
    console.error('[AUTH ROUTES] Stack trace:', error.stack);
    
    // Créer des routes fallback
    router.post('/login', (req, res) => {
        res.status(500).json({ message: 'Erreur serveur: configuration des routes d\'authentification' });
    });
    
    router.get('/check', (req, res) => {
        res.status(500).json({ message: 'Erreur serveur: configuration des routes d\'authentification' });
    });
}

console.log('[AUTH ROUTES] Configuration des routes d\'authentification terminée');

module.exports = router;