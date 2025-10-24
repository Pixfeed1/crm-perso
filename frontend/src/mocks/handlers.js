// src/mocks/handlers.js
import { rest } from 'msw'

// Token JWT valide (peut être généré par ton backend pour les tests)
const VALID_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZC..."

export const handlers = [
  // Intercepte les requêtes de login
  rest.post('/api/auth/login', (req, res, ctx) => {
    const { username, password } = req.body
    
    // Simule une validation basique
    if (!username || !password) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Identifiants requis' })
      )
    }
    
    // Simule une réponse réussie
    return res(
      ctx.status(200),
      ctx.json({
        token: VALID_TOKEN,
        user: {
          id: 123,
          username,
          role: 'user'
        }
      })
    )
  }),
  
  // Intercepte les vérifications d'authentification
  rest.get('/api/auth/check', (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res(
        ctx.status(401),
        ctx.json({ message: 'Non autorisé' })
      )
    }
    
    return res(
      ctx.status(200),
      ctx.json({
        authenticated: true,
        user: {
          id: 123,
          username: 'utilisateur_test',
          role: 'user'
        }
      })
    )
  }),
  
  // Intercepte les requêtes au dashboard
  rest.get('/api/dashboard', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        leads: { total: 45, newThisMonth: 12 },
        projects: { active: 8, completed: 15, upcoming: 3 },
        revenues: { thisMonth: 12500, projection: 15000, total: 125000 },
        // Ajoute d'autres données simulées selon ton modèle
      })
    )
  }),
]