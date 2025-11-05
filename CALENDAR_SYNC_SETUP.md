# Configuration de la synchronisation calendrier

Ce guide explique comment configurer la synchronisation bidirectionnelle avec Google Calendar et Microsoft Outlook.

## Fonctionnalités

- ✅ Synchronisation bidirectionnelle (import/export)
- ✅ Support Google Calendar
- ✅ Support Microsoft Outlook
- ✅ Synchronisation manuelle et automatique
- ✅ Gestion des événements récurrents
- ✅ Gestion des exceptions (supprimer/modifier une occurrence)
- ✅ Historique de synchronisation

## Installation des dépendances

```bash
cd backend
npm install googleapis
```

## Configuration Google Calendar

### 1. Créer un projet Google Cloud

1. Allez sur https://console.cloud.google.com/
2. Créez un nouveau projet ou sélectionnez un projet existant
3. Activez l'API Google Calendar :
   - Menu "APIs & Services" > "Library"
   - Recherchez "Google Calendar API"
   - Cliquez sur "Enable"

### 2. Créer des identifiants OAuth 2.0

1. Menu "APIs & Services" > "Credentials"
2. Cliquez sur "Create Credentials" > "OAuth client ID"
3. Si demandé, configurez l'écran de consentement OAuth :
   - Type d'application : Externe
   - Nom de l'application : Votre CRM
   - Email de support : votre email
   - Scopes : Ajouter `.../auth/calendar` et `.../auth/calendar.events`
4. Type d'application : Application Web
5. Nom : CRM Calendar Sync
6. URI de redirection autorisés :
   - `http://localhost:5000/api/calendar-sync/google/callback` (développement)
   - `https://votre-domaine.com/api/calendar-sync/google/callback` (production)
7. Téléchargez les identifiants JSON

### 3. Configurer les variables d'environnement

Dans `backend/.env` :

```env
GOOGLE_CLIENT_ID=votre_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=votre_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/calendar-sync/google/callback
```

## Configuration Microsoft Outlook

### 1. Créer une application Azure AD

1. Allez sur https://portal.azure.com/
2. Menu "Azure Active Directory" > "App registrations"
3. Cliquez sur "New registration"
4. Nom : CRM Calendar Sync
5. Types de comptes pris en charge : Comptes dans un annuaire organisationnel et comptes Microsoft personnels
6. URI de redirection :
   - Type : Web
   - URI : `http://localhost:5000/api/calendar-sync/outlook/callback`
7. Cliquez sur "Register"

### 2. Créer un secret client

1. Dans votre application, menu "Certificates & secrets"
2. Cliquez sur "New client secret"
3. Description : CRM Sync Secret
4. Expiration : 24 mois (recommandé)
5. Copiez la valeur du secret (vous ne pourrez plus la voir après)

### 3. Configurer les permissions API

1. Menu "API permissions"
2. Cliquez sur "Add a permission"
3. Sélectionnez "Microsoft Graph"
4. Sélectionnez "Delegated permissions"
5. Ajoutez les permissions :
   - `User.Read`
   - `Calendars.ReadWrite`
6. Cliquez sur "Grant admin consent" (si vous êtes admin)

### 4. Configurer les variables d'environnement

Dans `backend/.env` :

```env
MICROSOFT_CLIENT_ID=votre_client_id
MICROSOFT_CLIENT_SECRET=votre_client_secret
MICROSOFT_REDIRECT_URI=http://localhost:5000/api/calendar-sync/outlook/callback
FRONTEND_URL=http://localhost:3000
```

## Utilisation

### Connecter un calendrier

1. Ouvrez le CRM et allez dans "Calendrier"
2. Cliquez sur le bouton "Synchroniser" en haut à droite
3. Cliquez sur "Google Calendar" ou "Outlook"
4. Autorisez l'accès dans la fenêtre popup
5. Vous serez redirigé vers le CRM avec le calendrier connecté

### Synchroniser manuellement

1. Ouvrez le modal de synchronisation
2. Cliquez sur le bouton "Synchroniser" (icône refresh) à côté du calendrier connecté
3. La synchronisation démarre et vous verrez les statistiques

### Déconnecter un calendrier

1. Ouvrez le modal de synchronisation
2. Cliquez sur le bouton "X" à côté du calendrier connecté
3. Confirmez la déconnexion

## Direction de synchronisation

Par défaut, la synchronisation est **bidirectionnelle** :
- Les événements créés dans le CRM sont exportés vers le calendrier externe
- Les événements créés dans le calendrier externe sont importés dans le CRM
- Les modifications sont synchronisées dans les deux sens

Vous pouvez configurer la direction dans les préférences (à venir) :
- `import` : Import uniquement depuis le calendrier externe
- `export` : Export uniquement vers le calendrier externe
- `bidirectional` : Synchronisation dans les deux sens

## Gestion des conflits

En cas de conflit (modification du même événement dans les deux calendriers), la stratégie par défaut est :
- `manual` : Demande à l'utilisateur de choisir
- `local_wins` : La version locale (CRM) a priorité
- `remote_wins` : La version distante (Google/Outlook) a priorité
- `latest_wins` : La dernière modification a priorité

## Plages de synchronisation

Par défaut :
- **Passé** : 30 jours
- **Futur** : 90 jours

Ces valeurs peuvent être modifiées dans les préférences de synchronisation.

## Limitations

- Google Calendar : Limite de 10,000 requêtes API par jour (gratuit)
- Outlook : Limite de 10,000 requêtes API par 10 minutes (gratuit)
- La synchronisation automatique s'exécute toutes les 15 minutes par défaut

## Dépannage

### Erreur "Invalid credentials"

- Vérifiez que les variables d'environnement sont correctement configurées
- Vérifiez que les URIs de redirection correspondent exactement

### Erreur "Token expired"

- Le token de rafraîchissement est automatiquement utilisé
- Si l'erreur persiste, déconnectez et reconnectez le calendrier

### Événements ne se synchronisent pas

- Vérifiez que la synchronisation est activée pour la connexion
- Vérifiez les logs de synchronisation dans le modal
- Vérifiez que les événements sont dans la plage de dates configurée

## Sécurité

- Les tokens OAuth2 sont stockés de manière chiffrée dans la base de données
- Les tokens de rafraîchissement permettent de renouveler l'accès sans redemander l'autorisation
- Les tokens expirent et sont automatiquement renouvelés
- Utilisez HTTPS en production pour sécuriser les communications

## Support

Pour toute question ou problème, consultez :
- [Documentation Google Calendar API](https://developers.google.com/calendar/api/guides/overview)
- [Documentation Microsoft Graph API](https://docs.microsoft.com/graph/api/resources/calendar)
