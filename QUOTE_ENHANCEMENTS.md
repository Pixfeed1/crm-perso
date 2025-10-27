# Enrichissement des fonctionnalités Devis & Factures

## 📋 Vue d'ensemble

Ce document décrit les améliorations apportées au module Devis et Factures du CRM.

## ✨ Nouvelles fonctionnalités implémentées

### 1. **Titre personnalisé**
- Champ `title` TEXT pour donner un nom explicite au devis/facture
- Exemple : "Développement site web e-commerce", "Refonte graphique logo"

### 2. **Association aux projets**
- Champ `project_id` INTEGER
- Foreign key vers table `projects`
- Permet de rattacher un devis/facture à un projet existant
- Le projet contient déjà le client associé

### 3. **Système de remise**
- **3 types de remise** :
  - `none` : Pas de remise
  - `percent` : Remise en pourcentage (ex: 10%)
  - `fixed` : Montant fixe (ex: 500€)
- Champs ajoutés :
  - `discount_type` VARCHAR(10)
  - `discount_value` DECIMAL(10,2)
  - `discount_amount` NUMERIC (calculé automatiquement)

### 4. **Moyens de règlement multiples**
- Champ `payment_methods` JSONB (tableau)
- Table de référence `payment_methods` avec codes standards :
  - VIREMENT : Virement bancaire
  - CHEQUE : Chèque
  - CARTE : Carte bancaire
  - ESPECES : Espèces
  - PRELEVEMENT : Prélèvement automatique
  - PAYPAL : PayPal
  - STRIPE : Stripe
  - TRAITE : Lettre de change
  - AUTRE : Autre moyen
- Possibilité de sélectionner plusieurs moyens

