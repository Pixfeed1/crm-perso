// src/components/signaux/SignauxPanel.jsx
//
// Onglet « Signaux » du Portefeuille : nouveaux domaines .fr (fichier quotidien AFNIC) passés
// par une table tampon. Import du jour, historique des imports, vues par statut (qualifiés,
// à surveiller, promus, rejetés), promotion manuelle en prospect, revérification, rejet.
// Charte : tokens de thème, react-icons, framer-motion. Aucune couleur en dur.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiRadio, FiDownload, FiUserPlus, FiRefreshCw, FiSlash, FiLoader, FiClock, FiAlertTriangle, FiExternalLink, FiCheck, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { signauxAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const VUES = [
  { key: 'qualifie', label: 'Qualifiés', hint: 'Score ≥ 50 : entreprise identifiée, récente ou du métier, souvent sans site. À contacter.' },
  { key: 'a_surveiller', label: 'À surveiller', hint: 'Pas assez d\'indices aujourd\'hui. Recontrôlés à J+7, 15, 30, 60, 90 (site apparu ? entreprise immatriculée ?).' },
  { key: 'promu', label: 'Promus', hint: 'Déjà passés en prospects.' },
  { key: 'rejete', label: 'Rejetés', hint: 'Alias, grande entreprise, ou rien après 90 jours. Rien n\'est supprimé.' }
];

const SITE_BADGE = {
  actif: { cls: 'bg-success-bg text-success-text', label: 'Site en ligne' },
  parking: { cls: 'bg-warning-bg text-warning-text', label: 'Parking' },
  vide: { cls: 'bg-warning-bg text-warning-text', label: 'Installé, vide' },
  sans_dns: { cls: 'bg-neutral-bg text-neutral-text', label: 'Aucun site' },
  injoignable: { cls: 'bg-neutral-bg text-neutral-text', label: 'Injoignable' },
  redirection: { cls: 'bg-neutral-bg text-neutral-text', label: 'Redirige ailleurs' },
  protege: { cls: 'bg-neutral-bg text-neutral-text', label: 'Protégé (antibot)' },
  erreur: { cls: 'bg-danger-bg text-danger-text', label: 'Erreur HTTP' },
  inconnu: { cls: 'bg-neutral-bg text-neutral-text', label: 'Non analysé' }
};
const siteBadge = (s) => SITE_BADGE[s] || SITE_BADGE.inconnu;

const IMPORT_BADGE = {
  running: { cls: 'bg-warning-bg text-warning-text', label: 'En cours' },
  done: { cls: 'bg-success-bg text-success-text', label: 'Terminé' },
  error: { cls: 'bg-danger-bg text-danger-text', label: 'Erreur' }
};
const PHASES = { telechargement: 'Téléchargement du fichier AFNIC', filtrage: 'Filtrage des noms', analyse: 'Analyse des sites', sirene: 'Recherche des entreprises (SIRENE)', qualification: 'Score et statut', done: 'Terminé' };

const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); };
const fmtDateTime = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const joursDepuis = (s) => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : Math.round((Date.now() - d.getTime()) / 86400000); };
const isoDay = (d) => d.toISOString().slice(0, 10);
const scoreCls = (n) => n >= 70 ? 'bg-success-bg text-success-text' : n >= 50 ? 'bg-info-bg text-info-text' : n >= 30 ? 'bg-warning-bg text-warning-text' : 'bg-neutral-bg text-neutral-text';

