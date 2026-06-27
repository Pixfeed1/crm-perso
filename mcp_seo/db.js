// mcp_seo/db.js
// Pool PostgreSQL du serveur MCP SEO. Se connecte avec un rôle DÉDIÉ SELECT-only
// (mcp_seo_ro, cf. setup.sql) -> double barrière : même un bug ne peut ni écrire ni lire
// d'autres tables que celles autorisées en base.
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.MCP_DB_HOST || 'localhost',
  port: parseInt(process.env.MCP_DB_PORT || '5432', 10),
  user: process.env.MCP_DB_USER || 'mcp_seo_ro',
  password: process.env.MCP_DB_PASSWORD || '',
  database: process.env.MCP_DB_NAME || 'crm_db',
  max: 5,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000, // garde-fou : aucune requête ne traîne
});
