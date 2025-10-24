# Guide de Déploiement - CRM Production

Ce guide vous explique comment déployer le CRM sur votre serveur de production.

## Prérequis Serveur

- Ubuntu 20.04+ ou Debian 11+
- Node.js 18+ et npm
- PostgreSQL 14+
- Nginx
- Accès SSH root ou sudo
- Nom de domaine pointant vers votre serveur (ex: crm.votredomaine.com)

---

## 1️⃣ Connexion SSH et Préparation Serveur

```bash
# Se connecter au serveur
ssh root@votre-serveur-ip

# Mise à jour du système
apt update && apt upgrade -y

# Installer les outils nécessaires
apt install -y curl git nginx postgresql postgresql-contrib
```

---

## 2️⃣ Installation de Node.js

```bash
# Installer Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Vérifier l'installation
node -v  # Devrait afficher v20.x.x
npm -v   # Devrait afficher 10.x.x

# Installer PM2 globalement (gestionnaire de processus)
npm install -g pm2
```

---

## 3️⃣ Configuration PostgreSQL

```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Dans psql, créer la base de données et l'utilisateur
CREATE DATABASE crm_production;
CREATE USER crm_user WITH PASSWORD 'votre_mot_de_passe_securise';
GRANT ALL PRIVILEGES ON DATABASE crm_production TO crm_user;
ALTER DATABASE crm_production OWNER TO crm_user;

# Quitter psql
\q

# Configurer PostgreSQL pour accepter les connexions locales
# Éditer le fichier pg_hba.conf
nano /etc/postgresql/14/main/pg_hba.conf

# Ajouter cette ligne (si pas déjà présente)
# local   all             all                                     md5

# Redémarrer PostgreSQL
systemctl restart postgresql
```

---

## 4️⃣ Cloner le Projet

```bash
# Créer un répertoire pour l'application
mkdir -p /var/www/crm
cd /var/www/crm

# Cloner le repository (remplacer par votre URL)
git clone https://github.com/votre-compte/crm-perso.git .

# Ou si vous utilisez une branche spécifique
git checkout claude/crm-project-cleanup-011CURi4knQv224CLkmZDp4j
```

---

## 5️⃣ Configuration Backend

```bash
cd /var/www/crm/backend

# Créer le fichier .env
nano .env
```

**Contenu du fichier `.env` :**

```env
# Port du backend
PORT=5000

# Configuration PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=crm_production
DB_USER=crm_user
DB_PASSWORD=votre_mot_de_passe_securise

# JWT Secret (générer une clé aléatoire sécurisée)
JWT_SECRET=votre_cle_secrete_aleatoire_tres_longue_et_securisee

# Utilisateur par défaut
DEFAULT_USER_USERNAME=admin
DEFAULT_USER_PASSWORD=VotreMotDePasseSecurise123!

# Environnement
NODE_ENV=production
```

**Générer une clé JWT sécurisée :**

```bash
# Générer une clé aléatoire
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copier le résultat dans JWT_SECRET
```

**Installer les dépendances :**

```bash
npm install --production
```

---

## 6️⃣ Configuration et Build Frontend

```bash
cd /var/www/crm/frontend

# Créer le fichier .env pour le frontend
nano .env
```

**Contenu du fichier `.env` frontend :**

```env
# URL de l'API backend
REACT_APP_API_URL=https://crm.votredomaine.com/api

# Ou si vous utilisez un sous-domaine pour l'API
# REACT_APP_API_URL=https://api.crm.votredomaine.com
```

**Installer les dépendances et builder :**

```bash
npm install
npm run build

# Le dossier build/ contient maintenant les fichiers statiques optimisés
```

---

## 7️⃣ Configuration Nginx

```bash
# Créer la configuration Nginx
nano /etc/nginx/sites-available/crm
```

**Contenu du fichier de configuration Nginx :**

```nginx
# Frontend + Backend sur même domaine
server {
    listen 80;
    server_name crm.votredomaine.com;

    # Redirection HTTP vers HTTPS (à activer après SSL)
    # return 301 https://$server_name$request_uri;

    # Frontend React (fichiers statiques)
    root /var/www/crm/frontend/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Backend API (reverse proxy)
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend - SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache des assets statiques
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Activer la configuration :**

```bash
# Créer un lien symbolique
ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/

# Tester la configuration
nginx -t

# Redémarrer Nginx
systemctl restart nginx
```

---

## 8️⃣ Configuration SSL avec Let's Encrypt (HTTPS)

```bash
# Installer Certbot
apt install -y certbot python3-certbot-nginx

