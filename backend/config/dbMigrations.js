/**
 * Configuration des migrations de la base de données
 * Ce fichier gère les migrations de schéma pour la base de données SQLite
 */

const { verbose } = require('sqlite3');
const sqlite3 = verbose();
const path = require('path');
const fs = require('fs');

// Mot de passe par défaut pour l'admin
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

/**
 * Classe de gestion des migrations de base de données
 */
class DatabaseMigrations {
  constructor(db) {
    this.db = db;
    this.currentVersion = 0;
    this.migrations = [];
    this.initMigrations();
  }

  /**
   * Initialise les migrations disponibles
   */
  initMigrations() {
    // Migration 1: Création des tables initiales
    this.migrations.push(this.createInitialTables.bind(this));

    // Migration 2: Ajout des tables pour les objectifs
    this.migrations.push(this.addGoalsTables.bind(this));

    // Migration 3: Ajout de la colonne progress à la table projects
    this.migrations.push(this.addProgressToProjects.bind(this));

    // Migration 4: Vérification et correction de la table activities pour le lead_name
    this.migrations.push(this.ensureActivitiesLeadNameColumn.bind(this));

    // Migration 5: Ajout des colonnes pour la récupération de mot de passe
    this.migrations.push(this.addPasswordResetColumns.bind(this));

    // Migration 6: Création de la table des interactions avec les leads
    this.migrations.push(this.createLeadInteractionsTable.bind(this));

    // Migration 7: Création de la table des rappels/notifications
    this.migrations.push(this.createRemindersTable.bind(this));

    // Migration 8: Création de la table clients pour les leads convertis
    this.migrations.push(this.createClientsTable.bind(this));
  }

