// src/components/leads/ProspectEmails.jsx
//
// Fiche prospect : bouton "Envoyer un email" -> modale (modèle éditable + signature,
// envoi immédiat ou différé) + liste des emails programmés (annulables tant que pending).
// Réutilise l'envoi email existant (leadsAPI.sendEmail / scheduledEmailsAPI) et le log Suivi.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMail, FiSend, FiClock, FiX, FiTrash2, FiCpu, FiLoader } from 'react-icons/fi';
import { leadsAPI, scheduledEmailsAPI, emailTemplatesAPI, emailSignaturesAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { CHANNELS } from '../../utils/relationStatus';
import EmailExtraFields from '../common/EmailExtraFields';

const nowLocalDT = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset() + 60); // +1h par défaut
  return d.toISOString().slice(0, 16);
};

const resolveVars = (text, lead, prenomName) => {
  if (!text) return '';
  const source = (prenomName || lead.name || '').trim();
  const prenom = source.split(/\s+/)[0] || 'Bonjour';
  const site = lead.company || '';
  const platMatch = lead.notes && lead.notes.match(/Plateforme\s*:\s*([^\n]+)/i);
  const plateforme = (platMatch && platMatch[1].trim()) || lead.tags || '';
  return text.replace(/\{prenom\}/g, prenom).replace(/\{site\}/g, site).replace(/\{plateforme\}/g, plateforme);
};

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STATUS_BADGE = {
  pending: { cls: 'bg-warning-bg text-warning-text', label: 'Programmé' },
  sent: { cls: 'bg-success-bg text-success-text', label: 'Envoyé' },
  failed: { cls: 'bg-danger-bg text-danger-text', label: 'Erreur' },
  cancelled: { cls: 'bg-neutral-bg text-neutral-text', label: 'Annulé' }
};

