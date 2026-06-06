// src/utils/chartTheme.js
//
// Couleurs des graphiques (recharts) pilotees par le theme, sans recabler chaque
// chart a la main. En "classique" : valeurs EXACTES utilisees jusqu'ici (rendu
// inchange). En "clair" : grille/axes/legendes en gris doux, accent violet.
import { useTheme } from '../contexts/ThemeContext';

export const getChartColors = (theme) => {
  if (theme === 'clair') {
    return {
      grid: '#ededec',
      axis: '#787774',
      legend: '#5f5e5a',
      accent: '#6d5ae6',
      tooltipBg: '#ffffff',
      tooltipBorder: '#ededec',
      tooltipText: '#37352f'
    };
  }
  // classique (sombre) : valeurs historiques
  return {
    grid: '#374151',     /* gray-700 */
    axis: '#9CA3AF',     /* gray-400 */
    legend: '#9CA3AF',
    accent: '#6366f1',   /* indigo-500 */
    tooltipBg: '#1f2937',
    tooltipBorder: '#374151',
    tooltipText: '#ffffff'
  };
};

export const useChartColors = () => {
  const { theme } = useTheme();
  return getChartColors(theme);
};
