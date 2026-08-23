// mcp_seo/server.js
// Serveur MCP SEO — connecteur LECTURE SEULE des données SEO du CRM pour Claude.
// SÉCURITÉ : Bearer statique (timing-safe), rate limiting, logs d'accès, écoute locale
// (TLS assuré par le reverse proxy nginx). Service systemd autonome, hors process CRM.
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { pool } from './db.js';
import * as tools from './tools.js';
import * as bing from './bing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.MCP_SEO_TOKEN || '';
const PORT = parseInt(process.env.MCP_SEO_PORT || '8790', 10);
const RATE_MAX = parseInt(process.env.MCP_SEO_RATE_MAX || '60', 10); // requêtes / minute / IP
const LOG_FILE = process.env.MCP_SEO_LOG || path.join(__dirname, 'access.log');

if (TOKEN.length < 40) {
  console.error('[MCP] MCP_SEO_TOKEN manquant ou trop court (>= 40 caractères requis). Arrêt.');
  process.exit(1);
}

// --- Journalisation des accès (qui/quoi/quand) ---
function log(ip, msg, status) {
  const line = `${new Date().toISOString()}\t${ip}\t${status}\t${msg}\n`;
  try { fs.appendFile(LOG_FILE, line, () => {}); } catch (e) { /* best effort */ }
}

