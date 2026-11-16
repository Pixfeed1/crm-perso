// Paramètres > Sauvegardes : copie chiffrée de la base sur Google Drive, sans aucune commande à taper.
// Connexion en un clic (scope drive.file : le CRM ne voit que ses propres fichiers), clé de chiffrement affichée
// une seule fois, envoi chaque nuit, test de relecture chaque semaine, alerte par mail en cas d'échec.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiHardDrive, FiKey, FiUploadCloud, FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiCopy } from 'react-icons/fi';
import { sauvegardeAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const fmt = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const bouton = 'px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50';

function Statut({ s }) {
  if (!s) return <span className="text-text-muted">pas encore</span>;
  const bon = s.statut === 'OK';
  return (
    <span className={bon ? 'text-success-text' : 'text-danger-text'}>
      {bon ? <FiCheckCircle className="inline mr-1" /> : <FiAlertTriangle className="inline mr-1" />}
      {s.statut} · {fmt(s.le)}{s.detail ? ` · ${s.detail}` : ''}
    </span>
  );
}

export default function SauvegardesSettings() {
  const { toast } = useToast();
  const [etat, setEtat] = useState(null);
  const [cle, setCle] = useState(null);       // { cle, empreinte } : affichée une seule fois
  const [rangee, setRangee] = useState(false);
  const [busy, setBusy] = useState('');

  const charger = useCallback(async () => {
    try { setEtat(await sauvegardeAPI.etat()); } catch (e) { toast.error(e.message || 'État des sauvegardes illisible'); }
  }, [toast]);
  // Envoi et test tournent en arrière-plan sur le serveur : on suit l'étape, puis on annonce le résultat.
  const suivi = useRef(null);
  useEffect(() => {
    if (!etat) return undefined;
    if (etat.en_cours) { suivi.current = etat.en_cours.quoi; const t = setTimeout(charger, 3000); return () => clearTimeout(t); }
    if (suivi.current) {
      const s = suivi.current === 'envoi' ? etat.envoi : etat.test;
      suivi.current = null;
      if (s && s.statut === 'OK') toast.success(`${s === etat.envoi ? 'Copie envoyée' : 'Copie relue'} : ${s.detail || s.fichier}`);
      else if (s) toast.error(`${s === etat.envoi ? 'Envoi' : 'Test de relecture'} en échec : ${s.detail || ''}`);
    }
    return undefined;
  }, [etat, charger, toast]);
  useEffect(() => {
    charger();
    const q = new URLSearchParams(window.location.search);
    if (q.get('drive') === 'success') toast.success('Google Drive connecté pour les sauvegardes');
    if (q.get('drive') === 'error') toast.error(`Connexion Google Drive : ${q.get('detail') || 'échec'}`);
  }, [charger, toast]);

  const action = async (quoi, fn, ok) => {
    setBusy(quoi);
    try { const r = await fn(); if (ok) toast.success(ok(r)); if (quoi !== 'envoyer' && quoi !== 'tester') await charger(); return r; }
    catch (e) { toast.error(e.message || 'Échec'); await charger(); return null; }
    finally { setBusy(''); }
  };
  const connecter = () => action('connecter', async () => { const r = await sauvegardeAPI.connecter(); window.location.href = r.authUrl; });
  const voirCle = () => action('cle', async () => setCle(await sauvegardeAPI.cle()));
  const cleRangee = () => action('rangee', async () => { await sauvegardeAPI.cleRangee(); setCle(null); }, () => 'Clé marquée comme rangée : elle ne s\'affichera plus');

  if (!etat) return null;
  return (
    <div className="bg-surface/30 rounded-lg border border-border/50 p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1 flex items-center gap-2"><FiHardDrive /> Sauvegardes hors du serveur</h2>
        <p className="text-text-muted text-sm">
          Chaque nuit, une copie de la base, chiffrée sur le serveur avant l'envoi, part dans le dossier « {etat.dossier} » de votre Google Drive.
          Chaque semaine, le CRM redescend la dernière copie, la déchiffre et vérifie qu'elle se relit ; un échec vous est envoyé par mail.
          Le CRM n'a accès qu'aux fichiers qu'il dépose, pas au reste de votre Drive.
        </p>
      </div>

      {!etat.connecte ? (
        <button onClick={connecter} disabled={!!busy} className={`${bouton} bg-accent text-white hover:bg-accent-hover`}>
          <FiHardDrive /> Connecter Google Drive pour les sauvegardes
        </button>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="text-text-primary">Google Drive connecté{etat.compte ? ` : ${etat.compte}` : ''}, le {fmt(etat.connecte_le)}</div>
          <div><span className="text-text-secondary">Dernier envoi : </span><Statut s={etat.envoi} /></div>
          <div><span className="text-text-secondary">Dernier test de relecture : </span><Statut s={etat.test} /></div>
          {etat.en_cours && <div className="text-text-primary">En cours : {etat.en_cours.quoi}, {etat.en_cours.etape || 'démarrage'} (depuis {new Date(etat.en_cours.depuis).toLocaleTimeString('fr-FR')})</div>}
          <div className="text-text-muted text-xs">{etat.planning} ; copies gardées {etat.garder_jours} jours sur Drive.</div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={() => action('envoyer', async () => setEtat(await sauvegardeAPI.envoyer()))} disabled={!!busy || !!etat.en_cours || etat.cle.a_afficher} className={`${bouton} bg-surface-strong text-text-primary`}>
              <FiUploadCloud /> {etat.en_cours && etat.en_cours.quoi === 'envoi' ? 'Envoi…' : 'Envoyer une copie maintenant'}
            </button>
            <button onClick={() => action('tester', async () => setEtat(await sauvegardeAPI.tester()))} disabled={!!busy || !!etat.en_cours || !etat.envoi} className={`${bouton} bg-surface-strong text-text-primary`}>
              <FiRefreshCw className={etat.en_cours && etat.en_cours.quoi !== 'envoi' ? 'animate-spin' : ''} /> {etat.en_cours && etat.en_cours.quoi !== 'envoi' ? 'Test…' : 'Tester la relecture maintenant'}
            </button>
            <button onClick={connecter} disabled={!!busy} className={`${bouton} text-text-muted`}>Reconnecter</button>
          </div>
          {!etat.cle.coherente && <div className="text-danger-text">La clé du serveur ne correspond pas à celle affichée à la connexion : aucun envoi tant que ce n'est pas réglé.</div>}
        </div>
      )}

      {etat.connecte && etat.cle.a_afficher && (
        <div className="rounded-xl border border-warning-text/40 bg-warning-bg/40 p-4 space-y-3">
          <div className="font-medium text-text-primary flex items-center gap-2"><FiKey /> Clé de chiffrement : à ranger maintenant</div>
          <p className="text-sm text-text-secondary">
            Elle ne s'affiche qu'une fois. Rangez-la dans votre gestionnaire de mots de passe, pas sur le serveur : si le serveur tombe, c'est elle qui permet de relire les copies.
            Sans elle, une copie est illisible, pour vous comme pour quiconque accéderait à votre Drive. Les envois commencent une fois la clé rangée.
          </p>
          {!cle ? (
            <button onClick={voirCle} disabled={!!busy} className={`${bouton} bg-accent text-white`}><FiKey /> Afficher la clé</button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="px-3 py-2 rounded-lg bg-surface text-text-primary font-mono text-sm break-all select-all">{cle.cle}</code>
                <button onClick={() => navigator.clipboard.writeText(cle.cle.replace(/\s+/g, '')).then(() => toast.success('Clé copiée'))} className={`${bouton} bg-surface-strong text-text-primary`} title="Copier"><FiCopy /></button>
              </div>
              <div className="text-xs text-text-muted">Empreinte de contrôle : {cle.empreinte}. Relire une copie sans le CRM : node backend/scripts/dechiffrer-sauvegarde.js &lt;copie&gt;, puis pg_restore.</div>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input type="checkbox" checked={rangee} onChange={(e) => setRangee(e.target.checked)} /> J'ai rangé la clé dans mon gestionnaire de mots de passe
              </label>
              <button onClick={cleRangee} disabled={!rangee || !!busy} className={`${bouton} bg-accent text-white`}>C'est rangé</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
