# 📋 GUIDE DE TEST COMPLET - CRM PERSONNEL

**Branche**: `claude/start-positioning-011CUTfNdGe1LoTm43ezYuwo`
**Derniers commits**:
- f91c3db: Refactorisation routes/modèles
- 1826073: Création 5 modèles manquants

---

## 🔐 1. AUTHENTIFICATION

### Endpoints disponibles:
- **POST** `/api/auth/login` - Connexion
- **GET** `/api/auth/check` - Vérifier le token
- **POST** `/api/auth/forgot-password` - Mot de passe oublié
- **POST** `/api/auth/reset-password` - Réinitialiser mot de passe

### Tests à faire:
```bash
# Connexion
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password"}'

# Vérifier token
curl http://localhost:5000/api/auth/check \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 👥 2. LEADS (Prospects)

### Endpoints disponibles:
- **GET** `/api/leads` - Liste tous les leads
- **GET** `/api/leads/:id` - Détail d'un lead (avec contacts + projets)
- **POST** `/api/leads` - Créer un lead
- **PUT** `/api/leads/:id` - Modifier un lead
- **DELETE** `/api/leads/:id` - Supprimer un lead
- **GET** `/api/leads/kanban/stats` - ✅ Statistiques Kanban

### Gestion des contacts:
- **GET** `/api/leads/:id/contacts` - Liste contacts d'un lead
- **POST** `/api/leads/:id/contacts` - Ajouter contact
- **PUT** `/api/leads/:leadId/contacts/:contactId` - Modifier contact
- **DELETE** `/api/leads/:leadId/contacts/:contactId` - Supprimer contact

### Tests à faire:
```bash
# Créer un lead
curl -X POST http://localhost:5000/api/leads \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Lead",
    "company": "Test Company",
    "status": "new",
    "type": "company"
  }'

# Kanban stats
curl http://localhost:5000/api/leads/kanban/stats \
  -H "Authorization: Bearer TOKEN"

# Ajouter contact
curl -X POST http://localhost:5000/api/leads/1/contacts \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "is_primary": true
  }'
```

---

## 💼 3. CLIENTS

### Endpoints disponibles:
- **GET** `/api/clients` - Liste tous les clients
- **GET** `/api/clients/stats` - Statistiques clients
- **GET** `/api/clients/:id` - Détail d'un client (avec projets + revenus)
- **POST** `/api/clients` - Créer un client
- **POST** `/api/clients/convert/:leadId` - ✅ Convertir lead → client
- **PUT** `/api/clients/:id` - Modifier un client
- **DELETE** `/api/clients/:id` - Supprimer un client

### Tests à faire:
```bash
# Convertir lead en client
curl -X POST http://localhost:5000/api/clients/convert/1 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_start_date": "2025-01-01",
    "lifetime_value": 5000
  }'

# Stats clients
curl http://localhost:5000/api/clients/stats \
  -H "Authorization: Bearer TOKEN"
```

---

## 📊 4. OBJECTIFS (Goals)

### Endpoints disponibles:
- **GET** `/api/goals` - Liste tous les objectifs
- **GET** `/api/goals/:id` - Détail objectif (avec milestones)
- **POST** `/api/goals` - Créer un objectif
- **PUT** `/api/goals/:id` - Modifier un objectif
- **PATCH** `/api/goals/:id/progress` - ✅ Mettre à jour progression
- **DELETE** `/api/goals/:id` - Supprimer un objectif

### Gestion des milestones:
- **GET** `/api/goals/:id/milestones` - Liste milestones
- **POST** `/api/goals/:id/milestones` - Ajouter milestone
- **PUT** `/api/goals/:goalId/milestones/:milestoneId` - Modifier milestone
- **DELETE** `/api/goals/:goalId/milestones/:milestoneId` - Supprimer milestone

### Tests à faire:
```bash
# Créer objectif
curl -X POST http://localhost:5000/api/goals \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CA Q1",
    "category": "revenue",
    "period": "quarterly",
    "target_value": 100000,
    "current_value": 0,
    "start_date": "2025-01-01",
    "end_date": "2025-03-31"
  }'

