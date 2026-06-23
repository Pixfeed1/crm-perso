// backend/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const db = require('./config/pgConfig'); // Changé pour utiliser PostgreSQL
const { autoInitDatabase } = require('./scripts/autoInitDatabase');
const scheduledEmailWorker = require('./services/scheduledEmailWorker');
const maintenanceReminderWorker = require('./services/maintenanceReminderWorker');
const veilleMissionsWorker = require('./services/veilleMissionsWorker');

// Charger les variables d'environnement
dotenv.config();

// Initialiser l'application Express
const app = express();

// Derriere le reverse-proxy Apache (cPanel) : faire confiance au premier proxy
// pour recuperer l'IP reelle (X-Forwarded-For/Proto). Requis AVANT le rate-limit.
app.set('trust proxy', 1);

// Configuration du logger
const logFormat = process.env.NODE_ENV === 'development' ? 'dev' : 'combined';
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'access.log'), 
  { flags: 'a' }
);

// Middleware global pour logger toutes les requêtes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Securite des en-tetes HTTP. CSP desactivee pour l'instant (une CSP stricte
// casserait le SPA React) : a regler plus tard, separement.
app.use(helmet({ contentSecurityPolicy: false }));

// Middleware standard
// CORS : liste blanche explicite via ALLOWED_ORIGINS (origines separees par des
// virgules), sans aucun fallback permissif. Les credentials restent autorises.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Pas d'en-tete Origin (same-origin, curl, health checks) ou origine listee : autorise
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origine non autorisee par CORS'));
  },
  credentials: true
}));
app.use(cookieParser());

// Webhook Stripe (prélèvement maintenance) : monté AVANT express.json() car la
// vérification de signature exige le corps BRUT (express.raw dans ce routeur).
// Route publique serveur-à-serveur, sans authMiddleware.
app.use('/api/maintenance-billing', require('./routes/maintenanceBillingRoutes'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan(logFormat, { stream: accessLogStream }));
app.use(morgan('dev'));

// Vérifier si JWT_SECRET est défini
if (!process.env.JWT_SECRET) {
  console.error("ERREUR CRITIQUE: JWT_SECRET n'est pas défini dans les variables d'environnement.");
  console.error("Ajoutez JWT_SECRET dans votre fichier .env");
  process.exit(1);
}

// Vérifier si les variables d'environnement PostgreSQL sont définies
if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_HOST || !process.env.DB_NAME) {
  console.warn("ATTENTION: Certaines variables d'environnement PostgreSQL ne sont pas définies. Utilisation des valeurs par défaut.");
}

// Rendre la base de données accessible aux routes
app.locals.db = db;

// Définir le port
const PORT = process.env.PORT || 5000;

// Définir explicitement les chemins des fichiers critiques
const publicPath = path.join(__dirname, 'public');
const frontendPath = path.join(__dirname, '../frontend');
const buildPath = path.join(frontendPath, 'build');
const indexPath = path.join(buildPath, 'index.html');

console.log('=== VÉRIFICATION DES CHEMINS ===');
console.log('Chemin public:', publicPath);
console.log('Chemin build frontend:', buildPath);
console.log('index.html existe:', fs.existsSync(indexPath), '(chemin:', indexPath, ')');
console.log('===============================');

// 1. Routes d'API - /api/*
// Routes publiques (AVANT authMiddleware)
app.use('/api/public', require('./routes/publicRoutes'));
app.use('/api/webhooks', require('./routes/webhookRoutes'));

