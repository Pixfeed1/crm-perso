// src/pages/Revenues.jsx

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Composants
import RevenueStats from '../components/revenues/RevenueStats';
import RevenueChart from '../components/revenues/RevenueChart';
import RevenueList from '../components/revenues/RevenueList';
import RevenueForm from '../components/revenues/RevenueForm';
import RevenueFilter from '../components/revenues/RevenueFilter';
import EmptyState from '../components/common/EmptyState';

// API
import { revenuesAPI, projectsAPI } from '../services/api';

const Revenues = () => {
  const [revenues, setRevenues] = useState([]);
  const [filteredRevenues, setFilteredRevenues] = useState([]);
  const [selectedRevenue, setSelectedRevenue] = useState(null);
  const [isAddingRevenue, setIsAddingRevenue] = useState(false);
  const [period, setPeriod] = useState('month'); // 'month', 'quarter', 'year'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    average: 0,
    highest: 0,
    forecasted: 0
  });
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    minAmount: '',
    maxAmount: '',
    project: 'all'
  });
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);

  // Chargement des données depuis l'API
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Récupérer les projets
        try {
          const projectsData = await projectsAPI.getAll();
          setProjects(projectsData);
          console.log('Projets chargés:', projectsData);
        } catch (pErr) {
          console.error('Erreur lors du chargement des projets:', pErr);
          // Continuer même si échec
          setProjects([]);
        }

        // Récupérer les revenus
        try {
          const revenuesData = await revenuesAPI.getAll();
          console.log('Revenus chargés:', revenuesData);
          
          // Formater les données si nécessaire
          const formattedRevenues = revenuesData.map(rev => ({
            ...rev,
            amount: parseFloat(rev.amount) || 0
          }));
          
          setRevenues(formattedRevenues);
          setFilteredRevenues(formattedRevenues);
          calculateStats(formattedRevenues);
        } catch (rErr) {
          console.error('Erreur lors du chargement des revenus:', rErr);
          // En cas d'erreur, utiliser un tableau vide
          setRevenues([]);
          setFilteredRevenues([]);
          // Créer un message d'erreur plus convivial
          if (rErr.message && rErr.message.includes('revenues')) {
            setError('La table "revenues" n\'existe pas encore dans la base de données. Veuillez exécuter les migrations pour la créer.');
          } else {
            setError(`Erreur lors du chargement des revenus: ${rErr.message}`);
          }
        }
      } catch (err) {
        console.error('Erreur globale:', err);
        setError(`Une erreur est survenue: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calcul des statistiques
  const calculateStats = (revenueData) => {
    const paidOrPending = revenueData.filter(
      (r) => r.status === 'paid' || r.status === 'pending'
    );
    const totalAmount = paidOrPending.reduce((sum, r) => sum + r.amount, 0);
    const average =
      paidOrPending.length > 0
        ? Math.round(totalAmount / paidOrPending.length)
        : 0;
    const highest = revenueData.length
      ? Math.max(...revenueData.map((r) => r.amount))
      : 0;
    const forecasted = revenueData
      .filter((r) => r.status === 'planned')
      .reduce((sum, r) => sum + r.amount, 0);

    setStats({
      total: totalAmount,
      average,
      highest,
      forecasted
    });
  };

  // Filtrage (search, type, montant, projet)
  useEffect(() => {
    const result = revenues.filter((revenue) => {
      const searchMatch =
        filters.search === '' ||
        revenue.description.toLowerCase().includes(filters.search.toLowerCase()) ||
        (revenue.project_name &&
          revenue.project_name.toLowerCase().includes(filters.search.toLowerCase()));

      const typeMatch = filters.type === 'all' || revenue.type === filters.type;

      const minAmountMatch =
        filters.minAmount === '' || revenue.amount >= parseFloat(filters.minAmount);
      const maxAmountMatch =
        filters.maxAmount === '' || revenue.amount <= parseFloat(filters.maxAmount);

      const projectMatch =
        filters.project === 'all' ||
        (filters.project === 'none' && revenue.project_id === null) ||
        (revenue.project_id && revenue.project_id.toString() === filters.project);

      return (
        searchMatch && typeMatch && minAmountMatch && maxAmountMatch && projectMatch
      );
    });

    setFilteredRevenues(result);
  }, [revenues, filters]);

  // Filtrer par période
  const getRevenuesForPeriod = () => {
    const now = new Date(currentDate);
    let startDate, endDate;

    if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
    }

    return filteredRevenues.filter((r) => {
      const d = new Date(r.date);
      return d >= startDate && d <= endDate;
    });
  };

  // Navigation entre périodes
  const navigateToPrevious = () => {
    const newDate = new Date(currentDate);
    if (period === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (period === 'quarter') {
      newDate.setMonth(newDate.getMonth() - 3);
    } else if (period === 'year') {
      newDate.setFullYear(newDate.getFullYear() - 1);
    }
    setCurrentDate(newDate);
  };

  const navigateToNext = () => {
    const newDate = new Date(currentDate);
    if (period === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (period === 'quarter') {
      newDate.setMonth(newDate.getMonth() + 3);
    } else if (period === 'year') {
      newDate.setFullYear(newDate.getFullYear() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateToToday = () => {
    setCurrentDate(new Date());
  };

  // Format du titre de la période
  const formatPeriodTitle = () => {
    const now = new Date(currentDate);
    if (period === 'month') {
      return new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric'
      }).format(now);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      return `${quarter}ème trimestre ${now.getFullYear()}`;
    } else if (period === 'year') {
      return String(now.getFullYear());
    }
    return '';
  };

  // Sélection d'un revenu
  const handleSelectRevenue = (revenue) => {
    setSelectedRevenue(revenue);
    setIsAddingRevenue(false);
  };

  // Gestion de l'ajout
  const handleAddRevenue = () => {
    setSelectedRevenue(null);
    setIsAddingRevenue(true);
  };

  // Sauvegarder un nouveau revenu
  const handleSaveRevenue = async (revenueData) => {
    try {
      console.log('Données du formulaire:', revenueData);
      
      const newRevenue = await revenuesAPI.create(revenueData);
      console.log('Nouveau revenu créé:', newRevenue);
      
      // Mettre à jour la liste
      setRevenues(prevRevenues => {
        const updatedRevenues = [...prevRevenues, newRevenue];
        calculateStats(updatedRevenues);
        return updatedRevenues;
      });
      
      setIsAddingRevenue(false);
      setSelectedRevenue(newRevenue);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du revenu:', error);
      
      // Message d'erreur plus convivial
      let errorMessage = "Erreur lors de la sauvegarde";
      
      if (error.message && error.message.includes("no such table")) {
        errorMessage = "La table 'revenues' n'existe pas dans la base de données. Veuillez exécuter les migrations pour la créer.";
      }
      
      alert(errorMessage);
    }
  };

  // Mettre à jour un revenu
  const handleUpdateRevenue = async (id, updatedData) => {
    try {
      const updated = await revenuesAPI.update(id, updatedData);
      
      const updatedRevenues = revenues.map(r => {
        if (r.id === id) {
          return updated;
        }
        return r;
      });
      
      setRevenues(updatedRevenues);
      calculateStats(updatedRevenues);
      setSelectedRevenue(updated);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du revenu:', error);
      alert(`Erreur lors de la mise à jour: ${error.message}`);
    }
  };

  // Supprimer un revenu
  const handleDeleteRevenue = async (id) => {
    try {
      await revenuesAPI.delete(id);
      
      const remaining = revenues.filter(r => r.id !== id);
      setRevenues(remaining);
      calculateStats(remaining);
      setSelectedRevenue(null);
    } catch (error) {
      console.error('Erreur lors de la suppression du revenu:', error);
      alert(`Erreur lors de la suppression: ${error.message}`);
    }
  };

  // Loader
  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <motion.div
          className="w-16 h-16 border-4 border-teal-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  const periodRevenues = getRevenuesForPeriod();

  return (
    <div className="h-full flex flex-col">
      {/* En-tête */}
      <header className="mb-6">
        <motion.h1
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 to-teal-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Revenus
        </motion.h1>
        <motion.p
          className="text-teal-200 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Suivez vos revenus et analysez vos finances
        </motion.p>
      </header>

      {/* Affichage des erreurs */}
      {error && (
        <motion.div 
          className="mb-6 p-4 bg-rose-900/30 border border-rose-800 rounded-lg text-rose-200"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="font-medium text-rose-100 mb-1">Erreur</h3>
          <p>{error}</p>
        </motion.div>
      )}

      {/* Stats */}
      <div>
        <RevenueStats stats={stats} />
      </div>

      {/* Navigation de période */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <div className="flex space-x-2 mr-4">
            <motion.button
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={navigateToPrevious}
            >
              ◀
            </motion.button>
            <motion.button
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={navigateToToday}
            >
              Aujourd'hui
            </motion.button>
            <motion.button
              className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={navigateToNext}
            >
              ▶
            </motion.button>
          </div>
          <h2 className="text-2xl font-semibold text-white capitalize">
            {formatPeriodTitle()}
          </h2>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-gray-800/50 rounded-lg p-1 flex">
            {['month', 'quarter', 'year'].map((p) => (
              <motion.button
                key={p}
                className={`px-3 py-1 rounded-lg text-sm ${
                  period === p
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
                whileHover={{ scale: period === p ? 1 : 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPeriod(p)}
              >
                {p === 'month' && 'Mois'}
                {p === 'quarter' && 'Trimestre'}
                {p === 'year' && 'Année'}
              </motion.button>
            ))}
          </div>
          <motion.button
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg flex items-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAddRevenue}
          >
            <span className="mr-2">+</span>Revenu
          </motion.button>
        </div>
      </div>

      {/* Filtres */}
      <div className="mb-6">
        <RevenueFilter
          filters={filters}
          setFilters={setFilters}
          projects={projects}
        />
      </div>

      {/* Graphique + Formulaire/Détails */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Graphique */}
        <div className="md:col-span-2 bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6 h-96">
          <RevenueChart
            revenues={periodRevenues}
            period={period}
            currentDate={currentDate}
          />
        </div>

        {/* Formulaire ou Détails */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6">
          <AnimatePresence mode="wait">
            {isAddingRevenue ? (
              <motion.div
                key="add-form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <RevenueForm
                  onSave={handleSaveRevenue}
                  onCancel={() => setIsAddingRevenue(false)}
                  projects={projects}
                />
              </motion.div>
            ) : selectedRevenue ? (
              <motion.div
                key={`revenue-${selectedRevenue.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h3 className="text-xl font-semibold text-white mb-4">
                  Détails du revenu
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Montant</span>
                    <span className="font-bold text-white">
                      {selectedRevenue.amount.toLocaleString()} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Date</span>
                    <span className="text-white">
                      {new Date(selectedRevenue.date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type</span>
                    <span className="text-white capitalize">
                      {selectedRevenue.type === 'invoice'
                        ? 'Facture'
                        : selectedRevenue.type === 'recurring'
                        ? 'Récurrent'
                        : selectedRevenue.type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Statut</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        selectedRevenue.status === 'paid'
                          ? 'bg-green-900/30 text-green-300'
                          : selectedRevenue.status === 'pending'
                          ? 'bg-amber-900/30 text-amber-300'
                          : 'bg-blue-900/30 text-blue-300'
                      }`}
                    >
                      {selectedRevenue.status === 'paid'
                        ? 'Payé'
                        : selectedRevenue.status === 'pending'
                        ? 'En attente'
                        : 'Planifié'}
                    </span>
                  </div>
                  {selectedRevenue.project_name && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Projet</span>
                      <span className="text-teal-300">
                        {selectedRevenue.project_name}
                      </span>
                    </div>
                  )}
                  <div className="pt-2">
                    <span className="text-gray-400">Description</span>
                    <p className="mt-1 text-white">
                      {selectedRevenue.description}
                    </p>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <motion.button
                      className="p-2 rounded-lg bg-teal-600/30 hover:bg-teal-600/50 text-teal-300"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setIsAddingRevenue(true);
                        setSelectedRevenue(null);
                      }}
                    >
                      ✏️
                    </motion.button>
                    <motion.button
                      className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDeleteRevenue(selectedRevenue.id)}
                    >
                      🗑️
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex items-center justify-center"
              >
                <EmptyState
                  icon="💰"
                  title="Revenus"
                  description="Sélectionnez un revenu dans la liste ou ajoutez-en un nouveau."
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Liste des revenus - Correction pour éviter la double scrollbar */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6 flex flex-col flex-grow overflow-hidden">
        <h3 className="text-xl font-semibold text-white mb-4">Liste des revenus</h3>
        <RevenueList
          revenues={filteredRevenues}
          selectedRevenue={selectedRevenue}
          onSelectRevenue={handleSelectRevenue}
        />
      </div>
    </div>
  );
};

export default Revenues;