const SignauxPanel = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const hier = new Date(Date.now() - 86400000);
  const [jour, setJour] = useState(isoDay(hier));
  const [texte, setTexte] = useState('');
  const [showColler, setShowColler] = useState(false);
  const [imports, setImports] = useState([]);
  const [vue, setVue] = useState('qualifie');
  const [counts, setCounts] = useState({});
  const [signals, setSignals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [working, setWorking] = useState(null); // 'import' | 'promote' | 'recheck' | 'reject' | null
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const loadImports = useCallback(async () => {
    try { const data = await signauxAPI.imports(); setImports(data || []); return data || []; } catch { return []; }
  }, []);
  const loadSignals = useCallback(async (v = vue) => {
    try {
      const data = await signauxAPI.list(v);
      setCounts(data.counts || {}); setSignals(data.signals || []); setBusy(!!data.busy);
    } catch (e) { console.error('Signaux :', e); } finally { setLoading(false); }
  }, [vue]);

  useEffect(() => { loadImports(); }, [loadImports]);
  useEffect(() => { setSelected(new Set()); setLoading(true); loadSignals(vue); }, [vue, loadSignals]);

  // Polling tant qu'un import tourne (progression + nouveaux signaux à la fin).
  const running = imports.some((i) => i.statut === 'running');
  useEffect(() => {
    if (!running) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; loadSignals(vue); } return undefined; }
    pollRef.current = setInterval(() => { loadImports(); }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [running, loadImports, loadSignals, vue]);

  const handleImport = async () => {
    try {
      setWorking('import');
      await signauxAPI.startImport({ jour, texte: showColler && texte.trim() ? texte : undefined });
      toast.success(`Import du fichier AFNIC du ${fmtDate(jour)} lancé`);
      setTexte('');
      loadImports();
    } catch (e) {
      toast.error(e.message || "Impossible de lancer l'import");
    } finally { setWorking(null); }
  };

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const promote = async (ids, thenCompose = false) => {
    if (!ids.length) return;
    try {
      setWorking('promote');
      const res = await signauxAPI.promote(ids);
      if (thenCompose && res.lead_ids && res.lead_ids[0]) {
        navigate(`/leads?lead=${res.lead_ids[0]}&compose=claude`);
        return;
      }
      toast.success(`${res.created} prospect${res.created > 1 ? 's' : ''} créé${res.created > 1 ? 's' : ''}`);
      if (res.skipped && res.skipped.length) toast.info(`${res.skipped.length} ignoré${res.skipped.length > 1 ? 's' : ''} : ${res.skipped.slice(0, 3).map((x) => `${x.domain} (${x.raison})`).join(', ')}`);
      setSelected(new Set()); loadSignals(vue);
    } catch (e) { toast.error(e.message || 'Erreur lors de la promotion'); } finally { setWorking(null); }
  };

  const recheck = async (ids) => {
    if (!ids.length) return;
    try {
      setWorking('recheck');
      const res = await signauxAPI.recheck(ids);
      toast.success(`${res.checked} domaine${res.checked > 1 ? 's' : ''} recontrôlé${res.checked > 1 ? 's' : ''}`);
      setSelected(new Set()); loadSignals(vue);
    } catch (e) { toast.error(e.message || 'Erreur lors du contrôle'); } finally { setWorking(null); }
  };

  const reject = async (ids) => {
    if (!ids.length) return;
    try {
      setWorking('reject');
      for (const id of ids) await signauxAPI.update(id, { statut: 'rejete', raison: 'écarté à la main' });
      toast.success(`${ids.length} signal${ids.length > 1 ? 'aux' : ''} écarté${ids.length > 1 ? 's' : ''}`);
      setSelected(new Set()); loadSignals(vue);
    } catch (e) { toast.error(e.message || 'Erreur'); } finally { setWorking(null); }
  };

  const restore = async (id) => {
    try { await signauxAPI.update(id, { statut: 'a_surveiller' }); toast.success('Remis en surveillance'); loadSignals(vue); } catch (e) { toast.error(e.message || 'Erreur'); }
  };

  const selectable = signals.filter((s) => s.statut !== 'promu');
  const minJour = isoDay(new Date(Date.now() - 7 * 86400000));

  return (
    <div>
      {/* Import */}
      <div className="bg-surface border border-border rounded-2xl p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiRadio size={15} /> Nouveaux domaines .fr (AFNIC)</h3>
            <p className="text-xs text-text-muted mt-1 max-w-2xl">
              L'AFNIC publie chaque jour la liste des .fr créés la veille (gratuit, en ligne sept jours). Le CRM filtre les noms, écarte ce qu'il connaît déjà,
              regarde ce que répond le domaine, cherche l'entreprise (SIRENE, avec sa date de création) et note l'intention. Rien n'entre dans les prospects sans ton clic.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mt-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Fichier du</label>
            <input type="date" value={jour} min={minJour} max={isoDay(new Date())} onChange={(e) => setJour(e.target.value)} disabled={running}
              className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50" />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2 items-center">
            <button onClick={handleImport} disabled={running || working === 'import' || busy}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
              <FiDownload size={16} /> {running ? 'Import en cours…' : 'Importer le fichier AFNIC'}
            </button>
            <button onClick={() => setShowColler((v) => !v)} className="px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm flex items-center gap-1">
              {showColler ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />} Coller la liste à la main
            </button>
            {busy && !running && <span className="text-xs text-warning-text flex items-center gap-1"><FiLoader size={12} className="animate-spin" /> Revérification en cours</span>}
          </div>
        </div>
        {showColler && (
          <div className="mt-3">
            <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} placeholder={'Un domaine par ligne (le fichier AFNIC tel quel convient : les lignes # sont ignorées).\nUtile si le téléchargement automatique échoue.'}
              className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent resize-y" />
          </div>
        )}
      </div>

      {/* Historique des imports */}
      {imports.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 mb-5">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3"><FiClock size={15} /> Imports</h3>
          <div className="space-y-2">
            {imports.slice(0, 8).map((i) => {
              const b = IMPORT_BADGE[i.statut] || IMPORT_BADGE.running;
              const pct = i.progress_total > 0 ? Math.round((i.progress_done / i.progress_total) * 100) : 0;
              return (
                <div key={i.id} className="p-3 rounded-xl border border-border bg-surface-muted/30">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">Fichier du {fmtDate(i.jour)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
                    {i.statut === 'running' && <span className="text-xs text-text-muted">{PHASES[i.phase] || i.phase}{i.phase === 'analyse' && i.progress_total > 0 ? ` ${i.progress_done}/${i.progress_total}` : ''}</span>}
                    <span className="text-xs text-text-muted ml-auto">{fmtDateTime(i.created_at)}</span>
                  </div>
                  {i.statut === 'running' && i.phase === 'analyse' && i.progress_total > 0 && (
                    <div className="mt-2 h-1.5 bg-surface-strong rounded-full overflow-hidden"><motion.div className="h-full bg-accent rounded-full" animate={{ width: `${pct}%` }} /></div>
                  )}
                  {i.statut !== 'running' && (
                    <div className="text-xs text-text-muted mt-1">
                      {i.nb_lus} lus · {i.nb_filtres} rejetés sur le nom · {i.nb_connus} déjà connus · <span className="text-text-primary">{i.nb_nouveaux} analysés</span> · <span className="text-success-text">{i.nb_qualifies} qualifiés</span>
                    </div>
                  )}
                  {i.statut === 'error' && <div className="text-xs text-danger-text mt-1 flex items-start gap-1"><FiAlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {i.message}</div>}
                  {i.statut === 'done' && i.message && <div className="text-xs text-text-muted mt-1">{i.message}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vues par statut */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {VUES.map((v) => (
          <button key={v.key} onClick={() => setVue(v.key)} title={v.hint}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${vue === v.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
            {v.label} ({counts[v.key] || 0})
          </button>
        ))}
        <span className="text-xs text-text-muted ml-1">{(VUES.find((v) => v.key === vue) || {}).hint}</span>
      </div>

      {vue !== 'promu' && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => promote([...selected])} disabled={working || selected.size === 0}
            className="px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50">
            <FiUserPlus size={15} /> Ajouter aux prospects{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <button onClick={() => recheck([...selected])} disabled={working || busy || running || selected.size === 0}
            title="Ré-analyser le site et rechercher l'entreprise maintenant"
            className="px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm flex items-center gap-1 disabled:opacity-50">
            <FiRefreshCw size={15} className={working === 'recheck' ? 'animate-spin' : ''} /> Revérifier{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          {vue !== 'rejete' && (
            <button onClick={() => reject([...selected])} disabled={working || selected.size === 0}
              className="px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm flex items-center gap-1 disabled:opacity-50">
              <FiSlash size={15} /> Écarter{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>
      ) : signals.length === 0 ? (
        <div className="text-center py-12 bg-surface/30 rounded-lg border border-border">
          <FiRadio className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-muted">{imports.length === 0 ? 'Aucun import encore. Lance le fichier d\'hier pour voir ce que la source donne.' : 'Rien dans cette vue.'}</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-left text-text-muted">
                  <th className="px-4 py-3 w-10">
                    {vue !== 'promu' && (
                      <input type="checkbox" checked={selectable.length > 0 && selectable.every((s) => selected.has(s.id))}
                        onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((s) => s.id)) : new Set())} />
                    )}
                  </th>
                  <th className="px-4 py-3">Domaine</th>
                  <th className="px-4 py-3">Entreprise</th>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Signaux</th>
                  <th className="px-4 py-3">Suivi</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {signals.map((s) => {
                    const sb = siteBadge(s.website_status);
                    const age = joursDepuis(s.company_created_at);
                    const sig = Array.isArray(s.signaux) ? s.signaux : [];
                    return (
                      <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t border-border hover:bg-surface-muted/40 align-top">
                        <td className="px-4 py-3">{s.statut !== 'promu' && <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />}</td>
                        <td className="px-4 py-3">
                          <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="text-text-primary font-medium hover:text-accent inline-flex items-center gap-1">{s.domain} <FiExternalLink size={11} /></a>
                          <div className="text-xs text-text-muted mt-0.5">créé le {fmtDate(s.registered_at)}{s.metier ? ` · ${s.metier}` : ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          {s.company_name ? (
                            <>
                              <div className="text-text-primary">{s.company_name}{s.match_confidence === 'probable' && <span className="text-xs text-text-muted"> (probable)</span>}</div>
                              <div className="text-xs text-text-muted">{[s.city, s.department ? `(${s.department})` : null, s.naf_label].filter(Boolean).join(' ')}</div>
                              {age != null && <div className={`text-xs ${age <= 90 ? 'text-success-text' : 'text-text-muted'}`}>créée il y a {age} j{s.dirigeant ? ` · ${s.dirigeant}` : ''}</div>}
                            </>
                          ) : <span className="text-xs text-text-muted">{s.match_confidence === 'douteux' ? 'Correspondance douteuse' : 'Aucune entreprise trouvée'}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.cls}`}>{sb.label}</span>
                          {s.platform && s.platform !== 'Inconnu' && <div className="text-xs text-text-muted mt-1">{s.platform}</div>}
                          {s.site_apparu_le && <div className="text-xs text-success-text mt-1">Site apparu le {fmtDate(s.site_apparu_le)}</div>}
                        </td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${scoreCls(s.intent_score || 0)}`}>{s.intent_score || 0}</span></td>
                        <td className="px-4 py-3">
                          <ul className="text-xs text-text-secondary space-y-0.5">
                            {sig.map((x, i) => <li key={i} className="flex items-start gap-1"><FiCheck size={11} className="mt-0.5 text-success-text flex-shrink-0" /> {x}</li>)}
                          </ul>
                          {s.raison_rejet && <div className="text-xs text-text-muted mt-1">Rejet : {s.raison_rejet}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-muted">
                          {s.checks || 0} contrôle{(s.checks || 0) > 1 ? 's' : ''}
                          {s.next_check_at && <div>prochain le {fmtDate(s.next_check_at)}</div>}
                          {s.prospect_id && <button onClick={() => navigate(`/leads?lead=${s.prospect_id}`)} className="text-accent hover:underline">Prospect #{s.prospect_id}</button>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {s.statut !== 'promu' && (
                            <button onClick={() => promote([s.id], true)} disabled={!!working}
                              title="Créer le prospect et ouvrir l'email (création de site, ou par la preuve si le site est en ligne)"
                              className="px-2.5 py-1 text-xs rounded-lg bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50">Prospecter</button>
                          )}
                          {s.statut === 'rejete' && (
                            <button onClick={() => restore(s.id)} className="ml-1 px-2.5 py-1 text-xs rounded-lg bg-surface-strong text-text-secondary hover:bg-border-strong">Remettre</button>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignauxPanel;