const formatDT = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ProspectEmails = ({ lead, autoCompose = false }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [scheduled, setScheduled] = useState([]);

  // Destinataires possibles : contacts du prospect avec email, + l'email du lead.
  const contactRecipients = (lead.contacts || [])
    .filter((c) => c && c.email)
    .map((c) => ({ email: c.email.trim(), name: c.name || '' }));
  const recipientOptions = [...contactRecipients];
  if (lead.email && !recipientOptions.some((r) => r.email.toLowerCase() === lead.email.toLowerCase())) {
    recipientOptions.push({ email: lead.email.trim(), name: lead.name || '' });
  }
  const defaultTo = (contactRecipients[0] && contactRecipients[0].email) || lead.email || '';

  const [to, setTo] = useState(defaultTo);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [signatureId, setSignatureId] = useState('');
  const [mode, setMode] = useState('now'); // now | schedule
  const [sendAt, setSendAt] = useState(nowLocalDT());
  const [relanceDate, setRelanceDate] = useState('');
  const [relanceChannel, setRelanceChannel] = useState('appel');
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftTon, setDraftTon] = useState('humain');
  const [accounts, setAccounts] = useState([]);   // comptes d'envoi dispo (pro / gmail)
  const [fromAccount, setFromAccount] = useState('pro');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [files, setFiles] = useState([]);

  // Nom utilisé pour {prenom} selon le destinataire courant (contact choisi sinon lead).
  const recipientName = (email) => {
    const match = recipientOptions.find((r) => r.email.toLowerCase() === (email || '').toLowerCase());
    return (match && match.name) || lead.name || '';
  };

  const loadScheduled = useCallback(async () => {
    try {
      const data = await scheduledEmailsAPI.getByRelated('lead', lead.id);
      setScheduled(Array.isArray(data) ? data : (data.emails || data.data || []));
    } catch (error) {
      console.error('Erreur emails programmés:', error);
    }
  }, [lead.id]);

  useEffect(() => { loadScheduled(); }, [loadScheduled]);

  const openModal = async () => {
    setTo(defaultTo); setTemplateId(''); setSubject(''); setBody(''); setMode('now'); setSendAt(nowLocalDT());
    setRelanceDate(''); setRelanceChannel('appel'); setCc(''); setBcc(''); setFiles([]);
    setOpen(true);
    try {
      const [t, s, a] = await Promise.all([emailTemplatesAPI.list(), emailSignaturesAPI.list(), leadsAPI.getEmailAccounts().catch(() => null)]);
      setTemplates(t || []);
      setSignatures(s || []);
      const def = (s || []).find((x) => x.is_default) || (s || [])[0];
      setSignatureId(def ? String(def.id) : '');
      const accs = (a && a.accounts) || [];
      setAccounts(accs);
      setFromAccount((a && a.default) || (accs[0] && accs[0].id) || 'pro');
    } catch (error) {
      toast.error('Erreur lors du chargement des modèles');
    }
  };

  const applyTemplate = (id, recipientEmail = to) => {
    setTemplateId(id);
    if (!id) { setSubject(''); setBody(''); return; }
    const t = templates.find((x) => String(x.id) === String(id));
    if (!t) return;
    const prenomName = recipientName(recipientEmail);
    setSubject(resolveVars(t.subject, lead, prenomName));
    setBody(resolveVars(t.body, lead, prenomName));
  };

  // Changement de destinataire : met à jour {prenom} si un modèle est actif.
  const handleRecipientChange = (email) => {
    setTo(email);
    if (templateId) applyTemplate(templateId, email);
  };

  const signatureContent = () => {
    const s = signatures.find((x) => String(x.id) === String(signatureId));
    return s ? s.content : '';
  };

  // Rédaction du corps par Claude à partir des problèmes détectés par l'audit du crawl.
  // Claude ne signe pas : la signature par défaut (Paramètres) est ajoutée à l'envoi.
  const generateWithClaude = async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      const res = await leadsAPI.draftEmail(lead.id, { ton: draftTon });
      if (res.subject) setSubject(res.subject);
      setBody(res.body || '');
      toast.success('Brouillon rédigé par Claude');
    } catch (e) {
      toast.error(e.message || 'Échec de la rédaction');
    } finally {
      setDrafting(false);
    }
  };

  // Deep-link « Prospecter » depuis le Crawl : ouvre la modale + lance Claude, une seule fois.
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoCompose && !autoFired.current && lead && lead.id) {
      autoFired.current = true;
      (async () => { await openModal(); generateWithClaude(); })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCompose, lead]);

  const handleSend = async () => {
    if (!to || !subject || !body) { toast.error('Destinataire, objet et message requis'); return; }
    try {
      setSending(true);
      const acc = accounts.find((a) => a.id === fromAccount);
      const accLabel = acc ? ` (depuis ${acc.label})` : '';
      const attachments = files.map(({ filename, content, content_type }) => ({ filename, content, content_type }));
      if (mode === 'now') {
        await leadsAPI.sendEmail(lead.id, {
          to, subject, body, signature: signatureContent(), from_account: fromAccount,
          next_followup_date: relanceDate || null,
          next_followup_channel: relanceDate ? relanceChannel : null,
          cc: cc.trim() || null, bcc: bcc.trim() || null, attachments
        });
        toast.success(`Email envoyé${accLabel}`);
      } else {
        const bodyHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#374151;">`
          + `<div style="white-space:pre-wrap;">${esc(body)}</div>`
          + (signatureContent() ? `<div style="margin-top:18px;">${signatureContent()}</div>` : '')
          + `</div>`;
        await scheduledEmailsAPI.create({
          to_email: to,
          to_name: lead.name || '',
          subject,
          body_html: bodyHtml,
          body_text: body,
          scheduled_at: sendAt,
          email_type: 'prospect',
          related_type: 'lead',
          related_id: lead.id,
          from_account: fromAccount,
          cc_email: cc.trim() || null,
          bcc_email: bcc.trim() || null,
          attachments
        });
        toast.success(`Email programmé pour le ${formatDT(sendAt)}${accLabel}`);
      }
      setOpen(false);
      loadScheduled();
    } catch (error) {
      toast.error(error.message || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const cancelScheduled = async (id) => {
    try {
      await scheduledEmailsAPI.cancel(id);
      toast.success('Envoi annulé');
      loadScheduled();
    } catch (error) {
      toast.error("Erreur lors de l'annulation");
    }
  };

  const pendingList = scheduled.filter((e) => e.status === 'pending' || e.status === 'sent' || e.status === 'failed');

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2"><FiMail /> Emails</h3>
        <button onClick={openModal} className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 bg-accent hover:bg-accent-hover text-white transition-colors">
          <FiSend size={14} /> Envoyer un email
        </button>
      </div>

      {pendingList.length > 0 && (
        <div className="space-y-2">
          {pendingList.map((e) => {
            const sb = STATUS_BADGE[e.status] || STATUS_BADGE.pending;
            return (
              <div key={e.id} className="bg-surface-muted/40 border border-border rounded-xl p-3 flex items-center gap-3">
                <FiClock size={15} className="text-text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary truncate">{e.subject}</div>
                  <div className="text-xs text-text-muted">{formatDT(e.scheduled_at)}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.cls}`}>{sb.label}</span>
                {e.status === 'pending' && (
                  <button onClick={() => cancelScheduled(e.id)} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Annuler l'envoi">
                    <FiTrash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="panel-bg border border-border rounded-2xl max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden"
              style={{ maxHeight: '90dvh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-border shrink-0">
                <h2 className="text-lg font-bold text-text-primary">Envoyer un email</h2>
                <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary"><FiX size={20} /></button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Modèle</label>
                  <select
                    onChange={(e) => applyTemplate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">— Message vierge —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Destinataire</label>
                  {recipientOptions.length > 0 && (
                    <select
                      value={recipientOptions.some((r) => r.email.toLowerCase() === to.toLowerCase()) ? to : ''}
                      onChange={(e) => handleRecipientChange(e.target.value)}
                      className="w-full mb-2 px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                    >
                      {recipientOptions.map((r) => (
                        <option key={r.email} value={r.email}>{r.name ? `${r.name} — ${r.email}` : r.email}</option>
                      ))}
                      <option value="">Autre (saisie manuelle)…</option>
                    </select>
                  )}
                  <input type="email" value={to} onChange={(e) => handleRecipientChange(e.target.value)}
                    placeholder="email@exemple.com"
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
                  {recipientOptions.length === 0 && !to && (
                    <p className="text-xs text-danger-text mt-1">Aucune adresse email — ajoutez un email au prospect ou à un contact.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Objet</label>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <label className="text-sm text-text-secondary">Message</label>
                    <div className="flex items-center gap-1.5">
                      <select value={draftTon} onChange={(e) => setDraftTon(e.target.value)} disabled={drafting}
                        className="px-2 py-1 text-xs bg-surface-muted border border-border rounded-lg text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50"
                        title="Ton de l'email">
                        <option value="humain">Ton humain</option>
                        <option value="direct">Ton direct</option>
                        <option value="doux">Ton doux</option>
                      </select>
                      <button type="button" onClick={generateWithClaude} disabled={drafting}
                        title="Rédiger le message avec Claude à partir des problèmes détectés sur le site"
                        className="px-2.5 py-1 text-xs rounded-lg bg-accent/15 text-accent hover:bg-accent/25 flex items-center gap-1.5 disabled:opacity-50">
                        {drafting
                          ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={13} /></motion.span>
                          : <FiCpu size={13} />}
                        {drafting ? 'Rédaction…' : 'Rédiger avec Claude'}
                      </button>
                    </div>
                  </div>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent resize-y" />
                  <p className="text-xs text-text-muted mt-1">La signature par défaut (Paramètres) est ajoutée automatiquement à l'envoi.</p>
                </div>

                {/* Cc / Cci / pièces jointes — communs à tous les emails de l'outil */}
                <EmailExtraFields cc={cc} setCc={setCc} bcc={bcc} setBcc={setBcc} files={files} setFiles={setFiles} />

                {/* Choix de l'expéditeur (serveur pro / Gmail) — visible si 2 comptes configurés */}
                {accounts.length > 1 && (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Envoyer depuis</label>
                    <div className="flex gap-1 p-1 bg-surface-muted rounded-lg border border-border">
                      {accounts.map((a) => (
                        <button key={a.id} type="button" onClick={() => setFromAccount(a.id)}
                          className={`flex-1 px-3 py-1.5 rounded-md text-sm truncate transition-colors ${fromAccount === a.id ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-strong'}`}
                          title={a.label}>
                          {a.id === 'gmail' ? '✉️ ' : '🏢 '}{a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-text-secondary mb-2">Envoi</label>
                  <div className="flex gap-1 p-1 bg-surface-muted rounded-lg border border-border mb-2">
                    <button type="button" onClick={() => setMode('now')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm transition-colors ${mode === 'now' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-strong'}`}>
                      Maintenant
                    </button>
                    <button type="button" onClick={() => setMode('schedule')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm transition-colors ${mode === 'schedule' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-strong'}`}>
                      Programmer
                    </button>
                  </div>
                  {mode === 'schedule' && (
                    <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
                  )}
                </div>

                {mode === 'now' && (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Programmer une relance après l'envoi (optionnel)</label>
                    <div className="flex gap-2">
                      <input type="date" value={relanceDate} onChange={(e) => setRelanceDate(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
                      <select value={relanceChannel} onChange={(e) => setRelanceChannel(e.target.value)} disabled={!relanceDate}
                        className="w-28 px-2 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50">
                        {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
                <button type="button" onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2.5 border-2 border-border text-text-primary hover:bg-surface-strong rounded-lg font-medium transition-all">
                  Annuler
                </button>
                <button type="button" onClick={handleSend} disabled={sending || !to.trim()}
                  title={!to.trim() ? 'Aucune adresse email' : undefined}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {mode === 'now' ? <FiSend size={16} /> : <FiClock size={16} />}
                  {sending ? 'Envoi…' : (mode === 'now' ? 'Envoyer maintenant' : 'Programmer')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProspectEmails;
