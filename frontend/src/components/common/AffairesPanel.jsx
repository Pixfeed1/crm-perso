// Affaires (lot 5) d'une fiche prospect ou client : plusieurs par entreprise, chacune avec son type
// de besoin, ses montants, son étape et sa prochaine action (obligatoire tant qu'elle est en cours,
// posée comme une relance du Suivi). Motifs en liste si perdue ou reportée, devis rattachables.
import React, { useCallback, useEffect, useState } from 'react';
import { FiBriefcase, FiPlus, FiEdit2, FiTrash2, FiFileText, FiAlertCircle, FiX } from 'react-icons/fi';
import { affairesAPI, campagnesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const euros = (n) => (n === null || n === undefined || n === '' ? null : `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`);
const demain = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const ETAPE_CLS = {
  decouverte: 'bg-info-bg text-info-text', devis_envoye: 'bg-warning-bg text-warning-text', negociation: 'bg-warning-bg text-warning-text',
  gagnee: 'bg-success-bg text-success-text', perdue: 'bg-danger-bg text-danger-text', reportee: 'bg-neutral-bg text-neutral-text'
};
const vide = (leadId, clientId) => ({
  lead_id: leadId || null, client_id: clientId || null, titre: '', type_besoin: 'maintenance', montant_ponctuel: '', montant_mensuel: '',
  etape: 'decouverte', accord: '', motif: '', motif_detail: '', recontacter_le: '',
  prochaine_action_date: demain(), prochaine_action_canal: 'appel', prochaine_action_note: '', campagne_id: undefined
});
const input = 'w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent';

function Formulaire({ ref_, campagnes, initial, onSave, onCancel, busy }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ouverte = ref_.ouvertes.includes(f.etape);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="rounded-lg border border-border bg-surface-muted/60 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={f.titre} onChange={set('titre')} placeholder="Intitulé : « Maintenance mensuelle », « Outil de stock »…" className={`${input} sm:col-span-2`} required />
        <label className="text-xs text-text-muted">Type de besoin
          <select value={f.type_besoin} onChange={set('type_besoin')} className={input}>{Object.entries(ref_.types).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="text-xs text-text-muted">Étape
          <select value={f.etape} onChange={set('etape')} className={input}>{Object.entries(ref_.etapes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="text-xs text-text-muted">Montant ponctuel (€ HT)
          <input type="number" min="0" step="0.01" value={f.montant_ponctuel ?? ''} onChange={set('montant_ponctuel')} placeholder="ex. devis de développement" className={input} />
        </label>
        <label className="text-xs text-text-muted">Montant mensuel (€ HT)
          <input type="number" min="0" step="0.01" value={f.montant_mensuel ?? ''} onChange={set('montant_mensuel')} placeholder="ex. maintenance 50 €/mois" className={input} />
        </label>
        {f.etape !== 'gagnee' && (
          <label className="text-xs text-text-muted">Accord
            <select value={f.accord || ''} onChange={set('accord')} className={input}>
              <option value="">Pas encore d'accord</option><option value="ferme">Accord ferme</option><option value="incertain">Incertain (« éventuellement »)</option>
            </select>
          </label>
        )}
        <label className="text-xs text-text-muted">Campagne d'origine
          <select value={f.campagne_id ?? ''} onChange={(e) => setF({ ...f, campagne_id: e.target.value ? Number(e.target.value) : null })} className={input}>
            <option value="">{f.campagne_id === undefined ? 'Automatique (dernière campagne envoyée)' : 'Aucune'}</option>
            {campagnes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
      </div>
      {ouverte && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-xs text-text-muted">Prochaine action, le
            <input type="date" value={f.prochaine_action_date || ''} onChange={set('prochaine_action_date')} className={input} required />
          </label>
          <label className="text-xs text-text-muted">par
            <select value={f.prochaine_action_canal || ''} onChange={set('prochaine_action_canal')} className={input} required>
              {ref_.canaux.map((c) => <option key={c} value={c}>{c === 'rdv' ? 'rendez-vous' : c}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">quoi
            <input value={f.prochaine_action_note || ''} onChange={set('prochaine_action_note')} placeholder="envoyer le devis, rappeler…" className={input} />
          </label>
        </div>
      )}
      {['perdue', 'reportee'].includes(f.etape) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-xs text-text-muted">Motif
            <select value={f.motif || ''} onChange={set('motif')} className={input} required>
              <option value="">Choisir…</option>{Object.entries(ref_.motifs).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {(f.etape === 'reportee' || f.motif === 'recontacter_date') && (
            <label className="text-xs text-text-muted">En reparler le
              <input type="date" value={f.recontacter_le || ''} onChange={set('recontacter_le')} className={input} required />
            </label>
          )}
          <input value={f.motif_detail || ''} onChange={set('motif_detail')} placeholder="Précision (facultatif)" className={`${input} sm:col-span-2`} />
          {f.motif === 'refus_total' && <p className="text-xs text-danger-text sm:col-span-2">Ce motif enregistre un refus de toute sollicitation sur la fiche : plus aucun email ni relance.</p>}
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50">{busy ? '…' : 'Enregistrer'}</button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm rounded-lg text-text-muted">Annuler</button>
      </div>
    </form>
  );
}

function Devis({ affaire, onChange }) {
  const toast = useToast();
  const [liste, setListe] = useState(null);
  const ouvrir = async () => { try { setListe(await affairesAPI.devisDisponibles(affaire.id)); } catch (e) { toast.error(e.message); } };
  const rattacher = async (qid) => { try { onChange(await affairesAPI.rattacherDevis(affaire.id, qid)); setListe(null); } catch (e) { toast.error(e.message); } };
  const detacher = async (qid) => { try { onChange(await affairesAPI.detacherDevis(affaire.id, qid)); } catch (e) { toast.error(e.message); } };
  return (
    <div className="text-xs text-text-secondary mt-1 flex items-center gap-2 flex-wrap">
      {affaire.devis.map((d) => (
        <span key={d.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-strong">
          <FiFileText size={11} /> {d.quote_number}{d.total_ht ? ` · ${euros(d.total_ht)}` : ''} · {d.status}
          <button onClick={() => detacher(d.id)} title="Détacher ce devis" className="text-text-muted hover:text-danger-text"><FiX size={11} /></button>
        </span>
      ))}
      {liste === null
        ? <button onClick={ouvrir} className="underline text-text-muted hover:text-text-primary">rattacher un devis</button>
        : (
          <select autoFocus defaultValue="" onChange={(e) => e.target.value && rattacher(Number(e.target.value))} onBlur={() => setListe(null)}
            className="px-2 py-1 bg-surface border border-border rounded-lg text-text-primary text-xs">
            <option value="">{liste.length ? 'Choisir un devis…' : 'Aucun devis disponible'}</option>
            {liste.filter((q) => q.affaire_id !== affaire.id).map((q) => <option key={q.id} value={q.id}>{q.quote_number} · {q.title || q.client_name || ''} · {q.status}{q.total_ht ? ` · ${euros(q.total_ht)}` : ''}</option>)}
          </select>
        )}
    </div>
  );
}

export default function AffairesPanel({ leadId = null, clientId = null }) {
  const toast = useToast();
  const [ref_, setRef] = useState(null);
  const [affaires, setAffaires] = useState([]);
  const [campagnes, setCampagnes] = useState([]);
  const [edition, setEdition] = useState(null); // 'nouvelle' | id
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    try { setAffaires(await affairesAPI.list(leadId ? { lead_id: leadId } : { client_id: clientId })); } catch { setAffaires([]); }
  }, [leadId, clientId]);
  useEffect(() => {
    affairesAPI.referentiel().then(setRef).catch(() => setRef(null));
    campagnesAPI.list().then((r) => setCampagnes(Array.isArray(r) ? r : (r && (r.campagnes || r.campaigns)) || [])).catch(() => setCampagnes([]));
  }, []);
  useEffect(() => { charger(); setEdition(null); }, [charger]);

  if (!ref_) return null;
  const enregistrer = async (f) => {
    setBusy(true);
    try {
      const body = { ...f };
      if (body.campagne_id === undefined) delete body.campagne_id;
      if (edition === 'nouvelle') await affairesAPI.create(body); else await affairesAPI.update(edition, body);
      toast.success(edition === 'nouvelle' ? 'Affaire créée' : 'Affaire mise à jour');
      setEdition(null); charger();
    } catch (e) { toast.error(e.message || 'Enregistrement impossible'); } finally { setBusy(false); }
  };
  const supprimer = async (a) => {
    if (!window.confirm(`Supprimer l'affaire « ${a.titre} » ? Ses devis restent, simplement détachés.`)) return;
    try { await affairesAPI.remove(a.id); charger(); } catch (e) { toast.error(e.message); }
  };
  const remplacer = (a) => setAffaires((xs) => xs.map((x) => (x.id === a.id ? a : x)));
  const ouvertes = affaires.filter((a) => a.ouverte);
  const mensuelSigne = affaires.filter((a) => a.etape === 'gagnee').reduce((s, a) => s + Number(a.montant_mensuel || 0), 0);
  const enJeu = ouvertes.reduce((s, a) => s + Number(a.montant_ponctuel || 0), 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiBriefcase size={14} /> Affaires</h3>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {ouvertes.length > 0 && <span>{ouvertes.length} en cours{enJeu ? ` · ${euros(enJeu)} en jeu` : ''}</span>}
          {mensuelSigne > 0 && <span className="text-success-text">{euros(mensuelSigne)}/mois signés</span>}
          {edition !== 'nouvelle' && (
            <button onClick={() => setEdition('nouvelle')} className="px-2.5 py-1 rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong flex items-center gap-1"><FiPlus size={12} /> Nouvelle affaire</button>
          )}
        </div>
      </div>
      {edition === 'nouvelle' && <Formulaire ref_={ref_} campagnes={campagnes} initial={vide(leadId, clientId)} onSave={enregistrer} onCancel={() => setEdition(null)} busy={busy} />}
      {affaires.length === 0 && edition !== 'nouvelle' && <p className="text-sm text-text-muted">Aucune affaire. Une affaire par besoin : maintenance, développement, reprise, dépannage.</p>}
      <ul className="space-y-2 mt-2">
        {affaires.map((a) => (
          <li key={a.id} className="rounded-lg border border-border p-3">
            {edition === a.id ? (
              <Formulaire ref_={ref_} campagnes={campagnes} initial={{ ...a, accord: a.accord || '', motif: a.motif || '', recontacter_le: a.recontacter_le ? String(a.recontacter_le).slice(0, 10) : '', prochaine_action_date: a.prochaine_action_date ? String(a.prochaine_action_date).slice(0, 10) : demain(), prochaine_action_canal: a.prochaine_action_canal || 'appel' }}
                onSave={enregistrer} onCancel={() => setEdition(null)} busy={busy} />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{a.titre}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ETAPE_CLS[a.etape]}`}>{ref_.etapes[a.etape]}</span>
                    <span className="text-xs text-text-muted">{ref_.types[a.type_besoin]}</span>
                    {a.accord && a.etape !== 'gagnee' && <span className={`text-xs px-2 py-0.5 rounded-full ${a.accord === 'ferme' ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-neutral-text'}`}>{a.accord === 'ferme' ? 'accord ferme' : 'incertain'}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEdition(a.id)} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Modifier"><FiEdit2 size={13} /></button>
                    <button onClick={() => supprimer(a)} className="p-1.5 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Supprimer"><FiTrash2 size={13} /></button>
                  </div>
                </div>
                <div className="text-xs text-text-secondary mt-1 flex gap-3 flex-wrap">
                  {euros(a.montant_ponctuel) && <span>{euros(a.montant_ponctuel)} ponctuel</span>}
                  {euros(a.montant_mensuel) && <span>{euros(a.montant_mensuel)}/mois</span>}
                  {a.campagne_nom && <span className="text-text-muted">campagne « {a.campagne_nom} »</span>}
                  {a.motif && <span>motif : {ref_.motifs[a.motif]}{a.motif_detail ? ` (${a.motif_detail})` : ''}</span>}
                  {a.recontacter_le && !a.ouverte && <span>en reparler le {fmtDate(a.recontacter_le)}</span>}
                </div>
                {a.ouverte && (
                  a.action_a_replanifier
                    ? <div className="text-xs text-warning-text mt-1 flex items-center gap-1"><FiAlertCircle size={12} /> Prochaine action faite ou fermée : posez la suivante (Modifier).</div>
                    : <div className="text-xs text-text-secondary mt-1">Prochaine action : <strong>{fmtDate(a.prochaine_action_date)}</strong> par {a.prochaine_action_canal === 'rdv' ? 'rendez-vous' : a.prochaine_action_canal}{a.prochaine_action_note ? `, ${a.prochaine_action_note}` : ''}</div>
                )}
                <Devis affaire={a} onChange={remplacer} />
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
