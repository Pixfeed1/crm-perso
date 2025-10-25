// src/components/Layout.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { remindersAPI } from '../services/api';

// Utiliser les icônes de React Icons (Feather Icons)
import { FiGrid as DashboardIcon } from 'react-icons/fi';
import { FiUsers as LeadsIcon } from 'react-icons/fi';
import { FiUserCheck as ClientsIcon } from 'react-icons/fi';
import { FiBriefcase as ProjectsIcon } from 'react-icons/fi';
import { FiCalendar as CalendarIcon } from 'react-icons/fi';
import { FiDollarSign as RevenuesIcon } from 'react-icons/fi';
import { FiActivity as ActivitiesIcon } from 'react-icons/fi';
import { FiTarget as GoalsIcon } from 'react-icons/fi';
import { FiLogOut as LogoutIcon } from 'react-icons/fi';
import { FiBell } from 'react-icons/fi';

// Import des modals
import RemindersModal from './reminders/RemindersModal';
import SearchModal from './search/SearchModal';
import { FiSearch } from 'react-icons/fi';

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeModule, setActiveModule] = useState('/dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState({ active: 0, overdue: 0 });
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setActiveModule(location.pathname);
  }, [location]);

  // Charger le nombre de rappels
  useEffect(() => {
    const fetchReminderCount = async () => {
      try {
        const count = await remindersAPI.getCount();
        setReminderCount(count);
      } catch (error) {
        console.error('Erreur lors du chargement du nombre de rappels:', error);
      }
    };

    fetchReminderCount();

    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(fetchReminderCount, 30000);

    return () => clearInterval(interval);
  }, []);

  // Rafraîchir le compteur après fermeture du modal
  const handleRemindersClose = async () => {
    setRemindersOpen(false);
    try {
      const count = await remindersAPI.getCount();
      setReminderCount(count);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du nombre de rappels:', error);
    }
  };

  // Raccourci clavier pour la recherche (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigationItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/leads', label: 'Leads', icon: <LeadsIcon /> },
    { path: '/clients', label: 'Clients', icon: <ClientsIcon /> },
    { path: '/projects', label: 'Projets', icon: <ProjectsIcon /> },
    { path: '/calendar', label: 'Calendrier', icon: <CalendarIcon /> },
    { path: '/revenues', label: 'Revenus', icon: <RevenuesIcon /> },
    { path: '/activities', label: 'Activités', icon: <ActivitiesIcon /> },
    { path: '/goals', label: 'Objectifs', icon: <GoalsIcon /> },
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


  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white overflow-hidden">
      {/* Barre de recherche en haut à gauche - Position fixe pour visibilité constante */}
      <motion.button
        className="fixed top-4 left-4 z-50 px-4 py-2 sm:px-6 sm:py-3 bg-gray-800/80 backdrop-blur-md border border-purple-500/30 rounded-full flex items-center gap-2 sm:gap-3 shadow-xl hover:bg-gray-800/90 transition-all"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setSearchOpen(true)}
      >
        <FiSearch className="text-lg sm:text-xl text-indigo-300" />
        <span className="hidden sm:inline text-sm text-gray-400">Rechercher...</span>
        <kbd className="hidden sm:inline px-2 py-1 bg-gray-900/50 border border-gray-700 rounded text-xs text-gray-500">
          Ctrl+K
        </kbd>
      </motion.button>

      {/* Badge de notifications en haut à droite - Position fixe pour visibilité constante */}
      <motion.button
        className="fixed top-4 right-4 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-indigo-600 rounded-full flex items-center justify-center shadow-xl hover:bg-indigo-700 transition-all"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setRemindersOpen(true)}
      >
        <FiBell className="text-xl sm:text-2xl" />
        {reminderCount.overdue > 0 && (
          <motion.div
            className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs font-bold rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500 }}
          >
            {reminderCount.overdue > 9 ? '9+' : reminderCount.overdue}
          </motion.div>
        )}
      </motion.button>

      {/* Modal de recherche */}
      <AnimatePresence>
        {searchOpen && (
          <SearchModal
            onClose={() => setSearchOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Modal des rappels */}
      <AnimatePresence>
        {remindersOpen && (
          <RemindersModal
            onClose={handleRemindersClose}
          />
        )}
      </AnimatePresence>

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