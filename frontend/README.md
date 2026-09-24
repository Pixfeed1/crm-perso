# CRM PixFeed — frontend

Application React 18 construite avec **Vite** (migration depuis Create React App en septembre 2026 :
CRA n'est plus maintenu, react-app-rewired non plus).

## Commandes

```bash
npm install          # dépendances
npm run dev          # serveur de développement sur http://localhost:3000
                     # (/api et /uploads sont relayés vers le backend Express sur le port 5000)
npm run build        # build de production dans build/ (même dossier qu'avant : deploy.sh et
                     # nginx n'ont pas changé)
npm run preview      # sert build/ en local pour vérifier
npm run lint         # eslint (règles react-app)
```

## Variables d'environnement

- Le code lit encore `process.env.REACT_APP_API_URL` et `process.env.NODE_ENV` : `vite.config.js`
  les expose tel quel, à partir des fichiers `.env*` (préfixe `REACT_APP_` ou `VITE_`).
- `REACT_APP_API_URL` n'est pas défini en production : les appels utilisent les replis du code
  (même origine, `/api`).
- Pas de source maps en production, aucun script incrusté dans `index.html` : compatible avec une
  CSP `script-src 'self'` stricte.

## Repères

- `index.html` (racine) est le point d'entrée Vite ; `public/` contient favicon, manifest, robots.
- Les fichiers contenant du JSX portent l'extension `.jsx`.
- Tailwind est configuré par `tailwind.config.js` et `postcss.config.js` ; les tokens de thème
  (variables CSS) sont dans `src/index.css`.
