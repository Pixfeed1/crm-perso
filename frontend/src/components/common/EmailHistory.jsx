// src/components/common/EmailHistory.jsx
//
// Historique GLOBAL des emails sortants : tout ce qui part de l'outil, quelle que
// soit l'origine (prospection, envoi rapide, devis, facture, rapport, relance…).
//
// Avant, chaque canal gardait sa trace dans son coin, et un envoi différé non
// rattaché à un prospect disparaissait complètement une fois parti. Ici tout est
// listé, filtrable, et surtout : on clique sur une ligne pour RELIRE le message.
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMail, FiX, FiEye, FiMousePointer, FiPaperclip, FiAlertCircle, FiSearch, FiArrowLeft } from 'react-icons/fi';
import DOMPurify from 'dompurify';
import { emailHistoryAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const formatDT = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

const PAGE = 40;

const EmailHistory = ({ open, onClose }) => {
  const { toast } = useToast();
  const [emails, setEmails] = useState([]);
  const [sources, setSources] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null); // email ouvert en lecture

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await emailHistoryAPI.list({ source, status, q, limit: PAGE, offset });
      setEmails((d && d.emails) || []);
      setTotal((d && d.total) || 0);
      setSources((d && d.sources) || {});
    } catch (e) {
      toast.error(e.message || "Impossible de charger l'historique");
    } finally { setLoading(false); }
  }, [source, status, q, offset, toast]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { if (open) { setSelected(null); setOffset(0); } }, [open]);

  // Ouvre un email : le corps n'est pas dans la liste, on le charge à la demande.
  const openEmail = async (id) => {
    try {
      setSelected({ loading: true });
      const full = await emailHistoryAPI.getById(id);
      setSelected(full);
    } catch (e) {
      setSelected(null);
      toast.error(e.message || "Impossible d'ouvrir cet email");
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
        onClick={onClose}>
        <motion.div initial={{ scale: 0.97, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 16 }}
          className="panel-bg border border-border rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}>

          <div className="flex justify-between items-center px-6 py-4 border-b border-border">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              {selected && (
                <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text-primary" title="Retour à la liste">
                  <FiArrowLeft size={18} />
                </button>
              )}
              <FiMail size={18} /> {selected ? 'Email envoyé' : 'Historique des emails'}
              {!selected && total > 0 && <span className="text-sm font-normal text-text-muted">({total})</span>}
            </h2>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary"><FiX size={20} /></button>
          </div>

          {selected ? (
            /* ---------- Lecture d'un email ---------- */
            <div className="p-6 overflow-y-auto">
              {selected.loading ? (
                <p className="text-sm text-text-muted">Chargement…</p>
              ) : (
                <>
                  <div className="mb-4 space-y-1 text-sm">
                    <div className="text-text-primary font-medium text-base">{selected.subject}</div>
                    <div className="text-text-muted">À : <span className="text-text-secondary">{selected.to_email}</span></div>
                    {selected.cc_email && <div className="text-text-muted">Cc : <span className="text-text-secondary">{selected.cc_email}</span></div>}
                    {selected.bcc_email && <div className="text-text-muted">Cci : <span className="text-text-secondary">{selected.bcc_email}</span></div>}
                    <div className="text-text-muted">
                      Envoyé le <span className="text-text-secondary">{formatDT(selected.sent_at)}</span>
                      {selected.from_email && <> depuis <span className="text-text-secondary">{selected.from_email}</span></>}
                    </div>
                    <div className="flex gap-3 pt-1 flex-wrap">
                      {selected.status === 'failed' ? (
                        <span className="text-xs text-danger-text flex items-center gap-1">
                          <FiAlertCircle size={12} /> Échec : {selected.error_message}
                        </span>
                      ) : (
                        <>
                          {selected.open_count > 0
                            ? <span className="text-xs text-success-text flex items-center gap-1"><FiEye size={12} /> ouvert {selected.open_count}×</span>
                            : <span className="text-xs text-text-muted">non ouvert</span>}
                          {selected.click_count > 0 && (
                            <span className="text-xs text-info-text flex items-center gap-1"><FiMousePointer size={12} /> {selected.click_count} clic(s)</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {/* Feuille blanche : le message est écrit pour une boîte mail. */}
                  <div className="border border-border rounded-lg p-4 overflow-x-auto"
                    style={{ background: '#ffffff', color: '#374151', colorScheme: 'light' }}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.body_html || '<i>(corps non enregistré)</i>') }} />
                </>
              )}
            </div>
          ) : (
            /* ---------- Liste ---------- */
            <>
              <div className="px-6 py-3 border-b border-border flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }}
                    placeholder="Destinataire ou objet…"
                    className="w-full pl-9 pr-3 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
                <select value={source} onChange={(e) => { setSource(e.target.value); setOffset(0); }}
                  className="px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent">
                  <option value="">Toutes origines</option>
                  {Object.entries(sources).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
                  className="px-2 py-1.5 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent">
                  <option value="">Tous</option>
                  <option value="sent">Envoyés</option>
                  <option value="failed">Échecs</option>
                </select>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-3">
                {loading ? (
                  <p className="text-sm text-text-muted">Chargement…</p>
                ) : emails.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    Aucun email pour ces critères. L'historique se remplit à partir des envois faits après la mise à jour.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {emails.map((e) => (
                      <li key={e.id}>
                        <button onClick={() => openEmail(e.id)}
                          className="w-full text-left px-3 py-2 bg-surface-muted border border-border rounded-lg hover:border-accent transition-colors">
                          <div className="flex justify-between gap-2 items-start">
                            <span className="text-sm text-text-primary truncate">{e.subject || '(sans objet)'}</span>
                            <span className="text-xs text-text-muted flex-shrink-0">{formatDT(e.sent_at)}</span>
                          </div>
                          <div className="flex justify-between gap-2 items-center mt-0.5">
                            <span className="text-xs text-text-muted truncate">
                              {e.to_email}
                              {sources[e.source] && <span className="ml-2 px-1.5 py-0.5 rounded bg-neutral-bg text-neutral-text">{sources[e.source]}</span>}
                            </span>
                            <span className="flex gap-2 flex-shrink-0 items-center">
                              {e.attachments_count > 0 && <FiPaperclip size={12} className="text-text-muted" />}
                              {e.status === 'failed'
                                ? <span className="text-xs text-danger-text flex items-center gap-1"><FiAlertCircle size={12} /> échec</span>
                                : e.open_count > 0
                                  ? <span className="text-xs text-success-text flex items-center gap-1"><FiEye size={12} /> {e.open_count}</span>
                                  : <span className="text-xs text-text-muted">non ouvert</span>}
                              {e.click_count > 0 && <span className="text-xs text-info-text flex items-center gap-1"><FiMousePointer size={12} /> {e.click_count}</span>}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {total > PAGE && (
                <div className="px-6 py-3 border-t border-border flex justify-between items-center text-sm">
                  <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}
                    className="px-3 py-1.5 border border-border rounded-lg text-text-primary disabled:opacity-40">Précédent</button>
                  <span className="text-text-muted">{offset + 1}–{Math.min(offset + PAGE, total)} sur {total}</span>
                  <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}
                    className="px-3 py-1.5 border border-border rounded-lg text-text-primary disabled:opacity-40">Suivant</button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EmailHistory;
