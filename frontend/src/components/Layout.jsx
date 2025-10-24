// src/components/Layout.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Utiliser les icônes de React Icons (Feather Icons)
import { FiGrid as DashboardIcon } from 'react-icons/fi';
import { FiUsers as LeadsIcon } from 'react-icons/fi';
import { FiBriefcase as ProjectsIcon } from 'react-icons/fi';
import { FiCalendar as CalendarIcon } from 'react-icons/fi';
import { FiDollarSign as RevenuesIcon } from 'react-icons/fi';
import { FiActivity as ActivitiesIcon } from 'react-icons/fi';
import { FiTarget as GoalsIcon } from 'react-icons/fi';
import { FiLogOut as LogoutIcon } from 'react-icons/fi';

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [activeModule, setActiveModule] = useState('/dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    setActiveModule(location.pathname);
  }, [location]);

  const navigationItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/leads', label: 'Leads', icon: <LeadsIcon /> },
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