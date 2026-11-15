// Charte de rédaction et identité du site, telles que prepare_draft les relit à chaque dépôt (contrôles de style et
// relecture). Tout se modifie ici ou par l'outil modifier_charte du connecteur : chaque enregistrement crée une
// nouvelle version (l'ancien texte reste dans l'historique) et peut être annulé par « revenir à cette version ».
// La charte commune (règles, exemples, liste noire, seuils) est partagée par les deux sites : la modifier fait
// monter la version des deux.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiBookOpen, FiDownload, FiClock, FiEdit2, FiTrash2, FiPlus, FiRotateCcw, FiX, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { charteAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const fmt = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const champ = 'w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent';
const bouton = 'px-3 py-1.5 text-sm rounded-lg disabled:opacity-50';

function Section({ titre, ouvert, onBasculer, children, droite }) {
  return (
    <div className="bg-surface border border-border rounded-xl">
      <div className="w-full flex items-center justify-between gap-2 px-4 py-3">
        <button onClick={onBasculer} className="flex items-center gap-2 text-left text-sm font-semibold text-text-primary">
          {ouvert ? <FiChevronDown /> : <FiChevronRight />} {titre}
        </button>
        {droite}
      </div>
      {ouvert && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// Fenêtre de confirmation : aperçu (simulation) des changements, puis enregistrement.
function Confirmation({ apercu, motif, setMotif, onAnnuler, onEnregistrer, busy }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onAnnuler}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold text-text-primary">{apercu.retour_a ? `Revenir à la v${apercu.retour_a}` : 'Vérifier la modification'}</h3>
          <button onClick={onAnnuler} className="text-text-muted hover:text-text-primary"><FiX /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {apercu.sites.map((s) => (
            <div key={s.site_id}>
              <div className="font-medium text-text-primary mb-1">{s.domaine || `site ${s.site_id}`} : v{s.version_actuelle} → v{s.version_nouvelle}</div>
              <ul className="space-y-2">
                {s.changements.map((c, i) => (
                  <li key={i} className="rounded-lg border border-border p-2">
                    <div className="text-xs text-text-muted mb-1">{c.objet} · {c.cle}</div>
                    {c.avant !== null && <div className="text-danger-text whitespace-pre-wrap break-words">− {String(c.avant)}</div>}
                    {c.apres !== null && <div className="text-success-text whitespace-pre-wrap break-words">+ {String(c.apres)}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (facultatif) : « consigne du 16/11 sur les intros »…" className={champ} />
        </div>
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-border">
          <button onClick={onAnnuler} className={`${bouton} text-text-muted`}>Annuler</button>
          <button onClick={onEnregistrer} disabled={busy} className={`${bouton} bg-accent text-white hover:bg-accent-hover`}>{busy ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  );
}

function Liste({ nom, libelle, valeurs, regex, onAjouter, onRetirer }) {
  const [v, setV] = useState('');
  const [simple, setSimple] = useState(true);
  return (
    <div>
      <div className="text-xs font-medium text-text-secondary mb-1">{libelle} ({valeurs.length})</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {valeurs.map((x) => (
          <span key={x} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-strong text-xs text-text-primary font-mono">
            {x}<button onClick={() => onRetirer(nom, x)} title="Retirer" className="text-text-muted hover:text-danger-text"><FiX size={11} /></button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={regex ? 'expression à ajouter' : 'valeur à ajouter'} className={`${champ} py-1`} />
        {regex && (
          <label className="flex items-center gap-1 text-xs text-text-muted whitespace-nowrap" title="Décoché : expression régulière (motif du script)">
            <input type="checkbox" checked={simple} onChange={(e) => setSimple(e.target.checked)} /> telle quelle
          </label>
        )}
        <button disabled={!v.trim()} onClick={() => { onAjouter(nom, v.trim(), regex && simple); setV(''); }} className={`${bouton} bg-surface-strong text-text-primary`}><FiPlus /></button>
      </div>
    </div>
  );
}

export default function CharteTab({ siteId }) {
  const { toast } = useToast();
  const [c, setC] = useState(null);
  const [absente, setAbsente] = useState(false);
  const [versions, setVersions] = useState([]);
  const [ouverts, setOuverts] = useState({ identite: true });
  const [apercu, setApercu] = useState(null);       // { ...simulation, ops } ou { ...simulation, retour }
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [edition, setEdition] = useState(null);     // { type, cle, texte }
  const [identite, setIdentite] = useState('');
  const [nouvelle, setNouvelle] = useState({ cle: '', texte: '' });
  const [nouvelEx, setNouvelEx] = useState('');
  const [detailV, setDetailV] = useState(null);

  const charger = useCallback(async () => {
    if (!siteId) return;
    try {
      const [x, v] = await Promise.all([charteAPI.get(siteId), charteAPI.versions(siteId)]);
      setC(x); setVersions(v.versions || []); setAbsente(false); setIdentite(x.contenu.site.identite);
    } catch (e) { setC(null); setAbsente(true); }
  }, [siteId]);
  useEffect(() => { charger(); setEdition(null); }, [charger]);

  const basculer = (k) => setOuverts((o) => ({ ...o, [k]: !o[k] }));
  const sections = useMemo(() => {
    if (!c) return [];
    const m = [];
    for (const r of c.contenu.commun.regles) {
      const g = m.find((x) => x.section === r.section);
      if (g) g.regles.push(r); else m.push({ section: r.section, titre: r.section_titre, regles: [r] });
    }
    return m;
  }, [c]);

  // Toute modification : simulation d'abord, puis confirmation.
  const verifier = async (ops) => {
    setBusy(true);
    try { setApercu({ ...(await charteAPI.modifier(siteId, { operations: ops, simulation: true })), ops }); setMotif(''); }
    catch (e) { toast.error(e.message || 'Modification refusée'); } finally { setBusy(false); }
  };
  const verifierRetour = async (n) => {
    setBusy(true);
    try { setApercu({ ...(await charteAPI.retour(siteId, { version: n, simulation: true })), retour: n }); setMotif(''); }
    catch (e) { toast.error(e.message || 'Retour impossible'); } finally { setBusy(false); }
  };
  const enregistrer = async () => {
    setBusy(true);
    try {
      const r = apercu.retour
        ? await charteAPI.retour(siteId, { version: apercu.retour, motif: motif.trim() || null, simulation: false })
        : await charteAPI.modifier(siteId, { operations: apercu.ops, motif: motif.trim() || null, version_attendue: c.version, simulation: false });
      toast.success(`Enregistré : ${r.versions.map((v) => `site ${v.site_id} v${v.version}`).join(', ')}`);
      setApercu(null); setEdition(null); await charger();
    } catch (e) { toast.error(e.message || 'Enregistrement refusé'); } finally { setBusy(false); }
  };
  const exporter = async () => {
    try {
      const { nom, texte } = await charteAPI.exporter(siteId);
      const url = URL.createObjectURL(new Blob([texte], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = nom; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.message || 'Export impossible'); }
  };

  if (absente) return <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">Aucune charte de rédaction pour ce site.</div>;
  if (!c) return null;
  const { commun: C, site: S } = c.contenu;
  const L = c.libelles;
  const ajouterListe = (nom, valeur, texteSimple) => verifier([{ objet: 'liste', liste: nom, action: 'ajouter', valeur, texte_simple: texteSimple }]);
  const retirerListe = (nom, valeur) => verifier([{ objet: 'liste', liste: nom, action: 'retirer', valeur }]);

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 font-semibold text-text-primary"><FiBookOpen /> Charte de rédaction · {S.nom} ({c.domain}) · v{c.version}</div>
          <div className="text-xs text-text-muted mt-0.5">
            {fmt(c.created_at)} par {c.auteur}{c.motif ? ` · ${c.motif}` : ''}. Relue par prepare_draft à chaque dépôt (identite_version = {c.version}).
          </div>
        </div>
        <button onClick={exporter} className={`${bouton} bg-surface-strong text-text-primary flex items-center gap-1`}><FiDownload /> Exporter en Markdown</button>
      </div>

      <Section titre={`Identité du site (${S.registre})`} ouvert={ouverts.identite} onBasculer={() => basculer('identite')}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary">Registre :</span>
          {['tutoiement', 'vouvoiement'].map((r) => (
            <button key={r} disabled={busy || S.registre === r} onClick={() => verifier([{ objet: 'registre', action: 'modifier', valeur: r }])}
              className={`${bouton} ${S.registre === r ? 'bg-accent text-white' : 'bg-surface-strong text-text-primary'}`}>{r}</button>
          ))}
        </div>
        <textarea value={identite} onChange={(e) => setIdentite(e.target.value)} rows={12} className={`${champ} leading-relaxed`} />
        <div className="flex gap-2">
          <button disabled={busy || identite === S.identite || !identite.trim()} onClick={() => verifier([{ objet: 'identite', action: 'modifier', texte: identite }])}
            className={`${bouton} bg-accent text-white hover:bg-accent-hover`}>Vérifier la modification</button>
          {identite !== S.identite && <button onClick={() => setIdentite(S.identite)} className={`${bouton} text-text-muted`}>Annuler</button>}
        </div>
      </Section>

      <Section titre={`Charte commune aux deux sites (${C.regles.length} règles)`} ouvert={ouverts.regles} onBasculer={() => basculer('regles')}>
        {sections.map((g) => (
          <div key={g.section}>
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mt-2 mb-1">{g.section}. {g.titre}</div>
            <ul className="space-y-1.5">
              {g.regles.map((r) => (
                <li key={r.cle} className="text-sm text-text-primary">
                  {edition && edition.type === 'regle' && edition.cle === r.cle ? (
                    <div className="space-y-1">
                      <textarea value={edition.texte} onChange={(e) => setEdition({ ...edition, texte: e.target.value })} rows={4} className={champ} />
                      <div className="flex gap-2">
                        <button disabled={busy || !edition.texte.trim() || edition.texte === r.texte} onClick={() => verifier([{ objet: 'regle', action: 'modifier', cle: r.cle, texte: edition.texte }])} className={`${bouton} bg-accent text-white`}>Vérifier</button>
                        <button onClick={() => setEdition(null)} className={`${bouton} text-text-muted`}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 group">
                      <span className="font-mono text-xs text-text-muted pt-0.5 w-16 flex-shrink-0">{r.cle}</span>
                      <span className="flex-1 whitespace-pre-wrap">{r.texte}</span>
                      <span className="opacity-0 group-hover:opacity-100 flex gap-1 flex-shrink-0">
                        <button title="Modifier" onClick={() => setEdition({ type: 'regle', cle: r.cle, texte: r.texte })} className="text-text-muted hover:text-text-primary"><FiEdit2 size={13} /></button>
                        <button title="Retirer" onClick={() => verifier([{ objet: 'regle', action: 'retirer', cle: r.cle }])} className="text-text-muted hover:text-danger-text"><FiTrash2 size={13} /></button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-xs font-medium text-text-secondary">Ajouter une règle</div>
          <input value={nouvelle.cle} onChange={(e) => setNouvelle({ ...nouvelle, cle: e.target.value })} placeholder="Repère : 12.21, 11.2.14…" className={`${champ} w-48`} />
          <textarea value={nouvelle.texte} onChange={(e) => setNouvelle({ ...nouvelle, texte: e.target.value })} rows={3} placeholder="Texte de la règle" className={champ} />
          <button disabled={busy || !nouvelle.cle.trim() || !nouvelle.texte.trim()} onClick={() => verifier([{ objet: 'regle', action: 'ajouter', cle: nouvelle.cle.trim(), texte: nouvelle.texte }]).then(() => setNouvelle({ cle: '', texte: '' }))}
            className={`${bouton} bg-surface-strong text-text-primary`}>Vérifier l'ajout</button>
        </div>
      </Section>

      <Section titre={`Exemples (${(C.exemples || []).length})`} ouvert={ouverts.exemples} onBasculer={() => basculer('exemples')}>
        <p className="text-xs text-text-muted">Partie de la charte commune : la relecture les reçoit tous, à chaque dépôt.</p>
        {(C.exemples || []).map((e) => (
          <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">{e.id}{e.site_id ? ` · site ${e.site_id}` : ''}</span>
              <span className="flex gap-2">
                <button title="Modifier" onClick={() => setEdition({ type: 'exemple', cle: e.id, texte: e.texte })} className="text-text-muted hover:text-text-primary"><FiEdit2 size={13} /></button>
                <button title="Retirer" onClick={() => verifier([{ objet: 'exemple', action: 'retirer', id: e.id }])} className="text-text-muted hover:text-danger-text"><FiTrash2 size={13} /></button>
              </span>
            </div>
            {edition && edition.type === 'exemple' && edition.cle === e.id ? (
              <div className="space-y-1">
                <textarea value={edition.texte} onChange={(x) => setEdition({ ...edition, texte: x.target.value })} rows={8} className={champ} />
                <div className="flex gap-2">
                  <button disabled={busy || !edition.texte.trim() || edition.texte === e.texte} onClick={() => verifier([{ objet: 'exemple', action: 'modifier', id: e.id, texte: edition.texte }])} className={`${bouton} bg-accent text-white`}>Vérifier</button>
                  <button onClick={() => setEdition(null)} className={`${bouton} text-text-muted`}>Annuler</button>
                </div>
              </div>
            ) : <div className="whitespace-pre-wrap text-text-primary">{e.texte}</div>}
          </div>
        ))}
        <textarea value={nouvelEx} onChange={(e) => setNouvelEx(e.target.value)} rows={4} placeholder={`Nouvel exemple pour ${c.domain}`} className={champ} />
        <button disabled={busy || !nouvelEx.trim()} onClick={() => verifier([{ objet: 'exemple', action: 'ajouter', site_id: siteId, texte: nouvelEx }]).then(() => setNouvelEx(''))}
          className={`${bouton} bg-surface-strong text-text-primary`}>Vérifier l'ajout</button>
      </Section>

      <Section titre="Contrôles automatiques (listes et seuils)" ouvert={ouverts.controles} onBasculer={() => basculer('controles')}>
        <p className="text-xs text-text-muted">Listes et seuils communs aux deux sites ; effets et noms propres à {c.domain}.</p>
        {L.listes_communes.map((nom) => (
          <Liste key={nom} nom={nom} libelle={L.listes[nom]} valeurs={C.controles[nom] || []} regex={L.listes_regex.includes(nom)} onAjouter={ajouterListe} onRetirer={retirerListe} />
        ))}
        <div>
          <div className="text-xs font-medium text-text-secondary mb-1">Seuils</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(C.controles.seuils || {}).map(([k, v]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                <span className="font-mono">{k}</span>
                <input type="number" step="any" defaultValue={v} key={`${k}-${v}`} onBlur={(e) => { const n = Number(e.target.value); if (e.target.value !== '' && n !== v) verifier([{ objet: 'seuil', cle: k, action: 'modifier', valeur: n }]); }}
                  className={`${champ} py-1 w-24 text-right`} />
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-text-secondary mb-1">Effets sur {c.domain}</div>
          <div className="space-y-1">
            {Object.entries((S.controles || {}).effets || {}).map(([k, v]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-sm text-text-primary">
                <span>{L.effets[k] || k}</span>
                <select value={v} onChange={(e) => verifier([{ objet: 'effet', cle: k, action: 'modifier', valeur: e.target.value }])} className={`${champ} py-1 w-40`}>
                  {L.effets_possibles.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
        {L.listes_site.map((nom) => (
          <Liste key={nom} nom={nom} libelle={L.listes[nom]} valeurs={(S.controles || {})[nom] || []} regex={false} onAjouter={ajouterListe} onRetirer={retirerListe} />
        ))}
      </Section>

      <Section titre={`Historique (${versions.length} version${versions.length > 1 ? 's' : ''})`} ouvert={ouverts.historique} onBasculer={() => basculer('historique')} droite={<FiClock className="text-text-muted" />}>
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.version} className="rounded-lg border border-border p-2 text-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button onClick={() => setDetailV(detailV === v.version ? null : v.version)} className="text-left text-text-primary">
                  <strong>v{v.version}</strong> · {fmt(v.created_at)} · {v.auteur} ({v.origine}){v.motif ? ` · ${v.motif}` : ''}
                  <span className="text-text-muted"> · {(v.changements || []).length} changement{(v.changements || []).length > 1 ? 's' : ''}</span>
                </button>
                {v.version !== c.version && (
                  <button disabled={busy} onClick={() => verifierRetour(v.version)} className={`${bouton} bg-surface-strong text-text-primary flex items-center gap-1`}><FiRotateCcw size={13} /> Revenir à cette version</button>
                )}
              </div>
              {detailV === v.version && (
                <ul className="mt-2 space-y-1">
                  {(v.changements || []).map((x, i) => (
                    <li key={i} className="text-xs">
                      <span className="text-text-muted">{x.objet} · {x.cle}</span>
                      {x.avant !== null && <div className="text-danger-text whitespace-pre-wrap break-words">− {String(x.avant)}</div>}
                      {x.apres !== null && <div className="text-success-text whitespace-pre-wrap break-words">+ {String(x.apres)}</div>}
                    </li>
                  ))}
                  {!(v.changements || []).length && <li className="text-xs text-text-muted">Version initiale.</li>}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {apercu && <Confirmation apercu={apercu} motif={motif} setMotif={setMotif} busy={busy} onAnnuler={() => setApercu(null)} onEnregistrer={enregistrer} />}
    </div>
  );
}
