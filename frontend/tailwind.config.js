/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // Important: Cette option force tous les utilitaires Tailwind à utiliser !important
  // Cela garantit que text-white écrase toujours les autres styles
  important: false, // On garde false car on utilise déjà !important dans index.css
}
