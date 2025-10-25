// src/components/projects/TimelineView.jsx
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight, FiCalendar } from 'react-icons/fi';

const TimelineView = ({ projects, onProjectClick }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Calculer la plage de dates pour l'affichage
  const dateRange = useMemo(() => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const days = [];
    const current = new Date(start);

    while (current <= end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return { start, end, days };
  }, [currentMonth]);

  // Filtrer les projets qui ont des dates dans le mois actuel
  const visibleProjects = useMemo(() => {
    return projects.filter(project => {
      if (!project.start_date && !project.end_date) return false;

      const projectStart = project.start_date ? new Date(project.start_date) : null;
      const projectEnd = project.end_date ? new Date(project.end_date) : null;

      // Le projet est visible s'il chevauche le mois actuel
      if (projectStart && projectStart > dateRange.end) return false;
      if (projectEnd && projectEnd < dateRange.start) return false;

      return true;
    });
  }, [projects, dateRange]);

  // Calculer la position et la largeur d'une barre de projet
  const calculateBarPosition = (project) => {
    const projectStart = project.start_date ? new Date(project.start_date) : dateRange.start;
    const projectEnd = project.end_date ? new Date(project.end_date) : dateRange.end;

    // Ajuster aux limites du mois visible
    const visibleStart = projectStart < dateRange.start ? dateRange.start : projectStart;
    const visibleEnd = projectEnd > dateRange.end ? dateRange.end : projectEnd;

    const totalDays = dateRange.days.length;
    const startDay = Math.floor((visibleStart - dateRange.start) / (1000 * 60 * 60 * 24));
    const endDay = Math.ceil((visibleEnd - dateRange.start) / (1000 * 60 * 60 * 24));

    const left = (startDay / totalDays) * 100;
    const width = ((endDay - startDay) / totalDays) * 100;

    return { left, width };
  };

  // Obtenir la couleur selon le statut
  const getStatusColor = (status) => {
    const colors = {
      'planifié': 'bg-blue-500',
      'en-cours': 'bg-green-500',
      'terminé': 'bg-gray-500',
      'pause': 'bg-yellow-500',
      'annulé': 'bg-red-500'
    };
    return colors[status] || 'bg-purple-500';
  };

  // Navigation entre les mois
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  // Formater le nom du mois
  const monthName = currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="h-full flex flex-col bg-gray-900/30 rounded-xl p-4">
      {/* En-tête avec navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-semibold text-white capitalize">{monthName}</h3>
          <button
            onClick={goToToday}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm flex items-center gap-1 transition-colors"
          >
            <FiCalendar size={14} />
            Aujourd'hui
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={goToPreviousMonth}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            title="Mois précédent"
          >
            <FiChevronLeft />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            title="Mois suivant"
          >
            <FiChevronRight />
          </button>
        </div>
      </div>

      {/* En-tête du calendrier (jours du mois) */}
      <div className="flex border-b border-gray-700 pb-2 mb-4">
        <div className="w-48 flex-shrink-0"></div>
        <div className="flex-1 flex">
          {dateRange.days.map((day, index) => {
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            const isToday = day.toDateString() === new Date().toDateString();

            return (
              <div
                key={index}
                className={`flex-1 text-center text-xs ${
                  isToday ? 'text-purple-400 font-bold' : isWeekend ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                <div>{day.getDate()}</div>
                <div className="text-[10px]">
                  {day.toLocaleDateString('fr-FR', { weekday: 'narrow' })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Corps de la timeline avec les projets */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {visibleProjects.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Aucun projet ce mois-ci
          </div>
        ) : (
          visibleProjects.map((project) => {
            const { left, width } = calculateBarPosition(project);
            const statusColor = getStatusColor(project.status);

            return (
              <div key={project.id} className="flex items-center min-h-[60px]">
                {/* Nom du projet */}
                <div className="w-48 flex-shrink-0 pr-4">
                  <div className="text-sm font-medium text-white truncate">
                    {project.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {project.lead_name || 'Sans client'}
                  </div>
                </div>

                {/* Barre de timeline */}
                <div className="flex-1 relative h-12">
                  {/* Lignes de grille verticales */}
                  {dateRange.days.map((_, index) => {
                    const isWeekend = dateRange.days[index].getDay() === 0 || dateRange.days[index].getDay() === 6;
                    return (
                      <div
                        key={index}
                        className={`absolute h-full border-r ${
                          isWeekend ? 'border-gray-800' : 'border-gray-700/30'
                        }`}
                        style={{ left: `${(index / dateRange.days.length) * 100}%` }}
                      />
                    );
                  })}

                  {/* Barre du projet */}
                  <motion.div
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    className={`absolute ${statusColor} rounded-lg shadow-lg cursor-pointer hover:shadow-xl transition-shadow`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      top: '8px',
                      height: '32px'
                    }}
                    onClick={() => onProjectClick && onProjectClick(project)}
                    whileHover={{ scale: 1.02, zIndex: 10 }}
                  >
                    <div className="h-full flex items-center justify-center px-2 overflow-hidden">
                      <span className="text-white text-xs font-medium truncate">
                        {project.progress !== undefined && `${project.progress}%`}
                      </span>
                    </div>

                    {/* Barre de progression interne */}
                    {project.progress !== undefined && project.progress > 0 && (
                      <div
                        className="absolute bottom-0 left-0 h-1 bg-white/40 rounded-b-lg"
                        style={{ width: `${project.progress}%` }}
                      />
                    )}
                  </motion.div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-700 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span className="text-gray-400">Planifié</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="text-gray-400">En cours</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-500 rounded"></div>
          <span className="text-gray-400">Terminé</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500 rounded"></div>
          <span className="text-gray-400">Pause</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span className="text-gray-400">Annulé</span>
        </div>
      </div>
    </div>
  );
};

export default TimelineView;