// Rate-limit cible sur les routes d'authentification sensibles (10 tentatives / 15 min / IP).
// Applique uniquement sur les POST concernes, pas en global.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop de tentatives. Veuillez reessayer dans 15 minutes.' }
});
app.post('/api/auth/login', authLimiter);
app.post('/api/auth/forgot-password', authLimiter);

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/activities', require('./routes/activitiesRoutes'));
app.use('/api/leads', require('./routes/leadsRoutes'));
app.use('/api/leads', require('./routes/leadInteractionRoutes'));
app.use('/api/clients', require('./routes/clientsRoutes'));
app.use('/api/projects', require('./routes/projectsRoutes'));
app.use('/api/events', require('./routes/eventsRoutes'));
app.use('/api/goals', require('./routes/goalsRoutes'));
app.use('/api/objectif', require('./routes/objectifRoutes'));
app.use('/api/veille', require('./routes/veilleRoutes'));
app.use('/api/revenues', require('./routes/revenuesRoutes'));
app.use('/api/reminders', require('./routes/reminderRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/sirene', require('./routes/sireneRoutes'));
app.use('/api/quotes', require('./routes/quoteRoutes'));
app.use('/api/invoices', require('./routes/invoiceRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/tva-regimes', require('./routes/tvaRegimeRoutes'));
app.use('/api/payment-methods', require('./routes/paymentMethodRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/prospection', require('./routes/prospectionRoutes'));
app.use('/api/calendar-sync', require('./routes/calendarSyncRoutes'));
app.use('/api/video-conference', require('./routes/videoConferenceRoutes'));
app.use('/api/review-requests', require('./routes/reviewRequestRoutes'));
app.use('/api/interventions', require('./routes/interventionRoutes'));
app.use('/api/interactions', require('./routes/interactionRoutes'));
app.use('/api/portefeuille/crawl', require('./routes/crawlRoutes'));
app.use('/api/email-templates', require('./routes/emailTemplateRoutes'));
app.use('/api/email-signatures', require('./routes/emailSignatureRoutes'));
app.use('/api/maintenance-reports', require('./routes/maintenanceReportRoutes'));
app.use('/api/maintenance-contracts', require('./routes/maintenanceContractRoutes'));
app.use('/api/subscriptions', require('./routes/subscriptionRoutes'));
app.use('/api/scheduled-emails', require('./routes/scheduledEmailRoutes'));

// Lien court PUBLIC de paiement de maintenance (/pay/:token) : crée une session
// Stripe fraîche au clic et redirige vers Checkout. Monté AVANT le catch-all SPA.
app.use('/pay', require('./routes/maintenancePayRoutes'));

// Lien court via le sous-domaine pay.pixfeed.net : https://pay.pixfeed.net/{token}
// Ne matche QUE un token hexadécimal long (>=40 [a-f0-9]) directement à la racine,
// pour ne jamais entrer en conflit avec les routes du SPA (clients, maintenance, etc.).
// Monté AVANT le catch-all SPA. La logique est identique à /pay/:token.
const maintenanceContractController = require('./controllers/maintenanceContractController');
app.get(/^\/([a-f0-9]{40,})$/i, maintenanceContractController.payRedirect);

// Servir les fichiers uploadés en statique (protégés par auth si nécessaire)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. Servir les fichiers statiques du dossier public
app.use(express.static(publicPath));

// 3. Servir les fichiers statiques du build React
if (fs.existsSync(buildPath)) {
  console.log("[SERVER] Serving React frontend from:", buildPath);
  app.use(express.static(buildPath));
}

// 4. Redirection de la racine vers la page de login React
app.get('/', (req, res) => {
  console.log('[SERVER] Redirection de la racine vers /login');
  res.redirect('/login');
});

// 5. Toutes les autres routes sont gérées par React
app.get('*', (req, res) => {
  console.log(`[SERVER] Route: ${req.path}`);
  
  // Vérifier si la requête est pour un fichier statique ou API
  if (req.path.startsWith('/api/') || 
      req.path.startsWith('/static/') || 
      req.path.startsWith('/assets/')) {
    console.log('[SERVER] Ressource spécifique non trouvée:', req.path);
    return res.status(404).send('Ressource non trouvée: ' + req.path);
  }
  
  // Pour toutes les autres routes, servir l'application React
  if (fs.existsSync(indexPath)) {
    console.log(`[SERVER] Serving React app (index.html) pour route: ${req.path}`);
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`
      <h1>Application React non trouvée</h1>
      <p>Le fichier index.html n'a pas été trouvé dans: ${indexPath}</p>
      <p>Exécutez "npm run build" dans le dossier frontend pour créer les fichiers nécessaires.</p>
    `);
  }
});

// Middleware de gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message: err.message || 'Erreur interne du serveur'
  });
});

