// src/components/reminders/RemindersModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiClock, FiAlertCircle, FiPlus, FiCheck, FiXCircle } from 'react-icons/fi';
import { remindersAPI } from '../../services/api';
import ReminderForm from './ReminderForm';
import RemindersList from './RemindersList';

const RemindersModal = ({ onClose }) => {
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'overdue', 'upcoming'
  const [isAddingReminder, setIsAddingReminder] = useState(false);

  // Charger les rappels
  useEffect(() => {
    fetchReminders();
  }, [activeTab]);

  const fetchReminders = async () => {
    setIsLoading(true);
    try {
      let data;
      if (activeTab === 'overdue') {
        data = await remindersAPI.getOverdue();
      } else if (activeTab === 'upcoming') {
        data = await remindersAPI.getUpcoming(7);
      } else {
        data = await remindersAPI.getActive();
      }
      setReminders(data);
    } catch (error) {
      console.error('Erreur lors du chargement des rappels:', error);
      setReminders([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Gérer la complétion d'un rappel
  const handleComplete = async (id) => {
    try {
      await remindersAPI.complete(id);
      fetchReminders();
    } catch (error) {
      console.error('Erreur lors du marquage du rappel comme complété:', error);
      alert('Erreur lors du marquage du rappel comme complété');
    }
  };

  // Gérer le rejet d'un rappel
  const handleDismiss = async (id) => {
    try {
      await remindersAPI.dismiss(id);
      fetchReminders();
    } catch (error) {
      console.error('Erreur lors du rejet du rappel:', error);
      alert('Erreur lors du rejet du rappel');
    }
  };

  // Gérer la suppression d'un rappel
  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce rappel ?')) {
      return;
    }

    try {
      await remindersAPI.delete(id);
      fetchReminders();
    } catch (error) {
      console.error('Erreur lors de la suppression du rappel:', error);
      alert('Erreur lors de la suppression du rappel');
    }
  };

  // Gérer l'ajout d'un nouveau rappel
  const handleAddReminder = async (reminderData) => {
    try {
      await remindersAPI.create(reminderData);
      setIsAddingReminder(false);
      fetchReminders();
    } catch (error) {
      console.error('Erreur lors de la création du rappel:', error);
      alert('Erreur lors de la création du rappel');
    }
  };

  // Calculer le nombre de rappels par onglet
  const overdueCount = reminders.filter(r => {
    const dueDate = new Date(r.due_date);
    return dueDate < new Date();
  }).length;

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <FiClock className="text-indigo-400" />
              Rappels
            </h2>
            <div className="flex items-center gap-2">
              <motion.button
                className="px-3 py-2 sm:px-4 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 text-sm sm:text-base"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsAddingReminder(true)}
              >
                <FiPlus />
                <span className="hidden sm:inline">Nouveau</span>
              </motion.button>
              <motion.button
                className="p-2 hover:bg-gray-800 rounded-lg"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
              >
                <FiX className="text-xl" />
              </motion.button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => setActiveTab('all')}
            >
              <FiClock className="text-xs sm:text-base" />
              <span>Tous</span>
            </button>
            <button
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'overdue'
                  ? 'bg-rose-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => setActiveTab('overdue')}
            >
              <FiAlertCircle className="text-xs sm:text-base" />
              <span>En retard</span>
              {overdueCount > 0 && (
                <span className="bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {overdueCount}
                </span>
              )}
            </button>
            <button
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'upcoming'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => setActiveTab('upcoming')}
            >
              <FiClock className="text-xs sm:text-base" />
              <span className="hidden xs:inline">À venir</span>
              <span className="xs:hidden">7j</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {isAddingReminder ? (
              <motion.div
                key="add-form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <ReminderForm
                  onSave={handleAddReminder}
                  onCancel={() => setIsAddingReminder(false)}
                />
              </motion.div>
            ) : isLoading ? (
              <motion.div
                key="loading"
                className="flex items-center justify-center py-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              </motion.div>
            ) : reminders.length === 0 ? (
              <motion.div
                key="empty"
                className="flex flex-col items-center justify-center py-12 text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <FiClock className="text-5xl mb-4" />
                <p className="text-lg font-medium">Aucun rappel</p>
                <p className="text-sm text-center mt-2">
                  {activeTab === 'overdue'
                    ? 'Aucun rappel en retard'
                    : activeTab === 'upcoming'
                    ? 'Aucun rappel dans les 7 prochains jours'
                    : 'Créez votre premier rappel'}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <RemindersList
                  reminders={reminders}
                  onComplete={handleComplete}
                  onDismiss={handleDismiss}
                  onDelete={handleDelete}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RemindersModal;
