// src/components/leads/ProspectionPanel.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiMapPin, FiUserPlus, FiExternalLink, FiAlertCircle, FiDollarSign, FiRefreshCw, FiEdit, FiPhone, FiGlobe, FiMail, FiArrowRight, FiTarget, FiSend, FiRadio, FiCpu } from 'react-icons/fi';
import { prospectionAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import VeilleMissionsPanel from './VeilleMissionsPanel';

// Badge SOURCE homogene (meme rendu pour toutes les sources, seul le libelle change).
// Tokens semantiques uniquement (charte) : aucune couleur en dur.
const SOURCE_LABELS = {
  'pole-emploi': 'France Travail',
  'france travail': 'France Travail',
  'google-jobs': 'Google Jobs',
  'google jobs': 'Google Jobs',
  sirene: 'SIRENE',
  pappers: 'Pappers',
  crawl: 'Crawl',
  manuel: 'Manuel',
  manual: 'Manuel'
};

const SourceBadge = ({ source }) => {
  if (!source) return null;
  const label = SOURCE_LABELS[String(source).toLowerCase()] || source;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-info-bg text-info-text">
      <FiRadio size={11} /> {label}
    </span>
  );
};

// Fil d'etapes : Decouverte (sources) -> Qualification (liste) -> Relance (outreach).
// Permet de naviguer sans saut brutal entre les vues de la page Leads.
const FLOW_STEPS = [
  { key: 'prospection', label: 'Découverte', icon: FiSearch, hint: 'Trouver de nouvelles sources' },
  { key: 'table', label: 'Qualification', icon: FiTarget, hint: 'Trier et qualifier les prospects' },
  { key: 'outreach', label: 'Relance', icon: FiSend, hint: 'Contacter et relancer' }
];

const FlowStepper = ({ current = 'prospection', onNavigate }) => (
  <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
    {FLOW_STEPS.map((step, i) => {
      const Icon = step.icon;
      const isActive = step.key === current;
      const clickable = !isActive && typeof onNavigate === 'function';
      return (
        <React.Fragment key={step.key}>
          <button
            type="button"
            onClick={clickable ? () => onNavigate(step.key) : undefined}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-accent text-white'
                : clickable
                ? 'bg-surface-strong text-text-secondary hover:bg-border-strong hover:text-text-primary'
                : 'bg-surface-strong text-text-muted'
            }`}
            title={step.hint}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isActive ? 'bg-white/20' : 'bg-surface'}`}>{i + 1}</span>
            <Icon size={14} />
            <span className="hidden sm:inline">{step.label}</span>
          </button>
          {i < FLOW_STEPS.length - 1 && <FiArrowRight className="text-text-muted flex-shrink-0" size={14} />}
        </React.Fragment>
      );
    })}
  </div>
);

