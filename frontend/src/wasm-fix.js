// src/wasm-fix.js

// Méthode 1: Intercepter les erreurs WebAssembly globalement
window.addEventListener('error', function(event) {
    if (event.error && event.error.message && 
        (event.error.message.includes('WebAssembly') || 
         event.error.message.includes('buffer'))) {
      console.log('[WASM Fix] Erreur WebAssembly interceptée:', event.error.message);
      event.preventDefault(); // Empêcher la propagation de l'erreur
      return false;
    }
  });
  
  // Méthode 2: Modifier framer-motion pour éviter WebAssembly
  try {
    // Essayer de détecter framer-motion dans le code
    const motionExports = window.__FRAMER_MOTION_EXPORTS__;
    if (motionExports) {
      console.log('[WASM Fix] Framer Motion détecté, désactivation de WebAssembly');
      // Tenter de désactiver l'utilisation de WebAssembly par framer-motion
      motionExports.__MOTION_USE_WASM__ = false;
    }
  } catch (err) {
    console.log('[WASM Fix] Tentative de désactivation de WebAssembly dans framer-motion:', err);
  }