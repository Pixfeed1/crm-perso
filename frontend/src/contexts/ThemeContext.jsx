// src/contexts/ThemeContext.jsx
//
// Gestion du thème : "classique" (sombre actuel, défaut) ou "clair" (style Notion).
// Persiste le choix en localStorage et applique data-theme sur <html>.
// Les couleurs sont pilotées par des variables CSS (voir index.css + tailwind.config.js).
import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'classique', setTheme: () => {}, toggleTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

const normalize = (t) => (t === 'clair' ? 'clair' : 'classique');

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    try {
      return normalize(localStorage.getItem('theme'));
    } catch (e) {
      return 'classique';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      /* localStorage indisponible : on ignore */
    }
  }, [theme]);

  const setTheme = (t) => setThemeState(normalize(t));
  const toggleTheme = () => setThemeState((prev) => (prev === 'classique' ? 'clair' : 'classique'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
