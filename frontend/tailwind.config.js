/** @type {import('tailwindcss').Config} */

// Couleurs pilotées par des variables CSS (voir src/index.css). Les canaux sont
// stockés en "R G B" pour conserver le support des modificateurs d'opacité Tailwind
// (ex: bg-gray-800/50). Le thème (sombre/clair) bascule via data-theme sur <html>,
// sans avoir à modifier les classes existantes des composants.
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        white: withVar('--white'),
        black: withVar('--black'),
        gray: {
          50: withVar('--gray-50'),
          100: withVar('--gray-100'),
          200: withVar('--gray-200'),
          300: withVar('--gray-300'),
          400: withVar('--gray-400'),
          500: withVar('--gray-500'),
          600: withVar('--gray-600'),
          700: withVar('--gray-700'),
          800: withVar('--gray-800'),
          900: withVar('--gray-900'),
        },
      },
    },
  },
  plugins: [],
  // Important: Cette option force tous les utilitaires Tailwind à utiliser !important
  // Cela garantit que text-white écrase toujours les autres styles
  important: false, // On garde false car on utilise déjà !important dans index.css
}