// Fonction pour initialiser la base de données
async function initializeDatabase() {
  try {
    // Utiliser le système d'auto-initialisation qui vérifie et crée tout automatiquement
    await autoInitDatabase(db.pool);
  } catch (error) {
    console.log('');
    console.log('===========================================');
    console.log('⚠️  ERREUR D\'INITIALISATION DE LA BDD');
    console.log('===========================================');

    if (error.code === 'ECONNREFUSED') {
      console.error('❌ PostgreSQL n\'est pas accessible');
      console.error('   Port:', error.port || 5432);
      console.error('   Host:', error.address || 'localhost');
      console.error('');
      console.error('💡 SOLUTION:');
      console.error('   1. Vérifiez que PostgreSQL est installé');
      console.error('   2. Démarrez PostgreSQL :');
      console.error('      - Linux: sudo service postgresql start');
      console.error('      - Mac: brew services start postgresql');
      console.error('      - Windows: Démarrer le service PostgreSQL');
      console.error('   3. Vérifiez vos variables .env (DB_HOST, DB_PORT, etc.)');
    } else {
      console.error('❌ Erreur:', error.message);
      console.error('   Code:', error.code);
    }

    console.error('');
    console.error('⚠️  Le serveur va démarrer SANS base de données');
    console.error('   Les routes API ne fonctionneront pas correctement');
    console.log('===========================================');
    console.log('');
  }
}

// Démarrer le serveur après l'initialisation de la base de données
async function startServer() {
  // Initialiser la base de données
  await initializeDatabase();

  // Initialiser et démarrer le worker d'emails programmés
  scheduledEmailWorker.initialize(app.locals.db);
  scheduledEmailWorker.start();

  // Initialiser et démarrer le worker de rappel maintenance
  maintenanceReminderWorker.initialize(app.locals.db);
  maintenanceReminderWorker.start(); // Tous les jours à 9h00

  // Initialiser et démarrer le worker de veille missions (heure depuis veille_criteres)
  veilleMissionsWorker.initialize(app.locals.db);
  veilleMissionsWorker.start();

  // Démarrer le serveur HTTP
  const server = app.listen(PORT, () => {
    console.log('===========================================');
    console.log(`Serveur démarré sur le port ${PORT} en mode ${process.env.NODE_ENV}`);
    console.log(`Base de données: PostgreSQL sur ${process.env.DB_HOST || 'localhost'}`);
    console.log(`Version: ${new Date().toISOString()}`);

    if (!fs.existsSync(indexPath)) {
      console.log('');
      console.log('⚠️ AVERTISSEMENT: index.html non trouvé!');
      console.log('L\'application React ne pourra pas être servie correctement.');
      console.log('Exécutez "npm run build" dans le dossier frontend.');
      console.log('');
    }

    console.log('===========================================');
  });

  return server;
}

// Lancer le serveur
let server;
startServer().then(s => {
  server = s;
}).catch(error => {
  console.error('❌ Erreur fatale lors du démarrage du serveur:', error);
  process.exit(1);
});

// Gestion de la fermeture propre de la base de données et du serveur
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function gracefulShutdown() {
  console.log('Arrêt gracieux du serveur...');

  // Arrêter les workers
  scheduledEmailWorker.stop();
  maintenanceReminderWorker.stop();
  veilleMissionsWorker.stop();

  server.close(() => {
    console.log('Serveur HTTP fermé.');
    db.close((err) => {
      if (err) {
        console.error('Erreur lors de la fermeture de la base de données :', err.message);
      } else {
        console.log('Connexion à la base de données fermée');
      }
      process.exit(0);
    });
  });
  
  // Si le serveur ne se ferme pas dans les 10s, forcer la fermeture
  setTimeout(() => {
    console.error('Fermeture forcée du processus après délai d\'attente');
    process.exit(1);
  }, 10000);
}