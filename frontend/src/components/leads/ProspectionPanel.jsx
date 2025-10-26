// src/components/leads/ProspectionPanel.jsx
import React, { useState } from 'react';
import { FiSearch, FiMapPin, FiUserPlus, FiExternalLink, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi';
import { prospectionAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ProspectionPanel = ({ onLeadCreated }) => {
  const { toast } = useToast();
  const [isSearching, setIsSearching] = useState(false);
  const [searchParams, setSearchParams] = useState({
    keywords: '',
    location: '',
    sources: ['pole-emploi'] // Array de sources
  });
  const [results, setResults] = useState([]);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [importingId, setImportingId] = useState(null);

  // Gérer le toggle des sources
  const handleSourceToggle = (source) => {
    const newSources = searchParams.sources.includes(source)
      ? searchParams.sources.filter(s => s !== source)
      : [...searchParams.sources, source];

    setSearchParams({ ...searchParams, sources: newSources });
  };

  // Rechercher des opportunités
  const handleSearch = async (e) => {
    e.preventDefault();

    if (!searchParams.keywords.trim()) {
      toast.error('Veuillez saisir des mots-clés de recherche');
      return;
    }

    if (searchParams.sources.length === 0) {
      toast.error('Veuillez sélectionner au moins une source');
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      const response = await prospectionAPI.search(
        searchParams.keywords,
        searchParams.location,
        searchParams.sources.join(',') // Joindre les sources avec virgule
      );

      if (response.success) {
        setResults(response.opportunities || []);

        // Message avec détail par source
        let message = `${response.total || 0} opportunité(s) trouvée(s)`;
        if (response.sources && response.sources.length > 0) {
          const details = response.sources.map(s => `${s.source}: ${s.count}`).join(', ');
          message += ` (${details})`;
        }

        toast.success(message);

        // Afficher les erreurs s'il y en a
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
      setIsSearching(false);
    }
  };

  // Importer une opportunité comme lead
  const handleImportLead = async (opportunity) => {
    setImportingId(opportunity.id || opportunity.company_name);

    try {
      const response = await prospectionAPI.importLead(opportunity);

      if (response.success) {
        toast.success(`Lead créé : ${opportunity.company_name}`);

        // Retirer l'opportunité des résultats
        setResults(results.filter(r =>
          (r.id || r.company_name) !== (opportunity.id || opportunity.company_name)
        ));

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-2">
          Prospection France Travail
        </h3>
        <p className="text-sm text-gray-400">
          Recherchez des opportunités dans les offres d'emploi France Travail (anciennement Pôle Emploi)
        </p>
      </div>

      {/* Formulaire de recherche */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mots-clés */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mots-clés <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchParams.keywords}
                onChange={(e) => setSearchParams({ ...searchParams, keywords: e.target.value })}
                placeholder="Ex: refonte site, développeur web, graphiste..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Localisation */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Localisation (optionnel)
            </label>
            <div className="relative">
              <FiMapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchParams.location}
                onChange={(e) => setSearchParams({ ...searchParams, location: e.target.value })}
                placeholder="Ex: 75 (Paris), 69 (Rhône)..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Code département (2 chiffres) ou code postal (5 chiffres)
            </p>
          </div>

          {/* Sources */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Sources <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
                <input
                  type="checkbox"
                  checked={searchParams.sources.includes('pole-emploi')}
                  onChange={() => handleSourceToggle('pole-emploi')}
                  className="w-4 h-4 text-indigo-600 bg-gray-800 border-gray-700 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-300">France Travail</span>
              </label>
              <label className="flex items-center gap-2 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
                <input
                  type="checkbox"
                  checked={searchParams.sources.includes('google-jobs')}
                  onChange={() => handleSourceToggle('google-jobs')}
                  className="w-4 h-4 text-indigo-600 bg-gray-800 border-gray-700 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-300">Google Jobs</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Sélectionnez au moins une source de recherche
            </p>
          </div>

          {/* Bouton recherche */}
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSearching}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isSearching
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <FiSearch className="w-4 h-4" />
              {isSearching ? 'Recherche...' : 'Rechercher'}
            </button>
          </div>
        </div>
      </form>

      {/* Résultats */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-white">
              {results.length} opportunité(s) trouvée(s)
            </h4>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {results.map((opportunity, index) => (
              <div
                key={opportunity.id || index}
                className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 hover:border-indigo-500/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Entreprise */}
                    <h5 className="text-white font-semibold mb-1">
                      {opportunity.company_name || 'Entreprise confidentielle'}
                    </h5>

                    {/* Localisation */}
                    {(opportunity.city || opportunity.department) && (
                      <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                        <FiMapPin className="w-3 h-3" />
                        <span>
                          {opportunity.city}
                          {opportunity.department && ` (${opportunity.department})`}
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    {opportunity.notes && (
                      <p className="text-sm text-gray-400 mb-3 line-clamp-3">
                        {opportunity.notes}
                      </p>
                    )}

                    {/* Infos complémentaires */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {opportunity.sector && (
                        <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded">
                          {opportunity.sector}
                        </span>
                      )}
                      {opportunity.source && (
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded">
                          {opportunity.source}
                        </span>
                      )}
                      {opportunity.email && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded">
                          {opportunity.email}
                        </span>
                      )}
                      {opportunity.phone && (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded">
                          {opportunity.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleImportLead(opportunity)}
                      disabled={importingId === (opportunity.id || opportunity.company_name)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        importingId === (opportunity.id || opportunity.company_name)
                          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                      title="Importer comme lead"
                    >
                      <FiUserPlus className="w-4 h-4" />
                      {importingId === (opportunity.id || opportunity.company_name) ? 'Import...' : 'Importer'}
                    </button>

                    {opportunity.url && (
                      <a
                        href={opportunity.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                        title="Voir l'offre"
                      >
                        <FiExternalLink className="w-4 h-4" />
                        Voir
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* État vide */}
      {!isSearching && results.length === 0 && searchParams.keywords && (
        <div className="text-center py-8">
          <FiAlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">Aucune opportunité trouvée</p>
          <p className="text-sm text-gray-500 mt-1">
            Essayez avec d'autres mots-clés ou une autre localisation
          </p>
        </div>
      )}
    </div>
  );
};

export default ProspectionPanel;
