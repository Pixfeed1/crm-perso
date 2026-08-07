// src/components/common/TemplateSelector.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFile, FiX, FiCheck, FiCopy, FiInfo } from 'react-icons/fi';
import { getTemplatesByCategory, fillTemplate } from '../../services/templates';

/**
 * Composant de sélection de templates prédéfinis
 * Permet d'insérer rapidement des modèles de notes/emails dans les formulaires
 */
const TemplateSelector = ({
  category,
  onSelect,
  currentValue = '',
  buttonText = 'Insérer un template',
  buttonIcon = <FiFile />,
  variables = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Récupérer les templates de la catégorie
  const templates = getTemplatesByCategory(category);

  // Gérer la sélection d'un template
  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setPreviewMode(true);
  };

  // Insérer le template dans le champ
  const handleInsertTemplate = (mode = 'replace') => {
    if (!selectedTemplate) return;

    // Remplir les variables du template si fournies
    const filledContent = fillTemplate(selectedTemplate.content, variables);

    let finalContent;
    if (mode === 'replace') {
      finalContent = filledContent;
    } else if (mode === 'append') {
      finalContent = currentValue
        ? `${currentValue}\n\n---\n\n${filledContent}`
        : filledContent;
    }

    onSelect(finalContent);
    setIsOpen(false);
    setSelectedTemplate(null);
    setPreviewMode(false);
  };

  // Copier le template dans le presse-papiers
  const handleCopyTemplate = async () => {
    if (!selectedTemplate) return;

    const filledContent = fillTemplate(selectedTemplate.content, variables);

    try {
      await navigator.clipboard.writeText(filledContent);
      // Optionnel : afficher une notification de succès
    } catch (error) {
      console.error('Erreur lors de la copie:', error);
    }
  };

  return (
    <div className="relative">
      {/* Bouton d'ouverture */}
      <motion.button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-indigo-300 text-sm transition-colors"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {buttonIcon}
        <span>{buttonText}</span>
      </motion.button>

      {/* Modal de sélection */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsOpen(false);
                setSelectedTemplate(null);
                setPreviewMode(false);
              }}
            />

            {/* Modal */}
            <motion.div
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] max-w-4xl max-h-[90vh] panel-bg border border-purple-500/30 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
                <h3 className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2">
                  <FiFile className="text-indigo-400" />
                  Sélectionner un template
                </h3>
                <motion.button
                  onClick={() => {
                    setIsOpen(false);
                    setSelectedTemplate(null);
                    setPreviewMode(false);
                  }}
                  className="p-2 hover:bg-surface-strong/50 rounded-lg transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <FiX className="text-xl text-text-muted" />
                </motion.button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
                {/* Liste des templates */}
                {!previewMode && (
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {templates.length === 0 ? (
                      <div className="text-center py-12 text-text-muted">
                        Aucun template disponible pour cette catégorie
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {templates.map((template) => (
                          <motion.button
                            key={template.id}
                            onClick={() => handleSelectTemplate(template)}
                            className="p-4 bg-surface/50 hover:bg-indigo-600/20 border border-border hover:border-indigo-500/50 rounded-lg text-left transition-all group"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-start gap-3">
                              <FiFile className="text-indigo-400 text-xl mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-text-primary text-sm sm:text-base group-hover:text-indigo-300 transition-colors">
                                  {template.name}
                                </h4>
                                <p className="text-xs text-text-muted mt-1 line-clamp-2">
                                  {template.content.substring(0, 80)}...
                                </p>
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Prévisualisation */}
                {previewMode && selectedTemplate && (
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col">
                    {/* Titre et actions */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-semibold text-text-primary">
                          {selectedTemplate.name}
                        </h4>
                        <p className="text-sm text-text-muted mt-1">
                          Prévisualisation du template
                        </p>
                      </div>
                      <motion.button
                        onClick={() => {
                          setPreviewMode(false);
                          setSelectedTemplate(null);
                        }}
                        className="p-2 hover:bg-surface-strong/50 rounded-lg transition-colors flex-shrink-0"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <FiX className="text-text-muted" />
                      </motion.button>
                    </div>

                    {/* Contenu du template */}
                    <div className="flex-1 bg-surface/50 border border-border rounded-lg p-4 mb-4 overflow-y-auto">
                      <pre className="text-sm text-text-secondary whitespace-pre-wrap font-mono">
                        {fillTemplate(selectedTemplate.content, variables)}
                      </pre>
                    </div>

                    {/* Boutons d'action */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <motion.button
                        onClick={() => handleInsertTemplate('replace')}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <FiCheck />
                        Remplacer le contenu
                      </motion.button>

                      {currentValue && (
                        <motion.button
                          onClick={() => handleInsertTemplate('append')}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <FiCheck />
                          Ajouter à la fin
                        </motion.button>
                      )}

                      <motion.button
                        onClick={handleCopyTemplate}
                        className="px-4 py-3 bg-surface-strong hover:bg-gray-600 text-text-primary rounded-lg font-medium transition-colors"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        title="Copier dans le presse-papiers"
                      >
                        <FiCopy />
                      </motion.button>
                    </div>

                    {currentValue && (
                      <p className="text-xs text-text-muted mt-2 text-center flex items-center justify-center gap-1">
                        <FiInfo className="flex-shrink-0" />
                        Vous pouvez remplacer le contenu actuel ou l'ajouter à la fin
                      </p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TemplateSelector;