# Obtenir le certificat SSL (remplacer par votre domaine)
certbot --nginx -d crm.votredomaine.com

# Suivre les instructions
# Certbot va automatiquement configurer Nginx pour HTTPS

# Tester le renouvellement automatique
certbot renew --dry-run
```

---

## 9️⃣ Démarrer le Backend avec PM2

```bash
cd /var/www/crm/backend

# Démarrer l'application avec PM2
pm2 start server.js --name crm-backend

# Sauvegarder la configuration PM2
pm2 save

# Configurer PM2 pour démarrer au boot
pm2 startup
# Exécuter la commande affichée par PM2

# Vérifier le statut
pm2 status
pm2 logs crm-backend
```

---

## 🔟 Vérifications et Tests

```bash
# Vérifier que le backend répond
curl http://localhost:5000/api/health
# Devrait retourner un JSON avec status: ok

# Vérifier Nginx
systemctl status nginx

# Vérifier PM2
pm2 status

# Vérifier PostgreSQL
systemctl status postgresql

# Voir les logs en temps réel
pm2 logs crm-backend --lines 100
```

**Tester dans le navigateur :**

1. Accéder à `https://crm.votredomaine.com`
2. Se connecter avec les identifiants définis dans `.env`
3. Tester toutes les fonctionnalités

---

## 📊 Commandes Utiles

### PM2 (Backend)

```bash
# Redémarrer l'application
pm2 restart crm-backend

# Arrêter l'application
pm2 stop crm-backend

# Voir les logs
pm2 logs crm-backend

# Monitoring en temps réel
pm2 monit
```

### Nginx

```bash
# Redémarrer
systemctl restart nginx

# Recharger la configuration (sans downtime)
systemctl reload nginx

# Voir les logs d'erreur
tail -f /var/log/nginx/error.log

# Voir les logs d'accès
tail -f /var/log/nginx/access.log
```

### PostgreSQL

```bash
# Se connecter à la base
sudo -u postgres psql -d crm_production

# Backup de la base
pg_dump -U crm_user -d crm_production > backup.sql

# Restore
psql -U crm_user -d crm_production < backup.sql
```

### Git (Mises à jour)

```bash
cd /var/www/crm

# Récupérer les dernières modifications
git pull origin main

# Backend - redémarrer après mise à jour
cd backend
npm install --production
pm2 restart crm-backend

# Frontend - rebuild après mise à jour
cd /var/www/crm/frontend
npm install
npm run build
systemctl reload nginx
```

---

## 🔒 Sécurité Recommandée

### Firewall (UFW)

```bash
# Activer le firewall
ufw enable

# Autoriser SSH
ufw allow 22/tcp

# Autoriser HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Vérifier le statut
ufw status
```

### Fail2Ban (Protection SSH)

```bash
# Installer Fail2Ban
apt install -y fail2ban

# Créer la configuration
nano /etc/fail2ban/jail.local
```

**Contenu minimal :**

```ini
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 3600
```

```bash
# Redémarrer Fail2Ban
systemctl restart fail2ban
```

### Permissions des fichiers

```bash
# Créer un utilisateur dédié (optionnel mais recommandé)
adduser --disabled-password crm-app

# Changer le propriétaire
chown -R crm-app:crm-app /var/www/crm

# Protéger le fichier .env
chmod 600 /var/www/crm/backend/.env
```

---

## 🚨 Dépannage

### Le backend ne démarre pas

```bash
# Voir les logs
pm2 logs crm-backend

# Vérifier la connexion PostgreSQL
psql -U crm_user -d crm_production -h localhost
```

### Erreur 502 Bad Gateway

```bash
# Vérifier que le backend tourne
pm2 status

# Vérifier les logs Nginx
tail -f /var/log/nginx/error.log
```

### Frontend ne se charge pas

```bash
# Vérifier que les fichiers sont buildés
ls -la /var/www/crm/frontend/build

# Rebuild si nécessaire
cd /var/www/crm/frontend
npm run build
```

---

## 📧 Support

Si vous rencontrez des problèmes, vérifiez :

1. Les logs PM2 : `pm2 logs crm-backend`
2. Les logs Nginx : `tail -f /var/log/nginx/error.log`
3. Les logs PostgreSQL : `tail -f /var/log/postgresql/postgresql-14-main.log`
4. Le fichier `.env` est correct et sécurisé

---

## 🎉 Félicitations !

Votre CRM est maintenant déployé en production ! 🚀

URL d'accès : `https://crm.votredomaine.com`
