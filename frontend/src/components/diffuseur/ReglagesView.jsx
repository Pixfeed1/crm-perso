// Diffuseur : réglages. Hashtags de base, tableau Pinterest, heures de publication et en-têtes
// des modèles d'import (collez la ligne d'en-tête du modèle téléchargé depuis votre compte).
import React, { useEffect, useState } from 'react';
import { FiSave, FiLoader } from 'react-icons/fi';
import { diffuseurAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { PLATEFORMES, ORDRE_PLATEFORMES, champ, boutonPrincipal } from './constants';

const ENTETES = { pinterest: 'Pinterest', meta: 'Meta Business Suite', x: 'X' };

const ReglagesView = () => {
  const { toast } = useToast();
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    diffuseurAPI.getReglages().then((r) => setF({
      hashtags_fr: r.hashtags_fr || '', hashtags_en: r.hashtags_en || '', tableau_pinterest: r.tableau_pinterest || '',
      heures: r.heures, entetes: Object.fromEntries(Object.keys(ENTETES).map((k) => [k, (r.entetes[k] || []).join(', ')]))
    })).catch((e) => toast.error(e.message || 'Chargement impossible'));
  }, [toast]);

  if (!f) return <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>;

  const enregistrer = async () => {
    setSaving(true);
    try { await diffuseurAPI.updateReglages(f); toast.success('Réglages enregistrés'); }
    catch (e) { toast.error(e.message || 'Enregistrement refusé'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="block text-xs text-text-muted mb-1">Hashtags de base en français (sans #, séparés par des virgules)</label><input value={f.hashtags_fr} onChange={(e) => setF({ ...f, hashtags_fr: e.target.value })} className={champ} /></div>
        <div><label className="block text-xs text-text-muted mb-1">Hashtags de base en anglais</label><input value={f.hashtags_en} onChange={(e) => setF({ ...f, hashtags_en: e.target.value })} className={champ} /></div>
        <div><label className="block text-xs text-text-muted mb-1">Tableau Pinterest par défaut</label><input value={f.tableau_pinterest} onChange={(e) => setF({ ...f, tableau_pinterest: e.target.value })} className={champ} /></div>
      </div>
      <p className="text-xs text-text-muted">Les hashtags de base complètent ceux proposés par Claude : 5 au plus sur Instagram, 3 sur Facebook, 2 sur X et Bluesky, aucun sur Pinterest qui utilise des mots-clés.</p>
      <div>
        <div className="text-xs text-text-muted mb-1">Heure de publication par plateforme (heure de Paris)</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {ORDRE_PLATEFORMES.map((p) => (
            <label key={p} className="text-xs text-text-secondary">{PLATEFORMES[p].label}
              <input type="time" value={f.heures[p] || ''} onChange={(e) => setF({ ...f, heures: { ...f.heures, [p]: e.target.value } })} className={champ} />
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs text-text-muted">Colonnes des exports. Téléchargez le modèle d'import vierge depuis l'outil concerné, ouvrez-le et collez ici sa ligne d'en-tête : l'export suivra exactement ces colonnes. Les colonnes inconnues restent vides.</div>
        {Object.entries(ENTETES).map(([k, label]) => (
          <div key={k}><label className="block text-xs text-text-muted mb-1">{label}</label><input value={f.entetes[k]} onChange={(e) => setF({ ...f, entetes: { ...f.entetes, [k]: e.target.value } })} className={champ} /></div>
        ))}
      </div>
      <div className="flex justify-end"><button onClick={enregistrer} disabled={saving} className={boutonPrincipal}><FiSave size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </div>
  );
};

export default ReglagesView;
