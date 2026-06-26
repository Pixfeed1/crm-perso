// backend/models/maintenanceContractModel.js

/**
 * Récupère tous les contrats de maintenance avec infos client
 */
const getAllContracts = async (db) => {
  const query = `
    SELECT
      mc.*,
      c.name as client_name,
      c.email as client_email,
      c.phone as client_phone,
      (SELECT COUNT(*) FROM interventions i WHERE i.maintenance_contract_id = mc.id) as interventions_count,
      (SELECT COUNT(*) FROM maintenance_reports mr WHERE mr.maintenance_contract_id = mc.id) as reports_count
    FROM maintenance_contracts mc
    LEFT JOIN crm_clients c ON mc.client_id = c.id
    ORDER BY mc.site_name ASC
  `;

  const result = await db.query(query);
  return result.rows;
};

/**
 * Récupère les statistiques des contrats
 */
const getStats = async (db) => {
  const query = `
    SELECT
      COUNT(*) as total_contracts,
      COUNT(*) FILTER (WHERE status = 'active') as active_contracts,
      COUNT(*) FILTER (WHERE status = 'paused') as paused_contracts,
      COUNT(*) FILTER (WHERE next_report_due <= CURRENT_DATE) as reports_due,
      -- Revenus = uniquement les contrats réellement prélevés via Stripe (billing_status='active'),
      -- et non les contrats simplement créés/actifs mais sans prélèvement en cours.
      COALESCE(SUM(monthly_amount) FILTER (WHERE billing_status = 'active'), 0) as monthly_revenue,
      COALESCE(AVG(pagespeed_mobile) FILTER (WHERE pagespeed_mobile IS NOT NULL), 0) as avg_pagespeed_mobile,
      COALESCE(AVG(pagespeed_desktop) FILTER (WHERE pagespeed_desktop IS NOT NULL), 0) as avg_pagespeed_desktop
    FROM maintenance_contracts
  `;

  const result = await db.query(query);
  return result.rows[0];
};

/**
 * Récupère un contrat par son ID avec ses interventions et rapports
 */
const getContractById = async (db, id) => {
  // Récupérer le contrat
  const contractQuery = `
    SELECT
      mc.*,
      c.name as client_name,
      c.email as client_email,
      c.phone as client_phone
    FROM maintenance_contracts mc
    LEFT JOIN crm_clients c ON mc.client_id = c.id
    WHERE mc.id = $1
  `;

  const contractResult = await db.query(contractQuery, [id]);

  if (contractResult.rows.length === 0) {
    return null;
  }

  const contract = contractResult.rows[0];

  // Récupérer les interventions
  const interventionsQuery = `
    SELECT * FROM interventions
    WHERE maintenance_contract_id = $1
    ORDER BY scheduled_date DESC
  `;
  const interventionsResult = await db.query(interventionsQuery, [id]);
  contract.interventions = interventionsResult.rows;

  // Récupérer les rapports
  const reportsQuery = `
    SELECT * FROM maintenance_reports
    WHERE maintenance_contract_id = $1
    ORDER BY period_end DESC
  `;
  const reportsResult = await db.query(reportsQuery, [id]);
  contract.reports = reportsResult.rows;

  return contract;
};

/**
 * Crée un nouveau contrat de maintenance
 */
const createContract = async (db, contractData) => {
  const {
    client_id, site_name, site_url, contract_start_date, monthly_amount, plan, report_frequency, billing_day,
    status, wordpress_version, php_version, hosting_provider, admin_url,
    pagespeed_mobile, pagespeed_desktop, plugins_count, notes
  } = contractData;

  // Calculer la prochaine date de rapport (fin du mois en cours)
  const now = new Date();
  const nextReportDue = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const query = `
    INSERT INTO maintenance_contracts (
      client_id, site_name, site_url, contract_start_date, monthly_amount,
      status, wordpress_version, php_version, hosting_provider, admin_url,
      pagespeed_mobile, pagespeed_desktop, plugins_count, notes, next_report_due, plan, report_frequency, billing_day
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *
  `;

  const values = [
    client_id || null,
    site_name,
    site_url || null,
    contract_start_date || null,
    monthly_amount || 0,
    status || 'active',
    wordpress_version || null,
    php_version || null,
    hosting_provider || null,
    admin_url || null,
    pagespeed_mobile || null,
    pagespeed_desktop || null,
    plugins_count || 0,
    notes || null,
    nextReportDue.toISOString().split('T')[0],
    plan || null,
    report_frequency || 'mensuel',
    billing_day || null
  ];

  const result = await db.query(query, values);
  return result.rows[0];
};

/**
 * Met à jour un contrat de maintenance
 */
const updateContract = async (db, id, contractData) => {
  const {
    client_id, site_name, site_url, contract_start_date, monthly_amount,
    status, wordpress_version, php_version, hosting_provider, admin_url,
    pagespeed_mobile, pagespeed_desktop, last_pagespeed_date,
    last_backup_date, last_update_date, last_report_date, next_report_due,
    plugins_count, notes, plan, report_frequency, billing_day
  } = contractData;

  const query = `
    UPDATE maintenance_contracts SET
      client_id = COALESCE($1, client_id),
      site_name = COALESCE($2, site_name),
      site_url = COALESCE($3, site_url),
      contract_start_date = COALESCE($4, contract_start_date),
      monthly_amount = COALESCE($5, monthly_amount),
      status = COALESCE($6, status),
      wordpress_version = COALESCE($7, wordpress_version),
      php_version = COALESCE($8, php_version),
      hosting_provider = COALESCE($9, hosting_provider),
      admin_url = COALESCE($10, admin_url),
      pagespeed_mobile = COALESCE($11, pagespeed_mobile),
      pagespeed_desktop = COALESCE($12, pagespeed_desktop),
      last_pagespeed_date = COALESCE($13, last_pagespeed_date),
      last_backup_date = COALESCE($14, last_backup_date),
      last_update_date = COALESCE($15, last_update_date),
      last_report_date = COALESCE($16, last_report_date),
      next_report_due = COALESCE($17, next_report_due),
      plugins_count = COALESCE($18, plugins_count),
      notes = COALESCE($19, notes),
      plan = COALESCE($20, plan),
      report_frequency = COALESCE($21, report_frequency),
      billing_day = COALESCE($22, billing_day),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $23
    RETURNING *
  `;

  const values = [
    client_id, site_name, site_url, contract_start_date, monthly_amount,
    status, wordpress_version, php_version, hosting_provider, admin_url,
    pagespeed_mobile, pagespeed_desktop, last_pagespeed_date,
    last_backup_date, last_update_date, last_report_date, next_report_due,
    plugins_count, notes, plan, report_frequency, billing_day, id
  ];

  const result = await db.query(query, values);
  return result.rows[0];
};

/**
 * Met à jour les scores PageSpeed d'un contrat
 */
const updatePageSpeed = async (db, id, mobile, desktop) => {
  const query = `
    UPDATE maintenance_contracts SET
      pagespeed_mobile = $1,
      pagespeed_desktop = $2,
      last_pagespeed_date = CURRENT_DATE,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `;

  const result = await db.query(query, [mobile, desktop, id]);
  return result.rows[0];
};

/**
 * Supprime un contrat de maintenance
 */
const deleteContract = async (db, id) => {
  const query = 'DELETE FROM maintenance_contracts WHERE id = $1 RETURNING *';
  const result = await db.query(query, [id]);
  return result.rows[0];
};

module.exports = {
  getAllContracts,
  getStats,
  getContractById,
  createContract,
  updateContract,
  updatePageSpeed,
  deleteContract
};
