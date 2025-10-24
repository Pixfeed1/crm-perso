#!/bin/bash

###############################################################################
# Script de Build et Déploiement Simplifié
# Architecture: Node.js sert React + API, Apache fait le proxy HTTPS
###############################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Build et déploiement du CRM${NC}"
echo ""

# Vérifier qu'on est dans le bon répertoire
if [ ! -f "backend/server.js" ]; then
    echo -e "${YELLOW}❌ Erreur: Exécutez ce script depuis la racine du projet${NC}"
    exit 1
fi

# 1. Build du frontend
echo -e "${GREEN}📦 Build du frontend React...${NC}"
cd frontend
npm install
npm run build
cd ..

echo -e "${GREEN}✅ Frontend buildé dans frontend/build/${NC}"
echo ""

# 2. Vérifier que le build existe
if [ ! -f "frontend/build/index.html" ]; then
    echo -e "${YELLOW}❌ Erreur: Build failed, index.html non trouvé${NC}"
    exit 1
fi

# 3. Redémarrer le backend avec PM2
echo -e "${GREEN}🔄 Redémarrage du backend Node.js...${NC}"
cd backend

# Installer les dépendances si besoin
if [ ! -d "node_modules" ]; then
    npm install --production
fi

# Redémarrer avec PM2
if pm2 list | grep -q "crm-backend"; then
    pm2 restart crm-backend
    echo -e "${GREEN}✅ Backend redémarré${NC}"
else
    pm2 start server.js --name crm-backend
    pm2 save
    echo -e "${GREEN}✅ Backend démarré${NC}"
fi

cd ..

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Déploiement terminé !${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📊 Vérifications:"
echo "  - Backend: pm2 status"
echo "  - Logs: pm2 logs crm-backend"
echo "  - URL: https://crm.pixfeed.net"
echo ""
echo "🔧 Node.js sert maintenant:"
echo "  - Frontend React: /*"
echo "  - API Backend: /api/*"
echo ""
