// src/components/seo/TargetSheet.jsx
//
// Fiche d'une cible de netlinking : ce qui décide vraiment d'une demande de lien.
//  - le rel PAR EMPLACEMENT (corps d'article, bloc sources, blogroll, commentaires, forum…),
//    lu automatiquement ou saisi à la main, avec l'URL exacte de la lecture ;
//  - la plateforme détectée et la règle appliquée (Forumactif → nofollow, Shaarli → dofollow…) ;
//  - la porte d'entrée (email, formulaire, compte à créer, réseau social, commentaire) ;
//  - le marquage concurrent (décision humaine, ou « probable » détecté automatiquement).
// Charte : tokens de thème, react-icons, aucune couleur en dur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiRefreshCw, FiLoader, FiTrash2, FiPlus, FiExternalLink, FiCheck, FiSlash, FiAlertTriangle, FiSave } from 'react-icons/fi';
import { seoBacklinksAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const EMPLACEMENTS = [
  ['article', "Corps d'article"], ['sources', 'Bloc sources / références'], ['blogroll', 'Blogroll / barre latérale'],
  ['commentaire', 'Commentaires'], ['forum_message', 'Message de forum'], ['partenaires', 'Partenaires'],
  ['profil', 'Profil / signature'], ['pied', 'Pied de page'], ['autre', 'Autre']
];
const EMP_LABEL = Object.fromEntries(EMPLACEMENTS);
const PORTES = [
  ['', 'Non renseignée'], ['email', 'Email'], ['formulaire', 'Formulaire de contact'], ['compte', 'Compte à créer'],
  ['reseau', 'Réseau social'], ['commentaire', 'Commentaire'], ['aucune', 'Aucune porte trouvée']
];
const SOURCE_LABEL = { manuel: 'saisie', auto: 'lecture auto', regle: 'règle plateforme', mcp: 'Claude' };

const Spinner = ({ size = 14 }) => (
  <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex">
    <FiLoader size={size} />
  </motion.span>
);

const inputCls = 'w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent';

const TargetSheet = ({ targetId, onClose, onChanged }) => {
  const { toast } = useToast();
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spotForm, setSpotForm] = useState({ emplacement: 'article', url: '', rel: '', note: '' });
  const [addingSpot, setAddingSpot] = useState(false);
  const [form, setForm] = useState({ porte_type: '', porte_url: '', porte_note: '', concurrent: false, concurrent_motif: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await seoBacklinksAPI.getTarget(targetId);
      setT(data);
      setForm({
        porte_type: data.porte_type || '', porte_url: data.porte_url || '', porte_note: data.porte_note || '',
        concurrent: !!data.concurrent, concurrent_motif: data.concurrent_motif || '', notes: data.notes || ''
      });
    } catch (e) {
      toast.error('Fiche introuvable');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [targetId, toast, onClose]);

  useEffect(() => { load(); }, [load]);

  const notify = () => { if (onChanged) onChanged(); };

  const autoCheck = async () => {
    setChecking(true);
    try {
      const r = await seoBacklinksAPI.relCheckTarget(targetId);
      if (r.ok) toast.success(`${r.spots} emplacement(s) lu(s)${r.platform ? ` · plateforme ${r.platform}` : ''}`);
      else toast.error(`Site injoignable (${r.error || 'erreur'})`);
      await load(); notify();
    } catch (e) {
      toast.error(e.message || 'Vérification impossible');
    } finally {
      setChecking(false);
    }
  };

  const addSpot = async () => {
    setAddingSpot(true);
    try {
      await seoBacklinksAPI.addSpot(targetId, spotForm);
      setSpotForm({ emplacement: 'article', url: '', rel: '', note: '' });
      toast.success('Emplacement enregistré');
      await load(); notify();
    } catch (e) {
      toast.error(e.message || 'Enregistrement impossible');
    } finally {
      setAddingSpot(false);
    }
  };

  const removeSpot = async (s) => {
    try {
      await seoBacklinksAPI.deleteSpot(s.id);
      await load(); notify();
    } catch (e) { toast.error('Suppression impossible'); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await seoBacklinksAPI.updateTarget(targetId, {
        porte_type: form.porte_type, porte_url: form.porte_url, porte_note: form.porte_note,
        concurrent: form.concurrent, concurrent_motif: form.concurrent_motif, notes: form.notes
      });
      toast.success('Fiche enregistrée');
      await load(); notify();
    } catch (e) {
      toast.error(e.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const dofollowBadge = (val) => val === true
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success-text font-medium inline-flex items-center gap-1"><FiCheck size={11} /> dofollow possible</span>
    : val === false
      ? <span className="text-xs px-2 py-0.5 rounded-full bg-danger-bg text-danger-text font-medium inline-flex items-center gap-1"><FiSlash size={11} /> tout bloqué</span>
      : <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text font-medium">rel non vérifié</span>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="panel-bg border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-border sticky top-0 panel-bg z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text-primary truncate">
              {t ? (
                <a href={`https://${t.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent inline-flex items-center gap-1">
                  {t.domain} <FiExternalLink size={13} className="opacity-50" />
                </a>
              ) : 'Fiche cible'}
            </h2>
            {t && t.title && <p className="text-xs text-text-muted truncate">{t.title}</p>}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><FiX size={20} /></button>
        </div>

        {loading || !t ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm py-12 justify-center"><Spinner size={18} /> Chargement…</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Synthèse */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {dofollowBadge(t.dofollow)}
              {t.platform && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-info-bg text-info-text font-medium" title={t.platform_rule_note || 'Plateforme détectée'}>
                  {t.platform}
                </span>
              )}
              {t.score_detail && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.score_detail.partiel ? 'bg-warning-bg text-warning-text' : 'bg-neutral-bg text-neutral-text'}`}
                  title={t.score_detail.manquants && t.score_detail.manquants.length ? `Non mesuré : ${t.score_detail.manquants.join(' ; ')}` : ''}>
                  score {t.score ?? '—'} · {t.score_detail.libelle}
                </span>
              )}
              {(t.concurrent || t.concurrent_probable) && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-danger-bg text-danger-text font-medium inline-flex items-center gap-1" title={t.concurrent_motif || ''}>
                  <FiAlertTriangle size={11} /> {t.concurrent ? 'concurrent' : 'concurrent probable'}
                </span>
              )}
              {t.rel_verifie_le && <span className="text-xs text-text-muted">rel vérifié le {new Date(t.rel_verifie_le).toLocaleDateString('fr-FR')}</span>}
            </div>
            {t.platform_rule_note && (
              <p className="text-xs text-text-secondary bg-surface-muted/40 border border-border rounded-lg px-3 py-2">Règle appliquée : {t.platform_rule_note}</p>
            )}
            {t.concurrent_motif && !t.concurrent && t.concurrent_probable && (
              <p className="text-xs text-warning-text">Détection automatique : {t.concurrent_motif}. Confirme ou infirme ci-dessous.</p>
            )}

            {/* Emplacements */}
            <section>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h3 className="font-semibold text-text-primary">Rel par emplacement</h3>
                <button onClick={autoCheck} disabled={checking}
                  className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                  title="Lit l'accueil et quelques articles, détecte la plateforme, applique la règle connue">
                  {checking ? <Spinner /> : <FiRefreshCw size={14} />} Lire automatiquement
                </button>
              </div>
              {t.spots.length === 0 ? (
                <p className="text-sm text-text-muted">Aucune lecture. Lance la lecture automatique ou saisis ce que tu as vu dans le DOM.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-border">
                        <th className="px-2 py-1.5">Emplacement</th>
                        <th className="px-2 py-1.5">rel lu</th>
                        <th className="px-2 py-1.5">Verdict</th>
                        <th className="px-2 py-1.5">Page</th>
                        <th className="px-2 py-1.5">Source</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.spots.map((s) => (
                        <tr key={s.id} className="border-b border-border/50">
                          <td className="px-2 py-1.5 text-text-primary">{EMP_LABEL[s.emplacement] || s.emplacement}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-text-secondary">{s.rel || <span className="text-text-muted">aucun</span>}</td>
                          <td className="px-2 py-1.5">{s.dofollow ? <span className="text-success-text inline-flex items-center gap-1"><FiCheck size={12} /> dofollow</span> : <span className="text-danger-text inline-flex items-center gap-1"><FiSlash size={12} /> bloqué</span>}</td>
                          <td className="px-2 py-1.5 max-w-[220px] truncate">
                            {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-accent text-xs" title={s.url}>{s.url.replace(/^https?:\/\/(www\.)?/, '')}</a> : <span className="text-text-muted text-xs">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-text-muted" title={s.note || ''}>{SOURCE_LABEL[s.source] || s.source}</td>
                          <td className="px-2 py-1.5 text-right">
                            <button onClick={() => removeSpot(s)} className="p-1 rounded text-text-muted hover:text-danger-text" title="Supprimer cette lecture"><FiTrash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-3">
                  <label className="block text-xs text-text-muted mb-1">Emplacement</label>
                  <select value={spotForm.emplacement} onChange={(e) => setSpotForm((p) => ({ ...p, emplacement: e.target.value }))} className={inputCls}>
                    {EMPLACEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs text-text-muted mb-1">rel lu (vide = aucun)</label>
                  <input value={spotForm.rel} onChange={(e) => setSpotForm((p) => ({ ...p, rel: e.target.value }))} placeholder="nofollow ugc" className={inputCls} />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs text-text-muted mb-1">URL exacte de la lecture</label>
                  <input value={spotForm.url} onChange={(e) => setSpotForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://…" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <button onClick={addSpot} disabled={addingSpot} className="w-full px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {addingSpot ? <Spinner /> : <FiPlus size={14} />} Ajouter
                  </button>
                </div>
              </div>
            </section>

            {/* Porte d'entrée */}
            <section>
              <h3 className="font-semibold text-text-primary mb-2">Porte d'entrée</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Type</label>
                  <select value={form.porte_type} onChange={(e) => setForm((p) => ({ ...p, porte_type: e.target.value }))} className={inputCls}>
                    {PORTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">URL de la porte</label>
                  <input value={form.porte_url} onChange={(e) => setForm((p) => ({ ...p, porte_url: e.target.value }))} placeholder="https://…/contact" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-text-muted mb-1">Contrainte à connaître (case à cocher, reCAPTCHA, limite de caractères…)</label>
                  <input value={form.porte_note} onChange={(e) => setForm((p) => ({ ...p, porte_note: e.target.value }))} className={inputCls} />
                </div>
              </div>
              {t.contact_email && <p className="text-xs text-text-muted mt-1">Email détecté : {t.contact_email}</p>}
            </section>

            {/* Concurrent + notes */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 text-sm text-text-primary mb-2">
                  <input type="checkbox" checked={form.concurrent} onChange={(e) => setForm((p) => ({ ...p, concurrent: e.target.checked }))} className="accent-accent" />
                  Concurrent (mêmes contenus sur les mêmes requêtes : pas une cible)
                </label>
                <input value={form.concurrent_motif} onChange={(e) => setForm((p) => ({ ...p, concurrent_motif: e.target.value }))} placeholder="Motif" className={inputCls} disabled={!form.concurrent} />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className={`${inputCls} resize-y`} />
              </div>
            </section>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-secondary hover:bg-surface-strong text-sm">Fermer</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Spinner /> : <FiSave size={14} />} Enregistrer la fiche
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default TargetSheet;
