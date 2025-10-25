# Migration de la table Reminders

## Problème
La table `reminders` n'existe pas dans PostgreSQL et doit être créée.

## Solution

### Méthode 1 : Exécuter le script de migration

```bash
cd backend
node scripts/createRemindersTable.js
```

### Méthode 2 : SQL Direct

Si le script Node ne fonctionne pas, vous pouvez exécuter directement ce SQL dans PostgreSQL :

```sql
-- Créer la table reminders
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMP NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  dismissed_at TIMESTAMP
);

-- Créer les index pour améliorer les performances
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_due_date ON reminders(due_date);
CREATE INDEX idx_reminders_entity ON reminders(entity_type, entity_id);
CREATE INDEX idx_reminders_priority ON reminders(priority);
```

### Méthode 3 : Via psql

```bash
# Se connecter à PostgreSQL
psql -U postgres -d votre_database

# Puis copier-coller le SQL ci-dessus
```

## Vérification

Pour vérifier que la table a été créée :

```sql
-- Lister les tables
\dt

-- Voir la structure de la table
\d reminders
```

## Configuration

Assurez-vous que vos variables d'environnement sont correctement configurées dans `.env` :

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=votre_database
DB_PASSWORD=votre_password
DB_PORT=5432
```

## Structure de la table

| Colonne | Type | Description |
|---------|------|-------------|
| id | SERIAL | Identifiant unique auto-incrémenté |
| entity_type | TEXT | Type d'entité (lead, project, client, etc.) |
| entity_id | INTEGER | ID de l'entité associée |
| title | TEXT | Titre du rappel |
| description | TEXT | Description optionnelle |
| due_date | TIMESTAMP | Date d'échéance du rappel |
| priority | TEXT | Priorité (low, medium, high) |
| status | TEXT | Statut (pending, completed, dismissed) |
| created_at | TIMESTAMP | Date de création |
| completed_at | TIMESTAMP | Date de complétion |
| dismissed_at | TIMESTAMP | Date de rejet |

## Utilisation dans l'application

Une fois la table créée, les rappels seront accessibles via :
- `reminderModel.js` pour les opérations CRUD
- API endpoints `/api/reminders`
- Interface utilisateur dans les composants Reminders
