// src/contexts/ThemeContext.jsx
//
// Gestion du thème (sombre par défaut, ou clair "Notion"), persisté en localStorage.
// Applique l'attribut data-theme sur <html> ; les couleurs sont pilotées par des
// variables CSS (voir index.css + tailwind.config.js).
import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggleTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

const normalize = (t) => (t === 'light' ? 'light' : 'dark');

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    try {
      return normalize(localStorage.getItem('theme'));
    } catch (e) {
      return 'dark';
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
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
