# 🚀 Instructions de déploiement sur le serveur de production

## 📋 Situation actuelle

Le code a été corrigé et commité localement :
- ✅ Migrations désactivées (tous les fichiers `.js.disabled`)
- ✅ `autoInitDatabase.js` configuré avec la colonne `category` pour `tva_regimes`
- ✅ `server.js` utilise `autoInitDatabase` au démarrage
- ✅ Commits prêts : `78c529e` et `3604673`

**Problème** : Le code n'est pas encore déployé sur le serveur de production `crm.pixfeed.net`

---

## 🔧 Actions à effectuer sur le serveur de production

### Étape 1 : Se connecter au serveur

```bash
ssh votre-utilisateur@crm.pixfeed.net
# ou
ssh root@crm.pixfeed.net
```

### Étape 2 : Aller dans le dossier du projet

```bash
cd /chemin/vers/crm-perso
# Exemple : cd /var/www/crm-perso
# ou : cd /home/user/crm-perso
```

### Étape 3 : Vérifier la branche actuelle

```bash
git status
git branch
```

Vous devriez être sur la branche : `claude/continue-positioning-011CUXLSBL5Yz3cVx6bmH9mJ`

### Étape 4 : Récupérer les derniers changements

```bash
# Sauvegarder les changements locaux si nécessaire
git stash

# Récupérer les derniers commits
git pull origin claude/continue-positioning-011CUXLSBL5Yz3cVx6bmH9mJ
```

### Étape 5 : Vérifier que les fichiers sont bien à jour

```bash
# Vérifier que les migrations sont désactivées
ls backend/scripts/migrations/*.disabled

# Vérifier que autoInitDatabase contient la colonne category
grep -A 5 "tva_regimes:" backend/scripts/autoInitDatabase.js | grep category
# Devrait afficher : category: "VARCHAR(50) NOT NULL DEFAULT 'taux_normal'",
```

### Étape 6 : Redémarrer le backend

**Si vous utilisez PM2 :**
```bash
cd backend
pm2 restart crm-backend
# ou
pm2 restart all

# Vérifier les logs
pm2 logs crm-backend --lines 50
```

**Si vous utilisez systemd :**
```bash
sudo systemctl restart crm-backend
# Vérifier les logs
sudo journalctl -u crm-backend -n 50 -f
```

**Si vous utilisez node directement :**
```bash
# Trouver le processus
ps aux | grep node

# Tuer le processus (remplacez PID par l'ID du processus)
kill PID

# Relancer
cd backend
node server.js
```

### Étape 7 : Vérifier que autoInitDatabase s'exécute

Dans les logs du backend, vous devriez voir :

```
═══════════════════════════════════════════════════════
🚀 AUTO-INITIALISATION DE LA BASE DE DONNÉES
═══════════════════════════════════════════════════════

📋 Vérification table tva_regimes...
  ✓ Table tva_regimes existe déjà
  → Ajout colonne category...
  ✓ Colonne category ajoutée
  ✓ Index vérifiés

═══════════════════════════════════════════════════════
✅ BASE DE DONNÉES PRÊTE
═══════════════════════════════════════════════════════
```

### Étape 8 : Tester l'API

```bash
# Test 1 : API reminders/count
curl https://crm.pixfeed.net/api/reminders/count

# Test 2 : API tva-regimes
curl https://crm.pixfeed.net/api/tva-regimes

# Les deux devraient maintenant fonctionner sans erreur 404
```

### Étape 9 : Vérifier dans le navigateur

Ouvrez `https://crm.pixfeed.net` dans votre navigateur et vérifiez :
- ✅ Aucune erreur 404 dans la console
- ✅ L'application se charge correctement
- ✅ Les rappels sont visibles (icône cloche en haut à droite)

---

## 🆘 Si ça ne fonctionne toujours pas

### Option A : Vérifier manuellement la table dans PostgreSQL

```bash
# Se connecter à PostgreSQL
psql -U postgres -d crm_db

# Vérifier la structure de la table
\d tva_regimes

# Vous devriez voir la colonne category
# Si elle n'existe PAS, continuez...

# Quitter psql
\q
```

### Option B : Forcer la recréation en DROP/CREATE (DANGEREUX - données perdues)

**⚠️ ATTENTION : Ceci SUPPRIMERA toutes les données de la table tva_regimes**

```bash
psql -U postgres -d crm_db << EOF
DROP TABLE IF EXISTS tva_regimes CASCADE;
EOF
```

Puis redémarrez le backend. `autoInitDatabase` recréera la table avec toutes les colonnes.

### Option C : Ajouter manuellement la colonne (SAFE)

```bash
psql -U postgres -d crm_db << EOF
ALTER TABLE tva_regimes
ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'taux_normal';

-- Mettre à jour les catégories existantes
UPDATE tva_regimes SET category = 'taux_normal' WHERE code = 'NORMAL';
UPDATE tva_regimes SET category = 'taux_reduit' WHERE code IN ('INTERMEDIAIRE', 'REDUIT', 'SUPER_REDUIT');
UPDATE tva_regimes SET category = 'non_application' WHERE code LIKE 'NON_APPLICABLE%';

-- Créer l'index
CREATE INDEX IF NOT EXISTS idx_tva_regimes_category ON tva_regimes(category);
EOF
```

---

## 📊 Vérification finale

Après le redémarrage, vérifiez dans PostgreSQL :

```bash
psql -U postgres -d crm_db -c "SELECT code, label, category FROM tva_regimes LIMIT 5;"
```

Vous devriez voir :

```
      code       |        label         |   category
-----------------+----------------------+---------------
 NORMAL          | TVA normale à 20%    | taux_normal
 INTERMEDIAIRE   | TVA intermédiaire..  | taux_reduit
 ...
```

---

## 📝 Résumé

1. ✅ `git pull` pour récupérer les derniers commits
2. ✅ Redémarrer le backend
3. ✅ Vérifier les logs (`autoInitDatabase` doit s'exécuter)
4. ✅ Tester les APIs
5. ✅ Vérifier dans le navigateur

**Durée estimée** : 5-10 minutes

---

## 📞 Support

Si le problème persiste après ces étapes, fournissez :
- Les logs complets du backend après redémarrage
- Le résultat de `\d tva_regimes` dans psql
- Les erreurs dans la console du navigateur