# Mettre à jour progression
curl -X PATCH http://localhost:5000/api/goals/1/progress \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_value": 25000}'

# Ajouter milestone
curl -X POST http://localhost:5000/api/goals/1/milestones \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premier palier",
    "target": 25000
  }'
```

---

## 📅 5. ÉVÉNEMENTS

### Endpoints disponibles:
- **GET** `/api/events?start_date=XXX&end_date=XXX` - Liste événements (filtrable)
- **GET** `/api/events/:id` - Détail événement
- **POST** `/api/events` - Créer événement
- **PUT** `/api/events/:id` - Modifier événement
- **DELETE** `/api/events/:id` - Supprimer événement

### Tests à faire:
```bash
# Créer événement
curl -X POST http://localhost:5000/api/events \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Réunion client",
    "start_datetime": "2025-01-15T10:00:00Z",
    "end_datetime": "2025-01-15T11:00:00Z",
    "category": "meeting"
  }'

# Filtrer par date
curl "http://localhost:5000/api/events?start_date=2025-01-01&end_date=2025-01-31" \
  -H "Authorization: Bearer TOKEN"
```

---

## 💰 6. REVENUS

### Endpoints disponibles:
- **GET** `/api/revenues?start_date=XXX&end_date=XXX&type=XXX` - Liste revenus (filtrable)
- **GET** `/api/revenues/stats` - Statistiques revenus
- **GET** `/api/revenues/:id` - Détail revenu
- **POST** `/api/revenues` - Créer revenu
- **PUT** `/api/revenues/:id` - Modifier revenu
- **DELETE** `/api/revenues/:id` - Supprimer revenu

### Tests à faire:
```bash
# Créer revenu
curl -X POST http://localhost:5000/api/revenues \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "date": "2025-01-15",
    "type": "contract",
    "description": "Paiement client"
  }'

# Stats revenus
curl "http://localhost:5000/api/revenues/stats?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer TOKEN"
```

---

## 📁 7. PROJETS

### Endpoints disponibles:
- **GET** `/api/projects` - Liste tous les projets
- **GET** `/api/projects/:id` - Détail projet (avec tasks)
- **POST** `/api/projects` - Créer projet
- **PUT** `/api/projects/:id` - Modifier projet
- **DELETE** `/api/projects/:id` - Supprimer projet

### Gestion des tâches:
- **POST** `/api/projects/:id/tasks` - Ajouter tâche
- **PUT** `/api/projects/:projectId/tasks/:taskId` - Modifier tâche
- **DELETE** `/api/projects/:projectId/tasks/:taskId` - Supprimer tâche

---

## 📝 8. ACTIVITÉS

### Endpoints disponibles:
- **GET** `/api/activities` - Liste toutes les activités
- **GET** `/api/activities/recent` - Activités récentes
- **GET** `/api/activities/:id` - Détail activité
- **POST** `/api/activities` - Créer activité
- **PUT** `/api/activities/:id` - Modifier activité
- **PATCH** `/api/activities/:id/complete` - Marquer comme complétée
- **DELETE** `/api/activities/:id` - Supprimer activité

---

## 🔔 9. RAPPELS (Reminders)

### Endpoints disponibles:
- **GET** `/api/reminders/active` - Rappels actifs
- **GET** `/api/reminders/overdue` - Rappels en retard
- **GET** `/api/reminders/upcoming` - Rappels à venir
- **GET** `/api/reminders/count` - Nombre de rappels actifs
- **GET** `/api/reminders/entity/:entityType/:entityId` - Rappels d'une entité
- **GET** `/api/reminders/:id` - Détail rappel
- **POST** `/api/reminders` - Créer rappel
- **PUT** `/api/reminders/:id` - Modifier rappel
- **PATCH** `/api/reminders/:id/complete` - Marquer comme complété
- **PATCH** `/api/reminders/:id/dismiss` - Ignorer rappel
- **DELETE** `/api/reminders/:id` - Supprimer rappel

---

## 📨 10. INTERACTIONS LEADS

### Endpoints disponibles:
- **GET** `/api/leads/:leadId/interactions` - Liste interactions d'un lead
- **POST** `/api/leads/:leadId/interactions` - Créer interaction
- **GET** `/api/leads/interactions/:interactionId` - Détail interaction
- **PUT** `/api/leads/interactions/:interactionId` - Modifier interaction
- **DELETE** `/api/leads/interactions/:interactionId` - Supprimer interaction

---

## 🔍 11. RECHERCHE GLOBALE

### Endpoints disponibles:
- **GET** `/api/search?query=XXX` - Recherche cross-entités

### Test:
```bash
curl "http://localhost:5000/api/search?query=test" \
  -H "Authorization: Bearer TOKEN"
