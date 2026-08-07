// src/components/calendar/AlternativeSlots.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCalendar, FiClock, FiCheck, FiX, FiRefreshCw, FiStar } from 'react-icons/fi';

const AlternativeSlots = ({ slots, onSelectSlot, onClose, isLoading }) => {
  const [selectedSlot, setSelectedSlot] = useState(null);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (durationMinutes) => {
    if (durationMinutes < 60) {
      return `${durationMinutes} min`;
    }
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    return mins > 0 ? `${hours}h${mins}` : `${hours}h`;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-success-text';
    if (score >= 60) return 'text-warning-text';
    return 'text-warning-text';
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Bon';
    return 'Acceptable';
  };

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
  };

  const handleConfirm = () => {
    if (selectedSlot && onSelectSlot) {
      onSelectSlot(selectedSlot);
    }
  };

  const groupSlotsByDate = (slots) => {
    const grouped = {};
    slots.forEach(slot => {
      const date = new Date(slot.start).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(slot);
    });
    return grouped;
  };

  const groupedSlots = groupSlotsByDate(slots || []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      >
        <motion.div
          className="bg-gradient-to-br from-surface-muted via-surface to-surface-muted rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-border"
        >
          {/* Header */}
          <div className="bg-accent px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiCalendar className="text-2xl text-text-primary" />
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Créneaux disponibles</h2>
                <p className="text-sm text-text-primary/80">
                  {slots && slots.length > 0 ? `${slots.length} créneau${slots.length > 1 ? 'x' : ''} trouvé${slots.length > 1 ? 's' : ''}` : 'Recherche en cours...'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-text-primary hover:text-text-primary transition-colors"
            >
              <FiX className="text-2xl" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FiRefreshCw className="text-4xl text-accent animate-spin mb-4" />
                <p className="text-text-secondary">Recherche des meilleurs créneaux...</p>
              </div>
            ) : slots && slots.length > 0 ? (
              <div className="space-y-6">
                {Object.entries(groupedSlots).map(([date, dateSlots], dateIndex) => (
                  <div key={date}>
                    <h3 className="text-lg font-semibold text-text-primary mb-3 sticky top-0 bg-surface-muted/90 backdrop-blur-sm py-2 -mx-6 px-6 z-10">
                      {dateSlots && dateSlots.length > 0 ? formatDate(dateSlots[0].start) : date}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {dateSlots.map((slot, slotIndex) => (
                        <motion.div
                          key={slotIndex}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: (dateIndex * dateSlots.length + slotIndex) * 0.05 }}
                          onClick={() => handleSelectSlot(slot)}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedSlot === slot
                              ? 'border-accent bg-accent/10'
                              : 'border-border bg-surface/50 hover:border-border-strong hover:bg-surface'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <FiClock className="text-accent" />
                              <div>
                                <div className="font-semibold text-text-primary">
                                  {formatTime(slot.start)} - {formatTime(slot.end)}
                                </div>
                                <div className="text-xs text-text-muted">
                                  {formatDuration(slot.duration)}
                                </div>
                              </div>
                            </div>

                            {selectedSlot === slot && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-6 h-6 bg-accent rounded-full flex items-center justify-center"
                              >
                                <FiCheck className="text-text-primary text-sm" />
                              </motion.div>
                            )}
                          </div>

                          {/* Score de qualité */}
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                            <FiStar className={`text-sm ${getScoreColor(slot.score)}`} />
                            <span className={`text-xs font-semibold ${getScoreColor(slot.score)}`}>
                              {getScoreLabel(slot.score)}
                            </span>
                            <span className="text-xs text-text-muted ml-auto">
                              Score: {slot.score}/100
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FiCalendar className="text-6xl text-text-muted mx-auto mb-4" />
                <p className="text-xl text-text-muted mb-2">Aucun créneau disponible</p>
                <p className="text-sm text-text-muted">
                  Essayez d'élargir la plage de recherche ou de modifier la durée de l'événement
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {slots && slots.length > 0 && (
            <div className="bg-surface/50 px-6 py-4 border-t border-border flex items-center justify-between">
              <div className="text-sm text-text-muted">
                {selectedSlot ? (
                  <span>
                    Créneau sélectionné : <span className="font-semibold text-text-primary">{formatTime(selectedSlot.start)}</span>
                  </span>
                ) : (
                  <span>Sélectionnez un créneau pour continuer</span>
                )}
              </div>

              <div className="flex gap-3">
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg font-semibold transition-colors"
                >
                  Annuler
                </motion.button>

                <motion.button
                  onClick={handleConfirm}
                  disabled={!selectedSlot}
                  whileHover={selectedSlot ? { scale: 1.02 } : {}}
                  whileTap={selectedSlot ? { scale: 0.98 } : {}}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                    selectedSlot
                      ? 'bg-accent hover:bg-accent-hover text-white'
                      : 'bg-surface-strong text-text-muted cursor-not-allowed'
                  }`}
                >
                  <FiCheck />
                  <span>Utiliser ce créneau</span>
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AlternativeSlots;
