// src/pages/Portefeuille.jsx
//
// Hub "Portefeuille" : regroupe Prospects (Leads), Clients et Projets sous 3 onglets.
// Chaque onglet RÉUTILISE la page existante telle quelle (aucune réécriture de leur contenu).
// L'onglet actif est piloté par le query param ?tab= pour permettre les liens directs.
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiUsers, FiUserCheck, FiBriefcase } from 'react-icons/fi';

import Leads from './Leads';
import Clients from './Clients';
import Projects from './Projects';

const TABS = [
  { key: 'prospects', label: 'Prospects', icon: FiUsers },
  { key: 'clients', label: 'Clients', icon: FiUserCheck },
  { key: 'projets', label: 'Projets', icon: FiBriefcase }
];

const Portefeuille = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.key === rawTab) ? rawTab : 'prospects';

  const selectTab = (key) => {
    // On repart sur un onglet "propre" (on retire les params spécifiques id/filter de l'onglet précédent).
    setSearchParams({ tab: key });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Barre d'onglets */}
      <div className="flex gap-1 px-2 sm:px-4 pt-16 sm:pt-2 border-b border-gray-700/50 shrink-0 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? 'text-indigo-300' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="portefeuille-tab-underline"
                  className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-500"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet actif (page existante embarquée telle quelle) */}
      <div className="flex-1 min-h-0">
        {activeTab === 'prospects' && <Leads />}
        {activeTab === 'clients' && <Clients />}
        {activeTab === 'projets' && <Projects />}
      </div>
    </div>
  );
};

export default Portefeuille;
