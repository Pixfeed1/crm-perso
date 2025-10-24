// src/components/Layout.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';

// Import simple d'icônes fictives (versions simplifiées)
const DashboardIcon = () => <div>📊</div>;
const LeadsIcon = () => <div>👥</div>;
const ProjectsIcon = () => <div>📂</div>;
const CalendarIcon = () => <div>📅</div>;
const RevenuesIcon = () => <div>💰</div>;
const ActivitiesIcon = () => <div>📋</div>;
const GoalsIcon = () => <div>🎯</div>;

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState('/dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

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
  ];

  const handleNavigation = (path) => {
    navigate(path);
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

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 text-white overflow-hidden">
      {/* Navigation innovante circulaire */}
      <motion.div 
        className="absolute bottom-6 right-6 z-50"
        initial={false}
        animate={menuOpen ? "open" : "closed"}
      >
        <motion.button
          className="absolute z-20 bottom-0 right-0 w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-xl"
          whileTap={{ scale: 0.95 }}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <motion.div
            animate={{ rotate: menuOpen ? 45 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {menuOpen ? (
              <span className="text-3xl">×</span>
            ) : (
              <span className="text-2xl">+</span>
            )}
          </motion.div>
        </motion.button>

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

                  return (
                    <motion.div
                      key={item.path}
                      className={`absolute w-14 h-14 rounded-full flex items-center justify-center cursor-pointer ${activeModule === item.path ? 'bg-white text-indigo-800' : 'bg-indigo-700 text-white'}`}
                      style={{ 
                        left: `calc(50% + ${x}px - 28px)`, 
                        top: `calc(50% + ${y}px - 28px)` 
                      }}
                      variants={itemVariants}
                      whileHover={{ scale: 1.1 }}
                      onClick={() => handleNavigation(item.path)}
                    >
                      {item.icon}
                      <motion.span
                        className="absolute top-full mt-2 whitespace-nowrap text-sm font-medium"
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

      {/* Contenu principal avec effets de transition */}
      <main className="flex-1 overflow-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Layout;