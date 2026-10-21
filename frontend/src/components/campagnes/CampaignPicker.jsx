// src/components/campagnes/CampaignPicker.jsx
//
// Petite fenêtre partagée (Crawl, liste des Prospects) : choisir une campagne ouverte ou en
// créer une, puis y ajouter la sélection. Rien n'est envoyé ici : on prépare seulement.
import React, { useEffect, useState } from 'react';
import { FiX, FiSend, FiPlus } from 'react-icons/fi';
import { campagnesAPI, emailTemplatesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const CampaignPicker = ({ count, onConfirm, onClose }) => {
  const { toast } = useToast();
  const [campagnes, setCampagnes] = useState([]);
  const [choix, setChoix] = useState('new');
  const [nom, setNom] = useState(`Campagne du ${new Date().toLocaleDateString('fr-FR')}`);
  const [mode, setMode] = useState('preuve');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    campagnesAPI.list().then((l) => {
      const ouvertes = (l || []).filter((c) => ['brouillon', 'en_cours', 'pause'].includes(c.statut));
      setCampagnes(ouvertes);
      if (ouvertes[0]) setChoix(String(ouvertes[0].id));
    }).catch(() => {});
    emailTemplatesAPI.list().then((l) => setTemplates(l || [])).catch(() => {});
  }, []);

  const confirm = async () => {
    try {
      setBusy(true);
      let id = choix;
      if (choix === 'new') {
        if (mode === 'modele' && !templateId) { toast.error('Choisis un modèle'); setBusy(false); return; }
        const c = await campagnesAPI.create({ nom, mode, template_id: mode === 'modele' ? parseInt(templateId, 10) : null });
        id = c.id;
      }
      await onConfirm(Number(id));
    } catch (e) {
      toast.error(e.message || 'Impossible de préparer la campagne');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-surface-muted border border-border rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2"><FiSend /> Préparer une campagne</h3>
          <button onClick={onClose} className="p-1 rounded text-text-muted hover:text-text-primary"><FiX /></button>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          {count} prospect{count > 1 ? 's' : ''} seront ajoutés, leurs emails générés et classés. Rien ne part : tu relis et tu valides ensuite.
        </p>
        <label className="block text-sm text-text-secondary mb-1">Campagne</label>
        <select value={choix} onChange={(e) => setChoix(e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent mb-3">
          <option value="new">Nouvelle campagne…</option>
          {campagnes.map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.statut} · {c.nb_items} ligne{c.nb_items > 1 ? 's' : ''}</option>)}
        </select>
        {choix === 'new' && (
          <div className="space-y-3 mb-3">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Nom</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent">
                <option value="preuve">Preuve (repli maintenance sans alerte si aucune preuve)</option>
                <option value="maintenance">Maintenance seule (aucune alerte technique)</option>
                <option value="modele">Un modèle du menu, rempli par prospect</option>
              </select>
            </div>
            {mode === 'modele' && (
              <div>
                <label className="block text-sm text-text-secondary mb-1">Modèle</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent">
                  <option value="">Choisir…</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p className="text-xs text-text-muted mt-1">Variables : {'{prenom}'} (civilité sûre ou « Bonjour »), {'{site}'}, {'{plateforme}'}, {'{constat}'} (preuve retenue), {'{expediteur}'}, {'{entreprise}'}.</p>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong text-sm">Annuler</button>
          <button onClick={confirm} disabled={busy} className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-1.5 disabled:opacity-50">
            <FiPlus size={14} /> {busy ? 'Préparation…' : 'Préparer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CampaignPicker;
