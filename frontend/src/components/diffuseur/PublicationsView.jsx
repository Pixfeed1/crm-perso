// Diffuseur : calendrier et validation. Planifier une image par jour sur 30 jours, relire chaque
// publication (image, plateforme, texte, lien, date), la modifier, la valider ou la rejeter, puis
// exporter les publications validées pour Pinterest, Meta Business Suite et X.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiCheck, FiX, FiSave, FiDownload, FiLoader, FiRotateCcw, FiExternalLink } from 'react-icons/fi';
import { diffuseurAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { PLATEFORMES, ORDRE_PLATEFORMES, STATUTS, BLUESKY, LANGUES, LIENS, fmtDate, demain, champ, bouton, boutonPrincipal } from './constants';

const badge = (map, k) => map[k] || { label: k, cls: 'bg-neutral-bg text-neutral-text' };

const PostCard = ({ post, selected, onToggle, onSave }) => {
  const initial = useMemo(() => ({
    texte_fr: post.texte_fr || '', texte_en: post.texte_en || '', titre_fr: post.titre_fr || '', titre_en: post.titre_en || '',
    langue: post.langue, lien_type: post.lien_type, date_prevue: post.date_prevue || '', heure: post.heure || ''
  }), [post]);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(initial); }, [initial]);
  const dirty = Object.keys(f).some((k) => f[k] !== initial[k]);
  const publie = post.bluesky_etat === 'publie';
  const pl = badge(PLATEFORMES, post.plateforme);
  const st = badge(STATUTS, post.statut);
  const agir = async (statut) => {
    setBusy(true);
    try {
      const payload = dirty ? { ...f, date_prevue: f.date_prevue || null } : {};
      if (statut) payload.statut = statut;
      await onSave(post.id, payload);
    } finally { setBusy(false); }
  };
  const langues = f.langue === 'fr' ? ['fr'] : f.langue === 'en' ? ['en'] : ['fr', 'en'];
  return (
    <div className={`border rounded-xl p-3 ${post.statut === 'rejete' ? 'opacity-60 border-border' : 'border-border bg-surface-muted/30'}`}>
      <div className="flex gap-3">
        {!publie && <input type="checkbox" checked={selected} onChange={() => onToggle(post.id)} className="mt-1 self-start accent-accent" />}
        <a href={post.image_url} target="_blank" rel="noreferrer" className="w-24 flex-shrink-0 self-start"><img src={post.image_url} alt="" className="w-full rounded-lg" loading="lazy" /></a>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-medium ${pl.cls}`}>{pl.label}</span>
            <span className={`px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
            {post.bluesky_etat && <span className={`px-2 py-0.5 rounded-full ${badge(BLUESKY, post.bluesky_etat).cls}`}>{badge(BLUESKY, post.bluesky_etat).label}</span>}
            <span className="text-text-muted truncate">{post.scene_nom}</span>
            {post.bluesky_uri && <a href={`https://bsky.app/profile/${post.bluesky_uri.split('/')[2]}/post/${post.bluesky_uri.split('/').pop()}`} target="_blank" rel="noreferrer" className="text-accent flex items-center gap-0.5">voir <FiExternalLink size={10} /></a>}
          </div>
          {post.bluesky_erreur && <div className="text-xs text-danger-text">{post.bluesky_erreur}</div>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input type="date" value={f.date_prevue} onChange={(e) => setF({ ...f, date_prevue: e.target.value })} disabled={publie} className={champ} />
            <input type="time" value={f.heure} onChange={(e) => setF({ ...f, heure: e.target.value })} disabled={publie} className={champ} />
            <select value={f.langue} onChange={(e) => setF({ ...f, langue: e.target.value })} disabled={publie} className={champ}>
              {Object.entries(LANGUES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.lien_type} onChange={(e) => setF({ ...f, lien_type: e.target.value })} disabled={publie} className={champ}>
              {Object.entries(LIENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {post.plateforme === 'pinterest' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {langues.map((l) => <input key={l} value={f[`titre_${l}`]} onChange={(e) => setF({ ...f, [`titre_${l}`]: e.target.value })} disabled={publie} placeholder={`Titre ${l.toUpperCase()}`} className={champ} />)}
            </div>
          )}
          <div className={`grid gap-2 ${langues.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {langues.map((l) => (
              <textarea key={l} value={f[`texte_${l}`]} onChange={(e) => setF({ ...f, [`texte_${l}`]: e.target.value })} disabled={publie} rows={post.plateforme === 'x' || post.plateforme === 'bluesky' ? 2 : 4} className={champ} placeholder={l === 'fr' ? 'Texte français' : 'English text'} />
            ))}
          </div>
          <details className="text-xs">
            <summary className={`cursor-pointer ${post.final.depasse ? 'text-danger-text' : 'text-text-muted'}`}>
              Texte publié : {post.final.longueur} sur {post.final.limite} caractères{post.final.depasse ? ', trop long' : ''}{dirty ? ' (enregistrez pour mettre à jour)' : ''}
            </summary>
            <pre className="whitespace-pre-wrap font-sans text-text-secondary bg-surface rounded-lg p-2 mt-1 border border-border">{post.final.titre ? `${post.final.titre}\n\n` : ''}{post.final.texte}{post.plateforme === 'pinterest' && post.final.lien ? `\n\nLien : ${post.final.lien}` : ''}{post.plateforme === 'instagram' && post.lien_url ? '\n\n(Lien non cliquable sur Instagram : il n\'est pas ajouté à la légende.)' : ''}</pre>
          </details>
          {!publie && (
            <div className="flex flex-wrap gap-2">
              {dirty && <button onClick={() => agir(null)} disabled={busy} className={bouton}><FiSave size={13} /> Enregistrer</button>}
              {post.statut !== 'valide' && <button onClick={() => agir('valide')} disabled={busy} className={boutonPrincipal}><FiCheck size={13} /> Valider</button>}
              {post.statut === 'valide' && <button onClick={() => agir('a_valider')} disabled={busy} className={bouton}><FiRotateCcw size={13} /> Dévalider</button>}
              {post.statut !== 'rejete' ? <button onClick={() => agir('rejete')} disabled={busy} className={bouton}><FiX size={13} /> Rejeter</button>
                : <button onClick={() => agir('a_valider')} disabled={busy} className={bouton}><FiRotateCcw size={13} /> Remettre à valider</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PublicationsView = () => {
  const { toast } = useToast();
  const [scenes, setScenes] = useState([]);
  const [posts, setPosts] = useState(null);
  const [filtres, setFiltres] = useState({ plateforme: '', statut: 'a_valider', scene_id: '', from: '', to: '' });
  const [plan, setPlan] = useState({ scene_ids: [], debut: demain(), jours: 30 });
  const [planif, setPlanif] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    try { setPosts(await diffuseurAPI.listPosts(filtres)); } catch (e) { toast.error(e.message || 'Chargement impossible'); setPosts([]); }
  }, [filtres, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { diffuseurAPI.listScenes().then((s) => setScenes(s || [])).catch(() => {}); }, []);

  const planifier = async () => {
    if (!plan.scene_ids.length) return toast.error('Cochez au moins une scène');
    setPlanif(true);
    try {
      const r = await diffuseurAPI.planifier(plan);
      toast.success(`${r.planifiees} jour${r.planifiees > 1 ? 's' : ''} planifié${r.planifiees > 1 ? 's' : ''}${r.fin ? ` jusqu'au ${fmtDate(r.fin)}` : ''}${r.non_planifiees ? `, ${r.non_planifiees} image${r.non_planifiees > 1 ? 's' : ''} en attente` : ''}`);
      await load();
    } catch (e) { toast.error(e.message || 'Planification impossible'); }
    finally { setPlanif(false); }
    return null;
  };

  const sauver = async (id, payload) => {
    try {
      await diffuseurAPI.updatePost(id, payload);
      if (payload.statut === 'valide') toast.success('Publication validée');
    } catch (e) { toast.error(e.message || 'Modification refusée'); }
    await load();
  };

  const validerSelection = async (statut) => {
    if (!selected.size) return;
    try {
      const r = await diffuseurAPI.validerPlusieurs([...selected], statut);
      toast.success(`${r.modifiees} publication${r.modifiees > 1 ? 's' : ''} mise${r.modifiees > 1 ? 's' : ''} à jour`);
      r.refusees.slice(0, 3).forEach((x) => toast.error(`#${x.id} : ${x.raison}`));
      setSelected(new Set());
      await load();
    } catch (e) { toast.error(e.message || 'Erreur'); }
  };

  const exporter = async (cible) => {
    try {
      const res = await diffuseurAPI.exporter(cible, { from: filtres.from, to: filtres.to });
      const n = res.headers.get('X-Nb-Lignes');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const m = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
      a.href = url; a.download = m ? m[1] : `diffusion-${cible}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${n || 0} publication${n === '1' ? '' : 's'} exportée${n === '1' ? '' : 's'}`);
    } catch (e) { toast.error('Export impossible'); }
  };

  const groupes = useMemo(() => {
    const g = new Map();
    for (const p of posts || []) {
      const k = p.date_prevue || 'aucune';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(p);
    }
    for (const arr of g.values()) arr.sort((a, b) => a.image_id - b.image_id || ORDRE_PLATEFORMES.indexOf(a.plateforme) - ORDRE_PLATEFORMES.indexOf(b.plateforme));
    return [...g.entries()];
  }, [posts]);
  const selectables = (posts || []).filter((p) => p.bluesky_etat !== 'publie');

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2"><FiCalendar size={15} /> Calendrier : une image par jour, scènes alternées</h3>
        <div className="flex flex-wrap gap-3 mb-3">
          {scenes.filter((s) => s.nb_textes > 0).map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" className="accent-accent" checked={plan.scene_ids.includes(s.id)}
                onChange={(e) => setPlan({ ...plan, scene_ids: e.target.checked ? [...plan.scene_ids, s.id] : plan.scene_ids.filter((x) => x !== s.id) })} />
              {s.nom} <span className="text-text-muted">({s.nb_textes} image{s.nb_textes > 1 ? 's' : ''})</span>
            </label>
          ))}
          {!scenes.some((s) => s.nb_textes > 0) && <span className="text-sm text-text-muted">Aucune scène avec des textes rédigés.</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="block text-xs text-text-muted mb-1">À partir du</label><input type="date" value={plan.debut} onChange={(e) => setPlan({ ...plan, debut: e.target.value })} className={champ} /></div>
          <div><label className="block text-xs text-text-muted mb-1">Jours</label><input type="number" min="1" max="60" value={plan.jours} onChange={(e) => setPlan({ ...plan, jours: e.target.value })} className={`${champ} w-24`} /></div>
          <button onClick={planifier} disabled={planif} className={boutonPrincipal}>{planif ? <FiLoader size={14} className="animate-spin" /> : <FiCalendar size={14} />} Planifier</button>
        </div>
        <p className="text-xs text-text-muted mt-2">Chaque image est publiée le même jour sur toutes ses plateformes. Jamais deux jours de suite la même scène : s'il ne reste qu'une scène, ses dernières images attendent la suivante. Replanifier déplace aussi les publications déjà validées, sauf celles déjà parties.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <select value={filtres.statut} onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })} className={champ}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filtres.plateforme} onChange={(e) => setFiltres({ ...filtres, plateforme: e.target.value })} className={champ}>
          <option value="">Toutes les plateformes</option>
          {ORDRE_PLATEFORMES.map((k) => <option key={k} value={k}>{PLATEFORMES[k].label}</option>)}
        </select>
        <select value={filtres.scene_id} onChange={(e) => setFiltres({ ...filtres, scene_id: e.target.value })} className={champ}>
          <option value="">Toutes les scènes</option>
          {scenes.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <input type="date" value={filtres.from} onChange={(e) => setFiltres({ ...filtres, from: e.target.value })} className={champ} title="Du" />
        <input type="date" value={filtres.to} onChange={(e) => setFiltres({ ...filtres, to: e.target.value })} className={champ} title="Au" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">Exporter les publications validées{filtres.from || filtres.to ? ' de la période choisie' : ''} :</span>
        <button onClick={() => exporter('pinterest')} className={bouton}><FiDownload size={13} /> Pinterest</button>
        <button onClick={() => exporter('meta')} className={bouton}><FiDownload size={13} /> Meta Business Suite</button>
        <button onClick={() => exporter('x')} className={bouton}><FiDownload size={13} /> X (à publier à la main)</button>
        <span className="text-xs text-text-muted">Bluesky part seul à l'heure prévue, une fois validé.</span>
      </div>

      {selectables.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-text-muted flex items-center gap-1.5"><input type="checkbox" className="accent-accent" checked={selectables.every((p) => selected.has(p.id))} onChange={(e) => setSelected(e.target.checked ? new Set(selectables.map((p) => p.id)) : new Set())} /> tout sélectionner ({selectables.length})</label>
          <button onClick={() => validerSelection('valide')} disabled={!selected.size} className={boutonPrincipal}><FiCheck size={13} /> Valider la sélection{selected.size ? ` (${selected.size})` : ''}</button>
          <button onClick={() => validerSelection('rejete')} disabled={!selected.size} className={bouton}><FiX size={13} /> Rejeter</button>
        </div>
      )}

      {posts === null ? <div className="text-center py-10 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>
        : groupes.length === 0 ? <div className="text-center py-10 bg-surface/30 rounded-lg border border-border text-text-muted text-sm">Aucune publication dans cette vue.</div>
          : groupes.map(([date, arr]) => (
            <div key={date}>
              <h4 className="text-sm font-semibold text-text-primary mb-2 capitalize">{date === 'aucune' ? 'Pas encore planifiées' : fmtDate(date)}</h4>
              <div className="space-y-2">
                {arr.map((p) => <PostCard key={p.id} post={p} selected={selected.has(p.id)} onToggle={(id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} onSave={sauver} />)}
              </div>
            </div>
          ))}
    </div>
  );
};

export default PublicationsView;
