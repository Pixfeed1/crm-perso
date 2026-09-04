// src/components/seo/SiteManager.jsx
//
// Gestion des sites SEO depuis l'UI. Avant : les sites étaient codés en dur dans
// seo_worker/config.py, donc ajouter un site = modifier le code et redéployer. La table
// seo_sites est désormais la source unique : le worker la lit à chaque job.
// Suppression = perte de TOUTES les données du site (pages, liens, GSC, audits, indexation,
// PageSpeed : FK ON DELETE CASCADE) ; on exige la saisie du domaine pour confirmer.
// Charte : tokens de thème, react-icons, framer-motion, aucune couleur en dur.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiPlus, FiEdit3, FiTrash2, FiCheck, FiGlobe, FiAlertTriangle } from 'react-icons/fi';
import { seoAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const EMPTY = { domain: '', wp_base_url: '', gsc_property: '', ga_property_id: '' };

const Field = ({ label, hint, ...props }) => (
  <label className="block">
    <span className="text-xs text-text-muted">{label}</span>
    <input {...props} className="mt-0.5 w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent" />
    {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
  </label>
);

const SiteManager = ({ sites, onClose, onChange }) => {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // id en édition
  const [editForm, setEditForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null); // site en attente de confirmation
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.domain.trim()) return;
    setBusy(true);
    try {
      await seoAPI.createSite(form);
      toast.success(`Site ${form.domain} ajouté`);
      setForm(EMPTY);
      onChange();
    } catch (e) { toast.error(e.message || 'Ajout impossible'); } finally { setBusy(false); }
  };

  const startEdit = (s) => { setEditing(s.id); setEditForm({ domain: s.domain, wp_base_url: s.wp_base_url || '', gsc_property: s.gsc_property || '', ga_property_id: s.ga_property_id || '' }); };
  const saveEdit = async () => {
    setBusy(true);
    try {
      await seoAPI.updateSite(editing, editForm);
      toast.success('Site mis à jour');
      setEditing(null);
      onChange();
    } catch (e) { toast.error(e.message || 'Mise à jour impossible'); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting || confirmText.trim().toLowerCase() !== deleting.domain) return;
    setBusy(true);
    try {
      await seoAPI.deleteSite(deleting.id);
      toast.success(`Site ${deleting.domain} supprimé`);
      setDeleting(null); setConfirmText('');
      onChange();
    } catch (e) { toast.error(e.message || 'Suppression impossible'); } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-overlay/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="bg-surface-muted border border-border rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0"><FiGlobe size={18} /></div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Sites suivis</h3>
              <p className="text-text-muted text-xs">Le worker lit cette liste à chaque tâche : aucun redéploiement nécessaire. Une seule connexion Search Console sert tous les sites.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong"><FiX size={18} /></button>
        </div>

        {/* Liste */}
        <ul className="divide-y divide-border/50 border border-border rounded-xl overflow-hidden mb-4">
          {sites.length === 0 && <li className="px-4 py-3 text-sm text-text-muted">Aucun site pour l'instant.</li>}
          {sites.map((s) => (
            <li key={s.id} className="px-4 py-3">
              {editing === s.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label="Domaine" value={editForm.domain} onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })} />
                    <Field label="URL WordPress" value={editForm.wp_base_url} onChange={(e) => setEditForm({ ...editForm, wp_base_url: e.target.value })} />
                    <Field label="Propriété Search Console" value={editForm.gsc_property} onChange={(e) => setEditForm({ ...editForm, gsc_property: e.target.value })} />
                    <Field label="Propriété Google Analytics 4 (ID)" placeholder="123456789" value={editForm.ga_property_id} onChange={(e) => setEditForm({ ...editForm, ga_property_id: e.target.value })} hint="Analytics > Admin > Paramètres de la propriété > ID de propriété" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm border border-border rounded-lg text-text-primary hover:bg-surface-strong">Annuler</button>
                    <button onClick={saveEdit} disabled={busy} className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg inline-flex items-center gap-1 disabled:opacity-50"><FiCheck size={14} /> Enregistrer</button>
                  </div>
                </div>
              ) : deleting && deleting.id === s.id ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm bg-danger-bg text-danger-text border border-danger-text/30 rounded-lg p-3">
                    <FiAlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                    <span>Supprimer <strong>{s.domain}</strong> efface toutes ses données SEO (pages, liens, historique Search Console, audits, indexation, PageSpeed). Irréversible. Tapez le domaine pour confirmer.</span>
                  </div>
                  <div className="flex gap-2">
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={s.domain}
                      className="flex-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-danger-text" />
                    <button onClick={() => { setDeleting(null); setConfirmText(''); }} className="px-3 py-1.5 text-sm border border-border rounded-lg text-text-primary hover:bg-surface-strong">Annuler</button>
                    <button onClick={remove} disabled={busy || confirmText.trim().toLowerCase() !== s.domain}
                      className="px-3 py-1.5 text-sm bg-danger-bg text-danger-text border border-danger-text/30 rounded-lg inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"><FiTrash2 size={14} /> Supprimer</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-primary">{s.domain}</div>
                    <div className="text-xs text-text-muted truncate">{s.wp_base_url} · {s.gsc_property}{s.ga_property_id ? ` · GA4 ${s.ga_property_id}` : ' · GA4 non renseignée'}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(s)} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Modifier"><FiEdit3 size={15} /></button>
                    <button onClick={() => { setDeleting(s); setConfirmText(''); }} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-danger-bg" title="Supprimer"><FiTrash2 size={15} /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* Ajout */}
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-text-primary inline-flex items-center gap-2"><FiPlus size={14} /> Ajouter un site</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Domaine *" placeholder="exemple.fr" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            <Field label="URL WordPress" placeholder={`https://${form.domain || 'exemple.fr'}`} value={form.wp_base_url} onChange={(e) => setForm({ ...form, wp_base_url: e.target.value })} hint="vide = https://domaine" />
            <Field label="Propriété Search Console" placeholder={`sc-domain:${form.domain || 'exemple.fr'}`} value={form.gsc_property} onChange={(e) => setForm({ ...form, gsc_property: e.target.value })} hint="vide = sc-domain:domaine" />
            <Field label="Propriété Google Analytics 4 (ID)" placeholder="123456789" value={form.ga_property_id} onChange={(e) => setForm({ ...form, ga_property_id: e.target.value })} hint="facultatif · Analytics > Admin > Paramètres de la propriété > ID" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-text-muted">Le site doit exposer l'API REST WordPress et le snippet SEO de functions.php (voir seo_worker/README.md). Puis lancer un crawl.</p>
            <button onClick={create} disabled={busy || !form.domain.trim()} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><FiPlus size={14} /> Ajouter</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SiteManager;
