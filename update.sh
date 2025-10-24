#!/bin/bash

###############################################################################
# Script de Mise à Jour CRM - Production
# Usage: ./update.sh
###############################################################################

set -e

echo "🔄 Mise à jour du CRM..."
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

function print_success {
    echo -e "${GREEN}✅ $1${NC}"
}

function print_info {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

function print_error {
    echo -e "${RED}❌ $1${NC}"
}

# Vérifier si on est root
if [ "$EUID" -ne 0 ]; then
    print_error "Ce script doit être exécuté en tant que root"
    echo "Utilisez: sudo ./update.sh"
    exit 1
fi

# Configuration
INSTALL_DIR="/var/www/crm"

if [ ! -d "$INSTALL_DIR" ]; then
    print_error "Le répertoire $INSTALL_DIR n'existe pas"
    print_info "Utilisez ./deploy.sh pour le premier déploiement"
    exit 1
fi

cd $INSTALL_DIR

print_info "==================== Sauvegarde ===================="
echo ""

# Backup de la base de données
DB_NAME=$(grep DB_NAME backend/.env | cut -d '=' -f2)
DB_USER=$(grep DB_USER backend/.env | cut -d '=' -f2)
BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"

print_info "Sauvegarde de la base de données..."
sudo -u postgres pg_dump -d $DB_NAME > $BACKUP_FILE
print_success "Backup créé: $BACKUP_FILE"

echo ""
print_info "==================== Récupération du code ===================="
echo ""

# Stash les changements locaux si nécessaire
git stash

# Pull les dernières modifications
print_info "Récupération des dernières modifications..."
git pull origin $(git branch --show-current)
print_success "Code mis à jour"

echo ""
print_info "==================== Mise à jour Backend ===================="
echo ""

cd $INSTALL_DIR/backend

# Installer les nouvelles dépendances
print_info "Installation des dépendances backend..."
npm install --production
print_success "Dépendances backend installées"

# Redémarrer le backend
print_info "Redémarrage du backend..."
pm2 restart crm-backend
sleep 2
pm2 save
print_success "Backend redémarré"

echo ""
print_info "==================== Mise à jour Frontend ===================="
echo ""

cd $INSTALL_DIR/frontend

# Installer les nouvelles dépendances
print_info "Installation des dépendances frontend..."
npm install
print_success "Dépendances frontend installées"

# Rebuild
print_info "Build du frontend..."
npm run build
print_success "Frontend buildé"

# Recharger Nginx
print_info "Rechargement de Nginx..."
systemctl reload nginx
print_success "Nginx rechargé"

echo ""
print_info "==================== Vérifications ===================="
echo ""

# Vérifier PM2
if pm2 list | grep -q "crm-backend.*online"; then
    print_success "Backend en ligne"
else
    print_error "Backend hors ligne - vérifiez les logs: pm2 logs crm-backend"
    exit 1
fi

# Vérifier Nginx
if systemctl is-active --quiet nginx; then
    print_success "Nginx en ligne"
else
    print_error "Nginx hors ligne"
    exit 1
fi

echo ""
echo "=========================================================="
echo "🎉 MISE À JOUR TERMINÉE AVEC SUCCÈS ! 🎉"
echo "=========================================================="
echo ""
echo "📊 Commandes utiles:"
echo "  - Voir les logs: pm2 logs crm-backend"
echo "  - Status: pm2 status"
echo "  - Restaurer backup: psql -U $DB_USER -d $DB_NAME < $BACKUP_FILE"
echo ""
echo "=========================================================="