### 5. **Régimes TVA français**
- Champ `tva_regime` VARCHAR(50) au lieu de juste un taux
- Table de référence `tva_regimes` avec les régimes standards :
  - **NORMAL** : 20.00% (Taux standard)
  - **INTERMEDIAIRE** : 10.00% (Travaux, restauration)
  - **REDUIT** : 5.50% (Produits de première nécessité)
  - **SUPER_REDUIT** : 2.10% (Médicaments remboursables)
  - **CORSE** : 13.00% (Taux Corse)
  - **DOM** : 8.50% (Départements d'Outre-Mer)
  - **EXONERE** : 0.00% (TVA non applicable)

### 6. **Informations complémentaires**
- Champ `additional_info` TEXT
- Zone de texte libre pour informations supplémentaires
- Affichée dans le PDF du devis/facture

### 7. **Pièces jointes**
- Champ `additional_files` JSONB (tableau)
- Structure :
  ```json
  [{
    "filename": "cahier_charges.pdf",
    "url": "/uploads/quotes/123/cahier_charges.pdf",
    "size": 245678,
    "uploaded_at": "2025-01-15T10:30:00Z"
  }]
  ```

### 8. **Signature électronique** (Devis uniquement)
- Champs ajoutés :
  - `signed_at` TIMESTAMP : Date de signature
  - `signed_by` TEXT : Nom du signataire
  - `signature_data` TEXT : Signature en base64
- **Fonctionnement** :
  1. Client reçoit le devis par email
  2. Accède au devis via lien unique
  3. Signe électroniquement (canvas signature)
  4. Signature enregistrée, devis passe en statut "signed"
  5. Conversion automatique en facture selon paramètres

## 🗄️ Structure de la base de données

### Tables ajoutées

#### `projects`
```sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  client_id INTEGER REFERENCES crm_clients(id),
  status VARCHAR(50) DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  budget NUMERIC DEFAULT 0,
  color VARCHAR(20) DEFAULT '#6366F1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `tva_regimes`
```sql
CREATE TABLE tva_regimes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  label TEXT NOT NULL,
  rate DECIMAL(5,2) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `payment_methods`
```sql
CREATE TABLE payment_methods (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Colonnes ajoutées aux tables `quotes` et `invoices`

```sql
-- Communes aux deux tables
title TEXT,
project_id INTEGER REFERENCES projects(id),
discount_type VARCHAR(10) DEFAULT 'none',
discount_value DECIMAL(10,2) DEFAULT 0,
discount_amount NUMERIC DEFAULT 0,
payment_methods JSONB DEFAULT '[]',
tva_regime VARCHAR(50) DEFAULT 'NORMAL',
additional_info TEXT,
additional_files JSONB DEFAULT '[]'

-- Spécifique aux quotes (signature)
signed_at TIMESTAMP,
signed_by TEXT,
signature_data TEXT
```

## 🚀 API Endpoints ajoutés

### Régimes TVA
- `GET /api/tva-regimes` - Liste tous les régimes TVA actifs
- `GET /api/tva-regimes/:code` - Récupère un régime par code

### Moyens de paiement
- `GET /api/payment-methods` - Liste tous les moyens de paiement actifs
- `GET /api/payment-methods/:code` - Récupère un moyen par code

### Projets
- Utilise les endpoints existants de `/api/projects`

## 📁 Fichiers créés/modifiés

### Backend

**Nouveaux fichiers** :
- `backend/scripts/migrations/addQuoteEnhancements.js` - Script de migration
- `backend/models/tvaRegimeModel.js` - Model régimes TVA
- `backend/models/paymentMethodModel.js` - Model moyens de paiement
- `backend/controllers/tvaRegimeController.js` - Controller régimes TVA
- `backend/controllers/paymentMethodController.js` - Controller moyens de paiement
- `backend/routes/tvaRegimeRoutes.js` - Routes régimes TVA
- `backend/routes/paymentMethodRoutes.js` - Routes moyens de paiement

**Fichiers modifiés** :
- `backend/server.js` - Ajout des nouvelles routes
- `backend/models/quoteModel.js` - À modifier pour nouveaux champs
- `backend/models/invoiceModel.js` - À modifier pour nouveaux champs
- `backend/controllers/quoteController.js` - À modifier pour nouveaux champs
- `backend/controllers/invoiceController.js` - À modifier pour nouveaux champs

### Frontend (à implémenter)

**À créer** :
- `frontend/src/components/quotes/QuoteFormEnhanced.jsx` - Formulaire enrichi
- `frontend/src/components/quotes/SignatureCanvas.jsx` - Canvas de signature
- `frontend/src/components/common/FileUpload.jsx` - Upload de fichiers
- `frontend/src/components/common/ProjectSelector.jsx` - Sélecteur de projet

**À modifier** :
- `frontend/src/pages/Quotes.jsx` - Intégrer nouveau formulaire
- `frontend/src/pages/Invoices.jsx` - Intégrer nouveau formulaire
- `frontend/src/services/quotesAPI.js` - Ajouter méthodes signature
- `frontend/src/services/projectsAPI.js` - Ajouter si manquant

## 🔧 Installation & Configuration

### 1. Exécuter la migration

```bash
cd backend
node scripts/migrations/addQuoteEnhancements.js
```

Cette commande va :
- Créer les tables `projects`, `tva_regimes`, `payment_methods`
- Ajouter toutes les nouvelles colonnes aux tables existantes
- Insérer les données de référence (régimes TVA et moyens de paiement)

### 2. Redémarrer le serveur

```bash
npm start
```

Les nouvelles routes seront automatiquement disponibles.

## 📝 TODO - Implémentation restante

### Backend
- [X] Migration base de données
- [X] Models pour tva_regimes et payment_methods
- [X] Controllers et routes pour tva_regimes et payment_methods
- [ ] Modifier quoteModel.createQuote() pour gérer nouveaux champs
- [ ] Modifier quoteModel.updateQuote() pour gérer nouveaux champs
- [ ] Modifier invoiceModel.createInvoice() pour gérer nouveaux champs
- [ ] Modifier invoiceModel.updateInvoice() pour gérer nouveaux champs
- [ ] Endpoint pour upload de fichiers
- [ ] Endpoint pour signature électronique
- [ ] Endpoint pour conversion devis → facture

### Frontend
- [ ] Enrichir QuoteForm avec tous les nouveaux champs
- [ ] Composant ProjectSelector
- [ ] Composant sélection régime TVA (dropdown)
- [ ] Composant sélection moyens de paiement (multi-select)
- [ ] Champ remise avec type (%, €)
- [ ] Zone informations complémentaires
- [ ] Composant FileUpload pour pièces jointes
- [ ] Canvas de signature électronique
- [ ] Page publique de visualisation/signature devis
- [ ] Bouton "Convertir en facture"

### Tests
- [ ] Tester création devis avec tous les champs
- [ ] Tester création facture avec tous les champs
- [ ] Tester conversion devis → facture
- [ ] Tester upload de fichiers
- [ ] Tester signature électronique

## 🎯 Priorités

1. **URGENT** : Mettre à jour quoteModel et invoiceModel pour gérer les nouveaux champs
2. **URGENT** : Enrichir le frontend QuoteForm
3. **IMPORTANT** : Implémenter upload de fichiers
4. **IMPORTANT** : Implémenter signature électronique
5. **MOYEN** : Tests complets

## 💡 Notes techniques

### Calcul automatique de la remise
```javascript
// Frontend ou backend
const calculateDiscount = (totalHT, discountType, discountValue) => {
  if (discountType === 'percent') {
    return totalHT * (discountValue / 100);
  } else if (discountType === 'fixed') {
    return discountValue;
  }
  return 0;
};
```

### Signature électronique
- Utiliser library `signature_pad` ou `react-signature-canvas`
- Stocker en base64 dans `signature_data`
- Générer token unique pour lien de signature
- Email envoyé au client avec lien : `/sign-quote/:token`

### Upload de fichiers
- Utiliser `multer` pour gérer les uploads
- Stocker dans `/backend/uploads/quotes/:quoteId/`
- Limiter taille : 10MB par fichier
- Types acceptés : PDF, JPG, PNG, DOCX

## 🔐 Sécurité

- Validation côté serveur de tous les champs
- Sanitization des entrées utilisateur
- Vérification des permissions avant signature
- Token de signature unique et expirant (7 jours)
- Scan antivirus des fichiers uploadés (recommandé)

## 📊 Impact sur les PDF

Les PDF générés doivent maintenant inclure :
- Titre du devis/facture en haut
- Nom du projet (si associé)
- Régime TVA avec libellé complet
- Remise affichée clairement
- Moyens de paiement acceptés
- Informations complémentaires
- Liste des pièces jointes
- Signature électronique (si signée)

---

**Date de création** : 2025-10-26
**Auteur** : Claude Code
**Version** : 1.0