// --- Auth Bearer en comparaison à temps constant ---
function authOk(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return false;
  const provided = Buffer.from(m[1]);
  const expected = Buffer.from(TOKEN);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

// --- Rate limiting basique en mémoire (fenêtre fixe d'1 minute / IP) ---
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const slot = Math.floor(now / 60000);
  const key = `${ip}:${slot}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) { for (const k of hits.keys()) if (!k.endsWith(`:${slot}`)) hits.delete(k); }
  return n > RATE_MAX;
}

// --- Construction d'un serveur MCP (un par requête en mode stateless) ---
function buildServer() {
  const server = new McpServer({ name: 'crm-seo', version: '1.0.0' });
  const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

  server.tool(
    'get_opportunities',
    "Pages prioritaires (potentiel SEO sous-exploité) : fort intérêt Google mais maillage faible. Renvoie url, titre, score, impressions/clics/position, et suggestions de liens internes.",
    { site_id: z.number().int(), min_impressions: z.number().int().optional() },
    async ({ site_id, min_impressions }) => ok(await tools.getOpportunities(pool, site_id, min_impressions ?? 20))
  );

  server.tool(
    'get_page_content',
    "Contenu et métadonnées d'une page : titre, meta description, catégorie, type, focus keyword, nombre de mots et extrait de texte (pour le maillage sémantique).",
    { site_id: z.number().int(), url: z.string() },
    async ({ site_id, url }) => ok(await tools.getPageContent(pool, site_id, url))
  );

  server.tool(
    'list_link_targets',
    "Pages-cibles candidates pour le maillage interne (glossaire et autres CPT de contenu) : titre, url, slug, catégorie. Filtrable par catégorie.",
    { site_id: z.number().int(), category: z.string().optional() },
    async ({ site_id, category }) => ok(await tools.listLinkTargets(pool, site_id, category ?? null))
  );

  server.tool(
    'get_page_keywords',
    "Requêtes Google Search Console d'une page : mot-clé, position, impressions, clics, CTR (fenêtre glissante en jours, défaut 28).",
    { site_id: z.number().int(), url: z.string(), days: z.number().int().optional() },
    async ({ site_id, url, days }) => ok(await tools.getPageKeywords(pool, site_id, url, days ?? 28))
  );

  server.tool(
    'list_sites',
    "Liste les sites suivis dans le CRM : site_id, domaine, nombre de pages, dates de dernier crawl et de dernière synchro Search Console. À appeler EN PREMIER pour connaître le site_id à passer aux autres outils.",
    {},
    async () => ok(await tools.listSites(pool))
  );

  server.tool(
    'get_site_overview',
    "Vue d'ensemble du site : pages par santé (orphelines/affamées/réservoirs/saines), liens internes, non indexées, impressions/clics GSC 28j, quasi-victoires (positions 11-20), dates de dernier crawl et synchro.",
    { site_id: z.number().int() },
    async ({ site_id }) => ok(await tools.getSiteOverview(pool, site_id))
  );

  server.tool(
    'get_audit',
    "Audit technique agrégé : état du sitemap (URLs, 404) et compteurs de problèmes on-page (meta description absente/trop longue, title trop long, H1 absent/multiple, noindex, canonical vers autre URL, mixed content, erreurs HTTP, contenu court, images sans alt).",
    { site_id: z.number().int() },
    async ({ site_id }) => ok(await tools.getAudit(pool, site_id))
  );

  server.tool(
    'get_cannibalisation',
    "Cannibalisation de mots-clés : requêtes Google où PLUSIEURS pages du site captent des impressions (positions et CTR dilués). Par requête : pages concurrentes avec impressions/clics/position. Choisir UNE page cible par requête.",
    { site_id: z.number().int(), days: z.number().int().optional(), min_impressions: z.number().int().optional() },
    async ({ site_id, days, min_impressions }) => ok(await tools.getCannibalisation(pool, site_id, days ?? 28, min_impressions ?? 10))
  );

  // ---- Indexation Google (URL Inspection) ----
  server.tool(
    'get_indexation_summary',
    "Verdict d'indexation Google du site : combien de pages indexées, en échec, neutres, et la répartition par état de couverture (« Explorée, actuellement non indexée », « Introuvable (404) »…). Indique aussi combien de pages n'ont jamais été inspectées. Source : API URL Inspection, décalage possible de quelques jours.",
    { site_id: z.number().int() },
    async ({ site_id }) => ok(await tools.getIndexationSummary(pool, site_id))
  );
  server.tool(
    'get_google_404s',
    "Les 404 vues par Google, AVEC leur origine (referring_urls = les pages qui pointent vers l'URL cassée, donc l'article à corriger). Ces URLs ne sont ni dans le sitemap ni dans le crawl : ce sont d'anciennes adresses mémorisées par Google ou des liens internes cassés. `encore_au_crawl` dit si l'URL existe encore côté site.",
    { site_id: z.number().int(), limit: z.number().int().optional() },
    async ({ site_id, limit }) => ok(await tools.getGoogle404s(pool, site_id, limit ?? 100))
  );
  server.tool(
    'get_canonical_mismatches',
    "Pages où Google a retenu une canonique DIFFÉRENTE de celle déclarée : signe de contenu dupliqué ou de pages trop proches. Google affiche alors l'autre page à la place de celle visée.",
    { site_id: z.number().int(), limit: z.number().int().optional() },
    async ({ site_id, limit }) => ok(await tools.getCanonicalMismatches(pool, site_id, limit ?? 100))
  );
  server.tool(
    'get_stale_crawls',
    "Pages que Google n'a plus explorées depuis N jours (90 par défaut) : il s'en désintéresse. Croisé avec le value_score pour repérer les pages importantes abandonnées.",
    { site_id: z.number().int(), days: z.number().int().optional(), limit: z.number().int().optional() },
    async ({ site_id, days, limit }) => ok(await tools.getStaleCrawls(pool, site_id, days ?? 90, limit ?? 100))
  );
  server.tool(
    'get_indexation_changes',
    "Historique des bascules d'indexation sur N jours : pages devenues indexées, pages désindexées. C'est ce qui permet de mesurer l'effet réel d'une refonte éditoriale ou d'une correction technique.",
    { site_id: z.number().int(), days: z.number().int().optional(), limit: z.number().int().optional() },
    async ({ site_id, days, limit }) => ok(await tools.getIndexationChanges(pool, site_id, days ?? 30, limit ?? 200))
  );

  server.tool(
    'get_ctr_anomalies',
    "Pages bien positionnées mais peu cliquées (CTR très sous la moyenne attendue pour leur position) : title/meta description à réécrire. Triées par clics potentiels récupérables, avec les défauts on-page connus (meta absente/courte/longue, title long).",
    { site_id: z.number().int(), days: z.number().int().optional(), min_impressions: z.number().int().optional() },
    async ({ site_id, days, min_impressions }) => ok(await tools.getCtrAnomalies(pool, site_id, days ?? 28, min_impressions ?? 30))
  );

  server.tool(
    'search_pages',
    "Recherche des pages du site par mot-clé/sujet (match sur URL, titre, focus keyword et tags) : renvoie url, titre, type, catégorie, santé, liens entrants, jus interne et métriques GSC (impressions/clics/position). À utiliser pour trouver le contenu existant sur un sujet SANS deviner les slugs.",
    { site_id: z.number().int(), q: z.string(), limit: z.number().int().optional() },
    async ({ site_id, q, limit }) => ok(await tools.searchPages(pool, site_id, q, limit ?? 20))
  );

  server.tool(
    'get_keyword_volume',
    "Volume de recherche d'un mot-clé (impressions Bing sur 3 mois glissants, via l'API Bing Webmaster Tools). known=false = mot-clé inconnu de Bing (volume quasi nul). Pour calibrer la demande AVANT d'écrire un contenu.",
    { q: z.string(), country: z.string().optional(), language: z.string().optional() },
    async ({ q, country, language }) => ok(await bing.getKeywordVolume(q, country ?? 'fr', language ?? 'fr-FR'))
  );

  server.tool(
    'get_related_keywords',
    "Mots-clés associés à une requête avec leurs volumes (impressions Bing 3 mois) : révèle les variantes et sujets adjacents auxquels on n'a pas pensé. Triés par volume décroissant.",
    { q: z.string(), country: z.string().optional(), language: z.string().optional(), limit: z.number().int().optional() },
    async ({ q, country, language, limit }) => ok(await bing.getRelatedKeywords(q, country ?? 'fr', language ?? 'fr-FR', limit ?? 25))
  );

  server.tool(
    'get_backlink_counts',
    "Backlinks EXTERNES vus par Bing : nombre de liens entrants par page du site (quelles pages attirent des liens). site_url = la propriété validée dans Bing Webmaster Tools (ex. https://jurojin.net/). Gratuit là où Ahrefs facture.",
    { site_url: z.string(), limit: z.number().int().optional() },
    async ({ site_url, limit }) => ok(await bing.getBacklinkCounts(site_url, limit ?? 50))
  );

  server.tool(
    'get_page_backlinks',
    "Backlinks EXTERNES d'une page précise vus par Bing : les URLs sources qui pointent vers elle (avec leur titre). Complète get_page_links (liens INTERNES) avec la vue externe.",
    { site_url: z.string(), url: z.string(), limit: z.number().int().optional() },
    async ({ site_url, url, limit }) => ok(await bing.getPageBacklinks(site_url, url, limit ?? 100))
  );

  server.tool(
    'get_page_links',
    "Liens internes d'une page : entrants (qui pointe vers elle, avec ancres et jus des donneurs) et sortants (vers quelles pages elle pointe). Essentiel pour raisonner le maillage d'une page précise.",
    { site_id: z.number().int(), url: z.string() },
    async ({ site_id, url }) => ok(await tools.getPageLinks(pool, site_id, url))
  );

  server.tool(
    'list_link_campaigns',
    "Campagnes de backlinks (netlinking) : niches avec leurs compteurs (cibles découvertes, contactées, liens obtenus) et l'état de la découverte. À appeler EN PREMIER pour obtenir l'id de campagne.",
    {},
    async () => ok(await tools.listLinkCampaigns(pool))
  );

  server.tool(
    'get_link_targets',
    "Cibles backlinks d'une campagne : domaine, titre, autorité (Open PageRank 0-10), trafic réel (présence CrUX), pertinence (liens vers les hubs), score composite 0-100, statut (nouveau/a_contacter/contacte/lien_obtenu/refus/ecarte) et email de contact. Triées par score.",
    { campaign_id: z.number().int(), statut: z.string().optional(), limit: z.number().int().optional() },
    async ({ campaign_id, statut, limit }) => ok(await tools.getLinkTargets(pool, campaign_id, statut ?? null, limit ?? 50))
  );

  server.tool(
    'get_link_outreach_status',
    "État de l'outreach d'une campagne backlinks : emails de demande de lien envoyés (depuis le Gmail perso), ouvertures/clics trackés, réponses, et nombre de relances dues.",
    { campaign_id: z.number().int() },
    async ({ campaign_id }) => ok(await tools.getLinkOutreachStatus(pool, campaign_id))
  );

  return server;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// Garde commune sur /mcp : auth + rate limit + log (statut réel loggé en fin de réponse).
app.use('/mcp', (req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  if (!authOk(req)) { log(ip, 'auth', 401); return res.status(401).json({ error: 'Unauthorized' }); }
  if (rateLimited(ip)) { log(ip, 'rate', 429); return res.status(429).json({ error: 'Too Many Requests' }); }
  const tool = (req.body && req.body.params && req.body.params.name) || (req.body && req.body.method) || '';
  res.on('finish', () => log(ip, tool || '-', res.statusCode));
  next();
});

// Mode STATELESS : un serveur + transport par requête (pas de session persistée).
app.post('/mcp', async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('[MCP] handleRequest:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  }
});

// Pas de session -> GET/DELETE inutiles.
app.get('/mcp', (req, res) => res.status(405).json({ error: 'Method Not Allowed' }));
app.delete('/mcp', (req, res) => res.status(405).json({ error: 'Method Not Allowed' }));

// Écoute LOCALE uniquement : le TLS est assuré par le reverse proxy (nginx).
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[MCP] Serveur SEO en écoute sur 127.0.0.1:${PORT} (lecture seule, Bearer requis)`);
});
