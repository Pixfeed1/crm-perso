// src/components/Layout.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { deleteDB } from 'idb';

// Utiliser les icônes de React Icons (Feather Icons)
import { FiGrid as DashboardIcon } from 'react-icons/fi';
import { FiUsers as LeadsIcon } from 'react-icons/fi';
import { FiBriefcase as ProjectsIcon } from 'react-icons/fi';
import { FiCalendar as CalendarIcon } from 'react-icons/fi';
import { FiDollarSign as RevenuesIcon } from 'react-icons/fi';
import { FiActivity as ActivitiesIcon } from 'react-icons/fi';
import { FiTarget as GoalsIcon } from 'react-icons/fi';
import { FiLogOut as LogoutIcon } from 'react-icons/fi';
import { FiTrendingUp as SalesPipelineIcon } from 'react-icons/fi';
import { FiSearch as SearchIcon } from 'react-icons/fi';
import { FiBarChart2 as AnalyticsIcon } from 'react-icons/fi';
import { FiUsers as UsersIcon } from 'react-icons/fi';
import { FiFileText as QuotesIcon } from 'react-icons/fi';

// Composant GlobalSearch
import GlobalSearch from './search/GlobalSearch';

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeModule, setActiveModule] = useState('/dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetProgress, setResetProgress] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setActiveModule(location.pathname);
  }, [location]);

  // Raccourci clavier pour ouvrir la recherche globale (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Effet pour simuler la progression de la réinitialisation
  useEffect(() => {
    let intervalId;
    if (isResetting) {
      intervalId = setInterval(() => {
        setResetProgress(prev => {
          // Augmenter la progression jusqu'à 95% maximum
          // Les 5% restants se complèteront une fois la redirection effectuée
          return Math.min(prev + 1, 95);
        });
      }, 100); // Mettre à jour toutes les 100ms
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isResetting]);

  const navigationItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/leads', label: 'Leads', icon: <LeadsIcon /> },
    { path: '/projects', label: 'Projets', icon: <ProjectsIcon /> },
    { path: '/calendar', label: 'Calendrier', icon: <CalendarIcon /> },
    { path: '/revenues', label: 'Revenus', icon: <RevenuesIcon /> },
    { path: '/activities', label: 'Activités', icon: <ActivitiesIcon /> },
    { path: '/goals', label: 'Objectifs', icon: <GoalsIcon /> },
    { path: '/sales-pipeline', label: 'Pipeline', icon: <SalesPipelineIcon /> },
    { path: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
    { path: '/quotes', label: 'Devis', icon: <QuotesIcon /> },
    { path: '/users', label: 'Utilisateurs', icon: <UsersIcon /> },
    // Ajouter l'option de déconnexion
    { path: '/logout', label: 'Déconnexion', icon: <LogoutIcon />, isLogout: true }
  ];

  const handleNavigation = (path, isLogout) => {
    if (isLogout) {
      if (window.confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
        logout();
        navigate('/login');
      }
    } else {
      navigate(path);
    }
    setMenuOpen(false);
  };

  // Variantes d'animation pour le menu de navigation
  const menuVariants = {
    closed: {
      scale: 0.8,
      opacity: 0,
      transition: {
        staggerChildren: 0.05,
        staggerDirection: -1
      }
    },
    open: {
      scale: 1,
      opacity: 1,
      transition: {
        delayChildren: 0.1,
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    closed: { y: 20, opacity: 0 },
    open: { y: 0, opacity: 1 }
  };

  // Variantes pour le bouton principal
  const mainButtonVariants = {
    default: { 
      width: "4rem", 
      height: "4rem" 
    },
    menuOpen: { 
      width: isHovering ? "3.5rem" : "2.5rem", 
      height: isHovering ? "3.5rem" : "2.5rem"
    }
  };

  // Fonction de réinitialisation complète et robuste
  const resetApplication = async () => {
    if (isResetting) return; // Éviter les clics multiples
    
    // Définir les délais de timeout
    const NORMAL_RESET_TIMEOUT = 5000; // 5 secondes pour la redirection normale
    const MAX_RESET_TIMEOUT = 15000; // 15 secondes maximum avant redirection forcée
    
    try {
      // Indiquer globalement que nous sommes en train de réinitialiser
      window.isAppResetting = true;
      
      // Forcer l'arrêt de toute tentative d'initialisation de la base de données
      window.stopAllDbOperations = true;
      
      setIsResetting(true);
      setResetProgress(0);
      console.log("Début de la réinitialisation complète de l'application...");
      
      // Configurer un timer de sécurité pour forcer le redémarrage si nécessaire
      const securityTimer = setTimeout(() => {
        console.log("Délai maximum dépassé, redémarrage forcé de l'application...");
        window.location.href = window.location.origin;
      }, MAX_RESET_TIMEOUT);
      
      // 1. Fermer toutes les connexions actives à SQLite
      if (window.sqliteConnection) {
        try {
          console.log("Fermeture de la connexion SQLite...");
          window.sqliteConnection.close();
          window.sqliteConnection = null;
        } catch (e) {
          console.warn("Erreur lors de la fermeture de SQLite:", e);
        }
      }
      
      // 2. Supprimer les tâches périodiques
      if (window.dbSaveInterval) {
        console.log("Arrêt des sauvegardes automatiques...");
        clearInterval(window.dbSaveInterval);
        window.dbSaveInterval = null;
      }
      
      // 3. Supprimer les gestionnaires d'événements
      if (window.dbBeforeUnloadHandler) {
        console.log("Suppression du gestionnaire beforeunload...");
        window.removeEventListener('beforeunload', window.dbBeforeUnloadHandler);
        window.dbBeforeUnloadHandler = null;
      }
      
      // 4. Supprimer les références à la base de données
      if (window.dbInstance) {
        console.log("Suppression des références à la base de données...");
        window.dbInstance = null;
      }
      
      // 5. Supprimer la base de données IndexedDB
      const DB_NAME = 'crm_audacieux_db';
      console.log(`Suppression de la base de données IndexedDB: ${DB_NAME}...`);
      
      try {
        await deleteDB(DB_NAME);
        console.log("Base de données IndexedDB supprimée avec succès");
      } catch (e) {
        console.error("Erreur lors de la suppression d'IndexedDB:", e);
        // Continuer malgré l'erreur
      }
      
      // 6. Nettoyer localStorage et sessionStorage
      console.log("Nettoyage du stockage local...");
      localStorage.clear();
      sessionStorage.clear();
      
      // 7. Nettoyer les cookies
      console.log("Nettoyage des cookies...");
      document.cookie.split(';').forEach(cookie => {
        const [name] = cookie.trim().split('=');
        if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });

      // 8. Supprimer les Service Workers si présents
      if (navigator.serviceWorker) {
        console.log("Désenregistrement des Service Workers...");
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (let registration of registrations) {
            await registration.unregister();
            console.log("Service Worker désenregistré");
          }
        } catch (e) {
          console.warn("Erreur lors du désenregistrement des Service Workers:", e);
        }
      }
      
      console.log("Réinitialisation terminée avec succès!");
      
      // 9. Redirection normale avec annulation du timer de sécurité
      setTimeout(() => {
        clearTimeout(securityTimer); // Annuler le timer de sécurité
        console.log("Redirection vers la page d'accueil...");
        window.location.href = window.location.origin;
      }, NORMAL_RESET_TIMEOUT);
      
    } catch (error) {
      console.error("Erreur catastrophique lors de la réinitialisation:", error);
      alert("Une erreur est survenue. L'application va être rechargée.");
      
      // En cas d'erreur, recharger la page après un délai
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  // Composant de bouton de réinitialisation
  const ResetButton = () => {
    const handleReset = () => {
      if (window.confirm('Êtes-vous sûr de vouloir réinitialiser toutes les données ? Cette action est irréversible.')) {
        resetApplication();
      }
    };
    
    return (
      <>
        <motion.button
          className="absolute top-4 right-4 px-3 py-2 bg-rose-600 text-white rounded-lg text-sm z-50 shadow-lg"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleReset}
          disabled={isResetting}
        >
          {isResetting ? "Réinitialisation en cours..." : "Réinitialiser les données"}
        </motion.button>
        
        {isResetting && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
            <div className="text-center max-w-lg p-8 bg-gray-900/80 rounded-xl backdrop-blur">
              {/* Animation de chargement plus visible */}
              <div className="relative mb-6 mx-auto">
                <motion.div 
                  className="w-28 h-28 border-8 border-indigo-500 border-t-transparent rounded-full mx-auto"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-2xl font-bold text-indigo-300">{resetProgress}%</p>
                </div>
              </div>
              
              <h2 className="text-white text-2xl font-bold mb-4">Réinitialisation en cours</h2>
              <p className="text-gray-300 text-lg mb-6">Veuillez patienter, ne fermez pas la page</p>
              <p className="text-gray-300">L'application redémarrera automatiquement</p>

              {/* Barre de progression */}
              <div className="h-2 bg-gray-700 mt-6 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-indigo-500"
                  style={{ width: `${resetProgress}%` }}
                />
              </div>

              <div className="mt-2 text-gray-300 text-sm">
                Nettoyage et préparation de l'application...
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white overflow-hidden">
      {/* GlobalSearch Modal */}
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Bouton de réinitialisation */}
      <ResetButton />

      {/* Bouton de recherche flottant */}
      <motion.button
        className="absolute top-4 left-4 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg z-50 flex items-center gap-2"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setSearchOpen(true)}
      >
        <SearchIcon className="w-5 h-5" />
        <span className="text-sm font-medium">Rechercher</span>
        <kbd className="hidden sm:inline-block px-2 py-1 text-xs bg-indigo-800 rounded">
          Ctrl+K
        </kbd>
      </motion.button>
      
      {/* Navigation innovante circulaire */}
      <motion.div 
        className="absolute bottom-6 right-6 z-40"
        initial={false}
        animate={menuOpen ? "open" : "closed"}
      >
        <motion.div
          className="absolute z-20 flex items-center justify-center shadow-xl bg-indigo-600 rounded-full overflow-hidden"
          style={{ bottom: 0, right: 0 }} // Position absolue
          variants={mainButtonVariants}
          animate={menuOpen ? "menuOpen" : "default"}
          transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setMenuOpen(!menuOpen)}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <div className="flex items-center justify-center w-full h-full">
            <motion.div
              animate={{ rotate: menuOpen ? 45 : 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center w-full h-full"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {menuOpen ? (
                  <span className={`flex items-center justify-center ${isHovering ? "text-2xl" : "text-xl"}`} style={{ marginTop: "-1px" }}>×</span>
                ) : (
                  <span className="flex items-center justify-center text-2xl" style={{ marginTop: "-1px" }}>+</span>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="absolute bottom-8 right-8"
              variants={menuVariants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <motion.div 
                className="relative"
                style={{ width: '300px', height: '300px' }}
              >
                {navigationItems.map((item, index) => {
                  // Position des éléments en cercle
                  const angle = (index * (2 * Math.PI / navigationItems.length)) - Math.PI/2;
                  const radius = 150;
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;

                  // Style spécial pour le bouton de déconnexion
                  const isLogoutButton = item.isLogout === true;
                  const buttonStyle = isLogoutButton 
                    ? 'bg-rose-600 text-white hover:bg-rose-700' 
                    : activeModule === item.path 
                      ? 'bg-white text-indigo-800' 
                      : 'bg-indigo-700 text-white';

                  return (
                    <motion.div
                      key={item.path}
                      className={`absolute w-14 h-14 rounded-full flex items-center justify-center cursor-pointer shadow-lg ${buttonStyle}`}
                      style={{ 
                        left: `calc(50% + ${x}px - 28px)`, 
                        top: `calc(50% + ${y}px - 28px)` 
                      }}
                      variants={itemVariants}
                      whileHover={{ scale: 1.1 }}
                      onClick={() => handleNavigation(item.path, item.isLogout)}
                    >
                      {item.icon}
                      <motion.span
                        className="absolute top-full mt-2 whitespace-nowrap text-sm font-medium bg-gray-800/70 px-2 py-1 rounded-md"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        {item.label}
                      </motion.span>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Contenu principal avec effets de transition - CORRIGÉ */}
      <main className="flex-1 overflow-auto p-6 pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="h-full flex flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Layout;