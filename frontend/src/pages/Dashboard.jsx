// src/pages/Dashboard.jsx - Version Clean UX sans bordures
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FaUserFriends,
  FaRocket,
  FaMoneyBillWave,
  FaClipboardList,
  FaBullseye,
  FaChartLine,
  FaArrowUp,
  FaArrowDown,
  FaClock,
  FaCheckCircle,
  FaEllipsisV,
  FaPlus,
  FaFilter,
  FaFileInvoice,
  FaUser,
  FaStar
} from 'react-icons/fa';
import {
  FiCalendar as FiCalendarIcon,
  FiTrendingUp as FiTrendingUpIcon,
  FiMoreHorizontal,
  FiActivity,
  FiTarget,
  FiClock,
  FiRefreshCw,
  FiMail,
  FiSend,
  FiX,
  FiPaperclip,
  FiTrash2,
  FiFile
} from 'react-icons/fi';
import KPIOrb from '../components/dashboard/KPIOrb';
import ActivityStream from '../components/dashboard/ActivityStream';
import GoalProgress from '../components/dashboard/GoalProgress';
import EmailAutocomplete from '../components/common/EmailAutocomplete';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { dashboardAPI, reviewRequestsAPI, clientsAPI } from '../services/api';
import { useToast } from '../hooks/useToast';

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dashboardData, setDashboardData] = useState({
    leads: { total: 0, newThisMonth: 0 },
    projects: { active: 0, completed: 0, upcoming: 0 },
    revenues: { thisMonth: 0, projection: 0, total: 0 },
    activities: { completed: 0, pending: 0 },
    goals: { onTrack: 0, atRisk: 0 },
    recentActivities: [],
    projectTimeline: [],
    revenueChart: []
  });

  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState('overview');
  const [hoveredCard, setHoveredCard] = useState(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [reviewStats, setReviewStats] = useState(null);
  const [dateFilter, setDateFilter] = useState('month'); // month, quarter, year, all
  const newMenuRef = useRef(null);
  const filtersRef = useRef(null);

  // Modal email rapide
  const [showQuickEmail, setShowQuickEmail] = useState(false);
  const [quickEmailData, setQuickEmailData] = useState({ to: '', subject: '', message: '' });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const quillRef = useRef(null);

  // Envoi différé
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total

  // Fermer les menus si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target)) {
        setShowNewMenu(false);
      }
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getData();
      setDashboardData(data);

      // Fetch review stats
      try {
        const stats = await reviewRequestsAPI.getStats();
        setReviewStats(stats);
      } catch (error) {
        console.error('Erreur lors de la récupération des stats d\'avis:', error);
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des données du tableau de bord:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchDashboardData();
  };

  // Gestion des pièces jointes
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);

    // Vérifier la taille de chaque fichier
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast.error('Fichier(s) trop volumineux. Taille max: 10MB');
      return;
    }

    // Vérifier la taille totale
    const currentSize = attachments.reduce((sum, file) => sum + file.size, 0);
    const newSize = files.reduce((sum, file) => sum + file.size, 0);
    if (currentSize + newSize > MAX_TOTAL_SIZE) {
      toast.error('Taille totale max: 25MB');
      return;
    }

    setAttachments([...attachments, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Réinitialiser le modal email
  const resetEmailModal = () => {
    setQuickEmailData({ to: '', subject: '', message: '' });
    setAttachments([]);
    setIsScheduled(false);
    setScheduledDate('');
    setScheduledTime('09:00');
    setShowQuickEmail(false);
  };

  // Envoyer un email rapide
  const handleSendQuickEmail = async () => {
    if (!quickEmailData.to || !quickEmailData.subject || !quickEmailData.message) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    // Validation pour l'envoi différé
    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        toast.error('Veuillez sélectionner une date et une heure');
        return;
      }
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledDateTime <= new Date()) {
        toast.error('La date de programmation doit être dans le futur');
        return;
      }
    }

    setSendingEmail(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

      if (isScheduled) {
        // Envoi différé via /api/scheduled-emails
        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        const response = await fetch(`${API_URL}/scheduled-emails`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to_email: quickEmailData.to,
            subject: quickEmailData.subject,
            body_html: quickEmailData.message,
            scheduled_at: scheduledAt,
            email_type: 'custom'
          })
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors de la programmation');
          } else {
            throw new Error(`Erreur serveur (${response.status})`);
          }
        }

        const formattedDate = new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString('fr-FR', {
          dateStyle: 'long',
          timeStyle: 'short'
        });
        toast.success(`Email programmé pour le ${formattedDate}`);
      } else {
        // Envoi immédiat
        const formData = new FormData();
        formData.append('to', quickEmailData.to);
        formData.append('subject', quickEmailData.subject);
        formData.append('message', quickEmailData.message);

        attachments.forEach((file) => {
          formData.append('attachments', file);
        });

        const response = await fetch(`${API_URL}/clients/send-generic-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json();
            throw new Error(error.message || 'Erreur lors de l\'envoi');
          } else {
            throw new Error(`Erreur serveur (${response.status})`);
          }
        }

        toast.success('Email envoyé avec succès !');
      }
      resetEmailModal();
    } catch (error) {
      toast.error(error.message || 'Erreur lors de l\'envoi');
    } finally {
      setSendingEmail(false);
    }
  };

  // Naviguer vers les nouveaux items
  const handleCardClick = (type) => {
    switch (type) {
      case 'leads':
        navigate('/leads?filter=new');
        break;
      case 'clients':
        navigate('/clients?filter=recent');
        break;
      case 'projects':
        navigate('/projects?filter=active');
        break;
      case 'revenues':
        navigate('/revenues');
        break;
      default:
        break;
    }
  };

  const handleNewAction = (action) => {
    setShowNewMenu(false);
    switch (action) {
      case 'project':
        navigate('/projects');
        break;
      case 'client':
        navigate('/clients');
        break;
      case 'quote':
        navigate('/quotes');
        break;
      case 'invoice':
        navigate('/invoices');
        break;
      case 'email':
        setShowQuickEmail(true);
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-text-muted">Chargement...</p>
        </motion.div>
      </div>
    );
  }

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  const getVariation = (current, previous = 100) => {
    const diff = ((current - previous) / previous * 100).toFixed(0);
    return diff > 0 ? `+${diff}` : diff;
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">

      {/* ========== HEADER ÉPURÉ ========== */}
      <motion.header 
        className="px-2 sm:px-4 lg:px-6 pt-8 pb-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-light text-text-primary">
                Bonjour Marc
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                {new Date().toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  day: 'numeric',
                  month: 'long' 
                })}
              </p>
            </div>
            
            {/* Actions rapides */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
                title="Actualiser"
              >
                <FiRefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>

              {/* Filtres avec dropdown */}
              <div className="relative" ref={filtersRef}>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 transition-colors ${showFilters ? 'text-indigo-400' : 'text-text-muted hover:text-text-primary'}`}
                  title="Filtres"
                >
                  <FaFilter className="w-5 h-5" />
                </button>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-50"
                    >
                      <div className="p-4">
                        <h3 className="text-sm font-medium text-text-secondary mb-3">Période d'affichage</h3>

                        <div className="space-y-2">
                          <button
                            onClick={() => { setDateFilter('month'); setShowFilters(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              dateFilter === 'month'
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:bg-surface-strong'
                            }`}
                          >
                            Ce mois
                          </button>
                          <button
                            onClick={() => { setDateFilter('quarter'); setShowFilters(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              dateFilter === 'quarter'
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:bg-surface-strong'
                            }`}
                          >
                            Ce trimestre
                          </button>
                          <button
                            onClick={() => { setDateFilter('year'); setShowFilters(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              dateFilter === 'year'
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:bg-surface-strong'
                            }`}
                          >
                            Cette année
                          </button>
                          <button
                            onClick={() => { setDateFilter('all'); setShowFilters(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              dateFilter === 'all'
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:bg-surface-strong'
                            }`}
                          >
                            Toutes les données
                          </button>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs text-text-muted">
                            Filtre sélectionné: <span className="text-indigo-400 font-medium">
                              {dateFilter === 'month' && 'Ce mois'}
                              {dateFilter === 'quarter' && 'Ce trimestre'}
                              {dateFilter === 'year' && 'Cette année'}
                              {dateFilter === 'all' && 'Toutes les données'}
                            </span>
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Menu "Nouveau" avec dropdown */}
              <div className="relative" ref={newMenuRef}>
                <button
                  onClick={() => setShowNewMenu(!showNewMenu)}
                  className="px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <FaPlus className="w-4 h-4" />
                  <span className="text-sm font-medium text-text-primary">Nouveau</span>
                </button>

                <AnimatePresence>
                  {showNewMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-50"
                    >
                      <button
                        onClick={() => handleNewAction('project')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surface-strong hover:text-text-primary transition-colors"
                      >
                        <FaRocket className="w-4 h-4 text-purple-400" />
                        <span>Nouveau projet</span>
                      </button>
                      <button
                        onClick={() => handleNewAction('client')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surface-strong hover:text-text-primary transition-colors"
                      >
                        <FaUser className="w-4 h-4 text-blue-400" />
                        <span>Nouveau client</span>
                      </button>
                      <button
                        onClick={() => handleNewAction('quote')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surface-strong hover:text-text-primary transition-colors"
                      >
                        <FaClipboardList className="w-4 h-4 text-amber-400" />
                        <span>Nouveau devis</span>
                      </button>
                      <button
                        onClick={() => handleNewAction('invoice')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surface-strong hover:text-text-primary transition-colors"
                      >
                        <FaFileInvoice className="w-4 h-4 text-emerald-400" />
                        <span>Nouvelle facture</span>
                      </button>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => handleNewAction('email')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surface-strong hover:text-text-primary transition-colors"
                      >
                        <FiMail className="w-4 h-4 text-pink-400" />
                        <span>Envoyer un email</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* ========== CONTENU PRINCIPAL ========== */}
      <div className="px-2 sm:px-4 lg:px-6 pb-12">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* ========== MÉTRIQUES PRINCIPALES - Sans bordures ========== */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5"
          >
            {/* Card Leads */}
            <motion.div
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onHoverStart={() => setHoveredCard('leads')}
              onHoverEnd={() => setHoveredCard(null)}
              onClick={() => handleCardClick('leads')}
              className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-4 sm:p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              {/* Accent gradient subtil */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className={`p-2 sm:p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'leads' ? 'bg-blue-500/20' : 'bg-surface-strong/50'
                  }`}>
                    <FaUserFriends className="text-lg sm:text-xl text-blue-400" />
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full transition-all ${
                    dashboardData.leads.newThisMonth > 0
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-text-muted bg-gray-500/10'
                  }`}>
                    {getVariation(dashboardData.leads.newThisMonth, 10)}%
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-2xl sm:text-3xl font-light text-text-primary">
                    {formatNumber(dashboardData.leads.total)}
                  </p>
                  <p className="text-xs sm:text-sm text-text-muted">Total Leads</p>
                  <p className="text-xs text-gray-500">
                    +{dashboardData.leads.newThisMonth} ce mois
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Card Projets */}
            <motion.div
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onHoverStart={() => setHoveredCard('projects')}
              onHoverEnd={() => setHoveredCard(null)}
              onClick={() => handleCardClick('projects')}
              className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'projects' ? 'bg-purple-500/20' : 'bg-surface-strong/50'
                  }`}>
                    <FaRocket className="text-xl text-purple-400" />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full text-purple-400 bg-purple-500/10">
                    {dashboardData.projects.upcoming} à venir
                  </span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-3xl font-light text-text-primary">
                    {formatNumber(dashboardData.projects.active)}
                  </p>
                  <p className="text-sm text-text-muted">Projets Actifs</p>
                  <p className="text-xs text-gray-500">
                    {dashboardData.projects.completed} terminés
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Card Revenus */}
            <motion.div
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onHoverStart={() => setHoveredCard('revenue')}
              onHoverEnd={() => setHoveredCard(null)}
              onClick={() => handleCardClick('revenues')}
              className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'revenue' ? 'bg-emerald-500/20' : 'bg-surface-strong/50'
                  }`}>
                    <FaMoneyBillWave className="text-xl text-emerald-400" />
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full transition-all ${
                    dashboardData.revenues.thisMonth >= (dashboardData.revenues.monthlyTarget || 8000)
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-amber-400 bg-amber-500/10'
                  }`}>
                    <FaChartLine className="inline w-3 h-3 mr-1" />
                    {Math.round((dashboardData.revenues.thisMonth / (dashboardData.revenues.monthlyTarget || 8000)) * 100)}%
                  </span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-3xl font-light text-text-primary">
                    {formatAmount(dashboardData.revenues.thisMonth)}
                  </p>
                  <p className="text-sm text-text-muted">Revenus du mois</p>
                  <p className="text-xs text-gray-500">
                    Objectif: {formatAmount(dashboardData.revenues.monthlyTarget || 8000)}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Card Activités */}
            <motion.div
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onHoverStart={() => setHoveredCard('activities')}
              onHoverEnd={() => setHoveredCard(null)}
              onClick={() => navigate('/activities')}
              className="relative bg-gradient-to-br from-surface/50 to-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20 overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-60"></div>
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-xl transition-all ${
                    hoveredCard === 'activities' ? 'bg-amber-500/20' : 'bg-surface-strong/50'
                  }`}>
                    <FaClipboardList className="text-xl text-amber-400" />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full text-amber-400 bg-amber-500/10">
                    {dashboardData.activities.pending} en attente
                  </span>
                </div>
                
                <div className="space-y-1">
                  <p className="text-3xl font-light text-text-primary">
                    {formatNumber(dashboardData.activities.completed)}
                  </p>
                  <p className="text-sm text-text-muted">Tâches complétées</p>
                  <p className="text-xs text-gray-500">
                    Cette semaine
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* ========== GRAPHIQUES & VISUALISATIONS ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Graphique principal - Évolution revenus */}
            <motion.section
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2 bg-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-lg font-medium text-text-primary mb-1">Performance Financière</h2>
                  <p className="text-sm text-gray-500">Évolution sur 6 mois</p>
                </div>
                <button className="p-2 text-text-muted hover:text-text-primary transition-colors">
                  <FiMoreHorizontal className="w-5 h-5" />
                </button>
              </div>

              {dashboardData.revenueChart && dashboardData.revenueChart.length > 0 ? (
                <div>
                  {/* Stats rapides */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="text-center">
                      <p className="text-2xl font-light text-text-primary mb-1">
                        {formatAmount(
                          dashboardData.revenueChart.reduce((sum, item) => sum + item.amount, 0) / 
                          dashboardData.revenueChart.length
                        )}
                      </p>
                      <p className="text-xs text-gray-500">Moyenne mensuelle</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-light text-text-primary mb-1">
                        {formatAmount(Math.max(...dashboardData.revenueChart.map(i => i.amount)))}
                      </p>
                      <p className="text-xs text-gray-500">Meilleur mois</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-light text-text-primary mb-1">
                        {formatAmount(dashboardData.revenueChart.reduce((sum, item) => sum + item.amount, 0))}
                      </p>
                      <p className="text-xs text-gray-500">Total période</p>
                    </div>
                  </div>

                  {/* Graphique minimaliste */}
                  <div className="relative h-48">
                    <div className="absolute inset-0 flex items-end justify-between gap-3">
                      {dashboardData.revenueChart.map((item, index) => {
                        const maxAmount = Math.max(...dashboardData.revenueChart.map(i => i.amount));
                        const heightPercentage = (item.amount / maxAmount) * 100;
                        
                        return (
                          <motion.div
                            key={index}
                            className="flex-1 relative group"
                            initial={{ height: 0 }}
                            animate={{ height: `${heightPercentage}%` }}
                            transition={{ duration: 0.8, delay: 0.3 + index * 0.05 }}
                          >
                            {/* Tooltip au hover */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-muted px-2 py-1 rounded text-xs text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                              {formatAmount(item.amount)}
                            </div>
                            
                            {/* Barre simple sans bordure */}
                            <div className="h-full bg-gradient-to-t from-indigo-600/80 to-indigo-400/80 rounded-t-lg hover:from-indigo-500 hover:to-indigo-300 transition-all cursor-pointer" />
                          </motion.div>
                        );
                      })}
                    </div>
                    
                    {/* Labels des mois */}
                    <div className="absolute -bottom-6 inset-x-0 flex justify-between">
                      {dashboardData.revenueChart.map((item, index) => (
                        <div key={index} className="flex-1 text-center">
                          <p className="text-xs text-gray-600">
                            {new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="h-8"></div>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  <p className="text-gray-500">Aucune donnée disponible</p>
                </div>
              )}
            </motion.section>

            {/* Panel Objectifs */}
            <motion.section
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <h2 className="text-lg font-medium text-text-primary mb-6">Objectifs du mois</h2>

              <div className="space-y-6">
                {/* Objectif Leads */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-text-muted">Nouveaux Leads</span>
                    <span className="text-sm font-medium text-text-primary">
                      {dashboardData.leads.newThisMonth}/{dashboardData.leads.monthlyTarget || 10}
                    </span>
                  </div>
                  <div className="h-2 bg-surface-strong/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((dashboardData.leads.newThisMonth / (dashboardData.leads.monthlyTarget || 10)) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.4 }}
                    />
                  </div>
                </div>

                {/* Objectif Projets */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-text-muted">Projets terminés</span>
                    <span className="text-sm font-medium text-text-primary">
                      {dashboardData.projects.completed}/{dashboardData.projects.monthlyTarget || 5}
                    </span>
                  </div>
                  <div className="h-2 bg-surface-strong/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((dashboardData.projects.completed / (dashboardData.projects.monthlyTarget || 5)) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                    />
                  </div>
                </div>

                {/* Objectif CA */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-text-muted">Chiffre d'affaires</span>
                    <span className="text-sm font-medium text-text-primary">
                      {Math.round((dashboardData.revenues.thisMonth / (dashboardData.revenues.monthlyTarget || 8000)) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-surface-strong/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((dashboardData.revenues.thisMonth / (dashboardData.revenues.monthlyTarget || 8000)) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.6 }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {formatAmount(dashboardData.revenues.thisMonth)} sur {formatAmount(dashboardData.revenues.monthlyTarget || 8000)}
                  </p>
                </div>

                {/* Indicateur global */}
                <div className="pt-4 mt-2">
                  <div className="flex items-center gap-3">
                    {(() => {
                      // Calculer les pourcentages d'atteinte des objectifs
                      const leadsPercent = (dashboardData.leads.newThisMonth / (dashboardData.leads.monthlyTarget || 10)) * 100;
                      const projectsPercent = (dashboardData.projects.completed / (dashboardData.projects.monthlyTarget || 5)) * 100;
                      const revenuePercent = (dashboardData.revenues.thisMonth / (dashboardData.revenues.monthlyTarget || 8000)) * 100;

                      // Moyenne des 3 objectifs
                      const avgPercent = (leadsPercent + projectsPercent + revenuePercent) / 3;

                      // Déterminer la performance avec classes complètes
                      let dotClass = 'w-3 h-3 rounded-full bg-gray-500';
                      let textClass = 'text-sm font-medium text-gray-500';
                      let label = 'Aucune donnée';

                      if (avgPercent > 0) {
                        if (avgPercent >= 80) {
                          dotClass = 'w-3 h-3 rounded-full bg-emerald-500 animate-pulse';
                          textClass = 'text-sm font-medium text-emerald-400';
                          label = 'Excellente';
                        } else if (avgPercent >= 60) {
                          dotClass = 'w-3 h-3 rounded-full bg-blue-500 animate-pulse';
                          textClass = 'text-sm font-medium text-blue-400';
                          label = 'Bonne';
                        } else if (avgPercent >= 40) {
                          dotClass = 'w-3 h-3 rounded-full bg-amber-500';
                          textClass = 'text-sm font-medium text-amber-400';
                          label = 'Moyenne';
                        } else {
                          dotClass = 'w-3 h-3 rounded-full bg-red-500';
                          textClass = 'text-sm font-medium text-red-400';
                          label = 'À améliorer';
                        }
                      }

                      return (
                        <>
                          <div className={dotClass}></div>
                          <span className="text-sm text-text-muted">Performance: </span>
                          <span className={textClass}>{label}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </motion.section>
          </div>

          {/* ========== ACTIVITÉS ET PROJETS ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Activités récentes */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-text-primary">Activité récente</h2>
                <button className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                  Tout voir
                </button>
              </div>

              <div className="space-y-4">
                {dashboardData.recentActivities && dashboardData.recentActivities.length > 0 ? (
                  dashboardData.recentActivities.slice(0, 5).map((activity, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + index * 0.05 }}
                      className="flex items-start gap-3 group cursor-pointer"
                    >
                      {/* Icône minimaliste */}
                      <div className={`p-2 rounded-lg transition-all ${
                        activity.type === 'lead' ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20' :
                        activity.type === 'project' ? 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20' :
                        activity.type === 'revenue' ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20' :
                        'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20'
                      }`}>
                        {activity.type === 'lead' ? <FaUserFriends className="w-4 h-4" /> :
                         activity.type === 'project' ? <FaRocket className="w-4 h-4" /> :
                         activity.type === 'revenue' ? <FaMoneyBillWave className="w-4 h-4" /> :
                         <FaClipboardList className="w-4 h-4" />}
                      </div>
                      
                      {/* Contenu */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary group-hover:text-indigo-300 transition-colors">
                          {activity.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <FiActivity className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Aucune activité</p>
                  </div>
                )}
              </div>
            </motion.section>

            {/* Liste des projets */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-text-primary">Projets actifs</h2>
                <span className="text-sm text-gray-500">
                  {dashboardData.projects.active} en cours
                </span>
              </div>

              <div className="space-y-3">
                {dashboardData.projectTimeline && dashboardData.projectTimeline.length > 0 ? (
                  dashboardData.projectTimeline.slice(0, 4).map((project, index) => (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.05 }}
                      className="bg-surface-strong/20 backdrop-blur rounded-xl p-4 hover:bg-surface-strong/30 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-text-primary group-hover:text-indigo-300 transition-colors">
                            {project.name}
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {project.client || 'Client'}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          project.status === 'in_progress'
                            ? 'bg-blue-500/10 text-blue-400'
                            : project.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {project.status === 'in_progress' ? 'En cours' :
                           project.status === 'completed' ? 'Terminé' : 'Planifié'}
                        </span>
                      </div>
                      
                      {/* Progress bar simple */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Progression</span>
                          <span className="text-text-muted">{project.progress || 45}%</span>
                        </div>
                        <div className="h-1 bg-surface-strong rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${project.progress || 45}%` }}
                            transition={{ duration: 1, delay: 0.6 + index * 0.1 }}
                          />
                        </div>
                      </div>
                      
                      {/* Timeline simple */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <FiClock className="w-3 h-3" />
                          {new Date(project.start_date).toLocaleDateString('fr-FR', { 
                            day: 'numeric', 
                            month: 'short' 
                          })}
                        </span>
                        <span className="text-gray-600">→</span>
                        <span>
                          {new Date(project.end_date).toLocaleDateString('fr-FR', { 
                            day: 'numeric', 
                            month: 'short' 
                          })}
                        </span>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <FiCalendarIcon className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-3">Aucun projet actif</p>
                    <button className="px-4 py-2 bg-accent/20 text-indigo-400 rounded-lg hover:bg-accent/30 transition-colors text-sm">
                      Créer un projet
                    </button>
                  </div>
                )}
              </div>
            </motion.section>
          </div>

          {/* ========== STATISTIQUES DES AVIS CLIENTS ========== */}
          {reviewStats && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-surface/30 backdrop-blur rounded-2xl p-6 shadow-xl shadow-black/20"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-500/10 rounded-xl">
                    <FaStar className="text-xl text-yellow-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-text-primary">Demandes d'avis</h2>
                    <p className="text-sm text-gray-500">Performance des demandes d'avis clients</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/clients')}
                  className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Demander un avis
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total */}
                <div className="bg-surface-strong/20 backdrop-blur rounded-xl p-4">
                  <div className="flex items-center gap-2 text-text-muted text-xs mb-2">
                    <FaStar />
                    <span>Total</span>
                  </div>
                  <p className="text-2xl font-light text-text-primary mb-1">
                    {reviewStats.total || 0}
                  </p>
                  <p className="text-xs text-gray-500">demandes</p>
                </div>

                {/* Envoyées */}
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-green-400 text-xs mb-2">
                    <FaCheckCircle />
                    <span>Envoyées</span>
                  </div>
                  <p className="text-2xl font-light text-text-primary mb-1">
                    {reviewStats.sent || 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reviewStats.total > 0
                      ? Math.round((reviewStats.sent / reviewStats.total) * 100)
                      : 0}%
                  </p>
                </div>

                {/* Cliquées */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-400 text-xs mb-2">
                    <FiActivity />
                    <span>Cliquées</span>
                  </div>
                  <p className="text-2xl font-light text-text-primary mb-1">
                    {reviewStats.clicked || 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reviewStats.sent > 0
                      ? Math.round((reviewStats.clicked / reviewStats.sent) * 100)
                      : 0}% taux
                  </p>
                </div>

                {/* Avis laissés */}
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-yellow-400 text-xs mb-2">
                    <FaStar />
                    <span>Avis reçus</span>
                  </div>
                  <p className="text-2xl font-light text-text-primary mb-1">
                    {reviewStats.reviewed || 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    {reviewStats.sent > 0
                      ? Math.round((reviewStats.reviewed / reviewStats.sent) * 100)
                      : 0}% conversion
                  </p>
                </div>
              </div>

              {/* Performance 30 derniers jours */}
              <div className="mt-6 pt-6 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FiTrendingUpIcon className="text-indigo-400" />
                    <span className="text-sm text-text-muted">30 derniers jours</span>
                  </div>
                  <span className="text-sm font-medium text-text-primary">
                    {reviewStats.last_30_days || 0} demandes
                  </span>
                </div>
              </div>
            </motion.section>
          )}

        </div>
      </div>

      {/* ========== MODAL EMAIL RAPIDE - Dark Theme ========== */}
      <AnimatePresence>
        {showQuickEmail && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetEmailModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <FiMail className="text-blue-400 text-xl" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">Envoyer un email</h2>
                    <p className="text-sm text-text-muted">Email rapide depuis le dashboard</p>
                  </div>
                </div>
                <button
                  onClick={resetEmailModal}
                  className="p-2 hover:bg-surface-strong rounded-lg transition-colors"
                >
                  <FiX className="text-text-muted text-xl" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* Destinataire */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Destinataire <span className="text-red-400">*</span>
                  </label>
                  <EmailAutocomplete
                    value={quickEmailData.to}
                    onChange={(value) => setQuickEmailData({ ...quickEmailData, to: value })}
                    placeholder="Tapez un nom ou email..."
                    className="w-full px-4 py-3 bg-surface-muted/50 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Objet */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Objet <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={quickEmailData.subject}
                    onChange={(e) => setQuickEmailData({ ...quickEmailData, subject: e.target.value })}
                    placeholder="Objet de votre email"
                    className="w-full px-4 py-3 bg-surface-muted/50 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Message avec éditeur dark */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-text-secondary">
                      Message <span className="text-red-400">*</span>
                    </label>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden email-editor-dark">
                    <ReactQuill
                      ref={quillRef}
                      theme="snow"
                      value={quickEmailData.message}
                      onChange={(value) => setQuickEmailData({ ...quickEmailData, message: value })}
                      placeholder="Écrivez votre message ici..."
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline', 'strike'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          ['link'],
                          ['clean']
                        ]
                      }}
                      formats={['bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link']}
                    />
                  </div>
                  <style>{`
                    .email-editor-dark .ql-toolbar {
                      background-color: rgba(17, 24, 39, 0.5);
                      border: none;
                      border-bottom: 1px solid #374151;
                    }
                    .email-editor-dark .ql-toolbar .ql-stroke {
                      stroke: #9ca3af;
                    }
                    .email-editor-dark .ql-toolbar .ql-fill {
                      fill: #9ca3af;
                    }
                    .email-editor-dark .ql-toolbar .ql-picker {
                      color: #9ca3af;
                    }
                    .email-editor-dark .ql-toolbar button:hover .ql-stroke,
                    .email-editor-dark .ql-toolbar button.ql-active .ql-stroke {
                      stroke: #60a5fa;
                    }
                    .email-editor-dark .ql-toolbar button:hover .ql-fill,
                    .email-editor-dark .ql-toolbar button.ql-active .ql-fill {
                      fill: #60a5fa;
                    }
                    .email-editor-dark .ql-container {
                      background-color: rgba(17, 24, 39, 0.5);
                      border: none;
                      font-size: 14px;
                    }
                    .email-editor-dark .ql-editor {
                      min-height: 150px;
                      color: #fff;
                    }
                    .email-editor-dark .ql-editor.ql-blank::before {
                      color: #6b7280;
                      font-style: normal;
                    }
                    .email-editor-dark .ql-editor a {
                      color: #60a5fa;
                    }
                    .email-editor-dark .ql-snow .ql-tooltip {
                      background-color: #1f2937;
                      border-color: #374151;
                      color: #fff;
                    }
                    .email-editor-dark .ql-snow .ql-tooltip input[type="text"] {
                      background-color: #374151;
                      border-color: #4b5563;
                      color: #fff;
                    }
                  `}</style>
                </div>

                {/* Pièces jointes */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Pièces jointes
                  </label>

                  {/* Bouton ajouter */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg transition-colors text-sm"
                  >
                    <FiPaperclip />
                    <span>Ajouter un fichier</span>
                  </button>

                  {/* Liste des fichiers */}
                  {attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {attachments.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-muted/50 rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FiFile className="text-blue-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-text-primary text-sm truncate">{file.name}</div>
                              <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(index)}
                            className="p-2 hover:bg-red-600 rounded-lg transition-colors text-text-muted hover:text-text-primary"
                            title="Supprimer"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {/* Indicateur taille totale */}
                      <div className="text-xs text-gray-500 flex items-center justify-between px-2">
                        <span>
                          {attachments.length} fichier{attachments.length > 1 ? 's' : ''}
                        </span>
                        <span>
                          Total : {formatFileSize(attachments.reduce((sum, file) => sum + file.size, 0))} / 25 MB
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Option envoi différé */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-surface-muted/50 rounded-lg border border-border">
                    <input
                      type="checkbox"
                      id="scheduleEmail"
                      checked={isScheduled}
                      onChange={(e) => {
                        setIsScheduled(e.target.checked);
                        if (e.target.checked && !scheduledDate) {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          setScheduledDate(tomorrow.toISOString().split('T')[0]);
                        }
                      }}
                      className="w-4 h-4 text-purple-600 bg-surface border-border-strong rounded focus:ring-purple-500 focus:ring-2"
                      disabled={sendingEmail}
                    />
                    <label htmlFor="scheduleEmail" className="text-sm text-text-secondary cursor-pointer flex items-center gap-2">
                      <FiClock className="text-purple-400" />
                      Programmer l'envoi pour plus tard
                    </label>
                  </div>

                  {/* Sélecteurs date/heure */}
                  <AnimatePresence>
                    {isScheduled && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-3 p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-purple-300 mb-1">
                              <FiCalendarIcon className="inline mr-1" /> Date
                            </label>
                            <input
                              type="date"
                              value={scheduledDate}
                              onChange={(e) => setScheduledDate(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                              className="w-full px-3 py-2 bg-surface/50 border border-purple-500/30 rounded-lg text-text-primary text-sm focus:outline-none focus:border-purple-500 transition-colors"
                              disabled={sendingEmail}
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-purple-300 mb-1">
                              <FiClock className="inline mr-1" /> Heure
                            </label>
                            <input
                              type="time"
                              value={scheduledTime}
                              onChange={(e) => setScheduledTime(e.target.value)}
                              className="w-full px-3 py-2 bg-surface/50 border border-purple-500/30 rounded-lg text-text-primary text-sm focus:outline-none focus:border-purple-500 transition-colors"
                              disabled={sendingEmail}
                            />
                          </div>
                        </div>
                        {scheduledDate && scheduledTime && (
                          <p className="mt-2 text-xs text-purple-300 px-1">
                            L'email sera envoyé le {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-surface-muted/30">
                <button
                  onClick={resetEmailModal}
                  disabled={sendingEmail}
                  className="px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-strong rounded-lg transition-colors disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSendQuickEmail}
                  disabled={sendingEmail || !quickEmailData.to.trim() || !quickEmailData.subject.trim() || !quickEmailData.message.trim() || (isScheduled && (!scheduledDate || !scheduledTime))}
                  className={`px-6 py-2 ${isScheduled ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'} text-text-primary rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                >
                  {sendingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{isScheduled ? 'Programmation...' : 'Envoi en cours...'}</span>
                    </>
                  ) : (
                    <>
                      {isScheduled ? <FiClock /> : <FiSend />}
                      <span>{isScheduled ? 'Programmer' : 'Envoyer'}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
