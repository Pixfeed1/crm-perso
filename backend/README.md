# CRM PixFeed — backend

Node.js / Express / PostgreSQL. Démarrage : `npm start` (lit `backend/.env`). Les migrations sont
idempotentes et jouées au démarrage par `scripts/autoInitDatabase.js`.

## Tests

```bash
npm test          # tests unitaires (sans base) : qualification des prospects, email par la preuve,
                  # netlinking, revenus. Les tests base sont ignorés.
npm run test:db   # idem + tests base sur une PostgreSQL JETABLE (TEST_DATABASE_URL, défaut
                  # postgres://postgres@127.0.0.1:55432/postgres). Jamais la base de production :
                  # chaque test crée son schéma et le supprime.
```

Lanceur intégré de Node (`node --test`), aucune dépendance de test.

## Accès à la base : deux styles cohabitent

- **Historique** : `db.run / db.get / db.all` avec des `?` (héritage SQLite, émulé sur PostgreSQL).
  Encore utilisé par `leadModel`, `revenueController`, l'import de prospects…
- **Actuel** : `db.pool.query(sql, params)` avec `$1, $2…` (pg natif). Tous les modules récents.

Règle pour le code neuf : **`db.pool.query` uniquement**. On ne convertit pas l'existant d'un bloc
(des centaines d'appels, risque de régression silencieuse) ; on migre un module quand on le
retouche, en le couvrant d'un test au passage.
