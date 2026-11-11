// Test A/B de la question finale (une campagne) : choix de la formulation B parmi les propositions,
// moitié des prospects en A (question d'origine), moitié en B ; résultats avec un verdict honnête.
// Figé dès qu'un email de la campagne est programmé ou parti.
import React, { useEffect, useState } from 'react';
import { FiGitBranch, FiAlertTriangle } from 'react-icons/fi';
import { campagnesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const FAMILLES = { preuve: 'Emails « par la preuve » (après un constat)', maintenance: 'Premiers contacts (sans constat)' };
const pc = (x) => (x === null || x === undefined ? '—' : `${String(x).replace('.', ',')} %`);

export default function AbTestPanel({ campaign, ab, verrouille, onChange }) {
  const { toast } = useToast();
  const [props, setProps] = useState(null);
  const [choix, setChoix] = useState({ preuve: '', maintenance: '' });
  const [edition, setEdition] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { campagnesAPI.abPropositions().then(setProps).catch(() => setProps(null)); }, []);
  useEffect(() => { setChoix({ preuve: (campaign.ab_question && campaign.ab_question.preuve) || '', maintenance: (campaign.ab_question && campaign.ab_question.maintenance) || '' }); }, [campaign.ab_question]);
  if (!props) return null;

  const enregistrer = async (config) => {
    setBusy(true);
    try {
      const r = await campagnesAPI.setAb(campaign.id, config);
      toast.success(config ? `Test lancé : ${r.A} ligne(s) en A, ${r.B} en B${r.a_relire ? `, ${r.a_relire} à relire` : ''}` : 'Test arrêté : toutes les lignes reviennent à la question d\'origine');
      setEdition(false);
      if (onChange) onChange();
    } catch (e) { toast.error(e.message || 'Réglage impossible'); } finally { setBusy(false); }
  };
  const actif = !!campaign.ab_question;

  if (!actif && !edition) {
    return (
      <div className="mb-4 rounded-xl border border-border bg-surface p-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-text-secondary flex items-center gap-2"><FiGitBranch size={14} /> Test A/B de la question finale : aucun.</span>
        {!verrouille && <button onClick={() => setEdition(true)} className="px-2.5 py-1 text-xs rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong">Préparer un test</button>}
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2"><FiGitBranch size={14} /> Test A/B de la question finale</h4>
      {edition ? (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">A = la question d'origine de chaque email. B = la formulation choisie ci-dessous. La moitié des prospects reçoit A, l'autre B, au hasard et à part égale pour chaque famille. Tout le reste de l'email est identique.</p>
          {Object.entries(FAMILLES).map(([f, lib]) => (
            <div key={f}>
              <div className="text-xs text-text-secondary mb-1">{lib}</div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-text-muted"><input type="radio" name={`ab-${f}`} checked={!choix[f]} onChange={() => setChoix({ ...choix, [f]: '' })} /> Pas de test pour cette famille</label>
                {props[f].map((p) => (
                  <label key={p.cle} className="flex items-center gap-2 text-sm text-text-primary">
                    <input type="radio" name={`ab-${f}`} checked={choix[f] === p.cle} onChange={() => setChoix({ ...choix, [f]: p.cle })} />
                    « {p.texte} »{p.texte_boutique !== p.texte ? <span className="text-xs text-text-muted"> (boutique : « {p.texte_boutique} »)</span> : null}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => enregistrer({ preuve: choix.preuve || null, maintenance: choix.maintenance || null })} disabled={busy || (!choix.preuve && !choix.maintenance)} className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50">{busy ? '…' : actif ? 'Mettre à jour le test' : 'Lancer le test'}</button>
            <button onClick={() => setEdition(false)} className="px-3 py-1.5 text-sm rounded-lg text-text-muted">Annuler</button>
            {actif && <button onClick={() => enregistrer(null)} disabled={busy} className="px-3 py-1.5 text-sm rounded-lg text-danger-text">Arrêter le test</button>}
          </div>
        </div>
      ) : (
        <>
          {ab && (
            <ul className="text-sm text-text-secondary mb-2 space-y-0.5">
              {Object.entries(ab.formulations).map(([f, t]) => <li key={f}>{FAMILLES[f]} : B = « {t} »</li>)}
            </ul>
          )}
          {ab && [['Cette campagne', ab.campagne], ...(ab.cumul ? [[`Cumul (${ab.cumul.campagnes.length} campagnes : ${ab.cumul.campagnes.join(', ')})`, ab.cumul]] : [])].map(([titre, bloc]) => (
            <div key={titre} className="mt-2">
              <div className="text-xs text-text-muted mb-1">{titre}</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-text-muted border-b border-border"><th className="py-1">Version</th><th className="py-1 text-right">Délivrés</th><th className="py-1 text-right">Réponses</th><th className="py-1 text-right">Clics prestations</th><th className="py-1 text-right">Refus</th></tr></thead>
                <tbody>
                  {['A', 'B'].map((k) => { const x = bloc.versions[k]; return (
                    <tr key={k} className="border-b border-border/50">
                      <td className="py-1 font-medium text-text-primary">{k}</td>
                      <td className="py-1 text-right tabular-nums">{x.delivres}</td>
                      <td className="py-1 text-right tabular-nums">{x.reponses} <span className="text-text-muted">({pc(x.taux_reponse)})</span></td>
                      <td className="py-1 text-right tabular-nums">{x.clics_prestations} <span className="text-text-muted">({pc(x.taux_clics)})</span></td>
                      <td className="py-1 text-right tabular-nums">{x.refus} <span className="text-text-muted">({pc(x.taux_refus)})</span></td>
                    </tr>); })}
                </tbody>
              </table>
              <p className={`text-sm mt-1 ${['A', 'B'].includes(bloc.verdict.conclusion) ? 'text-success-text' : 'text-text-secondary'}`}>{bloc.verdict.texte}</p>
              {bloc.verdict.attention && <p className="text-xs text-warning-text flex items-center gap-1"><FiAlertTriangle size={12} /> {bloc.verdict.attention}</p>}
            </div>
          ))}
          {ab && <p className="text-xs text-text-muted mt-2">{ab.definition}</p>}
          {!verrouille
            ? <button onClick={() => setEdition(true)} className="mt-2 px-2.5 py-1 text-xs rounded-lg bg-surface-strong text-text-primary hover:bg-border-strong">Modifier ou arrêter le test</button>
            : <p className="text-xs text-text-muted mt-2">Test figé : des emails sont programmés ou partis. Pour un autre test, créez une nouvelle campagne.</p>}
        </>
      )}
    </div>
  );
}
