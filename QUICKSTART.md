# 🚀 Déploiement Rapide - CRM Production

## Méthode 1: Script Automatique (Recommandé)

### Prérequis

Votre serveur doit avoir :
- Ubuntu 20.04+ ou Debian 11+
- Accès root ou sudo
- Un nom de domaine pointant vers le serveur

### Étapes

```bash
# 1. Se connecter au serveur
ssh root@votre-serveur-ip

# 2. Installer les dépendances de base
apt update && apt upgrade -y
apt install -y curl git nginx postgresql postgresql-contrib

# 3. Installer Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 4. Cloner le projet
mkdir -p /var/www/crm
cd /var/www/crm
git clone https://github.com/votre-compte/crm-perso.git .

# 5. Lancer le script de déploiement
chmod +x deploy.sh
./deploy.sh

# 6. Suivre les instructions du script
# Il vous demandera:
#   - Nom de domaine
#   - Mot de passe PostgreSQL
#   - Mot de passe admin CRM
```

Le script s'occupe de tout :
- ✅ Configuration PostgreSQL
- ✅ Installation des dépendances
- ✅ Build du frontend
- ✅ Configuration Nginx
- ✅ Démarrage avec PM2
- ✅ Configuration SSL (optionnel)

---

## Méthode 2: Déploiement Manuel

Si vous préférez contrôler chaque étape, suivez le guide détaillé :

📖 **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**

---

## Après le Déploiement

### Accéder au CRM

```
URL: https://votre-domaine.com
Utilisateur: admin
Mot de passe: celui que vous avez défini
```

### Commandes Utiles

```bash
# Voir les logs du backend
pm2 logs crm-backend

# Redémarrer le backend
pm2 restart crm-backend

# Status de tous les services
pm2 status
systemctl status nginx
systemctl status postgresql
```

### Mettre à Jour

```bash
cd /var/www/crm
./update.sh
```

---

## Dépannage Rapide

### Le site ne charge pas

```bash
# Vérifier Nginx
systemctl status nginx
systemctl restart nginx

# Vérifier les logs
tail -f /var/log/nginx/error.log
```

### Erreur 502 Bad Gateway

```bash
# Vérifier que le backend tourne
pm2 status
pm2 restart crm-backend

# Voir les logs
pm2 logs crm-backend
```

### Erreur de base de données

```bash
# Vérifier PostgreSQL
systemctl status postgresql

# Se connecter à la base
sudo -u postgres psql -d crm_production

# Vérifier les variables dans .env
cat /var/www/crm/backend/.env
```

---

## Architecture Déployée

```
Internet
   ↓
Nginx (Port 80/443)
   ↓
   ├─→ Frontend (React Static Files)
   │   └─ /var/www/crm/frontend/build
   │
   └─→ Backend API (Node.js + Express)
       └─ PM2 → server.js (Port 5000)
           └─ PostgreSQL (Port 5432)
```

---

## Sécurité

Le script configure automatiquement :
- ✅ HTTPS avec Let's Encrypt
- ✅ Mots de passe sécurisés
- ✅ JWT secret aléatoire
- ✅ Fichiers .env protégés (chmod 600)

**À faire après le déploiement :**

```bash
# Configurer le firewall
ufw enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Installer Fail2Ban (protection SSH)
apt install -y fail2ban
systemctl enable fail2ban
```

---

## Support

- 📖 Documentation complète : [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- 🔧 Logs backend : `pm2 logs crm-backend`
- 🌐 Logs Nginx : `/var/log/nginx/error.log`
- 🗄️ Logs PostgreSQL : `/var/log/postgresql/`

---

## Checklist de Production

- [ ] Node.js 18+ installé
- [ ] PostgreSQL configuré
- [ ] Nginx installé
- [ ] Nom de domaine pointé vers le serveur
- [ ] Certificat SSL installé
- [ ] Firewall configuré
- [ ] PM2 configuré pour démarrage auto
- [ ] Backup de la base de données planifié
- [ ] Variables d'environnement sécurisées

---

**🎉 Votre CRM est maintenant en production !**
