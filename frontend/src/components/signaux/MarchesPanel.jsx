// Signaux > Marchés publics : veille du BOAMP sur tous les marchés web accessibles (sites, e-commerce, maintenance,
// référencement, applications web, accessibilité, design), relevée deux fois par jour. Filtre par thème
// (maintenance à part), suivi de chaque marché ; répondre reste une décision de Marc, rien n'est déposé.
import React, { useCallback, useEffect, useState } from 'react';
import { FiFileText, FiRefreshCw, FiExternalLink, FiChevronDown, FiChevronUp, FiSettings } from 'react-icons/fi';
import { marchesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const STATUTS = { nouveau: 'Nouveau', a_etudier: 'À étudier', je_reponds: 'Je réponds', repondu: 'Répondu', gagne: 'Gagné', perdu: 'Perdu', ecarte: 'Écarté' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const bouton = 'px-2.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5 disabled:opacity-50';
const jours = (d) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);

function Ligne({ m, themes, onChange }) {
  const { toast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState(m.note || '');
  const j = jours(m.date_limite);
  const suivre = async (data, ok) => {
    try { await marchesAPI.suivre(m.idweb, data); toast.success(ok); onChange(); } catch (e) { toast.error(e.message || 'Échec'); }
  };
  return (
    <div className={`bg-surface border border-border rounded-xl ${m.statut === 'ecarte' ? 'opacity-60' : ''}`}>
      <button onClick={() => setOuvert((v) => !v)} className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary">{m.objet}</div>
          <div className="text-xs text-text-muted mt-1">
            {m.acheteur || 'Acheteur non précisé'}{m.departements && m.departements.length ? ` · ${m.departements.join(', ')}` : ''}
            {m.montant ? ` · environ ${Math.round(Number(m.montant)).toLocaleString('fr-FR')} € HT` : m.tranche ? ` · ${m.tranche}` : ''}{m.procedure ? ` · ${m.procedure}` : ''}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(m.themes || []).map((t) => <span key={t} className={`px-2 py-0.5 rounded-full text-xs ${t === 'maintenance' ? 'bg-warning-bg text-warning-text' : 'bg-neutral-bg text-neutral-text'}`}>{themes[t] || t}</span>)}
            {m.cible === 'hors_cible' && <span className="px-2 py-0.5 rounded-full text-xs bg-danger-bg text-danger-text">montant au-delà du maximum</span>}
            {m.rectificatif && <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-bg text-neutral-text">rectificatif</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-right">
          <div>
            <div className={`text-sm ${j !== null && j <= 7 ? 'text-danger-text' : 'text-text-primary'}`}>{m.date_limite ? `avant le ${fmt(m.date_limite)}` : 'date limite non précisée'}</div>
            <div className="text-xs text-text-muted">{j !== null ? (j <= 0 ? 'dernier jour' : `J-${j}`) : ''} · {STATUTS[m.statut] || m.statut}</div>
          </div>
          {ouvert ? <FiChevronUp className="text-text-muted" /> : <FiChevronDown className="text-text-muted" />}
        </div>
      </button>
      {ouvert && (
        <div className="px-4 pb-4 pt-3 border-t border-border space-y-3">
          <div className="text-xs text-text-secondary space-y-1">
            {m.descripteurs && m.descripteurs.length > 0 && <div>Descripteurs : {m.descripteurs.join(', ')}</div>}
            {m.cpv && m.cpv.length > 0 && <div>Codes CPV : {m.cpv.join(', ')}</div>}
            <div>Classement (score {m.score}) : {(m.raisons || []).join(' ; ')}</div>
            <div>Parution le {fmt(m.date_parution)}{m.nature ? ` · ${m.nature}` : ''} · avis {m.idweb}</div>
          </div>
          <a href={m.url} target="_blank" rel="noreferrer" className="text-accent text-sm inline-flex items-center gap-1">Lire l'avis sur le BOAMP <FiExternalLink size={12} /></a>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STATUTS).filter(([k]) => k !== m.statut).map(([k, l]) => (
              <button key={k} onClick={() => suivre({ statut: k }, `Marché passé en « ${l} »`)} className={`${bouton} ${k === 'je_reponds' ? 'bg-accent text-white' : 'bg-surface-strong text-text-primary'}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2 items-start">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note : pièces à préparer, questions à l'acheteur, prix envisagé…" className="flex-1 px-2 py-1.5 rounded-lg bg-surface-muted border border-border text-sm text-text-primary" />
            {note !== (m.note || '') && <button onClick={() => suivre({ note }, 'Note enregistrée')} className={`${bouton} bg-accent text-white`}>Enregistrer</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function Reglages({ r, onChange }) {
  const { toast } = useToast();
  const [f, setF] = useState({ montant_max: r.montant_max, departements: (r.departements || []).join(', '), exclusions: (r.exclusions || []).join(', '), alerte_mail: r.alerte_mail });
  const enregistrer = async () => {
    try { await marchesAPI.regler({ ...f, montant_max: Number(f.montant_max) }); toast.success('Réglages enregistrés : ils valent pour les prochains relevés'); onChange(); } catch (e) { toast.error(e.message || 'Échec'); }
  };
  const champ = 'px-2 py-1.5 rounded-lg bg-surface-muted border border-border text-sm text-text-primary';
  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-2 text-sm">
      <label className="flex items-center gap-2 flex-wrap"><span className="w-56 text-text-secondary">Montant maximal (€ HT)</span><input type="number" value={f.montant_max} onChange={(e) => setF({ ...f, montant_max: e.target.value })} className={`${champ} w-32`} /><span className="text-xs text-text-muted">au-delà : « hors cible » ; montant non publié : gardé</span></label>
      <label className="flex items-center gap-2 flex-wrap"><span className="w-56 text-text-secondary">Départements suivis de près</span><input value={f.departements} onChange={(e) => setF({ ...f, departements: e.target.value })} placeholder="95, 78, 75" className={`${champ} w-48`} /><span className="text-xs text-text-muted">mis en avant ; toute la France reste suivie</span></label>
      <label className="flex items-center gap-2 flex-wrap"><span className="w-56 text-text-secondary">Mots à écarter en plus</span><input value={f.exclusions} onChange={(e) => setF({ ...f, exclusions: e.target.value })} placeholder="ex. : billetterie, SIG" className={`${champ} flex-1 min-w-[12rem]`} /></label>
      <label className="flex items-center gap-2 text-text-primary"><input type="checkbox" checked={!!f.alerte_mail} onChange={(e) => setF({ ...f, alerte_mail: e.target.checked })} /> Mail quand de nouveaux marchés pertinents arrivent</label>
      <button onClick={enregistrer} className={`${bouton} bg-accent text-white`}>Enregistrer les réglages</button>
    </div>
  );
}

export default function MarchesPanel() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [filtre, setFiltre] = useState({ theme: '', statut: '', cible: 'pertinent', ouverts: 1 });
  const [voirReglages, setVoirReglages] = useState(false);
  const charger = useCallback(async () => {
    try { setData(await marchesAPI.lister(filtre)); } catch (e) { toast.error(e.message || 'Liste indisponible'); }
  }, [filtre, toast]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { if (!data || !data.releve.en_cours) return undefined; const t = setTimeout(charger, 5000); return () => clearTimeout(t); }, [data, charger]);
  const relever = async () => { try { await marchesAPI.relever(); toast.success('Relevé du BOAMP lancé'); charger(); } catch (e) { toast.error(e.message); } };
  if (!data) return null;
  const t = data.totaux;
  const r = data.releve;
  const puce = (actif) => `px-2.5 py-1 rounded-full text-xs ${actif ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`;
  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-xl p-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 font-semibold text-text-primary"><FiFileText /> Marchés publics web</div>
          <p className="text-xs text-text-muted mt-1 max-w-3xl">
            Annonces du BOAMP relevées à 7 h 47 et 13 h 47 : sites, e-commerce, maintenance et hébergement, référencement, applications web, accessibilité, design web.
            Les avis d'attribution et les dates passées sont écartés. Répondre reste votre décision : rien n'est déposé.
          </p>
          <div className="text-xs text-text-secondary mt-2">
            {t.ouverts} ouvert(s) · {t.nouveaux} nouveau(x) · {t.maintenance} en maintenance · {t.en_reponse} en réponse · {t.hors_cible} hors cible
          </div>
          <div className="text-xs text-text-muted mt-1">
            {r.en_cours ? `Relevé en cours depuis ${new Date(r.en_cours).toLocaleTimeString('fr-FR')}` : r.le ? `Dernier relevé : ${r.statut} le ${new Date(r.le).toLocaleString('fr-FR')} · ${r.detail || ''}` : 'Pas encore de relevé'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVoirReglages((v) => !v)} className={`${bouton} text-text-muted`}><FiSettings /> Réglages</button>
          <button onClick={relever} disabled={!!r.en_cours} className={`${bouton} bg-surface-strong text-text-primary`}><FiRefreshCw className={r.en_cours ? 'animate-spin' : ''} /> Relever maintenant</button>
        </div>
      </div>
      {voirReglages && <Reglages r={data.reglages} onChange={charger} />}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setFiltre({ ...filtre, theme: '' })} className={puce(!filtre.theme)}>Tous les thèmes</button>
        {Object.entries(data.themes).map(([k, l]) => <button key={k} onClick={() => setFiltre({ ...filtre, theme: k })} className={puce(filtre.theme === k)}>{l}</button>)}
        <select value={filtre.statut} onChange={(e) => setFiltre({ ...filtre, statut: e.target.value })} className="ml-2 px-2 py-1 rounded-lg bg-surface-muted border border-border text-xs text-text-primary">
          <option value="">Tous les suivis</option>
          {Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={filtre.cible} onChange={(e) => setFiltre({ ...filtre, cible: e.target.value })} className="px-2 py-1 rounded-lg bg-surface-muted border border-border text-xs text-text-primary">
          <option value="pertinent">À ma portée</option>
          <option value="hors_cible">Montant au-delà du maximum</option>
          <option value="tous">Tous</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-text-muted ml-1"><input type="checkbox" checked={!filtre.ouverts} onChange={(e) => setFiltre({ ...filtre, ouverts: e.target.checked ? 0 : 1 })} /> dates passées aussi</label>
      </div>
      {data.marches.length === 0 && <div className="text-sm text-text-muted p-4">Aucun marché pour ce filtre{r.le ? '' : ' : lancez un premier relevé'}.</div>}
      {data.marches.map((m) => <Ligne key={m.idweb} m={m} themes={data.themes} onChange={charger} />)}
    </div>
  );
}
