// src/components/settings/EmailTemplatesSettings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiTrash2, FiSave, FiMail } from 'react-icons/fi';
import { emailTemplatesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const CATEGORIES = ['contact', 'relance', 'cloture', 'interesse', 'presta', 'woo', 'autre'];

const EmailTemplatesSettings = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await emailTemplatesAPI.list();
      setTemplates(data || []);
      setSelected((prev) => (prev ? (data || []).find((t) => t.id === prev.id) || null : null));
    } catch (e) { toast.error('Erreur lors du chargement des modèles'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleNew = () => setSelected({ id: null, name: 'Nouveau modèle', category: 'autre', subject: '', body: '' });

  const handleSave = async () => {
    if (!selected || !selected.name) { toast.error('Nom requis'); return; }
    try {
      setSaving(true);
      if (selected.id) await emailTemplatesAPI.update(selected.id, selected);
      else { const created = await emailTemplatesAPI.create(selected); setSelected(created); }
      toast.success('Modèle enregistré');
      load();
    } catch (e) { toast.error('Erreur lors de l\'enregistrement'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await emailTemplatesAPI.delete(id); if (selected && selected.id === id) setSelected(null); toast.success('Modèle supprimé'); load(); }
    catch (e) { toast.error('Erreur lors de la suppression'); }
  };

  return (
    <div className="bg-surface/30 rounded-lg border border-border p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Liste */}
        <div className="md:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiMail size={15} /> Modèles</h3>
            <button onClick={handleNew} className="p-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white" title="Nouveau modèle"><FiPlus size={15} /></button>
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setSelected(t)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selected && selected.id === t.id ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-strong'}`}>
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-xs text-text-muted">{t.category}</div>
              </button>
            ))}
            {templates.length === 0 && <p className="text-text-muted text-sm">Aucun modèle.</p>}
          </div>
        </div>

        {/* Édition */}
        <div className="md:col-span-2">
          {selected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Nom</label>
                  <input value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Catégorie</label>
                  <select value={selected.category} onChange={(e) => setSelected({ ...selected, category: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Objet</label>
                <input value={selected.subject || ''} onChange={(e) => setSelected({ ...selected, subject: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Corps <span className="text-text-muted">(variables : {'{prenom}'} {'{site}'} {'{plateforme}'} {'{constat}'})</span></label>
                <textarea value={selected.body || ''} onChange={(e) => setSelected({ ...selected, body: e.target.value })} rows={12}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent resize-y" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50">
                  <FiSave size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {selected.id && (
                  <button onClick={() => handleDelete(selected.id)}
                    className="px-4 py-2 border-2 border-border text-text-primary hover:bg-surface-strong rounded-lg text-sm flex items-center gap-1">
                    <FiTrash2 size={15} /> Supprimer
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-text-muted text-sm">Sélectionnez un modèle ou créez-en un.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailTemplatesSettings;
