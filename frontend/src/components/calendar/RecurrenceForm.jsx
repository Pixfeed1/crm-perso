// src/components/calendar/RecurrenceForm.jsx
import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const RecurrenceForm = ({ recurrenceData = {}, onChange }) => {
  const [formData, setFormData] = useState({
    recurrence_type: recurrenceData.recurrence_type || 'NONE',
    recurrence_interval: recurrenceData.recurrence_interval || 1,
    recurrence_days: recurrenceData.recurrence_days || '',
    recurrence_end_type: recurrenceData.recurrence_end_type || 'NEVER',
    recurrence_end_date: recurrenceData.recurrence_end_date ? new Date(recurrenceData.recurrence_end_date) : null,
    recurrence_count: recurrenceData.recurrence_count || 10
  });

  // Mettre à jour le parent quand les données changent
  useEffect(() => {
    onChange(formData);
  }, [formData]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDayToggle = (dayIndex) => {
    const days = formData.recurrence_days ? formData.recurrence_days.split(',').map(d => parseInt(d)) : [];
    const index = days.indexOf(dayIndex);

    if (index > -1) {
      // Retirer le jour
      days.splice(index, 1);
    } else {
      // Ajouter le jour
      days.push(dayIndex);
    }

    // Trier les jours
    days.sort((a, b) => a - b);

    setFormData(prev => ({
      ...prev,
      recurrence_days: days.join(',')
    }));
  };

  const weekDays = [
    { index: 0, label: 'Dim', fullLabel: 'Dimanche' },
    { index: 1, label: 'Lun', fullLabel: 'Lundi' },
    { index: 2, label: 'Mar', fullLabel: 'Mardi' },
    { index: 3, label: 'Mer', fullLabel: 'Mercredi' },
    { index: 4, label: 'Jeu', fullLabel: 'Jeudi' },
    { index: 5, label: 'Ven', fullLabel: 'Vendredi' },
    { index: 6, label: 'Sam', fullLabel: 'Samedi' }
  ];

  const recurrenceTypeOptions = [
    { value: 'NONE', label: 'Aucune récurrence' },
    { value: 'DAILY', label: 'Quotidienne' },
    { value: 'WEEKLY', label: 'Hebdomadaire' },
    { value: 'MONTHLY', label: 'Mensuelle' },
    { value: 'YEARLY', label: 'Annuelle' }
  ];

  const intervalLabels = {
    DAILY: 'jour(s)',
    WEEKLY: 'semaine(s)',
    MONTHLY: 'mois',
    YEARLY: 'année(s)'
  };

  if (formData.recurrence_type === 'NONE') {
    return (
      <div className="border-t border-border-strong pt-4">
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Récurrence
        </label>
        <select
          value={formData.recurrence_type}
          onChange={(e) => handleChange('recurrence_type', e.target.value)}
          className="w-full bg-surface-muted/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
        >
          {recurrenceTypeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="border-t border-border-strong pt-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Récurrence
        </label>
        <select
          value={formData.recurrence_type}
          onChange={(e) => handleChange('recurrence_type', e.target.value)}
          className="w-full bg-surface-muted/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
        >
          {recurrenceTypeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Intervalle */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Répéter tous les
        </label>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            min="1"
            max="365"
            value={formData.recurrence_interval}
            onChange={(e) => handleChange('recurrence_interval', parseInt(e.target.value) || 1)}
            className="w-20 bg-surface-muted/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-text-secondary">
            {intervalLabels[formData.recurrence_type] || ''}
          </span>
        </div>
      </div>

      {/* Jours de la semaine pour récurrence hebdomadaire */}
      {formData.recurrence_type === 'WEEKLY' && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Répéter le(s)
          </label>
          <div className="flex flex-wrap gap-2">
            {weekDays.map(day => {
              const isSelected = formData.recurrence_days
                ? formData.recurrence_days.split(',').map(d => parseInt(d)).includes(day.index)
                : false;

              return (
                <button
                  key={day.index}
                  type="button"
                  onClick={() => handleDayToggle(day.index)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-accent text-white'
                      : 'bg-surface-muted/50 text-text-secondary border border-border hover:bg-surface/50'
                  }`}
                  title={day.fullLabel}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fin de récurrence */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Fin de récurrence
        </label>

        <div className="space-y-2">
          {/* Jamais */}
          <label className="flex items-center text-text-secondary cursor-pointer">
            <input
              type="radio"
              name="recurrence_end_type"
              value="NEVER"
              checked={formData.recurrence_end_type === 'NEVER'}
              onChange={(e) => handleChange('recurrence_end_type', e.target.value)}
              className="mr-2"
            />
            Jamais
          </label>

          {/* Après X occurrences */}
          <label className="flex items-center text-text-secondary cursor-pointer">
            <input
              type="radio"
              name="recurrence_end_type"
              value="COUNT"
              checked={formData.recurrence_end_type === 'COUNT'}
              onChange={(e) => handleChange('recurrence_end_type', e.target.value)}
              className="mr-2"
            />
            Après
            <input
              type="number"
              min="1"
              max="999"
              value={formData.recurrence_count}
              onChange={(e) => handleChange('recurrence_count', parseInt(e.target.value) || 1)}
              disabled={formData.recurrence_end_type !== 'COUNT'}
              className={`mx-2 w-20 bg-surface-muted/50 text-text-primary border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent ${
                formData.recurrence_end_type !== 'COUNT' ? 'opacity-50' : ''
              }`}
            />
            occurrence(s)
          </label>

          {/* À une date spécifique */}
          <label className="flex items-center text-text-secondary cursor-pointer">
            <input
              type="radio"
              name="recurrence_end_type"
              value="DATE"
              checked={formData.recurrence_end_type === 'DATE'}
              onChange={(e) => handleChange('recurrence_end_type', e.target.value)}
              className="mr-2"
            />
            Le
            <div className="ml-2">
              <DatePicker
                selected={formData.recurrence_end_date}
                onChange={(date) => handleChange('recurrence_end_date', date)}
                dateFormat="dd/MM/yyyy"
                disabled={formData.recurrence_end_type !== 'DATE'}
                className={`bg-surface-muted/50 text-text-primary border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent ${
                  formData.recurrence_end_type !== 'DATE' ? 'opacity-50' : ''
                }`}
                minDate={new Date()}
              />
            </div>
          </label>
        </div>
      </div>

      {/* Résumé de la récurrence */}
      <div className="bg-accent/10 border border-accent/40 rounded-lg p-3">
        <p className="text-sm text-text-secondary">
          <span className="font-medium">Résumé : </span>
          {getSummary(formData)}
        </p>
      </div>
    </div>
  );
};

// Fonction helper pour générer un résumé lisible de la récurrence
const getSummary = (data) => {
  if (data.recurrence_type === 'NONE') {
    return 'Aucune récurrence';
  }

  let summary = '';

  // Type et intervalle
  const typeLabels = {
    DAILY: 'jour',
    WEEKLY: 'semaine',
    MONTHLY: 'mois',
    YEARLY: 'an'
  };

  const interval = data.recurrence_interval || 1;
  const typeLabel = typeLabels[data.recurrence_type];

  if (interval === 1) {
    summary = `Tous les ${typeLabel}s`;
  } else {
    summary = `Tous les ${interval} ${typeLabel}s`;
  }

  // Jours de la semaine pour récurrence hebdomadaire
  if (data.recurrence_type === 'WEEKLY' && data.recurrence_days) {
    const weekDays = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    const selectedDays = data.recurrence_days
      .split(',')
      .map(d => weekDays[parseInt(d)])
      .join(', ');

    if (selectedDays) {
      summary += ` le ${selectedDays}`;
    }
  }

  // Fin de récurrence
  if (data.recurrence_end_type === 'COUNT') {
    summary += `, ${data.recurrence_count} fois`;
  } else if (data.recurrence_end_type === 'DATE' && data.recurrence_end_date) {
    const endDate = new Date(data.recurrence_end_date);
    const formattedDate = endDate.toLocaleDateString('fr-FR');
    summary += `, jusqu'au ${formattedDate}`;
  }

  return summary;
};

export default RecurrenceForm;