  /**
   * Vérifie la version actuelle de la base de données
   * @returns {Promise<number>} La version actuelle
   */
  async checkCurrentVersion() {
    return new Promise((resolve, reject) => {
      // Vérifie si la table de métadonnées existe
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='db_metadata'", (err, row) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la vérification de la table de métadonnées:', err);
          return reject(err);
        }

        if (!row) {
          // La table n'existe pas, créons-la
          this.db.run(`
            CREATE TABLE db_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
          `, (err) => {
            if (err) {
              console.error('[Migrations] Erreur lors de la création de la table de métadonnées:', err);
              return reject(err);
            }
            
            // Insertion de la version initiale
            this.db.run("INSERT INTO db_metadata (key, value) VALUES ('version', '0')", (err) => {
              if (err) {
                console.error('[Migrations] Erreur lors de l\'initialisation de la version:', err);
                return reject(err);
              }
              
              console.log('[Migrations] Table de métadonnées créée avec la version initiale 0');
              resolve(0);
            });
          });
        } else {
          // La table existe, récupérons la version
          this.db.get("SELECT value FROM db_metadata WHERE key='version'", (err, row) => {
            if (err) {
              console.error('[Migrations] Erreur lors de la récupération de la version:', err);
              return reject(err);
            }
            
            if (!row) {
              // Pas de version trouvée, initialisons-la
              this.db.run("INSERT INTO db_metadata (key, value) VALUES ('version', '0')", (err) => {
                if (err) {
                  console.error('[Migrations] Erreur lors de l\'initialisation de la version:', err);
                  return reject(err);
                }
                
                console.log('[Migrations] Version initialisée à 0');
                resolve(0);
              });
            } else {
              const version = parseInt(row.value, 10);
              console.log('[Migrations] Version actuelle de la base de données:', version);
              resolve(version);
            }
          });
        }
      });
    });
  }

  /**
   * Met à jour la version de la base de données
   * @param {number} version Nouvelle version
   * @returns {Promise<void>}
   */
  async updateVersion(version) {
    return new Promise((resolve, reject) => {
      this.db.run("UPDATE db_metadata SET value = ? WHERE key = 'version'", [version.toString()], (err) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la mise à jour de la version:', err);
          return reject(err);
        }
        
        console.log(`[Migrations] Version mise à jour vers ${version}`);
        resolve();
      });
    });
  }

  /**
   * Exécute les migrations nécessaires
   * @returns {Promise<void>}
   */
  async migrate() {
    try {
      this.currentVersion = await this.checkCurrentVersion();
      console.log(`[Migrations] Vérification de la version de la base de données...`);
      console.log(`[Migrations] Version actuelle de la base de données: ${this.currentVersion}`);

      const targetVersion = this.migrations.length;
      if (this.currentVersion >= targetVersion) {
        console.log(`[Migrations] La base de données est à jour (version ${this.currentVersion})`);
        return;
      }

      // Exécution des migrations manquantes
      for (let i = this.currentVersion; i < targetVersion; i++) {
        const migrationVersion = i + 1;
        console.log(`[Migrations] Exécution de la migration vers la version ${migrationVersion}...`);
        
        try {
          await this.migrations[i]();
          await this.updateVersion(migrationVersion);
          console.log(`[Migrations] Migration ${migrationVersion} terminée avec succès`);
        } catch (error) {
          console.error(`[Migrations] Erreur lors de la migration ${migrationVersion}:`, error);
          throw error;
        }
      }

      console.log(`[Migrations] Toutes les migrations ont été appliquées avec succès`);
    } catch (error) {
      console.error('[Migrations] Erreur lors du processus de migration:', error);
      throw error;
    }
  }

  /**
   * Migration 1: Création des tables initiales
   * @returns {Promise<void>}
   */
  async createInitialTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Table des utilisateurs
        this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT UNIQUE,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) return reject(err);
        });

        // Table des clients
        this.db.run(`
          CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_name TEXT,
            email TEXT,
            phone TEXT,
            address TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) return reject(err);
        });

        // Table des projets
        this.db.run(`
          CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            client_id INTEGER,
            status TEXT DEFAULT 'pending',
            start_date TEXT,
            end_date TEXT,
            budget REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients (id)
          )
        `, (err) => {
          if (err) return reject(err);
        });

        // Table des tâches
        this.db.run(`
          CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            assigned_to INTEGER,
            due_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects (id),
            FOREIGN KEY (assigned_to) REFERENCES users (id)
          )
        `, (err) => {
          if (err) return reject(err);
        });

        // Insertion d'un utilisateur admin par défaut
        this.db.run(`
          INSERT OR IGNORE INTO users (username, email, password, role)
          VALUES ('admin', 'admin@example.com', ?, 'admin')
        `, [DEFAULT_ADMIN_PASSWORD], (err) => {
          if (err) return reject(err);
          console.log('[Migrations] Utilisateur admin créé avec succès');
          resolve();
        });
      });
    });
  }

  /**
   * Migration 2: Ajout des tables pour les objectifs
   * @returns {Promise<void>}
   */
  async addGoalsTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Table des objectifs
        this.db.run(`
          CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            target_value REAL,
            current_value REAL DEFAULT 0,
            unit TEXT,
            start_date TEXT,
            end_date TEXT,
            status TEXT DEFAULT 'active',
            user_id INTEGER,
            category TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
          )
        `, (err) => {
          if (err) return reject(err);
        });

        // Table des mises à jour d'objectifs
        this.db.run(`
          CREATE TABLE IF NOT EXISTS goal_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            value REAL NOT NULL,
            notes TEXT,
            update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER,
            FOREIGN KEY (goal_id) REFERENCES goals (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
          )
        `, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  /**
   * Migration 3: Ajout de la colonne progress à la table projects
   * @returns {Promise<void>}
   */
  async addProgressToProjects() {
    return new Promise((resolve, reject) => {
      // Vérifier si la colonne progress existe déjà
      this.db.all("PRAGMA table_info(projects)", (err, rows) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la vérification des colonnes de la table projects:', err);
          return reject(err);
        }

        // Vérifier que rows est bien un tableau et le logger pour le debug
        console.log('[Migrations] Structure reçue pour les colonnes:', typeof rows, rows);
        
        // Traiter rows comme un objet si ce n'est pas un tableau
        let progressColumnExists = false;
        
        if (Array.isArray(rows)) {
          progressColumnExists = rows.some(row => row.name === 'progress');
        } else if (typeof rows === 'object' && rows !== null) {
          // Si c'est un objet, tenter de trouver une propriété qui pourrait contenir les colonnes
          const allValues = Object.values(rows);
          for (const value of allValues) {
            if (typeof value === 'object' && value !== null && typeof value.name === 'string') {
              if (value.name === 'progress') {
                progressColumnExists = true;
                break;
              }
            }
          }
        } else {
          console.error('[Migrations] Format inattendu pour les colonnes:', rows);
          return reject(new Error('Format inattendu pour les colonnes'));
        }
        
        if (progressColumnExists) {
          console.log('[Migrations] La colonne progress existe déjà dans la table projects');
          return resolve();
        }

        // Ajouter la colonne progress
        this.db.run("ALTER TABLE projects ADD COLUMN progress REAL DEFAULT 0", (err) => {
          if (err) {
            console.error('[Migrations] Erreur lors de l\'ajout de la colonne progress:', err);
            return reject(err);
          }

          console.log('[Migrations] Colonne progress ajoutée à la table projects');
          resolve();
        });
      });
    });
  }
  
  /**
   * Migration 4: Vérification et correction de la table activities pour le lead_name
   * @returns {Promise<void>}
   */
  async ensureActivitiesLeadNameColumn() {
    return new Promise((resolve, reject) => {
      console.log('[Migrations] Vérification de la table activities et de la colonne lead_name...');
      
      // Première étape: vérifier si la table activities existe
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'", (err, tableExists) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la vérification de la table activities:', err);
          return reject(err);
        }
        
        if (!tableExists) {
          console.log('[Migrations] Table activities non trouvée, création de la table...');
          
          // Créer la table activities complète avec la colonne lead_name
          this.db.run(`
            CREATE TABLE IF NOT EXISTS activities (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              description TEXT NOT NULL,
              planned_time INTEGER DEFAULT 0,
              actual_time INTEGER DEFAULT 0,
              date TEXT NOT NULL,
              priority TEXT DEFAULT 'medium',
              status TEXT DEFAULT 'planned',
              project_id INTEGER,
              lead_id INTEGER,
              lead_name TEXT,
              created_at TEXT,
              updated_at TEXT,
              FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
              FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
            )
          `, (createErr) => {
            if (createErr) {
              console.error('[Migrations] Erreur lors de la création de la table activities:', createErr);
              return reject(createErr);
            }
            
            console.log('[Migrations] Table activities créée avec succès, incluant la colonne lead_name');
            resolve();
          });
        } else {
          // La table existe, vérifions si la colonne lead_name existe
          this.db.all("PRAGMA table_info(activities)", (infoErr, columns) => {
            if (infoErr) {
              console.error('[Migrations] Erreur lors de la récupération des informations de la table activities:', infoErr);
              return reject(infoErr);
            }
            
            let leadNameExists = false;
            
            if (Array.isArray(columns)) {
              leadNameExists = columns.some(col => col.name === 'lead_name');
            } else if (typeof columns === 'object' && columns !== null) {
              // Si c'est un objet, parcourir ses valeurs
              const allValues = Object.values(columns);
              for (const value of allValues) {
                if (typeof value === 'object' && value !== null && typeof value.name === 'string') {
                  if (value.name === 'lead_name') {
                    leadNameExists = true;
                    break;
                  }
                }
              }
            }
            
            if (leadNameExists) {
              console.log('[Migrations] La colonne lead_name existe déjà dans la table activities');
              return resolve();
            }
            
            // La colonne n'existe pas, l'ajouter
            console.log('[Migrations] Ajout de la colonne lead_name à la table activities...');
            this.db.run("ALTER TABLE activities ADD COLUMN lead_name TEXT", (alterErr) => {
              if (alterErr) {
                console.error('[Migrations] Erreur lors de l\'ajout de la colonne lead_name:', alterErr);
                return reject(alterErr);
              }
              
              console.log('[Migrations] Colonne lead_name ajoutée avec succès à la table activities');
              
              // Mettre à jour les valeurs de lead_name à partir des leads existants
              this.db.run(`
                UPDATE activities 
                SET lead_name = (
                  SELECT name 
                  FROM leads 
                  WHERE leads.id = activities.lead_id
                )
                WHERE lead_id IS NOT NULL AND (lead_name IS NULL OR lead_name = '')
              `, (updateErr) => {
                if (updateErr) {
                  console.warn('[Migrations] Avertissement: Impossible de mettre à jour les lead_name existants:', updateErr);
                  // Ne pas échouer si cette mise à jour ne fonctionne pas, car la table leads peut ne pas exister
                }
                
                console.log('[Migrations] Migration pour lead_name terminée avec succès');
                resolve();
              });
            });
          });
        }
      });
    });
  }

  /**
   * Migration 5: Ajout des colonnes pour la récupération de mot de passe
   * @returns {Promise<void>}
   */
  async addPasswordResetColumns() {
    return new Promise((resolve, reject) => {
      console.log('[Migrations] Migration 5: Ajout des colonnes pour la récupération de mot de passe');

      // Vérifier si les colonnes existent déjà
      this.db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la récupération des informations de la table users:', err);
          return reject(err);
        }

        const resetTokenExists = columns.some(col => col.name === 'reset_token');
        const resetTokenExpiresExists = columns.some(col => col.name === 'reset_token_expires');

        if (resetTokenExists && resetTokenExpiresExists) {
          console.log('[Migrations] Les colonnes reset_token et reset_token_expires existent déjà');
          return resolve();
        }

        // Ajouter les colonnes si elles n'existent pas
        this.db.serialize(() => {
          if (!resetTokenExists) {
            this.db.run("ALTER TABLE users ADD COLUMN reset_token TEXT", (err) => {
              if (err) {
                console.error('[Migrations] Erreur lors de l\'ajout de reset_token:', err);
                return reject(err);
              }
              console.log('[Migrations] Colonne reset_token ajoutée');
            });
          }

          if (!resetTokenExpiresExists) {
            this.db.run("ALTER TABLE users ADD COLUMN reset_token_expires INTEGER", (err) => {
              if (err) {
                console.error('[Migrations] Erreur lors de l\'ajout de reset_token_expires:', err);
                return reject(err);
              }
              console.log('[Migrations] Colonne reset_token_expires ajoutée');
            });
          }

          console.log('[Migrations] Migration 5 terminée avec succès');
          resolve();
        });
      });
    });
  }

  /**
   * Migration 6: Création de la table des interactions avec les leads
   * Pour le suivi des appels, emails, rencontres, notes
   */
  async createLeadInteractionsTable() {
    return new Promise((resolve, reject) => {
      console.log('[Migrations] Migration 6: Création de la table lead_interactions');

      // Vérifier si la table existe déjà
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='lead_interactions'", (err, row) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la vérification de la table lead_interactions:', err);
          return reject(err);
        }

        if (row) {
          console.log('[Migrations] La table lead_interactions existe déjà, skip');
          return resolve();
        }

        // Créer la table lead_interactions
        this.db.run(`
          CREATE TABLE lead_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL,
            contact_id INTEGER,
            type TEXT NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('[Migrations] Erreur lors de la création de la table lead_interactions:', err);
            return reject(err);
          }

          console.log('[Migrations] Table lead_interactions créée avec succès');
          console.log('[Migrations] Migration 6 terminée avec succès');
          resolve();
        });
      });
    });
  }

  /**
   * Migration 7: Création de la table reminders pour les rappels
   */
  async createRemindersTable() {
    return new Promise((resolve, reject) => {
      console.log('[Migrations] Migration 7: Création de la table reminders');

      // Vérifier si la table existe déjà
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='reminders'", (err, row) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la vérification de la table reminders:', err);
          return reject(err);
        }

        if (row) {
          console.log('[Migrations] La table reminders existe déjà, skip');
          return resolve();
        }

        // Créer la table reminders
        this.db.run(`
          CREATE TABLE reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            priority TEXT NOT NULL DEFAULT 'medium',
            created_at TEXT NOT NULL,
            completed_at TEXT,
            dismissed_at TEXT
          )
        `, (err) => {
          if (err) {
            console.error('[Migrations] Erreur lors de la création de la table reminders:', err);
            return reject(err);
          }

          console.log('[Migrations] Table reminders créée avec succès');

          // Créer un index sur entity_type et entity_id pour des requêtes rapides
          this.db.run(`
            CREATE INDEX idx_reminders_entity ON reminders(entity_type, entity_id)
          `, (err) => {
            if (err) {
              console.error('[Migrations] Erreur lors de la création de l\'index:', err);
              // On continue même si l'index échoue
            }

            // Créer un index sur due_date et status pour filtrer les rappels actifs
            this.db.run(`
              CREATE INDEX idx_reminders_due_status ON reminders(due_date, status)
            `, (err) => {
              if (err) {
                console.error('[Migrations] Erreur lors de la création de l\'index due_status:', err);
              }

              console.log('[Migrations] Migration 7 terminée avec succès');
              resolve();
            });
          });
        });
      });
    });
  }

  /**
   * Migration 8: Création de la table clients pour les leads convertis
   */
  async createClientsTable() {
    return new Promise((resolve, reject) => {
      console.log('[Migrations] Migration 8: Création de la table clients');

      // Vérifier si la table existe déjà
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_clients'", (err, row) => {
        if (err) {
          console.error('[Migrations] Erreur lors de la vérification de la table crm_clients:', err);
          return reject(err);
        }

        if (row) {
          console.log('[Migrations] La table crm_clients existe déjà, skip');
          return resolve();
        }

        // Créer la table crm_clients (on évite le nom 'clients' qui existe déjà dans migration 1)
        this.db.run(`
          CREATE TABLE crm_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            name TEXT NOT NULL,
            company TEXT,
            type TEXT DEFAULT 'individual',
            email TEXT,
            phone TEXT,
            address TEXT,
            website TEXT,
            industry TEXT,
            source TEXT,
            contract_start_date TEXT,
            lifetime_value REAL DEFAULT 0,
            notes TEXT,
            tags TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('[Migrations] Erreur lors de la création de la table crm_clients:', err);
            return reject(err);
          }

          console.log('[Migrations] Table crm_clients créée avec succès');

          // Créer un index sur lead_id pour des requêtes rapides
          this.db.run(`
            CREATE INDEX idx_clients_lead_id ON crm_clients(lead_id)
          `, (err) => {
            if (err) {
              console.error('[Migrations] Erreur lors de la création de l\'index lead_id:', err);
              // On continue même si l'index échoue
            }

            // Créer un index sur status
            this.db.run(`
              CREATE INDEX idx_clients_status ON crm_clients(status)
            `, (err) => {
              if (err) {
                console.error('[Migrations] Erreur lors de la création de l\'index status:', err);
              }

              console.log('[Migrations] Migration 8 terminée avec succès');
              resolve();
            });
          });
        });
      });
    });
  }
}

/**
 * Exporte une fonction pour initialiser et exécuter les migrations
 * @param {Object} db Instance de la base de données SQLite
 * @returns {Promise<void>}
 */
module.exports = async function runMigrations(db) {
  const migrations = new DatabaseMigrations(db);
  await migrations.migrate();
};