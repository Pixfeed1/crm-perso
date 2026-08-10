// src/components/common/EmailExtraFields.jsx
//
// Champs COMMUNS à tous les envois d'email de l'outil (uniformisation) :
//   - Copie (Cc) et Copie cachée (Cci), visibles d'emblée.
//   - Pièces jointes (PJ) : sélection multiple, conversion base64, plafond 15 Mo.
// Composant contrôlé : le parent détient l'état (cc, bcc, files) et le transmet.
// `files` est un tableau [{ filename, content(base64 sans préfixe), content_type, size }].
import React, { useRef, useState } from 'react';
import { FiPaperclip, FiX } from 'react-icons/fi';

const MAX_TOTAL = 15 * 1024 * 1024; // 15 Mo au total

const humanSize = (n) => {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
};

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => {
    const res = String(r.result || '');
    resolve(res.replace(/^data:[^;]+;base64,/, ''));
  };
  r.onerror = reject;
  r.readAsDataURL(file);
});

const EmailExtraFields = ({ cc, setCc, bcc, setBcc, files, setFiles }) => {
  const inputRef = useRef(null);
  // Cc/Cci VISIBLES par défaut : repliés derrière un lien discret, ils passaient
  // inaperçus et donnaient l'impression que la fonction n'existait pas.
  const [showCc] = useState(true);
  const [err, setErr] = useState('');

  const onPick = async (e) => {
    setErr('');
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const current = (files || []);
    let total = current.reduce((s, f) => s + (f.size || 0), 0);
    const added = [];
    for (const file of picked) {
      total += file.size;
      if (total > MAX_TOTAL) { setErr('Pièces jointes trop volumineuses (max 15 Mo au total)'); break; }
      try {
        const content = await readAsBase64(file);
        added.push({ filename: file.name, content, content_type: file.type || 'application/octet-stream', size: file.size });
      } catch { setErr('Impossible de lire un fichier'); }
    }
    if (added.length) setFiles([...current, ...added]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (idx) => setFiles((files || []).filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      {showCc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Copie (Cc)</label>
            <input type="text" value={cc || ''} onChange={(e) => setCc(e.target.value)}
              placeholder="a@x.com, b@y.com"
              className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Copie cachée (Cci)</label>
            <input type="text" value={bcc || ''} onChange={(e) => setBcc(e.target.value)}
              placeholder="discret@z.com"
              className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
      )}

      <div>
        <input ref={inputRef} type="file" multiple onChange={onPick} className="hidden" />
        <button type="button" onClick={() => inputRef.current && inputRef.current.click()}
          className="text-xs text-accent hover:underline flex items-center gap-1">
          <FiPaperclip size={12} /> Ajouter une pièce jointe
        </button>
        {(files && files.length > 0) && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface-muted border border-border rounded-lg text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <FiPaperclip size={13} className="flex-shrink-0 text-text-muted" />
                  <span className="truncate text-text-primary">{f.filename}</span>
                  <span className="text-text-muted text-xs flex-shrink-0">{humanSize(f.size || 0)}</span>
                </span>
                <button type="button" onClick={() => remove(i)} className="text-text-muted hover:text-red-400 flex-shrink-0">
                  <FiX size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
      </div>
    </div>
  );
};

export default EmailExtraFields;
