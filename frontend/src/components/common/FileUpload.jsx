// src/components/common/FileUpload.jsx
import React, { useState } from 'react';
import { FiUpload, FiTrash2, FiFile, FiDownload, FiX } from 'react-icons/fi';

const FileUpload = ({
  entityType = 'quote', // 'quote' ou 'invoice'
  entityId,
  existingFiles = [],
  onFilesUpdated
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);

  // Formater la taille du fichier
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Obtenir l'icône selon le type de fichier
  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype === 'application/pdf') return '📄';
    if (mimetype.includes('word')) return '📝';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
    if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return '📊';
    if (mimetype.includes('zip')) return '📦';
    return '📎';
  };

  // Upload de fichiers
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/upload/${entityType}s/${entityId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erreur lors de l\'upload');
      }

      const data = await response.json();
      console.log('Upload réussi:', data);

      // Notifier le parent
      if (onFilesUpdated) {
        onFilesUpdated();
      }

      // Réinitialiser l'input
      e.target.value = '';
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(0), 1000);
    } catch (err) {
      console.error('Erreur upload:', err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Supprimer un fichier
  const handleDeleteFile = async (filename) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:5000/api/upload/${entityType}s/${entityId}/files/${filename}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erreur lors de la suppression');
      }

      // Notifier le parent
      if (onFilesUpdated) {
        onFilesUpdated();
      }
    } catch (err) {
      console.error('Erreur suppression:', err);
      setError(err.message);
    }
  };

  // Télécharger un fichier
  const handleDownloadFile = (filename) => {
    const url = `http://localhost:5000/uploads/${filename}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Zone d'upload */}
      <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-indigo-500 transition-colors">
        <input
          type="file"
          id="file-upload"
          multiple
          onChange={handleFileUpload}
          disabled={uploading || !entityId}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        />
        <label
          htmlFor="file-upload"
          className={`cursor-pointer flex flex-col items-center ${
            uploading || !entityId ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <FiUpload className="w-10 h-10 text-gray-400 mb-2" />
          <p className="text-gray-300 font-medium">
            {uploading ? 'Upload en cours...' : 'Cliquez pour sélectionner des fichiers'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Images, PDF, documents Office (max 10MB par fichier)
          </p>
        </label>

        {uploading && uploadProgress > 0 && (
          <div className="mt-4">
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
          <FiX className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Liste des fichiers */}
      {existingFiles && existingFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">
            Fichiers joints ({existingFiles.length})
          </h4>
          <div className="space-y-2">
            {existingFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-gray-800/30 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
              >
                <span className="text-2xl">{getFileIcon(file.mimetype)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {file.originalName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadFile(file.filename)}
                    className="p-2 text-indigo-400 hover:bg-indigo-500/20 rounded transition-colors"
                    title="Télécharger"
                  >
                    <FiDownload className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteFile(file.filename)}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                    title="Supprimer"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!entityId && (
        <p className="text-sm text-gray-500 text-center">
          Enregistrez d'abord le {entityType === 'quote' ? 'devis' : 'la facture'} pour pouvoir ajouter des fichiers
        </p>
      )}
    </div>
  );
};

export default FileUpload;