const ProspectionPanel = ({ onLeadCreated, onNavigate }) => {
  const { toast } = useToast();

  // État global
  const [activeTab, setActiveTab] = useState('jobs'); // 'jobs' ou 'companies'

  // État pour la recherche d'offres d'emploi (France Travail + Google Jobs)
  const [isSearchingJobs, setIsSearchingJobs] = useState(false);
  const [jobSearchParams, setJobSearchParams] = useState({
    keywords: '',
    location: '',
    sources: ['pole-emploi'],
    contractType: '',
    experience: '',
    datePosted: 'all',
    minSalary: '',
    maxSalary: ''
  });
  const [jobResults, setJobResults] = useState([]);

  // État pour la recherche d'entreprises (SIRENE)
  const [isSearchingCompanies, setIsSearchingCompanies] = useState(false);
  const [companySearchParams, setCompanySearchParams] = useState({
    nafCode: '',
    city: '',
    postalCode: '',
    department: '',
    minEmployees: '',
    maxEmployees: '',
    limit: '100'
  });
  const [companyResults, setCompanyResults] = useState([]);

  // État pour Pappers
  const [pappersCredits, setPappersCredits] = useState(null);
  const [enrichingId, setEnrichingId] = useState(null);

  // Import lead
  const [importingId, setImportingId] = useState(null);

  // Charger les crédits Pappers au montage
  useEffect(() => {
    loadPappersCredits();
  }, []);

  const loadPappersCredits = async () => {
    try {
      const response = await prospectionAPI.getPappersCredits();
      if (response.success) {
        setPappersCredits(response.credits);
      }
    } catch (error) {
      console.error('Erreur chargement crédits Pappers:', error);
    }
  };

  // ============================================================================
  // OFFRES D'EMPLOI (France Travail + Google Jobs)
  // ============================================================================

  const handleJobSourceToggle = (source) => {
    const newSources = jobSearchParams.sources.includes(source)
      ? jobSearchParams.sources.filter(s => s !== source)
      : [...jobSearchParams.sources, source];
    setJobSearchParams({ ...jobSearchParams, sources: newSources });
  };

  const handleJobSearch = async (e) => {
    e.preventDefault();

    if (!jobSearchParams.keywords.trim()) {
      toast.error('Veuillez saisir des mots-clés de recherche');
      return;
    }

    if (jobSearchParams.sources.length === 0) {
      toast.error('Veuillez sélectionner au moins une source');
      return;
    }

    setIsSearchingJobs(true);
    setJobResults([]);

    try {
      const filters = {};
      if (jobSearchParams.contractType) filters.contractType = jobSearchParams.contractType;
      if (jobSearchParams.experience) filters.experience = jobSearchParams.experience;
      if (jobSearchParams.datePosted && jobSearchParams.datePosted !== 'all') filters.datePosted = jobSearchParams.datePosted;
      if (jobSearchParams.minSalary) filters.minSalary = jobSearchParams.minSalary;
      if (jobSearchParams.maxSalary) filters.maxSalary = jobSearchParams.maxSalary;

      const response = await prospectionAPI.search(
        jobSearchParams.keywords,
        jobSearchParams.location,
        jobSearchParams.sources.join(','),
        filters
      );

      if (response.success) {
        setJobResults(response.opportunities || []);

        let message = `${response.total || 0} opportunité(s) trouvée(s)`;
        if (response.sources && response.sources.length > 0) {
          const details = response.sources.map(s => `${s.source}: ${s.count}`).join(', ');
          message += ` (${details})`;
        }

        toast.success(message);

        if (response.errors && response.errors.length > 0) {
          response.errors.forEach(err => {
            toast.warning(`${err.source}: ${err.error}`);
          });
        }
      } else {
        toast.error(response.message || 'Erreur lors de la recherche');
      }
    } catch (error) {
      console.error('Erreur recherche:', error);
      toast.error('Erreur lors de la recherche');
    } finally {
      setIsSearchingJobs(false);
    }
  };

  // ============================================================================
  // ENTREPRISES (SIRENE + Pappers)
  // ============================================================================

  const handleCompanySearch = async (e) => {
    e.preventDefault();

    // Au moins un critère requis
    if (!companySearchParams.nafCode && !companySearchParams.city &&
        !companySearchParams.postalCode && !companySearchParams.department) {
      toast.error('Veuillez renseigner au moins un critère de recherche');
      return;
    }

    setIsSearchingCompanies(true);
    setCompanyResults([]);

    try {
      const criteria = {};
      if (companySearchParams.nafCode) criteria.nafCode = companySearchParams.nafCode;
      if (companySearchParams.city) criteria.city = companySearchParams.city;
      if (companySearchParams.postalCode) criteria.postalCode = companySearchParams.postalCode;
      if (companySearchParams.department) criteria.department = companySearchParams.department;
      if (companySearchParams.minEmployees) criteria.minEmployees = companySearchParams.minEmployees;
      if (companySearchParams.maxEmployees) criteria.maxEmployees = companySearchParams.maxEmployees;
      if (companySearchParams.limit) criteria.limit = companySearchParams.limit;

      const response = await prospectionAPI.searchSirene(criteria);

      if (response.success) {
        setCompanyResults(response.companies || []);
        toast.success(`${response.total || 0} entreprise(s) trouvée(s)`);
      } else {
        toast.error(response.message || 'Erreur lors de la recherche');
      }
    } catch (error) {
      console.error('Erreur recherche SIRENE:', error);
      toast.error('Erreur lors de la recherche SIRENE');
    } finally {
      setIsSearchingCompanies(false);
    }
  };

  const handleEnrichWithPappers = async (company) => {
    // Vérifier les crédits
    if (pappersCredits && pappersCredits.is_depleted) {
      toast.error(`Crédits Pappers épuisés (0/${pappersCredits.total}). Prochaine réinitialisation: ${new Date(pappersCredits.next_reset).toLocaleDateString('fr-FR')}`);
      return;
    }

    setEnrichingId(company.siret);

    try {
      const response = await prospectionAPI.enrichWithPappers(company.siren);

      if (response.success) {
        // Enrichir les données de l'entreprise
        const enrichedCompany = {
          ...company,
          phone: response.data.phone,
          email: response.data.email,
          website: response.data.website,
          executives: response.data.executives,
          enriched: true
        };

        // Mettre à jour les résultats
        setCompanyResults(companyResults.map(c =>
          c.siret === company.siret ? enrichedCompany : c
        ));

        // Mettre à jour les crédits
        setPappersCredits(response.credits);

        toast.success(`Entreprise enrichie ! (${response.credits.remaining}/${response.credits.total} crédits restants)`);

        // Alerte si crédits faibles
        if (response.credits.is_low && !response.credits.is_depleted) {
          toast.warning(`Attention: seulement ${response.credits.remaining} crédits Pappers restants ce mois-ci`);
        }
      } else {
        toast.error(response.message || 'Erreur lors de l\'enrichissement');
      }
    } catch (error) {
      console.error('Erreur enrichissement Pappers:', error);
      toast.error('Erreur lors de l\'enrichissement Pappers');
    } finally {
      setEnrichingId(null);
    }
  };

  const handleManualEnrich = (company) => {
    // Marquer comme enrichi manuellement et permettre l'édition
    const enrichedCompany = {
      ...company,
      enriched: 'manual',
      phone: company.phone || '',
      email: company.email || '',
      website: company.website || ''
    };

    setCompanyResults(companyResults.map(c =>
      c.siret === company.siret ? enrichedCompany : c
    ));

    toast.info('Vous pouvez maintenant éditer les informations manuellement');
  };

  // ============================================================================
  // IMPORT LEAD
  // ============================================================================

  const handleImportLead = async (opportunity) => {
    setImportingId(opportunity.id || opportunity.siret || opportunity.company_name);

    try {
      const response = await prospectionAPI.importLead(opportunity);

      if (response.success) {
        toast.success(`Lead créé : ${opportunity.company_name}`);

        // Retirer l'opportunité des résultats
        if (activeTab === 'jobs') {
          setJobResults(jobResults.filter(r =>
            (r.id || r.company_name) !== (opportunity.id || opportunity.company_name)
          ));
        } else {
          setCompanyResults(companyResults.filter(c =>
            c.siret !== opportunity.siret
          ));
        }

        // Notifier le parent
        if (onLeadCreated) {
          onLeadCreated(response.lead);
        }
      } else if (response.message && response.message.includes('existe déjà')) {
        toast.warning('Ce lead existe déjà dans le CRM');
      } else {
        toast.error(response.message || 'Erreur lors de l\'import');
      }
    } catch (error) {
      console.error('Erreur import lead:', error);
      toast.error('Erreur lors de l\'import du lead');
    } finally {
      setImportingId(null);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Fil d'etapes : Decouverte -> Qualification -> Relance */}
      <FlowStepper current="prospection" onNavigate={onNavigate} />

      {/* En-tete harmonise (tokens, comme le cockpit Suivi) */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4 mb-4">
          <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
            <FiSearch size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-text-primary">
              Prospection multi-sources
            </h3>
            <p className="text-sm text-text-muted">
              Découvrez de nouveaux prospects via France Travail, Google Jobs et l'API SIRENE
            </p>
          </div>
        </div>

        {/* Sous-onglets de source (style cockpit) */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => setActiveTab('jobs')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'jobs'
                ? 'bg-accent text-white'
                : 'bg-surface-strong text-text-secondary hover:bg-border-strong hover:text-text-primary'
            }`}
          >
            <FiSearch size={15} />
            <span>Offres d'emploi</span>
          </button>
          <button
            onClick={() => setActiveTab('companies')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'companies'
                ? 'bg-accent text-white'
                : 'bg-surface-strong text-text-secondary hover:bg-border-strong hover:text-text-primary'
            }`}
          >
            <FiMapPin size={15} />
            <span>Entreprises SIRENE</span>
            {pappersCredits && (
              <span className={`ml-1 px-2 py-0.5 text-xs rounded-full font-semibold ${
                pappersCredits.is_depleted
                  ? 'bg-danger-bg text-danger-text'
                  : pappersCredits.is_low
                  ? 'bg-warning-bg text-warning-text'
                  : 'bg-success-bg text-success-text'
              }`}>
                {pappersCredits.remaining}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('veille')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'veille'
                ? 'bg-accent text-white'
                : 'bg-surface-strong text-text-secondary hover:bg-border-strong hover:text-text-primary'
            }`}
          >
            <FiCpu size={15} />
            <span>Veille missions</span>
          </button>
        </div>
      </div>

      {/* Contenu onglet Veille missions */}
      {activeTab === 'veille' && <VeilleMissionsPanel />}

      {/* Contenu onglet Offres d'emploi */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          <form onSubmit={handleJobSearch} className="bg-surface/30 border border-border rounded-xl p-6 space-y-6">
            <div className="space-y-4">
              {/* Champs principaux */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                    <FiSearch className="text-accent" />
                    Mots-clés <span className="text-danger-text">*</span>
                  </label>
                  <input
                    type="text"
                    value={jobSearchParams.keywords}
                    onChange={(e) => setJobSearchParams({ ...jobSearchParams, keywords: e.target.value })}
                    placeholder="Ex: refonte site web, développeur, designer UX/UI..."
                    className="w-full px-4 py-3 bg-surface-muted/50 border border-border-strong rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                    <FiMapPin className="text-accent" />
                    Localisation
                  </label>
                  <input
                    type="text"
                    value={jobSearchParams.location}
                    onChange={(e) => setJobSearchParams({ ...jobSearchParams, location: e.target.value })}
                    placeholder="Code département (75) ou code postal (75001)"
                    className="w-full px-4 py-3 bg-surface-muted/50 border border-border-strong rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-text-muted mt-1.5 flex items-center gap-1">
                    <FiAlertCircle className="w-3 h-3" />
                    Optionnel - Laissez vide pour rechercher partout en France
                  </p>
                </div>
              </div>

              {/* Sources */}
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-3">
                  Sources de recherche <span className="text-danger-text">*</span>
                </label>
                <div className="flex flex-col gap-3">
                  <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    jobSearchParams.sources.includes('pole-emploi')
                      ? 'bg-accent/15 border-accent'
                      : 'bg-surface-muted/50 border-border hover:border-border-strong'
                  }`}>
                    <input
                      type="checkbox"
                      checked={jobSearchParams.sources.includes('pole-emploi')}
                      onChange={() => handleJobSourceToggle('pole-emploi')}
                      className="w-5 h-5 text-accent bg-surface-strong border-border-strong rounded focus:ring-2 focus:ring-accent"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-text-primary">France Travail</span>
                      <p className="text-xs text-text-muted mt-0.5">Offres officielles Pôle Emploi</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                    jobSearchParams.sources.includes('google-jobs')
                      ? 'bg-accent/15 border-accent'
                      : 'bg-surface-muted/50 border-border hover:border-border-strong'
                  }`}>
                    <input
                      type="checkbox"
                      checked={jobSearchParams.sources.includes('google-jobs')}
                      onChange={() => handleJobSourceToggle('google-jobs')}
                      className="w-5 h-5 text-accent bg-surface-strong border-border-strong rounded focus:ring-2 focus:ring-accent"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-text-primary">Google Jobs</span>
                      <p className="text-xs text-text-muted mt-0.5">Agrégateur multi-sources</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Filtres avancés */}
              <div className="pt-2 border-t border-border">
                <h4 className="text-sm font-medium text-text-secondary mb-3">Filtres avancés</h4>
                <div className="space-y-4">

                  {/* Type de contrat */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Type de contrat
                    </label>
                    <select
                      value={jobSearchParams.contractType}
                      onChange={(e) => setJobSearchParams({ ...jobSearchParams, contractType: e.target.value })}
                      className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="">Tous les types</option>
                      <option value="CDI">CDI</option>
                      <option value="CDD">CDD</option>
                      <option value="MIS">Mission intérim</option>
                      <option value="SAI">Saisonnier</option>
                      <option value="FRA">Franchise</option>
                      <option value="LIB">Libéral</option>
                    </select>
                  </div>

                  {/* Expérience */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Niveau d'expérience
                    </label>
                    <select
                      value={jobSearchParams.experience}
                      onChange={(e) => setJobSearchParams({ ...jobSearchParams, experience: e.target.value })}
                      className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="">Tous les niveaux</option>
                      <option value="D">Débutant</option>
                      <option value="E">Expérimenté</option>
                      <option value="S">Senior</option>
                    </select>
                  </div>

                  {/* Date de publication */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Date de publication
                    </label>
                    <select
                      value={jobSearchParams.datePosted}
                      onChange={(e) => setJobSearchParams({ ...jobSearchParams, datePosted: e.target.value })}
                      className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="all">Toutes les dates</option>
                      <option value="today">Aujourd'hui</option>
                      <option value="3days">3 derniers jours</option>
                      <option value="week">Cette semaine</option>
                      <option value="month">Ce mois</option>
                    </select>
                  </div>

                  {/* Salaire */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Salaire min (€/an)
                      </label>
                      <input
                        type="number"
                        value={jobSearchParams.minSalary}
                        onChange={(e) => setJobSearchParams({ ...jobSearchParams, minSalary: e.target.value })}
                        placeholder="Ex: 30000"
                        className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Salaire max (€/an)
                      </label>
                      <input
                        type="number"
                        value={jobSearchParams.maxSalary}
                        onChange={(e) => setJobSearchParams({ ...jobSearchParams, maxSalary: e.target.value })}
                        placeholder="Ex: 50000"
                        className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Bouton de recherche */}
            <div className="flex justify-end pt-4 border-t border-border">
              <motion.button
                type="submit"
                disabled={isSearchingJobs}
                whileHover={{ scale: isSearchingJobs ? 1 : 1.02 }}
                whileTap={{ scale: isSearchingJobs ? 1 : 0.98 }}
                className="w-full sm:w-auto px-8 py-3.5 bg-accent hover:bg-accent-hover disabled:bg-surface-strong disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-3"
              >
                {isSearchingJobs ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Recherche en cours...</span>
                  </>
                ) : (
                  <>
                    <FiSearch className="w-5 h-5" />
                    <span>Lancer la recherche</span>
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {/* Résultats offres d'emploi */}
          {jobResults.length > 0 && (
            <div className="bg-surface/30 border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <div className="w-2 h-2 bg-success-text rounded-full animate-pulse" />
                  {jobResults.length} opportunité{jobResults.length > 1 ? 's' : ''} trouvée{jobResults.length > 1 ? 's' : ''}
                </h4>
                <span className="text-sm text-text-muted">
                  Cliquez sur une carte pour importer
                </span>
              </div>
              <div className="flex flex-col gap-3 max-h-[700px] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {jobResults.map((opportunity, index) => (
                    <OpportunityCard
                      key={opportunity.id || index}
                      opportunity={opportunity}
                      onImport={handleImportLead}
                      importing={importingId === (opportunity.id || opportunity.company_name)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contenu onglet Entreprises SIRENE */}
      {activeTab === 'companies' && (
        <div className="space-y-6">
          {/* Compteur crédits Pappers */}
          {pappersCredits && (
            <div className={`p-4 rounded-lg border border-border ${
              pappersCredits.is_depleted
                ? 'bg-danger-bg'
                : pappersCredits.is_low
                ? 'bg-warning-bg'
                : 'bg-success-bg'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary mb-1">
                    Crédits Pappers
                  </h4>
                  <p className="text-xs text-text-muted">
                    {pappersCredits.remaining} sur {pappersCredits.total} crédits disponibles ce mois-ci
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${
                    pappersCredits.is_depleted ? 'text-danger-text' : pappersCredits.is_low ? 'text-warning-text' : 'text-success-text'
                  }`}>
                    {pappersCredits.remaining}
                  </div>
                  <button
                    onClick={loadPappersCredits}
                    className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 mt-1"
                  >
                    <FiRefreshCw className="w-3 h-3" />
                    Actualiser
                  </button>
                </div>
              </div>
              {pappersCredits.is_depleted && (
                <p className="text-xs text-danger-text mt-2 flex items-center gap-1">
                  <FiAlertCircle className="flex-shrink-0" />
                  Crédits épuisés. Réinitialisation le {new Date(pappersCredits.next_reset).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleCompanySearch} className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Code NAF/APE
                </label>
                <input
                  type="text"
                  value={companySearchParams.nafCode}
                  onChange={(e) => setCompanySearchParams({ ...companySearchParams, nafCode: e.target.value })}
                  placeholder="Ex: 43.21A (plomberie), 62.01Z (programmation)"
                  className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Ville
                </label>
                <input
                  type="text"
                  value={companySearchParams.city}
                  onChange={(e) => setCompanySearchParams({ ...companySearchParams, city: e.target.value })}
                  placeholder="Ex: Paris, Lyon..."
                  className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Code postal
                </label>
                <input
                  type="text"
                  value={companySearchParams.postalCode}
                  onChange={(e) => setCompanySearchParams({ ...companySearchParams, postalCode: e.target.value })}
                  placeholder="Ex: 75001, 69002..."
                  className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Département
                </label>
                <input
                  type="text"
                  value={companySearchParams.department}
                  onChange={(e) => setCompanySearchParams({ ...companySearchParams, department: e.target.value })}
                  placeholder="Ex: 75, 92, 971..."
                  className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Effectifs min - max
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    value={companySearchParams.minEmployees}
                    onChange={(e) => setCompanySearchParams({ ...companySearchParams, minEmployees: e.target.value })}
                    placeholder="Min"
                    className="w-full sm:w-1/2 px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    value={companySearchParams.maxEmployees}
                    onChange={(e) => setCompanySearchParams({ ...companySearchParams, maxEmployees: e.target.value })}
                    placeholder="Max"
                    className="w-full sm:w-1/2 px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isSearchingCompanies}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                    isSearchingCompanies
                      ? 'bg-surface-strong text-text-muted cursor-not-allowed'
                      : 'bg-accent hover:bg-accent-hover text-white'
                  }`}
                >
                  <FiSearch className="w-4 h-4" />
                  {isSearchingCompanies ? 'Recherche...' : 'Rechercher dans SIRENE'}
                </button>
              </div>
            </div>
          </form>

          {/* Résultats entreprises */}
          {companyResults.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-md font-semibold text-text-primary">
                {companyResults.length} entreprise(s) trouvée(s)
              </h4>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {companyResults.map((company, index) => (
                    <CompanyCard
                      key={company.siret || index}
                      company={company}
                      onImport={handleImportLead}
                      onEnrichWithPappers={handleEnrichWithPappers}
                      onManualEnrich={handleManualEnrich}
                      importing={importingId === company.siret}
                      enriching={enrichingId === company.siret}
                      pappersCredits={pappersCredits}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPOSANT CARTE OPPORTUNITÉ (Offres d'emploi)
// ============================================================================

const OpportunityCard = ({ opportunity, onImport, importing }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="bg-surface border border-border rounded-xl p-4 hover:border-border-strong transition-colors"
  >
    <div className="flex flex-col sm:flex-row items-start gap-4">
      <div className="flex-1 w-full min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h5 className="text-text-primary font-semibold break-words">
            {opportunity.company_name || 'Entreprise confidentielle'}
          </h5>
          <SourceBadge source={opportunity.source || 'Offre'} />
        </div>

        {(opportunity.city || opportunity.department) && (
          <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
            <FiMapPin className="w-3 h-3 flex-shrink-0" />
            <span>
              {opportunity.city}
              {opportunity.department && ` (${opportunity.department})`}
            </span>
          </div>
        )}

        {opportunity.notes && (
          <p className="text-sm text-text-muted mb-3 line-clamp-3">
            {opportunity.notes}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {opportunity.sector && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text text-xs font-medium">
              {opportunity.sector}
            </span>
          )}
          {opportunity.email && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-strong text-text-secondary text-xs break-all">
              <FiMail size={11} className="flex-shrink-0" /> {opportunity.email}
            </span>
          )}
          {opportunity.phone && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-strong text-text-secondary text-xs">
              <FiPhone size={11} className="flex-shrink-0" /> {opportunity.phone}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto flex-shrink-0">
        <button
          onClick={() => onImport(opportunity)}
          disabled={importing}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            importing
              ? 'bg-surface-strong text-text-muted cursor-not-allowed'
              : 'bg-accent hover:bg-accent-hover text-white'
          }`}
        >
          <FiUserPlus className="w-4 h-4" />
          {importing ? 'Import...' : 'Importer'}
        </button>

        {opportunity.url && (
          <a
            href={opportunity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm font-medium transition-colors"
          >
            <FiExternalLink className="w-4 h-4" />
            Voir
          </a>
        )}
      </div>
    </div>
  </motion.div>
);

// ============================================================================
// COMPOSANT CARTE ENTREPRISE (SIRENE)
// ============================================================================

const CompanyCard = ({ company, onImport, onEnrichWithPappers, onManualEnrich, importing, enriching, pappersCredits }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="bg-surface border border-border rounded-xl p-4 hover:border-border-strong transition-colors"
  >
    <div className="flex flex-col sm:flex-row items-start gap-4">
      <div className="flex-1 w-full min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h5 className="text-text-primary font-semibold break-words">
            {company.company_name}
          </h5>
          <SourceBadge source="SIRENE" />
          {company.enriched && (
            <span className="px-2 py-0.5 rounded-full bg-success-bg text-success-text text-xs font-medium">
              {company.enriched === 'manual' ? 'Édité' : 'Enrichi'}
            </span>
          )}
        </div>

        <div className="space-y-1 text-sm text-text-muted mb-3 break-words">
          <div>SIRET: {company.siret} • {company.legal_form}</div>
          <div className="flex items-center gap-2">
            <FiMapPin className="w-3 h-3 flex-shrink-0" />
            {company.address}, {company.postal_code} {company.city}
          </div>
          {company.naf_code && (
            <div>NAF: {company.naf_code} - {company.naf_label}</div>
          )}
          {company.employees_range && (
            <div>Effectifs: {company.employees_range}</div>
          )}
        </div>

        {/* Informations enrichies */}
        {company.enriched && (
          <div className="flex flex-wrap gap-2 mb-2">
            {company.phone && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-strong text-text-secondary text-xs">
                <FiPhone className="w-3 h-3 flex-shrink-0" /> {company.phone}
              </span>
            )}
            {company.email && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-strong text-text-secondary text-xs break-all">
                <FiMail className="w-3 h-3 flex-shrink-0" /> {company.email}
              </span>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-info-bg text-info-text text-xs hover:opacity-80 transition-opacity"
              >
                <FiGlobe className="w-3 h-3 flex-shrink-0" /> Site web
              </a>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto sm:min-w-[140px] flex-shrink-0">
        <button
          onClick={() => onImport(company)}
          disabled={importing}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            importing
              ? 'bg-surface-strong text-text-muted cursor-not-allowed'
              : 'bg-accent hover:bg-accent-hover text-white'
          }`}
        >
          <FiUserPlus className="w-4 h-4" />
          {importing ? 'Import...' : 'Importer'}
        </button>

        {!company.enriched && (
          <>
            <button
              onClick={() => onEnrichWithPappers(company)}
              disabled={enriching || (pappersCredits && pappersCredits.is_depleted)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                enriching || (pappersCredits && pappersCredits.is_depleted)
                  ? 'bg-surface-strong text-text-muted cursor-not-allowed'
                  : 'bg-surface-strong hover:bg-border-strong text-text-primary'
              }`}
              title={pappersCredits && pappersCredits.is_depleted ? 'Crédits Pappers épuisés' : 'Enrichir avec Pappers (1 crédit)'}
            >
              <FiDollarSign className="w-4 h-4" />
              {enriching ? 'Enrichis...' : 'Pappers'}
            </button>

            <button
              onClick={() => onManualEnrich(company)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm font-medium transition-colors"
              title="Enrichir manuellement"
            >
              <FiEdit className="w-4 h-4" />
              Manuel
            </button>
          </>
        )}
      </div>
    </div>
  </motion.div>
);

export default ProspectionPanel;