```

---

## 📊 12. DASHBOARD

### Endpoints disponibles:
- **GET** `/api/dashboard` - Données complètes du dashboard

---

## 📥 13. EXPORT CSV

### Endpoints disponibles:
- **GET** `/api/export/leads` - Exporter leads en CSV
- **GET** `/api/export/clients` - Exporter clients en CSV
- **GET** `/api/export/projects` - Exporter projets en CSV
- **GET** `/api/export/goals` - Exporter objectifs en CSV
- **GET** `/api/export/revenues` - Exporter revenus en CSV
- **GET** `/api/export/activities` - Exporter activités en CSV
- **GET** `/api/export/contacts` - Exporter contacts en CSV
- **GET** `/api/export/all` - Tout exporter en ZIP

---

## ✅ VÉRIFICATIONS À FAIRE

### 1. Backend
```bash
cd backend
npm install
npm start
# Doit démarrer sur port 5000
```

### 2. Frontend
```bash
cd frontend
npm install
npm start
# Doit démarrer sur port 3000
```

### 3. Tests manuels prioritaires:
1. ✅ Connexion auth
2. ✅ Créer un lead
3. ✅ Voir stats Kanban
4. ✅ Convertir lead → client
5. ✅ Créer objectif + milestone
6. ✅ Mettre à jour progression objectif
7. ✅ Créer événement
8. ✅ Créer revenu
9. ✅ Recherche globale
10. ✅ Export CSV

---

## 🗂️ STRUCTURE DES MODÈLES

**Modèles disponibles** (tous utilisent Promises) :
- ✅ `activityModel.js` - Activités
- ✅ `clientModel.js` - Clients (NOUVEAU)
- ✅ `eventModel.js` - Événements (NOUVEAU)
- ✅ `goalModel.js` - Objectifs (NOUVEAU)
- ✅ `leadInteractionModel.js` - Interactions
- ✅ `leadModel.js` - Leads + Contacts (NOUVEAU)
- ✅ `projectModel.js` - Projets + Tâches
- ✅ `reminderModel.js` - Rappels
- ✅ `revenueModel.js` - Revenus (NOUVEAU)
- ✅ `userModel.js` - Utilisateurs

---

## 📌 NOTES IMPORTANTES

1. **Authentification** : Toutes les routes (sauf `/api/auth/*`) nécessitent un token JWT
2. **Base de données** : PostgreSQL (config dans `backend/config/pgConfig.js`)
3. **Kanban** : API stats disponible sur `/api/leads/kanban/stats`
4. **Conversion** : Lead → Client via `/api/clients/convert/:leadId`
5. **Recherche** : Cross-entités sur leads, projects, goals, activities, contacts

---

**TOUT EST LÀ ET POUSSÉ SUR LA BRANCHE** ✅
