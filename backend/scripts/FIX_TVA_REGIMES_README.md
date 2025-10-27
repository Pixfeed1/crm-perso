# Correction de la table tva_regimes

## Problème

L'API `/api/tva-regimes` retourne une erreur 500 :
```
Erreur : "column 'category' does not exist"
```

Cela signifie que la table `tva_regimes` existe dans votre base de données PostgreSQL mais **ne contient pas toutes les colonnes nécessaires**.

## Causes possibles

1. La table a été créée avec une ancienne version du schéma
2. Les migrations n'ont pas été exécutées correctement
3. Le système d'auto-initialisation n'a pas pu ajouter les colonnes manquantes

## Solutions

### Solution 1 : Redémarrer le backend (RECOMMANDÉ)

Le système d'auto-initialisation a été **corrigé** pour gérer correctement l'ajout de colonnes avec contraintes NOT NULL sur des tables existantes.

**Étapes :**
1. Arrêter le backend si il tourne
2. Démarrer le backend : `npm start`
3. Vérifier les logs de démarrage - vous devriez voir :
   ```
   📋 Vérification table tva_regimes...
   ✓ Table tva_regimes existe déjà
   → Ajout colonne category...
   ✓ Colonne category ajoutée
   ✓ Valeurs par défaut appliquées pour category
   ✓ Contrainte NOT NULL ajoutée pour category
   ...
   ✅ BASE DE DONNÉES PRÊTE
   ```

### Solution 2 : Script SQL manuel (si le redémarrage ne fonctionne pas)

Si le redémarrage ne résout pas le problème, exécutez le script SQL directement :

```bash
# Depuis le répertoire backend
cd backend/scripts

# Exécuter le script (remplacer les valeurs par vos paramètres DB)
psql -U postgres -d crm_db -f fix_tva_regimes.sql

# Ou avec variables d'environnement
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d crm_db -f fix_tva_regimes.sql
```

### Solution 3 : Script Node.js (si PostgreSQL est démarré)

```bash
cd backend
node scripts/fixTvaRegimesTable.js
```

### Solution 4 : Recréer complètement la table (DESTRUCTIF)

**⚠️ ATTENTION : Cette méthode supprime toutes les données de la table tva_regimes**

```sql
DROP TABLE IF EXISTS tva_regimes CASCADE;
-- Puis redémarrer le backend pour recréer la table
```

## Vérification

Après avoir appliqué une des solutions, testez l'API :

```bash
curl http://localhost:5000/api/tva-regimes
```

Vous devriez recevoir une réponse JSON avec les régimes de TVA :
```json
{
  "success": true,
  "total": 5,
  "regimes": [
    {
      "code": "NORMAL",
      "label": "TVA normale à 20%",
      "category": "taux_normal",
      "taux": "20.00",
      ...
    }
  ]
}
```

## Colonnes ajoutées par le fix

- `category` : Catégorie du régime (taux_normal, taux_reduit, non_application, etc.)
- `article_cgi` : Référence à l'article du Code Général des Impôts
- `description` : Description détaillée du régime
- `mention_legale` : Mention légale à afficher sur les factures
- `calcul_type` : Type de calcul (normal, non_applicable, etc.)
- `ordre` : Ordre d'affichage
- `active` : Régime actif ou non
- `created_at` : Date de création

## Modifications apportées

### autoInitDatabase.js

La logique d'ajout de colonnes a été améliorée pour :
1. **Retirer temporairement NOT NULL** lors de l'ajout initial
2. **Appliquer les valeurs par défaut** aux lignes existantes
3. **Ajouter NOT NULL après coup** si nécessaire

Cela évite les erreurs de type "column contains null values" lors de l'ajout de colonnes NOT NULL sur des tables avec données existantes.

### Code modifié (lignes 406-433)

```javascript
// Pour les colonnes NOT NULL, on enlève NOT NULL lors de l'ajout initial
const hasNotNull = cleanDef.includes('NOT NULL');
let alterDef = cleanDef.replace(/NOT NULL/g, '');

// Ajouter la colonne sans NOT NULL
await client.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${alterDef};`);

// Mettre à jour les valeurs NULL avec le DEFAULT
if (alterDef.includes('DEFAULT')) {
  await client.query(`UPDATE ${tableName} SET ${columnName} = ${defaultValue} WHERE ${columnName} IS NULL;`);
}

// Ajouter NOT NULL après
if (hasNotNull) {
  await client.query(`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`);
}
```

## Support

Si le problème persiste après avoir appliqué ces solutions, vérifiez :
1. Que PostgreSQL est bien démarré
2. Que les variables d'environnement DB_* sont correctes dans `.env`
3. Les logs du backend pour d'autres erreurs
