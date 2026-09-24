// Configuration Vite (remplace Create React App / react-app-rewired, plus maintenus).
// - même dossier de sortie « build/ » : deploy.sh et nginx ne changent pas ;
// - les variables REACT_APP_* et process.env.NODE_ENV restent lisibles par le code existant ;
// - pas de source maps en production, script d'amorçage externe (CSP script-src 'self' stricte).
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['REACT_APP_', 'VITE_']);
  const defineEnv = {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  };
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('REACT_APP_')) defineEnv[`process.env.${k}`] = JSON.stringify(v);
  }
  // Une variable REACT_APP_* absente doit rester `undefined` (les fallbacks `|| 'http://…'` du code
  // en dépendent) et non lever une erreur « process is not defined » dans le navigateur.
  for (const k of ['REACT_APP_API_URL']) {
    if (!(`process.env.${k}` in defineEnv)) defineEnv[`process.env.${k}`] = 'undefined';
  }
  return {
    plugins: [react()],
    envPrefix: ['REACT_APP_', 'VITE_'],
    define: defineEnv,
    server: {
      port: 3000,
      // En développement, /api et /uploads vont au backend Express (5000) comme avec CRA.
      proxy: { '/api': 'http://localhost:5000', '/uploads': 'http://localhost:5000' },
    },
    build: {
      outDir: 'build',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  };
});
