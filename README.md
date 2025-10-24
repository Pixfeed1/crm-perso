# CRM Personnel

Application CRM (Customer Relationship Management) full-stack pour gérer vos contacts, projets, activités et revenus.

## Description

Cette application permet de :
- Gérer des leads (prospects) et leur suivi
- Suivre des projets avec leurs tâches
- Planifier et enregistrer des activités
- Gérer un calendrier d'événements
- Suivre les objectifs (goals)
- Gérer les revenus
- Visualiser un dashboard avec des statistiques

## Stack Technique

### Backend
- **Node.js** avec **Express.js** - Serveur HTTP
- **PostgreSQL** - Base de données relationnelle
- **JWT** - Authentification par tokens
- **bcrypt** - Hachage des mots de passe

### Frontend
- **React** - Framework UI
- **React Router** - Navigation
- **Tailwind CSS** - Styles
- **Framer Motion** - Animations
- **Recharts** - Graphiques et visualisations
- **React DatePicker** - Sélection de dates

## Structure du Projet

```
crm-perso/
├── backend/                    # Serveur Node.js
│   ├── config/                # Configuration de la base de données
│   │   ├── pgConfig.js        # Configuration PostgreSQL
│   │   └── pgMigrations.js    # Migrations de la base de données
│   ├── controllers/           # Logique métier
│   ├── models/               # Modèles de données
│   ├── routes/               # Routes API
│   ├── middleware/           # Middlewares (auth, etc.)
│   ├── scripts/              # Scripts utilitaires
│   ├── server.js             # Point d'entrée du serveur
│   └── package.json          # Dépendances backend
│
├── frontend/                  # Application React
│   ├── src/
│   │   ├── pages/           # Pages principales
│   │   ├── components/      # Composants réutilisables
│   │   ├── contexts/        # Contexts React (Auth, etc.)
│   │   ├── services/        # Services API
│   │   └── App.js           # Composant racine
│   └── package.json         # Dépendances frontend
│
└── README.md                 # Ce fichier

```

## Installation

### Prérequis

- **Node.js** (v16 ou supérieur)
- **PostgreSQL** (v12 ou supérieur)
- **npm** ou **yarn**

### Étapes d'installation

1. **Cloner le repository**
   ```bash
   git clone <url-du-repo>
   cd crm-perso
   ```

2. **Installer PostgreSQL et créer la base de données**
   ```bash
   # Se connecter à PostgreSQL
   psql -U postgres

   # Créer la base de données
   CREATE DATABASE mcrm_dev;

   # Quitter psql
   \q
   ```

3. **Configurer les variables d'environnement du backend**
   ```bash
   cd backend
   cp .env.example .env
   ```

   Modifier le fichier `.env` avec vos paramètres :
   ```env
   DB_USER=postgres
   DB_PASSWORD=votre_mot_de_passe
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=mcrm_dev

   JWT_SECRET=votre_secret_jwt_tres_securise

   DEFAULT_USER_USERNAME=admin
   DEFAULT_USER_PASSWORD=votre_mot_de_passe_admin

   PORT=5000
   NODE_ENV=development
   ```

4. **Installer les dépendances du backend**
   ```bash
   cd backend
   npm install
   ```

5. **Installer les dépendances du frontend**
   ```bash
   cd ../frontend
   npm install
   ```

## Lancement de l'application

### Démarrer le backend

```bash
cd backend
npm start        # Production
# ou
npm run dev      # Développement avec nodemon
```

Le serveur backend démarre sur http://localhost:5000

### Démarrer le frontend

```bash
cd frontend
npm start
```

L'application frontend démarre sur http://localhost:3000

## Variables d'environnement

### Backend (.env)

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `DB_USER` | Utilisateur PostgreSQL | `postgres` |
| `DB_PASSWORD` | Mot de passe PostgreSQL | `postgres` |
| `DB_HOST` | Hôte de la base de données | `localhost` |
| `DB_PORT` | Port PostgreSQL | `5432` |
| `DB_NAME` | Nom de la base de données | `mcrm_dev` |
| `JWT_SECRET` | Secret pour les tokens JWT | *(requis)* |
| `DEFAULT_USER_USERNAME` | Username de l'utilisateur par défaut | *(optionnel)* |
| `DEFAULT_USER_PASSWORD` | Mot de passe de l'utilisateur par défaut | *(optionnel)* |
| `PORT` | Port du serveur backend | `5000` |
| `NODE_ENV` | Environnement | `development` |

## API Endpoints

Le backend expose les endpoints suivants :

### Authentification
- `POST /api/auth/login` - Connexion
- `POST /api/auth/register` - Inscription

### Activités
- `GET /api/activities` - Liste des activités
- `POST /api/activities` - Créer une activité
- `PUT /api/activities/:id` - Modifier une activité
- `DELETE /api/activities/:id` - Supprimer une activité

### Leads
- `GET /api/leads` - Liste des leads
- `POST /api/leads` - Créer un lead
- `PUT /api/leads/:id` - Modifier un lead
- `DELETE /api/leads/:id` - Supprimer un lead

### Projets
- `GET /api/projects` - Liste des projets
- `POST /api/projects` - Créer un projet
- `PUT /api/projects/:id` - Modifier un projet
- `DELETE /api/projects/:id` - Supprimer un projet

### Événements
- `GET /api/events` - Liste des événements
- `POST /api/events` - Créer un événement
- `PUT /api/events/:id` - Modifier un événement
- `DELETE /api/events/:id` - Supprimer un événement

### Objectifs
- `GET /api/goals` - Liste des objectifs
- `POST /api/goals` - Créer un objectif
- `PUT /api/goals/:id` - Modifier un objectif
- `DELETE /api/goals/:id` - Supprimer un objectif

### Revenus
- `GET /api/revenues` - Liste des revenus
- `POST /api/revenues` - Créer un revenu
- `PUT /api/revenues/:id` - Modifier un revenu
- `DELETE /api/revenues/:id` - Supprimer un revenu

### Dashboard
- `GET /api/dashboard/stats` - Statistiques du dashboard

## Architecture

### Backend

L'architecture backend suit le pattern MVC (Model-View-Controller) :

- **Routes** : Définissent les endpoints et appellent les controllers
- **Controllers** : Contiennent la logique métier
- **Models** : Gèrent l'accès aux données
- **Middleware** : Gèrent l'authentification JWT

### Frontend

L'architecture frontend est organisée par fonctionnalités :

- **Pages** : Composants de pages principales
- **Components** : Composants réutilisables organisés par domaine
- **Contexts** : Gestion d'état global (AuthContext)
- **Services** : Communication avec l'API backend

## Scripts disponibles

### Backend
- `npm start` - Démarrer le serveur en production
- `npm run dev` - Démarrer le serveur en mode développement

### Frontend
- `npm start` - Démarrer l'application en développement
- `npm run build` - Construire l'application pour la production
- `npm test` - Lancer les tests

## Sécurité

- Les mots de passe sont hachés avec bcrypt avant stockage
- L'authentification utilise des tokens JWT
- Les routes API sont protégées par un middleware d'authentification
- Les variables sensibles doivent être dans `.env` (jamais dans le code)

## Contribution

Pour contribuer au projet :

1. Créer une branche pour votre fonctionnalité
2. Faire vos modifications
3. Tester vos changements
4. Soumettre une pull request

## Licence

ISC
