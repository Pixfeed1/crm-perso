// Veille Reddit : annonces repérées toutes les 10 minutes (3D pour l'activité d'artiste, PixFeed pour le web),
// triées sans IA. Lecture seule sur Reddit : on ouvre l'annonce et on répond soi-même, à la main.
import React, { useCallback, useEffect, useState } from 'react';
import { FiExternalLink, FiRefreshCw, FiSettings, FiEye, FiCheck, FiX, FiRotateCcw, FiTrash2, FiPlus } from 'react-icons/fi';
import { veilleRedditAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ONGLETS = [
  { k: 'nouveau', l: 'Nouvelles' }, { k: 'vu', l: 'Vues' }, { k: 'repondu', l: 'Répondues' },
  { k: 'ecarte', l: 'Écartées (par moi)' }, { k: 'ecarte_auto', l: 'Écartées auto' },
];
const PERIODES = [{ v: '', l: 'Toute période' }, { v: '24', l: '24 h' }, { v: '48', l: '48 h' }, { v: '168', l: '7 jours' }, { v: '720', l: '30 jours' }];
const bouton = 'px-2.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5 disabled:opacity-50';
const champ = 'px-2 py-1.5 rounded-lg bg-surface-muted border border-border text-xs text-text-primary';
const anciennete = (d) => {
  if (!d) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  return min < 60 ? `${min} min` : min < 2880 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} j`;
};

function Annonce({ a, onChange }) {
  const { toast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const marquer = async (statut, ok) => {
    try { await veilleRedditAPI.marquer(a.id, { statut }); toast.success(ok); onChange(); } catch (e) { toast.error(e.message || 'Échec'); }
  };
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={() => setOuvert((v) => !v)} className="text-left text-sm font-medium text-text-primary hover:underline">{a.titre}</button>
          <div className="text-xs text-text-muted mt-1 flex flex-wrap gap-x-2">
            <span className={`px-1.5 rounded ${a.etiquette === '3D' ? 'bg-accent/15 text-accent' : 'bg-neutral-bg text-neutral-text'}`}>{a.etiquette}</span>
            <span>r/{a.subreddit}</span>
            <span>{a.budget_texte ? `budget ${a.budget_texte}` : 'budget non indiqué'}</span>
            <span>il y a {anciennete(a.publie_le)}</span>
            <span className={a.nb_commentaires > 20 ? 'text-warning-text font-medium' : ''}>{a.nb_commentaires} commentaire(s)</span>
            {a.flair && <span>étiquette « {a.flair} »</span>}
            {a.mot_cle && <span>mot-clé « {a.mot_cle} »</span>}
          </div>
          {a.statut === 'ecarte_auto' && <div className="text-xs text-danger-text mt-1">Écartée : {a.raison_ecart}</div>}
          {a.note && <div className="text-xs text-text-secondary mt-1">Note : {a.note}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end flex-shrink-0">
          <a href={a.url} target="_blank" rel="noreferrer" className={`${bouton} bg-accent text-white`}><FiExternalLink /> Ouvrir sur Reddit</a>
          {a.statut === 'ecarte_auto' ? (
            <button onClick={() => marquer('nouveau', 'Annonce récupérée')} className={`${bouton} bg-surface-strong text-text-primary`}><FiRotateCcw /> Récupérer</button>
          ) : (
            <>
              {a.statut !== 'vu' && <button onClick={() => marquer('vu', 'Marquée vue')} className={`${bouton} bg-surface-strong text-text-primary`}><FiEye /> Vu</button>}
              {a.statut !== 'repondu' && <button onClick={() => marquer('repondu', 'Marquée répondue')} className={`${bouton} bg-surface-strong text-text-primary`}><FiCheck /> Répondu</button>}
              {a.statut !== 'ecarte' && <button onClick={() => marquer('ecarte', 'Annonce écartée')} className={`${bouton} text-text-muted`}><FiX /> Écarter</button>}
            </>
          )}
        </div>
      </div>
      {ouvert && <div className="mt-3 text-sm text-text-secondary whitespace-pre-line border-t border-border pt-3 max-h-80 overflow-y-auto">{a.texte || '(pas de texte)'}<div className="text-xs text-text-muted mt-2">u/{a.auteur} · publiée le {a.publie_le ? new Date(a.publie_le).toLocaleString('fr-FR') : '?'}</div></div>}
    </div>
  );
}

function Reglages({ onChange }) {
  const { toast } = useToast();
  const [r, setR] = useState(null);
  const [src, setSrc] = useState({ type: 'forum', valeur: '', etiquette: '3D' });
  const [regle, setRegle] = useState({ type: 'mot_cle', valeur: '', etiquette: '3D' });
  const charger = useCallback(() => veilleRedditAPI.reglages().then(setR).catch((e) => toast.error(e.message)), [toast]);
  useEffect(() => { charger(); }, [charger]);
  const faire = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); charger(); onChange(); } catch (e) { toast.error(e.message || 'Échec'); } };
  if (!r) return null;
  const p = r.dernier_passage;
  const groupes = [['garder_type', null, 'Type gardé (étiquette ou titre)'], ['rejeter_type', null, 'Type rejeté'], ['exclusion', null, 'Exclusions'], ['mot_cle', '3D', 'Mots-clés 3D'], ['mot_cle', 'PixFeed', 'Mots-clés PixFeed']];
  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-4 text-sm">
      <div className="text-xs text-text-secondary">
        Dernier passage : {p ? `${new Date(p.debut).toLocaleString('fr-FR')} · ${p.lus} lue(s), ${p.nouveaux} nouvelle(s), ${p.ecartes} écartée(s) · ${p.sources_ok} source(s) lue(s)${p.sources_ko ? `, ${p.sources_ko} en erreur (${(p.erreurs || []).map((e) => `${e.source} : ${e.code}`).join(' ; ')})` : ''}` : 'pas encore'}
        {r.panne && r.panne.panne_signalee ? ' · PANNE signalée par mail' : r.panne && r.panne.echecs_consecutifs ? ` · ${r.panne.echecs_consecutifs} passage(s) de suite tout en erreur` : ''}
        <div className="text-text-muted">Accès : {r.acces} · {r.frequence}. Rien n'est jamais posté sur Reddit.</div>
      </div>
      <div>
        <div className="font-medium text-text-primary mb-1">Sources</div>
        <div className="space-y-1">
          {r.sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={s.actif} onChange={(e) => faire(() => veilleRedditAPI.modifierSource(s.id, { actif: e.target.checked }))} />
              <span className="w-16 text-text-muted">{s.etiquette}</span>
              <span className="flex-1 text-text-primary">{s.type === 'forum' ? `r/${s.valeur}` : `recherche ${s.valeur}`}</span>
              {s.derniere_erreur && <span className="text-danger-text">erreur {s.derniere_erreur.split(' : ').pop()}</span>}
              <button onClick={() => window.confirm(`Supprimer la source ${s.valeur} ?`) && faire(() => veilleRedditAPI.supprimerSource(s.id), 'Source supprimée')} className="text-text-muted hover:text-danger-text"><FiTrash2 /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <select value={src.type} onChange={(e) => setSrc({ ...src, type: e.target.value })} className={champ}><option value="forum">forum</option><option value="recherche">recherche globale</option></select>
          <input value={src.valeur} onChange={(e) => setSrc({ ...src, valeur: e.target.value })} placeholder={src.type === 'forum' ? 'HungryArtists' : '"hiring" zbrush'} className={`${champ} flex-1 min-w-[10rem]`} />
          <select value={src.etiquette} onChange={(e) => setSrc({ ...src, etiquette: e.target.value })} className={champ}><option>3D</option><option>PixFeed</option></select>
          <button onClick={() => faire(() => veilleRedditAPI.ajouterSource(src), 'Source ajoutée').then(() => setSrc({ ...src, valeur: '' }))} disabled={!src.valeur.trim()} className={`${bouton} bg-accent text-white`}><FiPlus /> Ajouter</button>
        </div>
      </div>
      {groupes.map(([type, etiquette, titre]) => (
        <div key={`${type}-${etiquette}`}>
          <div className="font-medium text-text-primary mb-1">{titre}</div>
          <div className="flex flex-wrap gap-1.5">
            {r.regles.filter((x) => x.type === type && (etiquette === null || x.etiquette === etiquette)).map((x) => (
              <span key={x.id} className={`px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 ${x.actif ? 'bg-surface-strong text-text-primary' : 'bg-surface-muted text-text-muted line-through'}`}>
                <button onClick={() => faire(() => veilleRedditAPI.modifierRegle(x.id, { actif: !x.actif }))} title={x.actif ? 'Désactiver' : 'Réactiver'}>{x.valeur}</button>
                <button onClick={() => faire(() => veilleRedditAPI.supprimerRegle(x.id))} className="text-text-muted hover:text-danger-text" title="Supprimer"><FiX size={11} /></button>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <select value={`${regle.type}|${regle.etiquette}`} onChange={(e) => { const [t, et] = e.target.value.split('|'); setRegle({ ...regle, type: t, etiquette: et }); }} className={champ}>
          {groupes.map(([t, et, titre]) => <option key={`${t}|${et}`} value={`${t}|${et}`}>{titre}</option>)}
        </select>
        <input value={regle.valeur} onChange={(e) => setRegle({ ...regle, valeur: e.target.value })} placeholder="mot ou expression" className={`${champ} flex-1 min-w-[10rem]`} />
        <button onClick={() => faire(() => veilleRedditAPI.ajouterRegle({ type: regle.type, valeur: regle.valeur, etiquette: regle.type === 'mot_cle' ? regle.etiquette : null }), 'Ajouté').then(() => setRegle({ ...regle, valeur: '' }))} disabled={!regle.valeur.trim()} className={`${bouton} bg-accent text-white`}><FiPlus /> Ajouter</button>
      </div>
      <p className="text-xs text-text-muted">Mots entiers, insensibles à la casse (pluriels compris pour les mots-clés). « free » ignore « feel free » et « free to DM ». Les changements valent pour les prochains passages.</p>
    </div>
  );
}

export default function VeilleRedditPanel() {
  const { toast } = useToast();
  const [onglet, setOnglet] = useState('nouveau');
  const [filtre, setFiltre] = useState({ etiquette: '', subreddit: '', budget: '', depuis_heures: '' });
  const [data, setData] = useState(null);
  const [voirReglages, setVoirReglages] = useState(false);
  const charger = useCallback(async () => {
    try { setData(await veilleRedditAPI.annonces({ statut: onglet, ...filtre })); } catch (e) { toast.error(e.message || 'Liste indisponible'); }
  }, [onglet, filtre, toast]);
  useEffect(() => { charger(); const t = setInterval(charger, 60000); return () => clearInterval(t); }, [charger]);
  const passage = async () => { try { const r = await veilleRedditAPI.passage(); toast.success(r.deja_en_cours ? 'Un passage est déjà en cours' : 'Passage lancé : les annonces arrivent dans une minute environ'); setTimeout(charger, 45000); } catch (e) { toast.error(e.message); } };
  const forums = data ? [...new Set(data.annonces.map((a) => a.subreddit).filter(Boolean))].sort() : [];
  const c = (data && data.compteurs) || {};
  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-xl p-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold text-text-primary">Veille Reddit</div>
          <p className="text-xs text-text-muted mt-1 max-w-3xl">Annonces relevées toutes les 10 minutes (3D pour l'activité d'artiste, PixFeed pour le web), triées sans IA, mail à chaque nouveauté. Lecture seule : on répond soi-même sur Reddit.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setVoirReglages((v) => !v)} className={`${bouton} text-text-muted`}><FiSettings /> Réglages</button>
          <button onClick={passage} className={`${bouton} bg-surface-strong text-text-primary`}><FiRefreshCw /> Passage maintenant</button>
        </div>
      </div>
      {voirReglages && <Reglages onChange={charger} />}
      <div className="flex flex-wrap gap-1.5">
        {ONGLETS.map((o) => <button key={o.k} onClick={() => setOnglet(o.k)} className={`px-3 py-1.5 rounded-lg text-xs ${onglet === o.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{o.l}{c[o.k] ? ` (${c[o.k]})` : ''}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={filtre.etiquette} onChange={(e) => setFiltre({ ...filtre, etiquette: e.target.value })} className={champ}><option value="">3D et PixFeed</option><option>3D</option><option>PixFeed</option></select>
        <select value={filtre.subreddit} onChange={(e) => setFiltre({ ...filtre, subreddit: e.target.value })} className={champ}><option value="">Tous les forums</option>{forums.map((f) => <option key={f} value={f}>r/{f}</option>)}</select>
        <select value={filtre.budget} onChange={(e) => setFiltre({ ...filtre, budget: e.target.value })} className={champ}><option value="">Budget : tous</option><option value="oui">Budget indiqué</option><option value="non">Sans budget</option></select>
        <select value={filtre.depuis_heures} onChange={(e) => setFiltre({ ...filtre, depuis_heures: e.target.value })} className={champ}>{PERIODES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</select>
      </div>
      {data && data.annonces.length === 0 && <div className="text-sm text-text-muted p-4">Aucune annonce ici pour l'instant.</div>}
      {data && data.annonces.map((a) => <Annonce key={a.id} a={a} onChange={charger} />)}
    </div>
  );
}
