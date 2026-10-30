// Configurateur PC de jurojin.net : écran de validation de l'agent (backend/modules/configurateur).
// Rien de ce que propose l'IA n'est publié sans validation ici. Une tâche lancée répond tout de suite ;
// l'écran suit son statut toutes les 3 secondes et affiche le résultat (publié, ou bloqué avec les erreurs).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiCpu, FiPlay, FiCheck, FiLoader, FiRotateCcw, FiAlertTriangle, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { configurateurAPI } from '../services/api';
import { useToast } from '../hooks/useToast';

const bouton = 'px-3 py-1.5 rounded-lg bg-surface-strong text-text-primary text-sm hover:bg-border-strong disabled:opacity-50 flex items-center gap-1.5';
const boutonPrincipal = 'px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5';
const carte = 'bg-surface border border-border rounded-xl p-4';
const fmt = (s) => (s ? new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const STATUTS = {
  publiee: 'bg-success-bg text-success-text', bloquee: 'bg-danger-bg text-danger-text', echec_ecriture: 'bg-danger-bg text-danger-text',
  terminee: 'bg-success-bg text-success-text', echouee: 'bg-danger-bg text-danger-text', en_cours: 'bg-info-bg text-info-text',
  refusee: 'bg-neutral-bg text-neutral-text', interrompue: 'bg-warning-bg text-warning-text'
};
const LIBELLES = {
  publiee: 'Publiée', bloquee: 'Bloquée', echec_ecriture: 'Non mise en ligne', terminee: 'Terminée', echouee: 'Échouée',
  en_cours: 'En cours', refusee: 'Refusée', interrompue: 'Interrompue',
  nuit: 'Relevé de nuit', lundi: 'Relevé du lundi', mois: 'Proposition du mois', valider: 'Validation', validerTelleQuelle: 'Validation initiale', restaurer: 'Restauration'
};
const Badge = ({ v }) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUTS[v] || 'bg-neutral-bg text-neutral-text'}`}>{LIBELLES[v] || v}</span>;
// Sources proposées par l'IA : lien seulement si https, sinon texte brut.
const Source = ({ url }) => (/^https:\/\/\S+$/i.test(String(url))
  ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5 break-all">{url.replace(/^https:\/\/(www\.)?/, '').slice(0, 60)} <FiExternalLink size={10} /></a>
  : <span className="break-all">{String(url)}</span>);

function detailLisible(c) {
  const d = c.detail || {};
  if (c.type === 'pourquoi') return d.texte;
  if (c.type === 'asin') return `ASIN ${d.asin}${d.rang ? ` (réserve ${d.rang})` : ''}`;
  if (c.type === 'ean') return `EAN ${[].concat(d.ean).join(', ')}`;
  if (c.type === 'modele') return `${d.remplacer ? 'Remplace' : 'Ajoute'} au rang ${d.rang || 0} : ${d.modele && (d.modele.modele || JSON.stringify(d.modele))}`;
  if (c.type === 'ajout') return d.composant ? `${d.composant.puce || ''} ${d.composant.modele ? `(${d.composant.modele})` : ''}` : '';
  if (c.type === 'retrait') return 'Retirer ce composant de la sélection';
  return Object.keys(d).length ? JSON.stringify(d) : '';
}

function ResultatTache({ t }) {
  const r = t.resultat || {};
  const res = r.resume || {};
  const erreurs = (res.controles && res.controles.erreurs) || [];
  return (
    <div className="text-sm space-y-1">
      <div className="flex items-center gap-2"><Badge v={t.statut} /> <span className="text-text-secondary">{LIBELLES[t.nom] || t.nom}, tâche n° {t.id}</span></div>
      {t.erreur && <div className="text-danger-text">{t.erreur}</div>}
      {t.statut === 'terminee' && (r.publie
        ? <div className="text-success-text">Publié : {res.composants} composants, {res.profils} profils.{r.proposition ? ' Une proposition attend ta validation ci-dessous.' : ''}</div>
        : <div className="text-danger-text">Bloqué : rien n'a changé en ligne ni dans la sélection.</div>)}
      {erreurs.length > 0 && <ul className="list-disc ml-5 text-danger-text text-xs">{erreurs.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>}
      {(res.erreursFlux || []).length > 0 && <div className="text-xs text-warning-text">Flux : {res.erreursFlux.join(' · ')}</div>}
      {(res.disparitions || []).length > 0 && <div className="text-xs text-warning-text">Retirées de la page : {res.disparitions.map((d) => `${d.puce} (${d.raison})`).join(', ')}</div>}
    </div>
  );
}

function Proposition({ p, selection, onValider, occupe, enAvant }) {
  const changements = (p.contenu && p.contenu.changements) || [];
  const [coches, setCoches] = useState({});
  const ref = useRef(null);
  useEffect(() => { if (enAvant && ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [enAvant]);
  const nb = Object.values(coches).filter(Boolean).length;
  return (
    <div ref={ref} className={`${carte} ${enAvant ? 'ring-2 ring-accent' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-text-primary">Proposition n° {p.id} · {fmt(p.cree_le)}</h3>
        <label className="text-xs text-text-muted flex items-center gap-1.5"><input type="checkbox" className="accent-accent"
          checked={changements.length > 0 && nb === changements.length}
          onChange={(e) => setCoches(Object.fromEntries(changements.map((_, i) => [i, e.target.checked])))} /> tout cocher</label>
      </div>
      {p.contenu && p.contenu.resume && <p className="text-sm text-text-secondary mb-3">{p.contenu.resume}</p>}
      <div className="space-y-2">
        {changements.map((c, i) => {
          const comp = selection && selection.composants && selection.composants[c.id];
          return (
            <label key={`${p.id}-${i}`} className="flex gap-3 items-start border border-border rounded-lg p-3 cursor-pointer hover:bg-surface-muted/40">
              <input type="checkbox" className="mt-1 accent-accent" checked={!!coches[i]} onChange={(e) => setCoches((x) => ({ ...x, [i]: e.target.checked }))} />
              <div className="min-w-0 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-info-bg text-info-text">{c.type}</span>
                  <span className="font-medium text-text-primary">{comp ? comp.puce : c.id}</span>
                  <span className="text-xs text-text-muted">{c.id}</span>
                </div>
                {detailLisible(c) && <div className="text-text-secondary">{detailLisible(c)}</div>}
                {c.raison && <div className="text-xs text-text-muted">Raison : {c.raison}</div>}
                {(c.sources || []).length > 0 && <div className="text-xs text-text-muted flex flex-wrap gap-x-3">Sources : {c.sources.map((u) => <Source key={u} url={u} />)}</div>}
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex justify-end mt-3">
        <button disabled={occupe} onClick={() => onValider(p.id, Object.fromEntries(changements.map((_, i) => [i, !!coches[i]])), nb)} className={boutonPrincipal}>
          <FiCheck size={14} /> Valider la sélection ({nb} changement{nb > 1 ? 's' : ''} retenu{nb > 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
}

const Configurateur = ({ embedded = false }) => {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const propositionVisee = parseInt(params.get('proposition'), 10) || null;
  const [etat, setEtat] = useState(null);
  const [tache, setTache] = useState(null);
  const suivi = useRef(null);

  const charger = useCallback(() => configurateurAPI.etat().then(setEtat).catch((e) => toast.error(e.message || 'Chargement impossible')), [toast]);
  useEffect(() => { charger(); return () => clearInterval(suivi.current); }, [charger]);

  const suivre = useCallback((id) => {
    clearInterval(suivi.current);
    const tick = async () => {
      try {
        const t = await configurateurAPI.tache(id);
        setTache(t);
        if (t.statut !== 'en_cours') { clearInterval(suivi.current); charger(); }
      } catch (e) { clearInterval(suivi.current); }
    };
    tick();
    suivi.current = setInterval(tick, 3000);
  }, [charger]);

  // Une tâche en cours au chargement (lancée par le planning ou ailleurs) est suivie aussi.
  useEffect(() => {
    const enCours = etat && (etat.taches || []).find((t) => t.statut === 'en_cours');
    if (enCours && (!tache || tache.id !== enCours.id)) suivre(enCours.id);
  }, [etat, tache, suivre]);

  const demarrer = async (appel) => {
    try {
      const r = await appel();
      setTache({ id: r.id, statut: r.statut, nom: '' });
      suivre(r.id);
    } catch (e) {
      if (e.status === 409 && e.data) toast.error(`Une tâche tourne déjà (n° ${e.data.en_cours}) : réessaie quand elle sera finie.`);
      else toast.error((e.data && e.data.erreur) || e.message || 'Impossible de lancer la tâche');
    }
  };

  const occupe = !!(tache && tache.statut === 'en_cours');
  const selection = etat && etat.selection;
  const nonValidee = selection && !selection.validee_le;
  const nbComposants = useMemo(() => (selection && selection.composants ? Object.keys(selection.composants).length : 0), [selection]);

  if (!etat) return <div className="text-center py-16 text-text-muted"><FiLoader className="inline animate-spin" /> Chargement…</div>;

  return (
    <div className={`h-full overflow-y-auto p-2 sm:p-4 lg:p-6 ${embedded ? '' : 'pt-16 sm:pt-6'}`}>
      <div className="max-w-5xl mx-auto w-full space-y-4">
        <div className="flex items-center gap-3">
          <FiCpu size={22} className="text-accent" />
          <h1 className="text-xl font-semibold text-text-primary flex-1">Configurateur PC · jurojin.net</h1>
          <button onClick={charger} className={bouton} title="Actualiser"><FiRefreshCw size={14} /></button>
        </div>

        <div className={carte}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="text-text-primary font-medium">Sélection {selection.version} · {nbComposants} composants</div>
              <div className="text-text-muted">{nonValidee ? 'Sélection de départ, pas encore validée : la page affiche « exemple ».' : `Validée le ${fmt(selection.validee_le)} par ${selection.validee_par || '?'}`}</div>
            </div>
            {nonValidee && (
              <button disabled={occupe} className={boutonPrincipal}
                onClick={() => window.confirm('Valider la sélection de départ telle quelle et la publier sur jurojin.net ? Le relevé des prix et les contrôles passent d\'abord ; si un contrôle échoue, rien n\'est publié.') && demarrer(() => configurateurAPI.validerSelection())}>
                <FiCheck size={14} /> Valider la sélection de départ
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button disabled={occupe} onClick={() => demarrer(() => configurateurAPI.lancer('nuit'))} className={bouton}><FiPlay size={13} /> Relevé des prix</button>
            <button disabled={occupe} onClick={() => demarrer(() => configurateurAPI.lancer('lundi'))} className={bouton}><FiPlay size={13} /> Relevé du lundi</button>
            <button disabled={occupe} onClick={() => window.confirm('Lancer la proposition du mois ? Elle relève les mesures Blender Open Data et appelle Claude avec recherche web (quelques centimes).') && demarrer(() => configurateurAPI.lancer('mois'))} className={bouton}><FiPlay size={13} /> Proposition du mois</button>
          </div>
          <p className="text-xs text-text-muted mt-2">Planning automatique : relevé chaque nuit à 3 h 30, relevé complet le lundi à 6 h, proposition le 1er du mois à 7 h. Le relevé des flux peut prendre plusieurs minutes.</p>
          {tache && <div className="mt-3 border-t border-border pt-3">{tache.statut === 'en_cours'
            ? <div className="text-sm text-text-secondary flex items-center gap-2"><FiLoader className="animate-spin" /> Tâche n° {tache.id} en cours…</div>
            : <ResultatTache t={tache} />}</div>}
        </div>

        {(etat.propositions || []).length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-text-primary">Propositions en attente ({etat.propositions.length})</h2>
            <p className="text-xs text-text-muted">Coche les changements à retenir. La validation relève les prix, recalcule et contrôle : si tout passe, la nouvelle sélection est enregistrée et publiée ; sinon rien ne change et la proposition reste en attente.</p>
            {etat.propositions.map((p) => (
              <Proposition key={p.id} p={p} selection={selection} occupe={occupe} enAvant={p.id === propositionVisee}
                onValider={(id, decisions, nb) => (nb === 0
                  ? toast.error('Coche au moins un changement, ou laisse la proposition en attente.')
                  : demarrer(() => configurateurAPI.validerProposition(id, decisions)))} />
            ))}
          </div>
        ) : <div className={`${carte} text-sm text-text-muted`}>Aucune proposition en attente.</div>}

        <div className={carte}>
          <h2 className="text-base font-semibold text-text-primary mb-2">Dernières publications</h2>
          {(etat.publications || []).length === 0 ? <p className="text-sm text-text-muted">Aucune publication pour l'instant.</p> : (
            <div className="space-y-2">
              {etat.publications.map((p) => (
                <div key={p.id} className="border border-border rounded-lg p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge v={p.statut} />
                    <span className="text-text-primary">n° {p.id} · {fmt(p.publie_le)}</span>
                    {p.taille_ko != null && <span className="text-text-muted">{p.taille_ko} Ko</span>}
                    {p.resume && p.resume.motif && <span className="text-text-muted">{p.resume.motif}</span>}
                    {p.restaurable && p.statut !== 'bloquee' && (
                      <button disabled={occupe} className={`${bouton} ml-auto`}
                        onClick={() => window.confirm(`Remettre en ligne, à l'identique, la publication n° ${p.id} ?`) && demarrer(() => configurateurAPI.restaurer(p.id))}>
                        <FiRotateCcw size={13} /> Restaurer
                      </button>
                    )}
                  </div>
                  {Array.isArray(p.erreurs) && p.erreurs.length > 0 && (
                    <ul className={`list-disc ml-5 mt-1 text-xs ${p.statut === 'publiee' ? 'text-warning-text' : 'text-danger-text'}`}>
                      {p.erreurs.slice(0, 10).map((e) => <li key={e}>{e}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={carte}>
          <h2 className="text-base font-semibold text-text-primary mb-2">Dernières tâches</h2>
          {(etat.taches || []).length === 0 ? <p className="text-sm text-text-muted">Aucune tâche pour l'instant.</p> : (
            <div className="space-y-1">
              {etat.taches.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge v={t.statut} /> <span className="text-text-primary">{LIBELLES[t.nom] || t.nom}</span>
                  <span className="text-text-muted">{fmt(t.debut)}{t.origine !== 'manuel' ? ` · ${t.origine === 'planifiee' ? 'planifiée' : 'réconciliation'}` : ''}</span>
                  {t.erreur && <span className="text-danger-text text-xs flex items-center gap-1"><FiAlertTriangle size={11} /> {t.erreur}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Configurateur;
