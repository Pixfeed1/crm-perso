// src/components/common/SignaturePad.jsx
import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { FiTrash2, FiCheck, FiX } from 'react-icons/fi';

const SignaturePad = ({ onSave, onCancel, quoteId, autoCreateInvoice = false }) => {
  const sigCanvas = useRef();
  const [signerName, setSignerName] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(null);

  // Effacer la signature
  const handleClear = () => {
    sigCanvas.current.clear();
    setError(null);
  };

  // Sauvegarder la signature
  const handleSave = async () => {
    if (sigCanvas.current.isEmpty()) {
      setError('Veuillez signer avant de valider');
      return;
    }

    if (!signerName.trim()) {
      setError('Veuillez indiquer votre nom');
      return;
    }

    setSigning(true);
    setError(null);

    try {
      // Convertir la signature en base64
      const signatureData = sigCanvas.current.toDataURL('image/png');

      // Envoyer au backend
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/quotes/${quoteId}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          signed_by: signerName,
          signature_data: signatureData,
          create_invoice: autoCreateInvoice
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erreur lors de la signature');
      }

      const data = await response.json();
      console.log('Signature réussie:', data);

      // Notifier le parent
      if (onSave) {
        onSave(data);
      }
    } catch (err) {
      console.error('Erreur signature:', err);
      setError(err.message);
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">Signature électronique</h3>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            disabled={signing}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Nom du signataire */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Nom du signataire <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Votre nom complet"
              disabled={signing}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Canvas de signature */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Signature <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-gray-600 rounded-lg bg-white relative">
              <SignatureCanvas
                ref={sigCanvas}
                canvasProps={{
                  className: 'w-full h-48 cursor-crosshair',
                  style: { touchAction: 'none' }
                }}
                backgroundColor="white"
                penColor="black"
              />
              <div className="absolute bottom-2 right-2">
                <button
                  onClick={handleClear}
                  disabled={signing}
                  className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-lg disabled:opacity-50"
                  title="Effacer la signature"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Dessinez votre signature avec la souris ou le doigt
            </p>
          </div>

          {/* Option de création automatique de facture */}
          {autoCreateInvoice && (
            <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-lg p-4">
              <p className="text-sm text-indigo-300">
                ℹ️ Une facture sera automatiquement créée après la signature
              </p>
            </div>
          )}

          {/* Message d'erreur */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <FiX className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onCancel}
            disabled={signing}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={signing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {signing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signature en cours...</span>
              </>
            ) : (
              <>
                <FiCheck />
                <span>Signer le devis</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignaturePad;
