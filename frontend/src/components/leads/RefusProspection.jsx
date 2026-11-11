// Refus de prospection par canal (lot 4) : ne plus écrire, ne plus appeler, refus de toute
// sollicitation, pour cette fiche ou toute l'entreprise (son domaine). Vérifiés à chaque envoi,
// en campagne et à la création des relances. Retirer un refus demande une raison et reste tracé.
import React, { useCallback, useEffect, useState } from 'react';
import { FiSlash, FiPhoneOff, FiMail, FiAlertTriangle } from 'react-icons/fi';
import { leadsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const CHOIX = [
  { canal: 'email', label: 'Ne plus écrire', icon: FiMail },
  { canal: 'appel', label: 'Ne plus appeler', icon: FiPhoneOff },
  { canal: 'tout', label: 'Refus de toute sollicitation', icon: FiSlash }
];
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const SOURCES = { lien: 'désinscrit par le lien', rebond: 'adresse en erreur (rebond)', opposition: 'opposition', refus: 'refus de prospection' };

export default function RefusProspection({ lead, onChange }) {
  const { toast } = useToast();
  const [etat, setEtat] = useState(null);
  const [choix, setChoix] = useState(null);
  const [entreprise, setEntreprise] = useState(false);
  const [motif, setMotif] = useState('');
  const [retrait, setRetrait] = useState(null); // { id, raison }
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    try { setEtat(await leadsAPI.getRefus(lead.id)); } catch { setEtat(null); }
  }, [lead.id]);
  useEffect(() => { charger(); setChoix(null); setRetrait(null); }, [charger]);

  const enregistrer = async () => {
    setBusy(true);
    try {
      const r = await leadsAPI.addRefus(lead.id, { canal: choix, entreprise, motif: motif.trim() || null });
      setEtat(r); setChoix(null); setMotif(''); setEntreprise(false);
      (r.avertissements || []).forEach((a) => toast.warning(a));
      toast.success(`Refus enregistré${r.fiches_concernees > 1 ? ` sur ${r.fiches_concernees} fiches` : ''}${r.relances_fermees ? `, ${r.relances_fermees} relance${r.relances_fermees > 1 ? 's' : ''} fermée${r.relances_fermees > 1 ? 's' : ''}` : ''}`);
      if (onChange) onChange(r);
    } catch (e) { toast.error(e.message || 'Refus impossible à enregistrer'); } finally { setBusy(false); }
  };

  const retirer = async () => {
    setBusy(true);
    try {
      const r = await leadsAPI.retirerRefus(retrait.id, retrait.raison);
      setEtat(r); setRetrait(null);
      toast.success('Refus retiré (tracé dans l\'historique)');
      if (onChange) onChange(r);
    } catch (e) { toast.error(e.message || 'Retrait impossible'); } finally { setBusy(false); }
  };

  if (!etat) return null;
  const domaine = (etat.domaines || [])[0];
  const deja = (canal) => (canal === 'tout' ? !!etat.tout : !!etat[canal]);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-4">
      <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2"><FiSlash size={14} /> Refus de prospection</h3>

      {(etat.email || etat.appel) && (
        <div className="rounded-lg bg-danger-bg text-danger-text text-sm px-3 py-2 mb-2 flex items-start gap-2">
          <FiAlertTriangle className="mt-0.5 flex-shrink-0" size={14} />
          <span>
            {etat.tout ? 'Refus de toute sollicitation' : [etat.email && 'Ne plus écrire', etat.appel && 'Ne plus appeler'].filter(Boolean).join(' · ')}
            {' '}: aucun email, aucune relance sur ce canal ne peut être créé.
          </span>
        </div>
      )}

      {etat.lignes.length > 0 && (
        <ul className="space-y-1 mb-2">
          {etat.lignes.map((r) => (
            <li key={r.id} className="text-xs text-text-secondary flex items-center gap-2 flex-wrap">
              <span className="text-text-primary">{r.libelle}</span>
              <span>{r.domaine ? `toute l'entreprise (${r.domaine})` : 'cette fiche'}</span>
              <span className="text-text-muted">depuis le {fmt(r.created_at)}{r.source === 'campagne' ? ' (opposition en campagne)' : ''}{r.motif ? ` · ${r.motif}` : ''}</span>
              {retrait && retrait.id === r.id ? (
                <span className="flex items-center gap-1">
                  <input autoFocus value={retrait.raison} onChange={(e) => setRetrait({ ...retrait, raison: e.target.value })} placeholder="Pourquoi ? (erreur de saisie, le prospect vous a recontacté…)"
                    className="px-2 py-1 bg-surface-muted border border-border rounded-lg text-text-primary text-xs w-72" />
                  <button onClick={retirer} disabled={busy || !retrait.raison.trim()} className="px-2 py-1 rounded-lg bg-surface-strong text-text-primary disabled:opacity-50">Retirer</button>
                  <button onClick={() => setRetrait(null)} className="px-2 py-1 rounded-lg text-text-muted">Annuler</button>
                </span>
              ) : (
                <button onClick={() => setRetrait({ id: r.id, raison: '' })} className="underline text-text-muted hover:text-text-primary">retirer</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {etat.desinscrites.length > 0 && (
        <p className="text-xs text-text-muted mb-2">
          Adresses bloquées pour l'envoi : {etat.desinscrites.map((d) => `${d.email} (${SOURCES[d.source] || d.source}, ${fmt(d.created_at)})`).join(' · ')}
        </p>
      )}

      {!etat.tout && (
        <div className="flex items-center gap-2 flex-wrap">
          {CHOIX.filter((c) => !deja(c.canal)).map(({ canal, label, icon: Icon }) => (
            <button key={canal} onClick={() => setChoix(choix === canal ? null : canal)}
              className={`px-2.5 py-1 text-xs rounded-lg flex items-center gap-1 ${choix === canal ? 'bg-danger-bg text-danger-text' : 'bg-surface-strong text-text-primary hover:bg-border-strong'}`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      )}

      {choix && (
        <div className="mt-2 rounded-lg border border-border bg-surface-muted/60 p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={entreprise} onChange={(e) => setEntreprise(e.target.checked)} disabled={!domaine} className="w-4 h-4 rounded border-border" />
            {domaine
              ? <span>Toute l'entreprise : bloquer aussi les autres fiches et toutes les adresses <strong>@{domaine}</strong></span>
              : <span className="text-text-muted">Toute l'entreprise : impossible, aucun domaine d'entreprise connu (adresse webmail, pas de site)</span>}
          </label>
          <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif ou contexte (facultatif) : « m'a demandé au téléphone de ne plus l'appeler »…"
            className="w-full px-2 py-1 bg-surface border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent" />
          <div className="flex items-center gap-2">
            <button onClick={enregistrer} disabled={busy} className="px-3 py-1 text-xs rounded-lg bg-danger-bg text-danger-text hover:opacity-80 disabled:opacity-50">
              {busy ? '…' : `Enregistrer : ${CHOIX.find((c) => c.canal === choix).label.toLowerCase()}`}
            </button>
            <button onClick={() => setChoix(null)} className="px-3 py-1 text-xs rounded-lg text-text-muted">Annuler</button>
            {choix !== 'appel' && <span className="text-xs text-text-muted">Les adresses connues de la fiche ne recevront plus aucun email de prospection.</span>}
            {choix !== 'email' && <span className="text-xs text-text-muted">Les relances {choix === 'tout' ? '' : 'd\'appel et SMS '}prévues sont fermées.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
