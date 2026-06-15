// src/components/calendar/EventImportModal.jsx
//
// Import en masse d'événements dans le calendrier via JSON (coller ou fichier .json).
// Aperçu (dry-run) avant écriture, notice de format intégrée + exemple téléchargeable.
// Tokens de thème uniquement, react-icons, framer-motion. Réutilise eventsAPI.importEvents.
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiX, FiUploadCloud, FiEye, FiCheckCircle, FiAlertTriangle, FiInfo,
  FiCopy, FiDownload, FiChevronDown, FiChevronUp, FiFileText
} from 'react-icons/fi';
import { eventsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const EXAMPLE = {
  defaults: { category: 'meeting', priority: 'medium', duration_minutes: 60 },
  events: [
    { title: 'Daily standup', start: '2026-06-16T09:00', duration_minutes: 15, repeat: { freq: 'daily', interval: 1, count: 10 } },
    { title: 'Bloc focus dev', start: '2026-06-16T14:00', end: '2026-06-16T16:00', category: 'task', repeat: { freq: 'weekly', days: ['MO', 'WE', 'FR'], until: '2026-07-15' } },
    { title: 'Congés', start: '2026-06-20', all_day: true }
  ]
};
const EXAMPLE_STR = JSON.stringify(EXAMPLE, null, 2);

const EventImportModal = ({ onClose, onImported }) => {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [showHelp, setShowHelp] = useState(true);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const parseJson = () => {
    try {
      return { data: JSON.parse(text) };
    } catch (e) {
      return { error: 'JSON invalide : ' + e.message };
    }
  };

  const run = async (dryRun) => {
    const { data, error } = parseJson();
    if (error) { toast.error(error); return; }
    setBusy(true);
    try {
      const payload = Array.isArray(data) ? { events: data, dry_run: dryRun } : { ...data, dry_run: dryRun };
      const res = await eventsAPI.importEvents(payload);
      setReport(res);
      if (!dryRun) {
        if (res.created > 0) {
          toast.success(`${res.created} événement(s) importé(s)`);
          if (onImported) onImported();
        } else {
          toast.info('Aucun événement créé');
        }
      }
    } catch (e) {
      toast.error(e.message || "Erreur lors de l'import");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setText(String(ev.target.result || '')); setReport(null); };
    reader.readAsText(file);
  };

  const copyExample = async () => {
    try { await navigator.clipboard.writeText(EXAMPLE_STR); toast.success('Exemple copié'); }
    catch { setText(EXAMPLE_STR); toast.info('Exemple inséré dans le champ'); }
  };

  const downloadExample = () => {
    const blob = new Blob([EXAMPLE_STR], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'exemple-evenements.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                <FiUploadCloud size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-text-primary">Importer des événements (JSON)</h2>
                <p className="text-xs text-text-muted">Remplir le calendrier en masse, sans saisie manuelle</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong flex-shrink-0">
              <FiX size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto">
            {/* Notice format */}
            <div className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowHelp((v) => !v)}
                className="w-full flex items-center justify-between gap-2 p-3 bg-surface-muted/50 hover:bg-surface-strong/50 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <FiInfo className="text-accent" /> Format attendu
                </span>
                {showHelp ? <FiChevronUp className="text-text-muted" /> : <FiChevronDown className="text-text-muted" />}
              </button>
              <AnimatePresence>
                {showHelp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-3 space-y-3 text-sm text-text-secondary">
                      <p>
                        Un tableau d'événements, ou <code className="text-text-primary">{'{ "events": [...], "defaults": {...} }'}</code>.
                        Champs : <strong className="text-text-primary">title</strong> et <strong className="text-text-primary">start</strong> requis ;
                        <em> end</em> ou <em>duration_minutes</em>, <em>all_day</em>, <em>category</em>, <em>priority</em>,
                        <em> location</em>, <em>description</em>, <em>color</em>, <em>reminder_minutes</em>.
                      </p>
                      <p>
                        Pour remplir plusieurs jours (10 jours, un mois…), ajoute un bloc
                        <strong className="text-text-primary"> repeat</strong> : <code className="text-text-primary">freq</code> (daily/weekly/monthly/yearly),
                        <code className="text-text-primary"> interval</code>, puis <code className="text-text-primary">count</code> (nb d'occurrences) ou
                        <code className="text-text-primary"> until</code> (date de fin). En hebdo : <code className="text-text-primary">days: ["MO","WE","FR"]</code>.
                      </p>
                      <pre className="bg-surface-muted border border-border rounded-lg p-3 text-xs text-text-secondary overflow-x-auto whitespace-pre">{EXAMPLE_STR}</pre>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={copyExample} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-xs">
                          <FiCopy size={13} /> Copier l'exemple
                        </button>
                        <button onClick={downloadExample} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-xs">
                          <FiDownload size={13} /> Télécharger l'exemple
                        </button>
                        <button onClick={() => { setText(EXAMPLE_STR); setReport(null); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-xs">
                          <FiFileText size={13} /> Pré-remplir le champ
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Saisie : coller ou fichier */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">Coller le JSON</label>
                <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-accent hover:brightness-110">
                  <FiUploadCloud size={14} /> …ou charger un fichier .json
                </button>
                <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
              </div>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setReport(null); }}
                rows={8}
                placeholder='{ "events": [ { "title": "...", "start": "2026-06-16T09:00" } ] }'
                className="w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            {/* Rapport / aperçu */}
            {report && (
              <div className="border border-border rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-neutral-bg text-neutral-text">{report.total} entrée(s)</span>
                  {report.dry_run
                    ? <span className="px-2 py-1 rounded-full bg-info-bg text-info-text">{report.preview.filter(p => p.action === 'would_create').length} à créer</span>
                    : <span className="px-2 py-1 rounded-full bg-success-bg text-success-text">{report.created} créé(s)</span>}
                  {report.skipped > 0 && <span className="px-2 py-1 rounded-full bg-warning-bg text-warning-text">{report.skipped} doublon(s) ignoré(s)</span>}
                  {report.preview.filter(p => p.conflicts > 0).length > 0 && (
                    <span className="px-2 py-1 rounded-full bg-warning-bg text-warning-text">
                      {report.preview.filter(p => p.conflicts > 0).length} avec conflit d'horaire
                    </span>
                  )}
                  {report.errors.length > 0 && <span className="px-2 py-1 rounded-full bg-danger-bg text-danger-text">{report.errors.length} erreur(s)</span>}
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1">
                  {report.preview.map((p) => (
                    <div key={`p-${p.index}`} className="flex items-start gap-2 text-xs text-text-secondary">
                      {p.duplicate
                        ? <FiAlertTriangle className="text-warning-text mt-0.5 flex-shrink-0" size={13} />
                        : <FiCheckCircle className="text-success-text mt-0.5 flex-shrink-0" size={13} />}
                      <div className="min-w-0">
                        <span className="text-text-primary">{p.title}</span>
                        {p.recurring && <span className="ml-1 text-text-muted">(série)</span>}
                        {p.duplicate && <span className="ml-1 text-warning-text">— doublon, ignoré</span>}
                        {p.warnings?.map((w, k) => <div key={k} className="text-warning-text">{w}</div>)}
                      </div>
                    </div>
                  ))}
                  {report.errors.map((er) => (
                    <div key={`e-${er.index}`} className="flex items-start gap-2 text-xs">
                      <FiAlertTriangle className="text-danger-text mt-0.5 flex-shrink-0" size={13} />
                      <div className="min-w-0 text-danger-text">
                        <span className="font-medium">{er.title || `Entrée #${er.index + 1}`}</span> — {er.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-secondary hover:bg-surface-strong transition-colors text-sm" disabled={busy}>
              Fermer
            </button>
            <button
              onClick={() => run(true)}
              disabled={busy || !text.trim()}
              className="px-4 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiEye size={15} /> Aperçu
            </button>
            <button
              onClick={() => run(false)}
              disabled={busy || !text.trim()}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiUploadCloud size={15} /> {busy ? 'Import…' : 'Importer'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EventImportModal;
