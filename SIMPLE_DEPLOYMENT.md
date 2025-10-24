# 🚀 Déploiement Simple - CRM avec cPanel

Architecture ultra-simple : **Node.js sert TOUT** (React + API), Apache fait juste le proxy HTTPS.

---

## 📊 Architecture

```
Internet (HTTPS)
    ↓
Apache (port 80/443) - Proxy HTTPS
    ↓
Node.js (port 5000)
    ├─→ Frontend React (/, /dashboard, /leads, etc.)
    └─→ API Backend (/api/*)
         └─→ PostgreSQL
```

**Un seul serveur Node.js pour tout !** ✅

---

## 🎯 Avantages

✅ **Simple** - Un seul serveur Node.js
✅ **Pas de CORS** - Même origine pour frontend et API
✅ **Pas de Mixed Content** - Tout en HTTPS via Apache
✅ **Facile à maintenir** - Un seul processus PM2
✅ **Compatible cPanel** - Fonctionne avec Apache

---

## 📦 Installation Initiale

### 1. Sur votre serveur cPanel

```bash
# Se connecter en SSH
ssh votre-utilisateur@votre-serveur

# Aller dans votre répertoire
cd /home/crmPixfeed

# Cloner le projet
git clone https://github.com/Pixfeed1/crm-perso.git
cd crm-perso
git checkout claude/crm-project-cleanup-011CURi4knQv224CLkmZDp4j
```

### 2. Configurer le backend

```bash
cd backend

# Créer le .env
nano .env
```

**Contenu du `.env` :**

```env
# Port Node.js
PORT=5000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=crm_production
DB_USER=votre_user_pg
DB_PASSWORD=votre_password_pg

# JWT Secret
JWT_SECRET=votre_cle_secrete_tres_longue

# Utilisateur par défaut
DEFAULT_USER_USERNAME=admin
DEFAULT_USER_PASSWORD=VotreMotDePasse123!

# Production
NODE_ENV=production
```

```bash
# Installer les dépendances
npm install --production
```

### 3. Configurer le frontend

```bash
cd ../frontend

# Créer le .env.production
nano .env.production
```

**Contenu du `.env.production` :**

```env
# URL de l'API (même domaine, pas de CORS !)
REACT_APP_API_URL=/api
```

**IMPORTANT:** `/api` relatif, pas d'URL complète !

### 4. Builder le frontend

```bash
npm install
npm run build
```

Le dossier `frontend/build/` contient maintenant les fichiers statiques.

### 5. Configurer Apache

**Dans cPanel → Domains → Gérer `crm.pixfeed.net`**

Créez ou éditez `/home/crmPixfeed/public_html/.htaccess` :

```apache
# Active le moteur de réécriture
RewriteEngine On

# Force HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

# Proxy vers Node.js sur le port 5000
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteRule ^(.*)$ http://localhost:5000/$1 [P,L]

# Préserve les en-têtes
ProxyPreserveHost On
ProxyPass / http://localhost:5000/
ProxyPassReverse / http://localhost:5000/
```

**OU copiez le fichier fourni :**

```bash
cp apache.htaccess /home/crmPixfeed/public_html/.htaccess
```

### 6. Démarrer Node.js avec PM2

```bash
cd backend

# Démarrer
pm2 start server.js --name crm-backend

# Sauvegarder la config
pm2 save

# Auto-start au reboot
pm2 startup
# Exécuter la commande affichée
```

### 7. Vérifier

```bash
# Status PM2
pm2 status

# Logs
pm2 logs crm-backend

# Tester
curl http://localhost:5000/api/debug
```

**Dans le navigateur :**

```
https://crm.pixfeed.net          → Frontend React ✅
https://crm.pixfeed.net/api/debug → API JSON ✅
```

---

## 🔄 Mises à Jour (Déploiement Rapide)

### Méthode 1: Script automatique

```bash
cd /home/crmPixfeed/crm-perso
git pull origin claude/crm-project-cleanup-011CURi4knQv224CLkmZDp4j

# Lancer le script de déploiement
./deploy-simple.sh
```

**C'est tout !** Le script :
1. Build le frontend React
2. Redémarre le backend Node.js
3. Vérifie que tout fonctionne

### Méthode 2: Manuel

```bash
cd /home/crmPixfeed/crm-perso

# 1. Récupérer les changements
git pull origin claude/crm-project-cleanup-011CURi4knQv224CLkmZDp4j

# 2. Rebuild le frontend
cd frontend
npm install
npm run build

# 3. Redémarrer le backend
cd ../backend
npm install --production
pm2 restart crm-backend

# 4. Vérifier
pm2 status
pm2 logs crm-backend
```

---

## 🔍 Dépannage

### Problème 1: Page blanche

**Cause:** Build React non trouvé

**Solution:**
```bash
cd frontend
npm run build
pm2 restart crm-backend
```

### Problème 2: 502 Bad Gateway

**Cause:** Node.js ne tourne pas

**Solution:**
```bash
pm2 status
pm2 restart crm-backend

# Si pas démarré:
cd backend
pm2 start server.js --name crm-backend
```

### Problème 3: Erreur API

**Cause:** `.env` mal configuré

**Solution:**
```bash
cd backend
nano .env
# Vérifier DB_HOST, DB_NAME, DB_USER, DB_PASSWORD

# Redémarrer
pm2 restart crm-backend
pm2 logs crm-backend
```

### Problème 4: CORS ou Mixed Content

**Cause:** Frontend configuré avec URL complète

**Solution:**
```bash
cd frontend
cat .env.production
# Doit contenir: REACT_APP_API_URL=/api
# PAS: REACT_APP_API_URL=https://crm.pixfeed.net/api

# Si mauvais:
echo "REACT_APP_API_URL=/api" > .env.production
npm run build
pm2 restart crm-backend
```

---

## 📋 Checklist de Déploiement

- [ ] PostgreSQL installé et DB créée
- [ ] Git repository cloné
- [ ] `backend/.env` configuré
- [ ] `frontend/.env.production` configuré avec `/api`
- [ ] Frontend buildé (`npm run build`)
- [ ] Backend démarré avec PM2
- [ ] `.htaccess` configuré dans public_html
- [ ] HTTPS activé dans cPanel
- [ ] Test: https://crm.pixfeed.net fonctionne
- [ ] Test: https://crm.pixfeed.net/api/debug retourne du JSON

---

## 🎯 Points Clés

1. **Node.js sert TOUT** - Frontend React + API Backend
2. **Apache fait juste le proxy** - De HTTPS vers Node.js
3. **Pas de CORS** - Même origine (crm.pixfeed.net)
4. **URL relative API** - `/api` dans `.env.production`
5. **Un seul PM2** - Process `crm-backend` seulement

---

## 📊 Commandes Utiles

```bash
# Voir les logs en temps réel
pm2 logs crm-backend

# Redémarrer
pm2 restart crm-backend

# Status
pm2 status

# Monitoring
pm2 monit

# Rebuild frontend
cd frontend && npm run build

# Backup DB
pg_dump -U votre_user crm_production > backup.sql
```

---

## ✅ Succès

Si tout fonctionne, vous devriez voir :

```
$ pm2 status
│ crm-backend │ online │

$ curl http://localhost:5000/api/debug
{"status":"ok", ...}

$ curl https://crm.pixfeed.net
<!doctype html><html>... (React HTML)
```

**Votre CRM est en ligne ! 🎉**
