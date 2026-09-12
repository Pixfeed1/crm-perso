// src/components/leads/TargetingStats.jsx
//
// « Ce qui convertit » : la boucle de retour du ciblage. Pour chaque dimension (plateforme,
// type de site, département, secteur, source, angle d'approche), les issues réelles de la
// prospection : contactés, emails ouverts, réponses, gagnés, refus, avec les taux.
// Lecture seule, calculé côté serveur à partir des échanges loggés, du tracking email et du
// statut de relation. Charte : tokens de thème, react-icons, aucune couleur en dur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiTarget, FiRefreshCw, FiLoader, FiInfo } from 'react-icons/fi';
import { leadsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const DIMS = [
  ['platform', 'Plateforme'], ['site_type', 'Type de site'], ['department', 'Département'],
  ['sector', 'Secteur'], ['source', 'Source'], ['prestataire', 'Prestataire en place'], ['angle', "Angle d'approche"]
];

const Spinner = ({ size = 15 }) => (
  <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex">
    <FiLoader size={size} />
  </motion.span>
);

const Rate = ({ value, weak, tone = 'success' }) => {
  if (value == null) return <span className="text-text-muted">—</span>;
  const cls = weak ? 'text-text-muted' : tone === 'danger' ? 'text-danger-text' : tone === 'info' ? 'text-info-text' : 'text-success-text';
  return <span className={`font-medium ${cls}`}>{value} %</span>;
};

const TargetingStats = () => {
  const { toast } = useToast();
  const [by, setBy] = useState('platform');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await leadsAPI.targetingStats(by);
      setData(d);
    } catch (e) {
      toast.error('Statistiques de ciblage indisponibles');
    } finally {
      setLoading(false);
    }
  }, [by, toast]);

  useEffect(() => { load(); }, [load]);

  const rows = data ? data.rows : [];
  const g = data ? data.global : null;
  const maxContactes = rows.reduce((m, r) => Math.max(m, r.contactes), 0);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><FiTarget /> Ce qui convertit</h3>
            <p className="text-xs text-text-muted">Issues réelles de la prospection, par critère de ciblage. Taux calculés sur les prospects contactés.</p>
          </div>
          <button onClick={load} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Rafraîchir"><FiRefreshCw size={16} /></button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {DIMS.map(([k, label]) => (
            <button key={k} onClick={() => setBy(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${by === k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm py-8 justify-center"><Spinner size={18} /> Calcul…</div>
        ) : !g || g.total === 0 ? (
          <p className="text-text-muted text-sm py-6 text-center">Aucun prospect en base.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {[
                ['Prospects', g.total, null], ['Contactés', g.contactes, null],
                ['Réponses', g.repondus, g.taux_reponse], ['Gagnés', g.gagnes, g.taux_gagne], ['Refus', g.refus, g.taux_refus]
              ].map(([label, n, rate]) => (
                <div key={label} className="bg-surface-muted/40 border border-border rounded-lg p-3">
                  <div className="text-xs text-text-muted">{label}</div>
                  <div className="text-xl font-bold text-text-primary">{n}{rate != null && <span className="text-sm font-normal text-text-muted ml-1">· {rate} %</span>}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    <th className="px-3 py-2">{DIMS.find(([k]) => k === by)[1]}</th>
                    <th className="px-3 py-2 text-right">Prospects</th>
                    <th className="px-3 py-2 text-right">Contactés</th>
                    <th className="px-3 py-2 text-right" title="Au moins un email ouvert">Ouverture</th>
                    <th className="px-3 py-2 text-right" title="Joint, a répondu à l'outreach, ou passé en discussion / devis / gagné">Réponse</th>
                    <th className="px-3 py-2 text-right">Gagné</th>
                    <th className="px-3 py-2 text-right" title="Pas de business ou perdu">Refus</th>
                    <th className="px-3 py-2 text-right" title="Score de priorité moyen des prospects du groupe">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.groupe} className={`border-b border-border/50 ${r.echantillon_faible ? 'opacity-70' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="text-text-primary">{r.libelle}</div>
                        {maxContactes > 0 && (
                          <div className="h-1 mt-1 rounded bg-surface-muted overflow-hidden w-40 max-w-full">
                            <div className="h-full bg-accent" style={{ width: `${Math.round((r.contactes / maxContactes) * 100)}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-text-secondary">{r.total}</td>
                      <td className="px-3 py-2 text-right text-text-primary font-medium">{r.contactes}{r.echantillon_faible && <span className="text-text-muted" title="Moins de 5 contactés : taux peu significatifs"> *</span>}</td>
                      <td className="px-3 py-2 text-right"><Rate value={r.taux_ouverture} weak={r.echantillon_faible} tone="info" /></td>
                      <td className="px-3 py-2 text-right"><Rate value={r.taux_reponse} weak={r.echantillon_faible} /></td>
                      <td className="px-3 py-2 text-right"><Rate value={r.taux_gagne} weak={r.echantillon_faible} /></td>
                      <td className="px-3 py-2 text-right"><Rate value={r.taux_refus} weak={r.echantillon_faible} tone="danger" /></td>
                      <td className="px-3 py-2 text-right text-text-secondary">{r.score_moyen ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted mt-3 flex items-start gap-1.5">
              <FiInfo size={12} className="mt-0.5 flex-shrink-0" />
              <span>* moins de 5 contactés : les taux ne veulent encore rien dire. Un groupe compte comme « contacté » dès qu'un échange est loggé ou qu'un email tracké est parti. La réponse inclut les prospects passés en discussion, devis ou gagné.</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default TargetingStats;
