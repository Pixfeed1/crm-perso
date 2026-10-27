// Diffuseur : une scène. Informations, assets et liens affiliés, envoi des rendus, point
// d'intérêt du recadrage Instagram, image principale, asset principal, rédaction des textes.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiUpload, FiTrash2, FiPlus, FiEdit3, FiLoader, FiCheck, FiAlertTriangle, FiSave, FiStar } from 'react-icons/fi';
import { diffuseurAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { champ, bouton, boutonPrincipal } from './constants';

const ImageCard = ({ image, assets, onChange, onDelete, onRediger, enCours }) => {
  const [v, setV] = useState(0);
  const cliquer = async (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    await onChange(image.id, { focal_x: x, focal_y: y });
    setV(Date.now());
  };
  return (
    <div className="border border-border rounded-xl bg-surface-muted/30 p-3">
      <div className="flex gap-3">
        <div className="relative w-36 flex-shrink-0 cursor-crosshair" onClick={cliquer} title="Cliquez sur le sujet : le recadrage Instagram se centre dessus">
          <img src={image.url} alt="" className="w-full rounded-lg" loading="lazy" />
          <span className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white bg-accent/70 pointer-events-none"
            style={{ left: `${image.focal_x * 100}%`, top: `${image.focal_y * 100}%` }} />
        </div>
        <div className="w-28 flex-shrink-0">
          <img src={`${image.url_instagram}?v=${v}`} alt="" className="w-full rounded-lg" loading="lazy" />
          <div className="text-[11px] text-text-muted mt-1 text-center">Instagram 4:5</div>
        </div>
        <div className="flex-1 min-w-0 space-y-2 text-sm">
          <div className="text-text-secondary truncate" title={image.nom_original}>{image.nom_original || `Image ${image.ordre}`}</div>
          <label className="flex items-center gap-2 text-text-secondary">
            <input type="checkbox" checked={!!image.principale} onChange={(e) => onChange(image.id, { principale: e.target.checked })} className="accent-accent" />
            <FiStar size={13} /> Image principale (renvoie vers l'article)
          </label>
          <div>
            <label className="block text-xs text-text-muted mb-1">Asset principal visible (son lien affilié)</label>
            <select value={image.asset_id || ''} onChange={(e) => onChange(image.id, { asset_id: e.target.value || null })} className={champ}>
              <option value="">Aucun</option>
              {assets.filter((a) => a.id).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </div>
          <div className="text-xs">
            {image.textes_le
              ? <span className="text-success-text flex items-center gap-1"><FiCheck size={12} /> Textes rédigés</span>
              : <span className="text-warning-text">Textes pas encore rédigés</span>}
            {image.description && <div className="text-text-muted mt-1">{image.description}</div>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => onRediger(image.id)} disabled={enCours} className={bouton}>
              {enCours ? <FiLoader size={13} className="animate-spin" /> : <FiEdit3 size={13} />} {image.textes_le ? 'Réécrire les textes' : 'Rédiger les textes'}
            </button>
            <button onClick={() => onDelete(image.id)} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Supprimer l'image"><FiTrash2 size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SceneView = ({ sceneId, onBack, onDeleted }) => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [assets, setAssets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [redaction, setRedaction] = useState({ enCours: null, fait: 0, total: 0, erreurs: [] });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await diffuseurAPI.getScene(sceneId);
      setData(d);
      setForm({ nom: d.scene.nom || '', article_url: d.scene.article_url || '', tableau_pinterest: d.scene.tableau_pinterest || '', notes: d.scene.notes || '', sensible: !!d.scene.sensible });
      setAssets(d.assets.map((a) => ({ id: a.id, nom: a.nom, url_affilie: a.url_affilie || '' })));
    } catch (e) { toast.error(e.message || 'Scène introuvable'); onBack(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);
  useEffect(() => { load(); }, [load]);

  if (!data || !form) return <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>;

  const enregistrer = async () => {
    if (form.sensible && !data.scene.sensible && !window.confirm('Scène sensible : ses publications Instagram, Facebook, Pinterest et Bluesky seront supprimées. Seul X reste, à publier à la main. Continuer ?')) return;
    setSaving(true);
    try { const d = await diffuseurAPI.updateScene(sceneId, { ...form, assets }); setData(d); setAssets(d.assets.map((a) => ({ id: a.id, nom: a.nom, url_affilie: a.url_affilie || '' }))); toast.success('Scène enregistrée'); }
    catch (e) { toast.error(e.message || 'Enregistrement refusé'); }
    finally { setSaving(false); }
  };

  const envoyer = async (files) => {
    if (!files || !files.length) return;
    setEnvoi(true);
    try {
      const r = await diffuseurAPI.uploadImages(sceneId, files);
      if (r.ajoutees.length) toast.success(`${r.ajoutees.length} image${r.ajoutees.length > 1 ? 's' : ''} ajoutée${r.ajoutees.length > 1 ? 's' : ''}`);
      r.echecs.forEach((e) => toast.error(`${e.fichier} : ${e.raison}`));
      await load();
    } catch (e) { toast.error(e.message || 'Envoi impossible'); }
    finally { setEnvoi(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const changerImage = async (imageId, payload) => {
    try {
      const im = await diffuseurAPI.updateImage(imageId, payload);
      setData((d) => ({ ...d, images: d.images.map((x) => (x.id === im.id ? im : x)) }));
    } catch (e) { toast.error(e.message || 'Modification refusée'); }
  };
  const supprimerImage = async (imageId) => {
    if (!window.confirm('Supprimer cette image, ses copies et ses publications ?')) return;
    try { await diffuseurAPI.deleteImage(imageId); await load(); } catch (e) { toast.error(e.message || 'Suppression refusée'); }
  };

  // Rédaction image par image : chaque appel prend quelques secondes, l'écran suit l'avancement.
  const rediger = async (ids) => {
    setRedaction({ enCours: ids[0], fait: 0, total: ids.length, erreurs: [] });
    const erreurs = [];
    for (let i = 0; i < ids.length; i++) {
      setRedaction((r) => ({ ...r, enCours: ids[i], fait: i }));
      try { await diffuseurAPI.genererTextes(ids[i]); } catch (e) { erreurs.push(`Image ${i + 1} : ${e.message}`); }
    }
    setRedaction({ enCours: null, fait: ids.length, total: ids.length, erreurs });
    if (erreurs.length) toast.error(`${erreurs.length} image${erreurs.length > 1 ? 's' : ''} sans texte : voir le détail`);
    else toast.success('Textes rédigés : relisez-les dans Publications');
    await load();
  };
  const sansTexte = data.images.filter((im) => !im.textes_le).map((im) => im.id);

  const supprimerScene = async () => {
    if (!window.confirm(`Supprimer la scène « ${data.scene.nom} », ses ${data.images.length} images et toutes ses publications ?`)) return;
    try { await diffuseurAPI.deleteScene(sceneId); toast.success('Scène supprimée'); onDeleted(); } catch (e) { toast.error(e.message || 'Suppression refusée'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong"><FiArrowLeft size={18} /></button>
        <h2 className="text-lg font-semibold text-text-primary flex-1 truncate">{data.scene.nom}</h2>
        <button onClick={supprimerScene} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Supprimer la scène"><FiTrash2 size={16} /></button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs text-text-muted mb-1">Nom de la scène</label><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className={champ} /></div>
          <div><label className="block text-xs text-text-muted mb-1">Article jurojin.net (facultatif)</label><input value={form.article_url} onChange={(e) => setForm({ ...form, article_url: e.target.value })} placeholder="https://jurojin.net/…" className={champ} /></div>
          <div><label className="block text-xs text-text-muted mb-1">Tableau Pinterest (sinon celui des réglages)</label><input value={form.tableau_pinterest} onChange={(e) => setForm({ ...form, tableau_pinterest: e.target.value })} className={champ} /></div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={form.sensible} onChange={(e) => setForm({ ...form, sensible: e.target.checked })} className="accent-accent" />
              Scène sensible : seulement X, à publier à la main
            </label>
          </div>
        </div>
        <div><label className="block text-xs text-text-muted mb-1">Notes pour la rédaction (facultatif)</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={champ} placeholder="Contexte, intention, ambiance recherchée…" /></div>
        <div>
          <div className="text-xs text-text-muted mb-1">Assets Daz utilisés et leur lien affilié CJ</div>
          <div className="space-y-2">
            {assets.map((a, i) => (
              <div key={a.id || `n${i}`} className="flex gap-2">
                <input value={a.nom} onChange={(e) => setAssets(assets.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} placeholder="Nom de l'asset" className={`${champ} sm:w-1/3`} />
                <input value={a.url_affilie} onChange={(e) => setAssets(assets.map((x, j) => (j === i ? { ...x, url_affilie: e.target.value } : x)))} placeholder="Lien affilié CJ" className={champ} />
                <button onClick={() => setAssets(assets.filter((_, j) => j !== i))} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong"><FiTrash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => setAssets([...assets, { id: null, nom: '', url_affilie: '' }])} className={bouton}><FiPlus size={14} /> Ajouter un asset</button>
          </div>
        </div>
        <div className="flex justify-end"><button onClick={enregistrer} disabled={saving} className={boutonPrincipal}><FiSave size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer la scène'}</button></div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-text-primary flex-1">Rendus ({data.images.length})</h3>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/tiff" multiple className="hidden" onChange={(e) => envoyer(e.target.files)} />
          <button onClick={() => fileRef.current && fileRef.current.click()} disabled={envoi} className={bouton}>
            {envoi ? <FiLoader size={14} className="animate-spin" /> : <FiUpload size={14} />} {envoi ? 'Envoi et traitement…' : 'Envoyer des rendus'}
          </button>
          {data.images.length > 0 && (
            <button onClick={() => rediger(sansTexte.length ? sansTexte : data.images.map((im) => im.id))} disabled={!!redaction.enCours} className={boutonPrincipal}>
              <FiEdit3 size={14} /> {sansTexte.length ? `Rédiger les textes (${sansTexte.length})` : 'Tout réécrire'}
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted mb-3">PNG, JPEG, WebP ou TIFF, 50 Mo au maximum par image. L'original reste privé sur le serveur ; les copies diffusées sont des JPEG sans métadonnées servis par media.jurojin.net. Cliquez sur le sujet d'une image pour recentrer son recadrage Instagram.</p>
        {redaction.total > 0 && (
          <div className="mb-3 text-sm text-text-secondary">
            {redaction.enCours ? <><FiLoader className="inline animate-spin mr-1" /> Rédaction {redaction.fait + 1} sur {redaction.total}…</> : `Rédaction terminée : ${redaction.total - redaction.erreurs.length} sur ${redaction.total}.`}
            {redaction.erreurs.map((e) => <div key={e} className="text-danger-text text-xs flex items-center gap-1"><FiAlertTriangle size={12} /> {e}</div>)}
          </div>
        )}
        {data.images.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">Aucun rendu. Envoyez les 7 ou 8 images de la scène.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.images.map((im) => <ImageCard key={im.id} image={im} assets={data.assets} onChange={changerImage} onDelete={supprimerImage} onRediger={(id) => rediger([id])} enCours={redaction.enCours === im.id} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default SceneView;
