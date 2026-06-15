// backend/routes/eventsRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const eventModel = require('../models/eventModel');
const recurrenceService = require('../services/recurrenceService');
const conflictDetectionService = require('../services/conflictDetectionService');
const icalExportService = require('../services/icalExportService');
const eventDependencyModel = require('../models/eventDependencyModel');
const { normalizeImportEvent, parseImportPayload } = require('../utils/eventImport');

// Appliquer le middleware d'authentification à toutes les routes
router.use(authMiddleware);

// Obtenir tous les événements (incluant les occurrences récurrentes)
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const { start_date, end_date } = req.query;

  try {
    const events = await eventModel.getAllEvents(db, { start_date, end_date });

    // Si une plage de dates est spécifiée, générer les occurrences récurrentes
    if (start_date && end_date) {
      const allOccurrences = [];

      for (const event of events) {
        if (event.recurrence_type && event.recurrence_type !== 'NONE') {
          // Récupérer les exceptions (occurrences supprimées)
          const exceptions = await eventModel.getEventExceptions(db, event.id);

          // Générer les occurrences
          const occurrences = recurrenceService.generateOccurrences(
            {
              ...event,
              start_date: event.start_datetime,
              end_date: event.end_datetime
            },
            new Date(start_date),
            new Date(end_date),
            exceptions
          );

          allOccurrences.push(...occurrences);
        } else {
          // Événement non récurrent
          allOccurrences.push(event);
        }
      }

      // Récupérer aussi les occurrences modifiées (exceptions)
      const modifiedOccurrences = events
        .filter(e => e.is_exception)
        .map(e => ({
          ...e,
          start_date: e.start_datetime,
          end_date: e.end_datetime
        }));

      allOccurrences.push(...modifiedOccurrences);

      // Trier par date de début
      allOccurrences.sort((a, b) => new Date(a.start_date || a.start_datetime) - new Date(b.start_date || b.start_datetime));

      res.json(allOccurrences);
    } else {
      // Sans plage de dates, retourner seulement les événements de base
      res.json(events);
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des événements:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir un événement spécifique
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const event = await eventModel.getEventById(db, id);

    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    res.json(event);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un nouvel événement
router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const {
    title,
    description,
    start_datetime,
    end_datetime,
    all_day,
    location,
    category,
    priority,
    color,
    reminder_time,
    activity_id
  } = req.body;

  if (!title || !start_datetime) {
    return res.status(400).json({ message: 'Titre et date de début sont requis' });
  }

  try {
    const event = await eventModel.createEvent(db, {
      title,
      description,
      start_datetime,
      end_datetime,
      all_day,
      location,
      category,
      priority,
      color,
      reminder_time,
      activity_id
    });

    res.status(201).json(event);
  } catch (error) {
    console.error('Erreur lors de la création de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour un événement
router.put('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const {
    title,
    description,
    start_datetime,
    end_datetime,
    all_day,
    location,
    category,
    priority,
    color,
    reminder_time,
    activity_id
  } = req.body;

  try {
    // Vérifier si l'événement existe
    const existingEvent = await eventModel.getEventById(db, id);
    if (!existingEvent) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    const updatedEvent = await eventModel.updateEvent(db, id, {
      title,
      description,
      start_datetime,
      end_datetime,
      all_day,
      location,
      category,
      priority,
      color,
      reminder_time,
      activity_id
    });

    res.json(updatedEvent);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un événement
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    // Vérifier si l'événement existe
    const existingEvent = await eventModel.getEventById(db, id);
    if (!existingEvent) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    await eventModel.deleteEvent(db, id);
    res.json({ message: 'Événement supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ============= ROUTES POUR LES ÉVÉNEMENTS RÉCURRENTS =============

// Créer un événement récurrent
router.post('/recurring', async (req, res) => {
  const db = req.app.locals.db;
  const eventData = req.body;

  // Valider les données de récurrence
  const validation = recurrenceService.validateRecurrence(eventData);
  if (!validation.isValid) {
    return res.status(400).json({
      message: 'Données de récurrence invalides',
      errors: validation.errors
    });
  }

  try {
    const event = await eventModel.createRecurringEvent(db, eventData);
    res.status(201).json(event);
  } catch (error) {
    console.error('Erreur lors de la création de l\'événement récurrent:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// Import en masse d'événements via JSON.
// Body : un tableau d'événements OU { events: [...], defaults: {...}, dry_run: bool }.
// dry_run=true => aucun écrit, renvoie seulement l'aperçu (ce qui serait créé/ignoré + avertissements).
router.post('/import', async (req, res) => {
  const db = req.app.locals.db;
  const dryRun = req.body && req.body.dry_run === true;
  const { events, defaults } = parseImportPayload(req.body);

  if (!Array.isArray(events)) {
    return res.status(400).json({ message: 'Format attendu : un tableau d\'événements ou { "events": [...] }' });
  }
  if (events.length === 0) {
    return res.status(400).json({ message: 'Aucun événement à importer' });
  }
  if (events.length > 500) {
    return res.status(400).json({ message: 'Trop d\'événements (max 500 par import)' });
  }

  const report = { dry_run: dryRun, total: events.length, created: 0, skipped: 0, errors: [], preview: [] };

  for (let i = 0; i < events.length; i++) {
    const { event, isRecurring, warnings, error } = normalizeImportEvent(events[i], defaults);
    if (error) {
      report.errors.push({ index: i, title: (events[i] && events[i].title) || null, reason: error });
      continue;
    }

    // Dédoublonnage : même titre + même minute de début (évite les doublons en cas de réimport)
    let duplicate = false;
    try {
      const dup = await db.pool.query(
        `SELECT id FROM events WHERE title = $1 AND date_trunc('minute', start_datetime) = date_trunc('minute', $2::timestamp) LIMIT 1`,
        [event.title, event.start_datetime]
      );
      duplicate = dup.rows.length > 0;
    } catch (e) { /* en cas d'échec du contrôle on n'empêche pas l'import */ }

    const line = {
      index: i,
      title: event.title,
      start: event.start_datetime,
      end: event.end_datetime,
      recurring: !!isRecurring,
      duplicate,
      warnings: warnings || []
    };

    if (duplicate) {
      report.skipped++;
      line.action = 'skip_duplicate';
      report.preview.push(line);
      continue;
    }

    // Détection de conflits d'horaire avec les événements existants (avertissement, non bloquant).
    // Pour une série, on contrôle la première occurrence (fenêtre de base).
    try {
      const c = await conflictDetectionService.detectConflicts(db, event);
      const count = c.conflictCount != null ? c.conflictCount : (c.conflicts ? c.conflicts.length : 0);
      if (count > 0) {
        line.conflicts = count;
        line.warnings = [...line.warnings, `${count} conflit(s) d'horaire avec des événements existants`];
      }
    } catch (e) { /* la détection de conflits n'empêche pas l'import */ }

    if (dryRun) {
      line.action = 'would_create';
      report.preview.push(line);
      continue;
    }

    try {
      if (isRecurring) await eventModel.createRecurringEvent(db, event);
      else await eventModel.createEvent(db, event);
      report.created++;
      line.action = 'created';
      report.preview.push(line);
    } catch (e) {
      report.errors.push({ index: i, title: event.title, reason: e.message });
    }
  }

  res.status(200).json(report);
});

// Obtenir les occurrences d'un événement récurrent dans une plage
router.get('/:id/occurrences', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({
      message: 'Les paramètres start_date et end_date sont requis'
    });
  }

  try {
    const event = await eventModel.getEventById(db, id);
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    if (!event.recurrence_type || event.recurrence_type === 'NONE') {
      return res.status(400).json({ message: 'Cet événement n\'est pas récurrent' });
    }

    // Récupérer les exceptions
    const exceptions = await eventModel.getEventExceptions(db, id);

    // Générer les occurrences
    const occurrences = recurrenceService.generateOccurrences(
      {
        ...event,
        start_date: event.start_datetime,
        end_date: event.end_datetime
      },
      new Date(start_date),
      new Date(end_date),
      exceptions
    );

    res.json(occurrences);
  } catch (error) {
    console.error('Erreur lors de la génération des occurrences:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer une occurrence spécifique (ajouter une exception)
router.post('/:id/exceptions', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { exception_date } = req.body;

  if (!exception_date) {
    return res.status(400).json({ message: 'La date de l\'exception est requise' });
  }

  try {
    const event = await eventModel.getEventById(db, id);
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    if (!event.recurrence_type || event.recurrence_type === 'NONE') {
      return res.status(400).json({ message: 'Cet événement n\'est pas récurrent' });
    }

    await eventModel.addEventException(db, id, exception_date);
    res.json({ message: 'Occurrence supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'exception:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Restaurer une occurrence supprimée (retirer une exception)
router.delete('/:id/exceptions', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { exception_date } = req.body;

  if (!exception_date) {
    return res.status(400).json({ message: 'La date de l\'exception est requise' });
  }

  try {
    const event = await eventModel.getEventById(db, id);
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    await eventModel.removeEventException(db, id, exception_date);
    res.json({ message: 'Occurrence restaurée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'exception:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Modifier une occurrence spécifique d'un événement récurrent
router.post('/:id/modify-occurrence', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { exception_date, ...modifiedData } = req.body;

  if (!exception_date) {
    return res.status(400).json({ message: 'La date originale de l\'occurrence est requise' });
  }

  try {
    const event = await eventModel.getEventById(db, id);
    if (!event) {
      return res.status(404).json({ message: 'Événement parent non trouvé' });
    }

    if (!event.recurrence_type || event.recurrence_type === 'NONE') {
      return res.status(400).json({ message: 'Cet événement n\'est pas récurrent' });
    }

    // Créer l'exception modifiée
    const modifiedEvent = await eventModel.createEventException(
      db,
      id,
      exception_date,
      modifiedData
    );

    res.status(201).json(modifiedEvent);
  } catch (error) {
    console.error('Erreur lors de la modification de l\'occurrence:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir toutes les exceptions (suppressions) d'un événement récurrent
router.get('/:id/exceptions', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const event = await eventModel.getEventById(db, id);
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    const exceptions = await eventModel.getEventExceptions(db, id);
    res.json({ exceptions });
  } catch (error) {
    console.error('Erreur lors de la récupération des exceptions:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Obtenir toutes les occurrences modifiées d'un événement récurrent
router.get('/:id/modified-occurrences', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const event = await eventModel.getEventById(db, id);
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }

    const modifiedOccurrences = await eventModel.getModifiedOccurrences(db, id);
    res.json(modifiedOccurrences);
  } catch (error) {
    console.error('Erreur lors de la récupération des occurrences modifiées:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ============= DÉTECTION DE CONFLITS =============

// Vérifier les conflits pour un événement
router.post('/check-conflicts', async (req, res) => {
  const db = req.app.locals.db;
  const eventData = req.body;

  try {
    const analysis = await conflictDetectionService.analyzeConflicts(
      db,
      eventData,
      eventData.id // Exclure l'événement lui-même si c'est une modification
    );

    res.json(analysis);
  } catch (error) {
    console.error('Erreur lors de la vérification des conflits:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Suggérer des créneaux alternatifs
router.post('/suggest-slots', async (req, res) => {
  const db = req.app.locals.db;
  const { eventData, options } = req.body;

  try {
    const suggestions = await conflictDetectionService.suggestAlternativeSlots(
      db,
      eventData,
      options || {}
    );

    res.json({ suggestions });
  } catch (error) {
    console.error('Erreur lors de la suggestion de créneaux:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ============================================================================
// EXPORT iCAL (.ics)
// ============================================================================

// Exporter un seul événement au format .ics
router.get('/:id/export', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const icalContent = await icalExportService.exportEvent(db, id);

    // Récupérer le titre de l'événement pour le nom de fichier
    const eventResult = await db.pool.query('SELECT title FROM events WHERE id = $1', [id]);
    const fileName = eventResult.rows[0]?.title
      ? `${eventResult.rows[0].title.replace(/[^a-z0-9]/gi, '_')}.ics`
      : `event_${id}.ics`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(icalContent);
  } catch (error) {
    console.error('Erreur lors de l\'export de l\'événement:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export de l\'événement' });
  }
});

// Exporter tous les événements de l'utilisateur
router.get('/export/calendar', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const { start_date, end_date, calendar_name } = req.query;

  try {
    const icalContent = await icalExportService.exportCalendar(
      db,
      userId,
      start_date || null,
      end_date || null,
      calendar_name || 'Calendrier CRM'
    );

    const fileName = calendar_name
      ? `${calendar_name.replace(/[^a-z0-9]/gi, '_')}.ics`
      : 'calendar.ics';

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(icalContent);
  } catch (error) {
    console.error('Erreur lors de l\'export du calendrier:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export du calendrier' });
  }
});

// Exporter les événements par catégorie
router.get('/export/category/:category', async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;
  const { category } = req.params;
  const { calendar_name } = req.query;

  try {
    const icalContent = await icalExportService.exportByCategory(
      db,
      userId,
      category,
      calendar_name || `Calendrier CRM - ${category}`
    );

    const fileName = `calendar_${category}.ics`.replace(/[^a-z0-9_.]/gi, '_');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(icalContent);
  } catch (error) {
    console.error('Erreur lors de l\'export par catégorie:', error);
    res.status(500).json({ message: 'Erreur lors de l\'export par catégorie' });
  }
});

// ============================================================================
// TIMELINE / GANTT - DÉPENDANCES ET MÉTADONNÉES
// ============================================================================

// Récupérer les événements pour la vue timeline
router.get('/timeline', async (req, res) => {
  const db = req.app.locals.db;
  const { start_date, end_date, project_id, swimlane } = req.query;

  try {
    const events = await eventDependencyModel.getTimelineEvents(db, {
      start_date,
      end_date,
      project_id,
      swimlane
    });

    res.json(events);
  } catch (error) {
    console.error('Erreur lors de la récupération des événements timeline:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer toutes les dépendances
router.get('/dependencies', async (req, res) => {
  const db = req.app.locals.db;
  const { event_ids } = req.query;

  try {
    const eventIds = event_ids ? event_ids.split(',').map(Number) : null;
    const dependencies = await eventDependencyModel.getAllDependencies(db, eventIds);

    res.json(dependencies);
  } catch (error) {
    console.error('Erreur lors de la récupération des dépendances:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les dépendances d'un événement spécifique
router.get('/:id/dependencies', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  try {
    const dependencies = await eventDependencyModel.getEventDependencies(db, id);
    res.json(dependencies);
  } catch (error) {
    console.error('Erreur lors de la récupération des dépendances:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer une dépendance entre deux événements
router.post('/:id/dependencies', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { target_event_id, dependency_type, lag_days } = req.body;

  try {
    // Vérifier les dépendances circulaires
    const hasCircular = await eventDependencyModel.checkCircularDependency(
      db,
      id,
      target_event_id
    );

    if (hasCircular) {
      return res.status(400).json({
        message: 'Impossible de créer cette dépendance : cela créerait une dépendance circulaire'
      });
    }

    const dependency = await eventDependencyModel.createDependency(
      db,
      id,
      target_event_id,
      dependency_type || 'finish_to_start',
      lag_days || 0
    );

    res.status(201).json(dependency);
  } catch (error) {
    console.error('Erreur lors de la création de la dépendance:', error);

    if (error.code === '23505') { // Violation de contrainte unique
      return res.status(400).json({ message: 'Cette dépendance existe déjà' });
    }

    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour une dépendance
router.put('/dependencies/:dependencyId', async (req, res) => {
  const db = req.app.locals.db;
  const { dependencyId } = req.params;
  const updates = req.body;

  try {
    const dependency = await eventDependencyModel.updateDependency(db, dependencyId, updates);
    res.json(dependency);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la dépendance:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer une dépendance
router.delete('/dependencies/:dependencyId', async (req, res) => {
  const db = req.app.locals.db;
  const { dependencyId } = req.params;

  try {
    await eventDependencyModel.deleteDependency(db, dependencyId);
    res.json({ message: 'Dépendance supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la dépendance:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour les métadonnées timeline d'un événement
router.put('/:id/timeline-data', async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const timelineData = req.body;

  try {
    const event = await eventDependencyModel.updateEventTimelineData(db, id, timelineData);
    res.json(event);
  } catch (error) {
    console.error('Erreur lors de la mise à jour des données timeline:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Calculer l'ordre topologique des événements
router.post('/topological-order', async (req, res) => {
  const db = req.app.locals.db;
  const { event_ids } = req.body;

  try {
    if (!event_ids || !Array.isArray(event_ids)) {
      return res.status(400).json({ message: 'event_ids requis (tableau)' });
    }

    const order = await eventDependencyModel.getTopologicalOrder(db, event_ids);
    res.json(order);
  } catch (error) {
    console.error('Erreur lors du calcul de l\'ordre topologique:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
