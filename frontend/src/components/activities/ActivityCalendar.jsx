// src/components/activities/ActivityCalendar.jsx
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiCheck } from 'react-icons/fi';

const ActivityCalendar = ({ activities, startDate, endDate, onSelectActivity, onAddActivity }) => {
  // Noms des jours de la semaine
  const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  
  // Générer un tableau de toutes les dates dans la période
  const daysInRange = useMemo(() => {
    const days = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return days;
  }, [startDate, endDate]);
  
  // Organiser les jours en semaines
  const weeksInRange = useMemo(() => {
    const weeks = [];
    let currentWeek = [];
    
    // Récupérer le jour de la semaine du premier jour (0-6, où 0 est dimanche)
    let firstDayOfWeek = daysInRange[0].getDay();
    // Ajuster pour commencer avec le lundi (0) plutôt que le dimanche (6)
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    // Ajouter des jours vides au début pour compléter la première semaine
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null);
    }
    
    // Ajouter tous les jours à leurs semaines respectives
    daysInRange.forEach(day => {
      currentWeek.push(day);
      
      // Si c'est un dimanche, créer une nouvelle semaine
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    
    // Compléter la dernière semaine avec des jours vides si nécessaire
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }
    
    return weeks;
  }, [daysInRange]);
  
  // Récupérer les activités pour un jour donné
  const getActivitiesForDay = (date) => {
    if (!date) return [];
    
    return activities.filter(activity => {
      const activityDate = new Date(activity.date);
      return activityDate.getDate() === date.getDate() &&
             activityDate.getMonth() === date.getMonth() &&
             activityDate.getFullYear() === date.getFullYear();
    });
  };
  
  // Vérifier si c'est aujourd'hui
  const isToday = (date) => {
    if (!date) return false;
    
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };
  
  // Configuration des couleurs de type
  const typeConfig = {
    'development': { bg: 'bg-blue-500/70', border: 'border-blue-400' },
    'design': { bg: 'bg-purple-500/70', border: 'border-purple-400' },
    'meeting': { bg: 'bg-indigo-500/70', border: 'border-indigo-400' },
    'call': { bg: 'bg-green-500/70', border: 'border-green-400' },
    'marketing': { bg: 'bg-amber-500/70', border: 'border-amber-400' },
    'maintenance': { bg: 'bg-teal-500/70', border: 'border-teal-400' }
  };
  
  // Configuration des couleurs de priorité
  const priorityBorder = {
    'high': 'border-l-rose-500',
    'medium': 'border-l-amber-500',
    'low': 'border-l-blue-500'
  };
  
  return (
    <div className="flex-1 overflow-y-auto">
      {/* En-tête des jours de la semaine */}
      <div className="grid grid-cols-7 text-center border-b border-border">
        {weekdays.map((day, index) => (
          <div key={index} className="py-2 text-text-muted font-medium text-sm">
            {day}
          </div>
        ))}
      </div>
      
      {/* Grille du calendrier */}
      <div className="divide-y divide-border/50">
        {weeksInRange.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 divide-x divide-border/50">
            {week.map((day, dayIndex) => (
              <div 
                key={dayIndex} 
                className={`min-h-[120px] p-2 ${
                  day ? (isToday(day) ? 'bg-indigo-900/20' : '') : 'bg-surface-muted/30'
                }`}
                onClick={() => day && onAddActivity(day)}
              >
                {day && (
                  <>
                    {/* Numéro du jour */}
                    <div className={`text-right font-medium mb-2 ${
                      isToday(day) ? 'text-indigo-300' : 'text-text-secondary'
                    }`}>
                      {day.getDate()}
                    </div>
                    
                    {/* Activités du jour */}
                    <div className="space-y-1">
                      {getActivitiesForDay(day).map(activity => {
                        const typeStyle = typeConfig[activity.type] || { bg: 'bg-border-strong/70', border: 'border-gray-500' };
                        const priorityStyle = priorityBorder[activity.priority] || 'border-l-gray-500';
                        
                        return (
                          <motion.div
                            key={activity.id}
                            className={`px-2 py-1 text-xs rounded truncate cursor-pointer border-l-2 ${typeStyle.bg} ${priorityStyle} text-text-primary ${
                              activity.status === 'completed' ? 'opacity-70' : ''
                            } flex items-center gap-1`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectActivity(activity);
                            }}
                          >
                            {activity.status === 'completed' && <FiCheck className="flex-shrink-0" />}
                            <span className="truncate">{activity.description}</span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityCalendar;