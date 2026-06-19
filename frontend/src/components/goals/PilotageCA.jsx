// src/components/goals/PilotageCA.jsx
//
// Sous-écran "Pilotage CA/MRR 2027" du module Objectifs (V1).
// Jauge CA réalisé vs cible, trajectoire (MRR + projection + repère), cartes métriques,
// bloc fiscal (provisions URSSAF/impôt séparées + net estimé). Paramètres éditables,
// ponctuel saisissable. Données réelles via /api/objectif. Tokens de thème, react-icons,
// framer-motion, aucune couleur en dur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiTarget, FiTrendingUp, FiUsers, FiDollarSign, FiActivity, FiAlertTriangle,
  FiSettings, FiPlus, FiRefreshCw, FiInfo
} from 'react-icons/fi';
import { objectifAPI, revenuesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ANNEE = 2027;

const eur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));
const pct = (v) => `${Math.round(Number(v) || 0)} %`;

const PilotageCA = () => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [ponctuelOpen, setPonctuelOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await objectifAPI.getSummary(ANNEE);
      setData(res);
    } catch (e) {
      toast.error('Erreur lors du chargement du pilotage CA');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <p className="text-text-muted text-sm py-10 text-center">Chargement du pilotage…</p>;
  }
  if (!data) {
    return <p className="text-text-muted text-sm py-10 text-center">Aucune donnée.</p>;
  }

  const progress = data.cible_ca > 0 ? Math.min(100, (data.ca_realise / data.cible_ca) * 100) : 0;
  const reste = Math.max(0, (data.cible_ca || 0) - (data.ca_realise || 0));
  const mrrVsCible = data.cible_mrr > 0 ? Math.min(100, (data.mrr / data.cible_mrr) * 100) : 0;

  const cards = [
    { icon: FiTrendingUp, label: 'MRR (run-rate)', value: eur(data.mrr), sub: `cible ${eur(data.cible_mrr)}/mois` },
    { icon: FiUsers, label: 'Clients actifs', value: data.clients_actifs, sub: 'abonnements actifs' },
    { icon: FiDollarSign, label: 'ARPU', value: eur(data.arpu), sub: 'revenu moyen / client' },
    { icon: FiActivity, label: 'Churn 3 mois', value: pct(data.churn_3m), sub: 'approximatif' },
    { icon: FiAlertTriangle, label: 'MRR à risque', value: eur(data.mrr_a_risque), sub: 'impayés (past_due)' }
  ];

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
            <FiTarget size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text-primary">Pilotage CA / MRR {ANNEE}</h2>
            <p className="text-sm text-text-muted">Données réelles (Stripe + factures encaissées)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Rafraîchir"><FiRefreshCw size={16} /></button>
          <button onClick={() => setPonctuelOpen(true)} className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-2"><FiPlus size={15} /> Revenu ponctuel</button>
          <button onClick={() => setParamsOpen(true)} className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-2"><FiSettings size={15} /> Paramètres</button>
        </div>
      </div>

      {/* Jauge CA réalisé */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-xs text-text-muted mb-1">CA réalisé {ANNEE}</div>
            <div className="text-3xl font-bold text-text-primary">{eur(data.ca_realise)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-text-muted mb-1">Objectif</div>
            <div className="text-xl font-semibold text-text-secondary">{eur(data.cible_ca)}</div>
          </div>
        </div>
        <div className="h-4 bg-surface-strong/60 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-accent"
          />
        </div>
        <div className="flex justify-between text-xs mt-1.5">
          <span className="font-medium text-text-primary">{pct(progress)}</span>
          <span className="text-text-muted">reste {eur(reste)}</span>
        </div>
      </div>

      {/* Trajectoire */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"><FiTrendingUp size={15} /> Trajectoire</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-surface-muted/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">MRR actuel</div>
            <div className="text-xl font-bold text-text-primary">{eur(data.mrr)}</div>
            <div className="h-1.5 bg-surface-strong/60 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-accent rounded-full" style={{ width: `${mrrVsCible}%` }} />
            </div>
            <div className="text-xs text-text-muted mt-1">repère {eur(data.cible_mrr)}/mois</div>
          </div>
          <div className="bg-surface-muted/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">À ce rythme, fin {ANNEE}</div>
            <div className="text-xl font-bold text-text-primary">~ {eur(data.ca_projete)}</div>
            <div className="text-xs text-text-muted mt-1">{data.mois_restants} mois restants</div>
          </div>
          <div className="bg-surface-muted/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Écart à la cible</div>
            <div className={`text-xl font-bold ${data.ca_projete >= data.cible_ca ? 'text-success-text' : 'text-warning-text'}`}>
              {data.ca_projete >= data.cible_ca ? '+' : ''}{eur(data.ca_projete - data.cible_ca)}
            </div>
            <div className="text-xs text-text-muted mt-1">projection vs {eur(data.cible_ca)}</div>
          </div>
        </div>
      </div>

      {/* Cartes métriques */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-surface border border-border rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><Icon size={14} /> <span className="truncate">{c.label}</span></div>
              <div className="text-lg font-bold text-text-primary">{c.value}</div>
              <div className="text-xs text-text-muted truncate">{c.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Bloc fiscal */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"><FiDollarSign size={15} /> Estimation fiscale (indicative)</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface-muted/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">CA réalisé</div>
            <div className="text-lg font-bold text-text-primary">{eur(data.ca_realise)}</div>
          </div>
          <div className="bg-surface-muted/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Provision URSSAF</div>
            <div className="text-lg font-bold text-warning-text">− {eur(data.provision_urssaf)}</div>
            <div className="text-xs text-text-muted">≈ {pct((data.params.taux_urssaf || 0) * 100)}</div>
          </div>
          <div className="bg-surface-muted/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Provision impôt</div>
            <div className="text-lg font-bold text-warning-text">− {eur(data.provision_impot)}</div>
            <div className="text-xs text-text-muted">≈ {pct((data.params.taux_impot_provision || 0) * 100)}</div>
          </div>
          <div className="bg-surface-muted/50 border border-border rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Net estimé</div>
            <div className="text-lg font-bold text-success-text">{eur(data.net_estime)}</div>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 text-xs text-text-muted bg-info-bg/60 border border-info-text/20 rounded-lg p-3">
          <FiInfo className="text-info-text mt-0.5 flex-shrink-0" size={14} />
          <p>
            URSSAF (≈26 %) et impôt sur le revenu sont <strong className="text-text-primary">séparés</strong> (compte sans versement
            libératoire : l'impôt ne passe pas par l'URSSAF). Net indicatif uniquement.
          </p>
        </div>

        {data.bascule_micro && (
          <div className="mt-2 flex items-start gap-2 text-xs bg-danger-bg text-danger-text border border-danger-text/30 rounded-lg p-3">
            <FiAlertTriangle className="mt-0.5 flex-shrink-0" size={14} />
            <p>
              Bascule hors micro ({eur(data.seuils.plafond_micro)} franchi) — le calcul de net devient indicatif,
              voir votre comptable (réel/société ≈ 45 % du bénéfice net).
            </p>
          </div>
        )}
      </div>

      {paramsOpen && <ParamsModal params={data.params} onClose={() => setParamsOpen(false)} onSaved={() => { setParamsOpen(false); load(); }} />}
      {ponctuelOpen && <PonctuelModal onClose={() => setPonctuelOpen(false)} onSaved={() => { setPonctuelOpen(false); load(); }} />}
    </div>
  );
};

// --- Modale paramètres (édite objectif_params) ---
const PARAM_FIELDS = [
  { key: 'cible_ca_eur', label: 'Cible CA annuel (€)', step: '100' },
  { key: 'cible_mrr_eur', label: 'Cible MRR (€/mois)', step: '50' },
  { key: 'taux_urssaf', label: 'Taux URSSAF (ex. 0.26)', step: '0.01' },
  { key: 'taux_impot_provision', label: 'Taux impôt (ex. 0.06)', step: '0.01' },
  { key: 'plafond_micro', label: 'Plafond micro (€)', step: '100' },
  { key: 'seuil_tva_base', label: 'Seuil TVA base (€)', step: '100' },
  { key: 'seuil_tva_majore', label: 'Seuil TVA majoré (€)', step: '100' },
  { key: 'ponctuel_prevu', label: 'Ponctuel prévu (projection, €)', step: '100' }
];

const ParamsModal = ({ params, onClose, onSaved }) => {
  const { toast } = useToast();
  const [form, setForm] = useState(() => {
    const f = { annee: params.annee };
    PARAM_FIELDS.forEach((fl) => { f[fl.key] = params[fl.key]; });
    return f;
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await objectifAPI.updateParams(form);
      toast.success('Paramètres mis à jour');
      onSaved();
    } catch (e) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-text-primary mb-4">Paramètres du pilotage {params.annee}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PARAM_FIELDS.map((fl) => (
            <div key={fl.key}>
              <label className="block text-xs text-text-muted mb-1">{fl.label}</label>
              <input
                type="number" step={fl.step} value={form[fl.key] ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, [fl.key]: e.target.value }))}
                className="w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-3">Ordres de grandeur 2026 à valider avec votre comptable.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-secondary hover:bg-surface-strong text-sm" disabled={saving}>Annuler</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Modale revenu ponctuel (crée une ligne revenues paid) ---
const PonctuelModal = ({ onClose, onSaved }) => {
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ amount: '', date: today, description: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Montant requis'); return; }
    setSaving(true);
    try {
      await revenuesAPI.create({
        amount: Number(form.amount),
        date: form.date,
        type: 'ponctuel',
        status: 'paid',
        description: form.description || 'Revenu ponctuel'
      });
      toast.success('Revenu ponctuel ajouté');
      onSaved();
    } catch (e) {
      toast.error('Erreur lors de l\'ajout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-border rounded-2xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-text-primary mb-1">Revenu ponctuel</h3>
        <p className="text-xs text-text-muted mb-4">Encaissement non connu du CRM (mission Codeur, one-shot…). Ajouté au CA réalisé.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Montant (€)</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Date d'encaissement</label>
            <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Libellé</label>
            <input type="text" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Ex: Mission Codeur — refonte X"
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-secondary hover:bg-surface-strong text-sm" disabled={saving}>Annuler</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm disabled:opacity-50">{saving ? 'Ajout…' : 'Ajouter'}</button>
        </div>
      </motion.div>
    </div>
  );
};

export default PilotageCA;
