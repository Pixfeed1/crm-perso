/** @type {import('tailwindcss').Config} */

// Tokens semantiques pilotes par des variables CSS (voir src/index.css).
// Canaux "R G B" pour conserver les modificateurs d'opacite Tailwind (ex bg-surface puis /50).
// On AJOUTE ces tokens sans toucher aux couleurs Tailwind par defaut (gray, white, ...),
// donc les classes existantes restent identiques (rendu inchange en "classique").
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: withVar('--surface'),
        'surface-muted': withVar('--surface-muted'),
        'surface-strong': withVar('--surface-strong'),
        'text-primary': withVar('--text-primary'),
        'text-secondary': withVar('--text-secondary'),
        'text-muted': withVar('--text-muted'),
        border: withVar('--border'),
        'border-strong': withVar('--border-strong'),
        accent: withVar('--accent'),
        'accent-text': withVar('--accent-text'),
        overlay: withVar('--overlay'),
      },
    },
  },
  plugins: [],
  // Important: Cette option force tous les utilitaires Tailwind à utiliser !important
  // Cela garantit que text-white écrase toujours les autres styles
  important: false, // On garde false car on utilise déjà !important dans index.css
}
