// src/components/common/QuickEmail.jsx
//
// Envoi rapide d'un email à une adresse LIBRE, sans créer de prospect.
// « Quand je veux aller vite » : destinataire tapé à la main, choix du compte
// (serveur pro / Gmail), signature par défaut ajoutée. Options uniformisées avec
// le reste de l'outil : copie (Cc), copie cachée (Cci), pièces jointes,
// suivi ouverture/clic, et programmation d'envoi.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiX, FiZap, FiClock } from 'react-icons/fi';
import { leadsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import EmailExtraFields from './EmailExtraFields';

const QuickEmail = ({ className = '' }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [files, setFiles] = useState([]);
  const [track, setTrack] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [fromAccount, setFromAccount] = useState('pro');
  const [sending, setSending] = useState(false);
  // Programmation
  const [isScheduled, setIsScheduled] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('09:00');

  const openModal = async () => {
    setTo(''); setSubject(''); setBody(''); setCc(''); setBcc(''); setFiles([]);
    setTrack(true); setIsScheduled(false); setOpen(true);
    const t = new Date(); t.setDate(t.getDate() + 1);
    setSchedDate(t.toISOString().split('T')[0]); setSchedTime('09:00');
    try {
      const a = await leadsAPI.getEmailAccounts();
      setAccounts((a && a.accounts) || []);
      setFromAccount((a && a.default) || 'pro');
    } catch { setAccounts([]); }
  };

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) { toast.error('Destinataire, objet et message requis'); return; }
    let scheduled_at = null;
    if (isScheduled) {
      if (!schedDate || !schedTime) { toast.error('Choisis une date et une heure'); return; }
      const dt = new Date(`${schedDate}T${schedTime}`);
      if (dt <= new Date()) { toast.error('La date doit être dans le futur'); return; }
      scheduled_at = dt.toISOString();
    }
    setSending(true);
    try {
      const attachments = files.map(({ filename, content, content_type }) => ({ filename, content, content_type }));
      const r = await leadsAPI.quickEmail({
        to: to.trim(), subject, body, from_account: fromAccount,
        cc: cc.trim() || null, bcc: bcc.trim() || null, attachments, track, scheduled_at,
      });
      const acc = accounts.find((x) => x.id === fromAccount);
      if (r && r.scheduled) toast.success(`Email programmé${acc ? ` (depuis ${acc.label})` : ''}`);
      else toast.success(`Email envoyé${acc ? ` (depuis ${acc.label})` : ''}`);
      setOpen(false);
    } catch (e) {
      toast.error(e.message || "Erreur lors de l'envoi");
    } finally { setSending(false); }
  };

  return (
    <>
      <button onClick={openModal}
        className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 bg-accent hover:bg-accent-hover text-white transition-colors ${className}`}
        title="Envoyer un email rapide à n'importe quelle adresse (sans créer de prospect)">
        <FiZap size={15} /> Email rapide
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setOpen(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="panel-bg border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-4 border-b border-border sticky top-0 panel-bg z-10">
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><FiZap size={18} /> Email rapide</h2>
                <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary"><FiX size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Destinataire</label>
                  <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@exemple.com"
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
                </div>
                {accounts.length > 1 && (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Envoyer depuis</label>
                    <div className="flex gap-1 p-1 bg-surface-muted rounded-lg border border-border">
                      {accounts.map((a) => (
                        <button key={a.id} type="button" onClick={() => setFromAccount(a.id)}
                          className={`flex-1 px-3 py-1.5 rounded-md text-sm truncate transition-colors ${fromAccount === a.id ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-strong'}`}
                          title={a.label}>{a.id === 'gmail' ? '✉️ ' : '🏢 '}{a.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Objet</label>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Message</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent resize-y" />
                  <p className="text-xs text-text-muted mt-1">La signature par défaut (Paramètres) est ajoutée automatiquement.</p>
                </div>

                {/* Cc / Cci / pièces jointes — communs à tous les emails de l'outil */}
                <EmailExtraFields cc={cc} setCc={setCc} bcc={bcc} setBcc={setBcc} files={files} setFiles={setFiles} />

                {/* Suivi ouverture/clic */}
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)}
                    className="w-4 h-4 rounded border-border" />
                  Suivre l'ouverture et les clics
                </label>

                {/* Programmer l'envoi */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)}
                      className="w-4 h-4 rounded border-border" />
                    <FiClock size={14} /> Programmer l'envoi
                  </label>
                  {isScheduled && (
                    <div className="flex gap-3">
                      <input type="date" value={schedDate} min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setSchedDate(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                      <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-border sticky bottom-0 panel-bg">
                <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2.5 border-2 border-border text-text-primary hover:bg-surface-strong rounded-lg font-medium">Annuler</button>
                <button onClick={send} disabled={sending || !to.trim()}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {isScheduled ? <FiClock size={16} /> : <FiSend size={16} />} {sending ? 'Envoi…' : (isScheduled ? 'Programmer' : 'Envoyer')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default QuickEmail;
