#!/bin/bash

###############################################################################
# Script de Déploiement CRM - Production
# Usage: ./deploy.sh
###############################################################################

set -e  # Arrêter en cas d'erreur

echo "🚀 Démarrage du déploiement CRM..."
echo ""

# Couleurs pour l'affichage
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Fonction d'affichage
function print_success {
    echo -e "${GREEN}✅ $1${NC}"
}

function print_warning {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

function print_error {
    echo -e "${RED}❌ $1${NC}"
}

function print_info {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Vérifier si on est root
if [ "$EUID" -ne 0 ]; then
    print_error "Ce script doit être exécuté en tant que root"
    echo "Utilisez: sudo ./deploy.sh"
    exit 1
fi

print_info "Vérification de l'environnement..."

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js n'est pas installé"
    echo "Installez Node.js 20+ avec:"
    echo "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    echo "apt install -y nodejs"
    exit 1
fi
print_success "Node.js installé: $(node -v)"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    print_error "npm n'est pas installé"
    exit 1
fi
print_success "npm installé: $(npm -v)"

# Vérifier PostgreSQL
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL n'est pas installé"
    echo "Installez PostgreSQL avec:"
    echo "apt install -y postgresql postgresql-contrib"
    exit 1
fi
print_success "PostgreSQL installé"

# Vérifier Nginx
if ! command -v nginx &> /dev/null; then
    print_error "Nginx n'est pas installé"
    echo "Installez Nginx avec:"
    echo "apt install -y nginx"
    exit 1
fi
print_success "Nginx installé"

# Vérifier PM2
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 n'est pas installé, installation en cours..."
    npm install -g pm2
    print_success "PM2 installé"
else
    print_success "PM2 installé"
fi

echo ""
print_info "==================== Configuration ===================="
echo ""

# Demander les informations de configuration
read -p "📍 Répertoire d'installation [/var/www/crm]: " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/var/www/crm}

read -p "🌐 Nom de domaine (ex: crm.votredomaine.com): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
    print_error "Le nom de domaine est requis"
    exit 1
fi

read -p "🗄️  Nom de la base de données [crm_production]: " DB_NAME
DB_NAME=${DB_NAME:-crm_production}

read -p "👤 Utilisateur PostgreSQL [crm_user]: " DB_USER
DB_USER=${DB_USER:-crm_user}

read -sp "🔐 Mot de passe PostgreSQL: " DB_PASSWORD
echo ""
if [ -z "$DB_PASSWORD" ]; then
    print_error "Le mot de passe PostgreSQL est requis"
    exit 1
fi

read -sp "🔑 Mot de passe admin CRM: " ADMIN_PASSWORD
echo ""
if [ -z "$ADMIN_PASSWORD" ]; then
    print_error "Le mot de passe admin est requis"
    exit 1
fi

# Générer une clé JWT aléatoire
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

echo ""
print_info "==================== Création de la base de données ===================="
echo ""

# Créer la base de données PostgreSQL
sudo -u postgres psql <<EOF
-- Créer l'utilisateur s'il n'existe pas
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Créer la base de données si elle n'existe pas
SELECT 'CREATE DATABASE $DB_NAME'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Donner les droits
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER DATABASE $DB_NAME OWNER TO $DB_USER;
EOF

print_success "Base de données créée/configurée"

echo ""
print_info "==================== Installation Backend ===================="
echo ""

cd $INSTALL_DIR/backend

# Créer le fichier .env
cat > .env <<EOF
# Port du backend
PORT=5000

# Configuration PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# JWT Secret
JWT_SECRET=$JWT_SECRET

# Utilisateur par défaut
DEFAULT_USER_USERNAME=admin
DEFAULT_USER_PASSWORD=$ADMIN_PASSWORD

# Environnement
NODE_ENV=production
EOF

chmod 600 .env
print_success "Fichier .env backend créé"

# Installer les dépendances
print_info "Installation des dépendances backend..."
npm install --production
print_success "Dépendances backend installées"

echo ""
print_info "==================== Build Frontend ===================="
echo ""

cd $INSTALL_DIR/frontend

# Créer le fichier .env
cat > .env <<EOF
REACT_APP_API_URL=https://$DOMAIN_NAME/api
EOF

print_success "Fichier .env frontend créé"

# Installer les dépendances
print_info "Installation des dépendances frontend..."
npm install
print_success "Dépendances frontend installées"

# Build
print_info "Build du frontend (peut prendre quelques minutes)..."
npm run build
print_success "Frontend buildé"

echo ""
print_info "==================== Configuration Nginx ===================="
echo ""

# Créer la configuration Nginx
cat > /etc/nginx/sites-available/crm <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Frontend React
    root $INSTALL_DIR/frontend/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Frontend SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache des assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Activer le site
ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/

# Tester la configuration
nginx -t
print_success "Configuration Nginx créée"

# Redémarrer Nginx
systemctl restart nginx
print_success "Nginx redémarré"

echo ""
print_info "==================== Démarrage Backend avec PM2 ===================="
echo ""

cd $INSTALL_DIR/backend

# Arrêter l'ancienne instance si elle existe
pm2 delete crm-backend 2>/dev/null || true

# Démarrer le backend
pm2 start server.js --name crm-backend
pm2 save

# Configurer le démarrage automatique
pm2 startup | grep -v "PM2" | bash || true

print_success "Backend démarré avec PM2"

echo ""
print_info "==================== Configuration SSL (optionnel) ===================="
echo ""

read -p "🔒 Voulez-vous installer un certificat SSL avec Let's Encrypt? (y/n): " INSTALL_SSL

if [ "$INSTALL_SSL" = "y" ] || [ "$INSTALL_SSL" = "Y" ]; then
    if ! command -v certbot &> /dev/null; then
        print_info "Installation de Certbot..."
        apt install -y certbot python3-certbot-nginx
    fi

    print_info "Obtention du certificat SSL..."
    certbot --nginx -d $DOMAIN_NAME --non-interactive --agree-tos --register-unsafely-without-email || print_warning "Erreur SSL - vous pouvez le configurer manuellement plus tard"

    print_success "SSL configuré"
else
    print_warning "SSL non installé - votre site sera accessible en HTTP uniquement"
fi

echo ""
print_info "==================== Vérifications Finales ===================="
echo ""

# Vérifier PM2
if pm2 list | grep -q "crm-backend.*online"; then
    print_success "Backend en ligne"
else
    print_error "Backend hors ligne"
fi

# Vérifier Nginx
if systemctl is-active --quiet nginx; then
    print_success "Nginx en ligne"
else
    print_error "Nginx hors ligne"
fi

# Vérifier PostgreSQL
if systemctl is-active --quiet postgresql; then
    print_success "PostgreSQL en ligne"
else
    print_error "PostgreSQL hors ligne"
fi

echo ""
echo "=========================================================="
echo "🎉 DÉPLOIEMENT TERMINÉ AVEC SUCCÈS ! 🎉"
echo "=========================================================="
echo ""
echo "📍 URL: http://$DOMAIN_NAME"
[ "$INSTALL_SSL" = "y" ] && echo "📍 URL HTTPS: https://$DOMAIN_NAME"
echo ""
echo "👤 Utilisateur: admin"
echo "🔑 Mot de passe: $ADMIN_PASSWORD"
echo ""
echo "📊 Commandes utiles:"
echo "  - Voir les logs backend: pm2 logs crm-backend"
echo "  - Redémarrer backend: pm2 restart crm-backend"
echo "  - Status PM2: pm2 status"
echo "  - Logs Nginx: tail -f /var/log/nginx/error.log"
echo ""
echo "🔧 Fichiers de configuration:"
echo "  - Backend .env: $INSTALL_DIR/backend/.env"
echo "  - Nginx config: /etc/nginx/sites-available/crm"
echo ""
echo "=========================================================="
