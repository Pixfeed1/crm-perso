// src/components/settings/EmailSignaturesSettings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiTrash2, FiSave, FiEdit3, FiStar } from 'react-icons/fi';
import DOMPurify from 'dompurify';
import { emailSignaturesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const EmailSignaturesSettings = () => {
  const { toast } = useToast();
  const [signatures, setSignatures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await emailSignaturesAPI.list();
      setSignatures(data || []);
      setSelected((prev) => (prev ? (data || []).find((s) => s.id === prev.id) || null : null));
    } catch (e) { toast.error('Erreur lors du chargement des signatures'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleNew = () => setSelected({ id: null, name: 'Nouvelle signature', content: '', is_default: false });

  const handleSave = async () => {
    if (!selected || !selected.name) { toast.error('Nom requis'); return; }
    try {
      setSaving(true);
      if (selected.id) await emailSignaturesAPI.update(selected.id, selected);
      else { const created = await emailSignaturesAPI.create(selected); setSelected(created); }
      toast.success('Signature enregistrée');
      load();
    } catch (e) { toast.error('Erreur lors de l\'enregistrement'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await emailSignaturesAPI.delete(id); if (selected && selected.id === id) setSelected(null); toast.success('Signature supprimée'); load(); }
    catch (e) { toast.error('Erreur lors de la suppression'); }
  };

  const setDefault = async (s) => {
    try { await emailSignaturesAPI.update(s.id, { is_default: true }); toast.success('Signature par défaut mise à jour'); load(); }
    catch (e) { toast.error('Erreur'); }
  };

  return (
    <div className="bg-surface/30 rounded-lg border border-border p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiEdit3 size={15} /> Signatures</h3>
            <button onClick={handleNew} className="p-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white" title="Nouvelle signature"><FiPlus size={15} /></button>
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {signatures.map((s) => (
              <div key={s.id} className={`flex items-center gap-1 rounded-lg ${selected && selected.id === s.id ? 'bg-accent/15' : ''}`}>
                <button onClick={() => setSelected(s)}
                  className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${selected && selected.id === s.id ? 'text-accent' : 'text-text-secondary hover:bg-surface-strong'}`}>
                  <span className="font-medium">{s.name}</span>
                  {s.is_default && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-success-bg text-success-text">défaut</span>}
                </button>
                {!s.is_default && (
                  <button onClick={() => setDefault(s)} className="p-2 text-text-muted hover:text-warning-text" title="Définir par défaut"><FiStar size={14} /></button>
                )}
              </div>
            ))}
            {signatures.length === 0 && <p className="text-text-muted text-sm">Aucune signature.</p>}
          </div>
        </div>

        <div className="md:col-span-2">
          {selected ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Nom</label>
                <input value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Contenu HTML <span className="text-text-muted">(inclut la ligne de désinscription)</span></label>
                <textarea value={selected.content || ''} onChange={(e) => setSelected({ ...selected, content: e.target.value })} rows={8}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent resize-y font-mono text-xs" />
              </div>
              {selected.content ? (
                <div>
                  <div className="text-xs text-text-secondary mb-1">
                    Aperçu <span className="text-text-muted">(tel que le verra le destinataire)</span>
                  </div>
                  {/* Feuille BLANCHE volontaire : une signature d'email est écrite pour une
                      boîte mail (texte sombre sur fond clair). L'afficher avec les couleurs
                      du thème donnait du texte foncé sur fond foncé en mode sombre. */}
                  <div
                    className="p-3 border border-border rounded-lg text-sm overflow-x-auto"
                    style={{ background: '#ffffff', color: '#374151', colorScheme: 'light' }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content) }}
                  />
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={!!selected.is_default} onChange={(e) => setSelected({ ...selected, is_default: e.target.checked })} />
                Signature par défaut
              </label>
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
            <p className="text-text-muted text-sm">Sélectionnez une signature ou créez-en une.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailSignaturesSettings;
