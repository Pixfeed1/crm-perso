// src/components/maintenance/MaintenanceReportForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiCheckCircle, FiPlus, FiTrash2 } from 'react-icons/fi';
import { maintenanceReportsAPI, maintenanceContractsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const DEFAULT_SYNTHESE = "Ce mois-ci, votre site est à jour et aucun incident de sécurité n'a été détecté.";
const DEFAULT_CLOSING = "Prochain rapport le mois prochain. Pour toute question, je reste à votre disposition.";

// Format JJ/MM/AAAA depuis une date ISO 'AAAA-MM-JJ'
const fmtFr = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Corps d'email par défaut (modifiable), dates de période injectées automatiquement.
const buildDefaultEmailMessage = (startIso, endIso, clientName) =>
`Bonjour${clientName ? ' ' + clientName : ''},

Voici votre rapport de maintenance pour la période du ${fmtFr(startIso)} au ${fmtFr(endIso)}.

Le détail complet est disponible dans le PDF joint à cet email. Pour toute question, vous pouvez répondre directement à ce message.

Bien à vous,`;

const RECO_LEVELS = [
  { value: 'bonne_pratique', label: 'Bonne pratique' },
  { value: 'conseil', label: 'Conseil' },
  { value: 'alerte', label: 'Alerte' }
];

const inputCls = "w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500";
const labelCls = "block text-sm text-text-muted mb-1";

const MaintenanceReportForm = ({ contract, onClose, onSuccess }) => {
  const { toast } = useToast();

  // Dates par défaut (mois précédent)
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

  const [formData, setFormData] = useState({
    period_start: firstDay.toISOString().split('T')[0],
    period_end: lastDay.toISOString().split('T')[0],
    synthese: DEFAULT_SYNTHESE,
    updates_count: '',
    pagespeed_mobile: contract.pagespeed_mobile || '',
    pagespeed_desktop: contract.pagespeed_desktop || '',
    perf_tips: '',
    perf_link: '',
    show_backups: true,
    closing_text: DEFAULT_CLOSING,
    email_message: buildDefaultEmailMessage(
      firstDay.toISOString().split('T')[0],
      lastDay.toISOString().split('T')[0],
      contract.client_name
    )
  });

  // Liste dynamique des recommandations : { niveau, texte, lien }
  const [recommendations, setRecommendations] = useState([]);

  const [submitting, setSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const addRecommendation = () => {
    setRecommendations(prev => [...prev, { niveau: 'conseil', texte: '', lien: '' }]);
  };

  const removeRecommendation = (index) => {
    setRecommendations(prev => prev.filter((_, i) => i !== index));
  };

  const updateRecommendation = (index, field, value) => {
    setRecommendations(prev => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSubmitting(true);

      // Mettre à jour les scores PageSpeed du contrat (comportement existant conservé)
      if (formData.pagespeed_mobile && formData.pagespeed_desktop) {
        await maintenanceContractsAPI.updatePageSpeed(
          contract.id,
          parseInt(formData.pagespeed_mobile),
          parseInt(formData.pagespeed_desktop)
        );
      }

      // report_data aux clés EXACTES attendues par reportTemplate
      const reportData = {
        period_start: formData.period_start,
        period_end: formData.period_end,
        report_data: {
          synthese: formData.synthese,
          updates_count: formData.updates_count === '' ? 0 : parseInt(formData.updates_count),
          pagespeed_mobile: formData.pagespeed_mobile ? parseInt(formData.pagespeed_mobile) : null,
          pagespeed_desktop: formData.pagespeed_desktop ? parseInt(formData.pagespeed_desktop) : null,
          perf_tips: formData.perf_tips.split('\n').map(t => t.trim()).filter(Boolean),
          perf_link: formData.perf_link.trim(),
          recommendations: recommendations
            .filter(r => r.texte && r.texte.trim())
            .map(r => ({ niveau: r.niveau, texte: r.texte.trim(), lien: (r.lien || '').trim() })),
          show_backups: formData.show_backups,
          closing_text: formData.closing_text,
          email_message: formData.email_message,
          extensions_count: (contract.plugins_count !== null && contract.plugins_count !== undefined && contract.plugins_count !== '')
            ? parseInt(contract.plugins_count)
            : null
        }
      };

      await maintenanceReportsAPI.generateForContract(contract.id, reportData);

      toast.success('Rapport généré avec succès');
      onSuccess();
    } catch (error) {
      console.error('Erreur génération rapport:', error);
      toast.error('Erreur lors de la génération du rapport');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 bg-surface-muted/40 rounded-lg p-5"
    >
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-purple-300 font-medium">Nouveau rapport de maintenance</h4>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="text-text-muted hover:text-text-primary"
        >
          <FiX />
        </motion.button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Période */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Début de période</label>
            <input
              type="date"
              name="period_start"
              value={formData.period_start}
              onChange={handleInputChange}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Fin de période</label>
            <input
              type="date"
              name="period_end"
              value={formData.period_end}
              onChange={handleInputChange}
              className={inputCls}
            />
          </div>
        </div>

        {/* Synthèse */}
        <div>
          <label className={labelCls}>Synthèse</label>
          <textarea
            name="synthese"
            value={formData.synthese}
            onChange={handleInputChange}
            rows={2}
            className={inputCls}
            placeholder={DEFAULT_SYNTHESE}
          />
        </div>

        {/* Chiffres */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Nombre de mises à jour</label>
            <input
              type="number"
              name="updates_count"
              value={formData.updates_count}
              onChange={handleInputChange}
              min="0"
              className={inputCls}
              placeholder="0"
            />
          </div>
          <div>
            <label className={labelCls}>PageSpeed Mobile</label>
            <input
              type="number"
              name="pagespeed_mobile"
              value={formData.pagespeed_mobile}
              onChange={handleInputChange}
              min="0"
              max="100"
              className={inputCls}
              placeholder="0-100"
            />
          </div>
          <div>
            <label className={labelCls}>PageSpeed Desktop</label>
            <input
              type="number"
              name="pagespeed_desktop"
              value={formData.pagespeed_desktop}
              onChange={handleInputChange}
              min="0"
              max="100"
              className={inputCls}
              placeholder="0-100"
            />
          </div>
        </div>

        {/* Performance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Pistes de performance (une par ligne)</label>
            <textarea
              name="perf_tips"
              value={formData.perf_tips}
              onChange={handleInputChange}
              rows={3}
              className={inputCls}
              placeholder="Activer la mise en cache navigateur&#10;Compresser les images au format WebP"
            />
          </div>
          <div>
            <label className={labelCls}>Lien rapport PageSpeed (URL)</label>
            <input
              type="url"
              name="perf_link"
              value={formData.perf_link}
              onChange={handleInputChange}
              className={inputCls}
              placeholder="https://pagespeed.web.dev/..."
            />
          </div>
        </div>

        {/* Recommandations (liste dynamique) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls + ' mb-0'}>Recommandations</label>
            <button
              type="button"
              onClick={addRecommendation}
              className="flex items-center gap-1 text-sm text-purple-300 hover:text-purple-200"
            >
              <FiPlus size={14} /> Ajouter
            </button>
          </div>
          {recommendations.length === 0 && (
            <p className="text-xs text-gray-500">Aucune recommandation. Cliquez sur « Ajouter » pour en créer une.</p>
          )}
          <div className="space-y-2">
            {recommendations.map((reco, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <select
                  value={reco.niveau}
                  onChange={(e) => updateRecommendation(index, 'niveau', e.target.value)}
                  className={inputCls + ' md:col-span-3'}
                >
                  {RECO_LEVELS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={reco.texte}
                  onChange={(e) => updateRecommendation(index, 'texte', e.target.value)}
                  className={inputCls + ' md:col-span-5'}
                  placeholder="Texte de la recommandation"
                />
                <input
                  type="url"
                  value={reco.lien}
                  onChange={(e) => updateRecommendation(index, 'lien', e.target.value)}
                  className={inputCls + ' md:col-span-3'}
                  placeholder="Lien (optionnel)"
                />
                <button
                  type="button"
                  onClick={() => removeRecommendation(index)}
                  className="md:col-span-1 flex items-center justify-center h-10 rounded-lg border border-border text-text-muted hover:text-rose-400 hover:border-rose-500"
                  aria-label="Supprimer la recommandation"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sauvegardes */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="show_backups"
            checked={formData.show_backups}
            onChange={handleInputChange}
            className="w-4 h-4 rounded border-border-strong bg-surface-strong text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm text-text-secondary">Afficher les sauvegardes quotidiennes</span>
        </label>

        {/* Mot de clôture */}
        <div>
          <label className={labelCls}>Mot de clôture</label>
          <textarea
            name="closing_text"
            value={formData.closing_text}
            onChange={handleInputChange}
            rows={2}
            className={inputCls}
            placeholder={DEFAULT_CLOSING}
          />
        </div>

        {/* Message de l'email (corps du mail envoyé au client) */}
        <div>
          <label className={labelCls}>Message de l'email</label>
          <textarea
            name="email_message"
            value={formData.email_message}
            onChange={handleInputChange}
            rows={7}
            className={inputCls}
          />
          <p className="text-xs text-gray-500 mt-1">
            Corps de l'email envoyé au client. Le PDF du rapport est joint et la signature ajoutée automatiquement.
          </p>
        </div>

        {/* Boutons */}
        <div className="flex justify-end gap-2 pt-2">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border-strong text-text-secondary hover:bg-surface-strong/50"
          >
            Annuler
          </motion.button>
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <motion.div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                Génération...
              </>
            ) : (
              <>
                <FiCheckCircle size={16} />
                Générer le rapport
              </>
            )}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default MaintenanceReportForm;
