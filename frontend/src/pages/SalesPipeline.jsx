// src/pages/SalesPipeline.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, PieChart, Pie
} from 'recharts';
import { FaFilter, FaChartLine, FaBullseye, FaCalendarAlt, FaSourcetree } from 'react-icons/fa';

const SalesPipeline = () => {
  const [pipelineData, setPipelineData] = useState(null);
  const [conversionRates, setConversionRates] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [sources, setSources] = useState(null);
  const [velocity, setVelocity] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pipeline'); // pipeline, conversion, forecast, sources

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const [pipelineRes, conversionRes, forecastRes, sourcesRes, velocityRes] = await Promise.all([
        fetch('http://localhost:5000/api/sales-pipeline', { headers }),
        fetch('http://localhost:5000/api/sales-pipeline/conversion-rates', { headers }),
        fetch('http://localhost:5000/api/sales-pipeline/forecast', { headers }),
        fetch('http://localhost:5000/api/sales-pipeline/sources', { headers }),
        fetch('http://localhost:5000/api/sales-pipeline/velocity', { headers })
      ]);

      if (pipelineRes.ok) setPipelineData(await pipelineRes.json());
      if (conversionRes.ok) setConversionRates(await conversionRes.json());
      if (forecastRes.ok) setForecast(await forecastRes.json());
      if (sourcesRes.ok) setSources(await sourcesRes.json());
      if (velocityRes.ok) setVelocity(await velocityRes.json());

    } catch (error) {
      console.error('Erreur lors du chargement du pipeline:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <header className="mb-8">
        <motion.h1
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-pink-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Pipeline de Ventes
        </motion.h1>
        <motion.p
          className="text-purple-200 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Analyse complète de votre processus commercial
        </motion.p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <TabButton
          active={activeTab === 'pipeline'}
          onClick={() => setActiveTab('pipeline')}
          icon={<FaFilter />}
        >
          Pipeline
        </TabButton>
        <TabButton
          active={activeTab === 'conversion'}
          onClick={() => setActiveTab('conversion')}
          icon={<FaChartLine />}
        >
          Conversion
        </TabButton>
        <TabButton
          active={activeTab === 'forecast'}
          onClick={() => setActiveTab('forecast')}
          icon={<FaBullseye />}
        >
          Prévisions
        </TabButton>
        <TabButton
          active={activeTab === 'sources'}
          onClick={() => setActiveTab('sources')}
          icon={<FaSourcetree />}
        >
          Sources
        </TabButton>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {activeTab === 'pipeline' && pipelineData && (
          <PipelineView data={pipelineData} />
        )}
        {activeTab === 'conversion' && conversionRates && (
          <ConversionView data={conversionRates} />
        )}
        {activeTab === 'forecast' && forecast && (
          <ForecastView data={forecast} />
        )}
        {activeTab === 'sources' && sources && (
          <SourcesView data={sources} />
        )}
      </div>
    </div>
  );
};

// Tab Button Component
const TabButton = ({ active, onClick, icon, children }) => (
  <motion.button
    className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
      active
        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
        : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
    }`}
    onClick={onClick}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    {icon}
    {children}
  </motion.button>
);

// Pipeline View - Funnel
const PipelineView = ({ data }) => {
  const { stages, summary } = data;

  // Couleurs pour chaque étape
  const stageColors = {
    'new': '#3b82f6',
    'contacted': '#8b5cf6',
    'qualified': '#a855f7',
    'proposal_sent': '#ec4899',
    'negotiation': '#f97316',
    'won': '#10b981',
    'lost': '#ef4444'
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Leads"
          value={summary.total_leads}
          color="from-blue-500 to-indigo-500"
        />
        <SummaryCard
          label="Actifs"
          value={summary.active_leads}
          color="from-purple-500 to-pink-500"
        />
        <SummaryCard
          label="Valeur Totale"
          value={`${summary.total_value.toLocaleString()}€`}
          color="from-emerald-500 to-teal-500"
        />
        <SummaryCard
          label="Taux de Gain"
          value={`${summary.win_rate}%`}
          color="from-amber-500 to-orange-500"
        />
      </div>

      {/* Funnel Chart */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-semibold text-white mb-6">Entonnoir de Ventes</h3>

        <div className="space-y-3">
          {stages.filter(s => !['won', 'lost'].includes(s.status)).map((stage, index) => {
            const maxLeads = Math.max(...stages.map(s => s.lead_count));
            const widthPercent = (stage.lead_count / maxLeads) * 100;

            return (
              <motion.div
                key={stage.status}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-300 font-medium">
                    {stage.label}
                  </div>
                  <div className="flex-1 relative">
                    <div
                      className="h-12 rounded-lg relative overflow-hidden"
                      style={{
                        width: `${widthPercent}%`,
                        minWidth: '20%',
                        backgroundColor: stageColors[stage.status],
                        boxShadow: `0 4px 20px ${stageColors[stage.status]}40`
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-between px-4">
                        <span className="text-white font-bold">{stage.lead_count}</span>
                        <span className="text-white/80 text-sm">
                          {stage.total_value.toLocaleString()}€
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm text-purple-300 font-semibold">
                    {stage.percentage}%
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Results - Won/Lost */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-emerald-300 text-sm mb-1">Leads Gagnés</div>
              <div className="text-3xl font-bold text-white">{summary.won_count}</div>
            </div>
            <div className="text-5xl">🎉</div>
          </div>
        </motion.div>

        <motion.div
          className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-rose-300 text-sm mb-1">Leads Perdus</div>
              <div className="text-3xl font-bold text-white">{summary.lost_count}</div>
            </div>
            <div className="text-5xl">❌</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// Conversion View
const ConversionView = ({ data }) => {
  const { conversion_rates, overall } = data;

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          label="Taux de Gain Global"
          value={`${overall.win_rate}%`}
          color="from-emerald-500 to-teal-500"
        />
        <SummaryCard
          label="Conversion Totale"
          value={`${overall.overall_conversion}%`}
          color="from-purple-500 to-pink-500"
        />
        <SummaryCard
          label="Leads Clôturés"
          value={overall.total_closed}
          color="from-blue-500 to-indigo-500"
        />
      </div>

      {/* Conversion Chart */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-semibold text-white mb-6">Taux de Conversion par Étape</h3>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={conversion_rates}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="from"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af' }}
            />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#fff'
              }}
            />
            <Legend wrapperStyle={{ color: '#9ca3af' }} />
            <Bar dataKey="conversion_rate" fill="#8b5cf6" name="Taux de Conversion %" />
            <Bar dataKey="dropoff_rate" fill="#ef4444" name="Taux d'Abandon %" />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Conversion Details */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-semibold text-white mb-4">Détails des Conversions</h3>

        <div className="space-y-3">
          {conversion_rates.map((rate, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
              <div>
                <div className="text-white font-medium">{rate.from} → {rate.to}</div>
                <div className="text-sm text-gray-400">
                  {rate.from_count} leads → {rate.to_count} leads
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${
                  rate.conversion_rate >= 70 ? 'text-emerald-400' :
                  rate.conversion_rate >= 40 ? 'text-amber-400' :
                  'text-rose-400'
                }`}>
                  {rate.conversion_rate}%
                </div>
                <div className="text-xs text-gray-400">
                  -{rate.dropoff_count} abandons
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

// Forecast View
const ForecastView = ({ data }) => {
  const { forecast, assumptions, pipeline_breakdown } = data;

  const forecastData = [
    { name: 'Conservateur', value: forecast.conservative_forecast, color: '#ef4444' },
    { name: 'Pondéré', value: forecast.weighted_forecast, color: '#8b5cf6' },
    { name: 'Optimiste', value: forecast.optimistic_forecast, color: '#10b981' }
  ];

  return (
    <div className="space-y-6">
      {/* Forecast Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          label="Prévision Conservatrice"
          value={`${forecast.conservative_forecast.toLocaleString()}€`}
          color="from-rose-500 to-red-500"
          subtitle={`Sur ${forecast.period_months} mois`}
        />
        <SummaryCard
          label="Prévision Pondérée"
          value={`${forecast.weighted_forecast.toLocaleString()}€`}
          color="from-purple-500 to-pink-500"
          subtitle="Scénario probable"
        />
        <SummaryCard
          label="Prévision Optimiste"
          value={`${forecast.optimistic_forecast.toLocaleString()}€`}
          color="from-emerald-500 to-teal-500"
          subtitle="Scénario idéal"
        />
      </div>

      {/* Forecast Chart */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-semibold text-white mb-6">Comparaison des Scénarios</h3>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#fff'
              }}
              formatter={(value) => `${value.toLocaleString()}€`}
            />
            <Bar dataKey="value" name="Montant">
              {forecastData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Assumptions */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-semibold text-white mb-4">Hypothèses et Données</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
            <div className="text-indigo-300 text-sm mb-1">Taux de gain historique</div>
            <div className="text-2xl font-bold text-white">{assumptions.historical_win_rate}%</div>
          </div>
          <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
            <div className="text-purple-300 text-sm mb-1">Temps moyen conversion</div>
            <div className="text-2xl font-bold text-white">{assumptions.avg_conversion_days}j</div>
          </div>
          <div className="p-4 bg-pink-900/20 border border-pink-500/30 rounded-lg">
            <div className="text-pink-300 text-sm mb-1">Opportunités actives</div>
            <div className="text-2xl font-bold text-white">{assumptions.active_opportunities}</div>
          </div>
        </div>

        <div className="text-sm text-gray-400">
          <p className="mb-2">
            <strong className="text-gray-300">Moyenne mensuelle historique:</strong> {forecast.monthly_avg_historical.toLocaleString()}€
          </p>
          <p>
            <strong className="text-gray-300">Projection mensuelle:</strong> {forecast.projected_monthly.toLocaleString()}€
          </p>
        </div>
      </motion.div>

      {/* Pipeline Breakdown */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-semibold text-white mb-4">Détail du Pipeline Actif</h3>

        <div className="space-y-2">
          {pipeline_breakdown.map((stage, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
              <div>
                <div className="text-white font-medium">{stage.status}</div>
                <div className="text-sm text-gray-400">{stage.count} opportunités</div>
              </div>
              <div className="text-right">
                <div className="text-white font-bold">{stage.total_value.toLocaleString()}€</div>
                <div className="text-sm text-purple-400">
                  Pondéré: {stage.weighted_value.toLocaleString()}€ ({Math.round(stage.weight * 100)}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

// Sources View
const SourcesView = ({ data }) => {
  const { sources, summary } = data;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          label="Nombre de Sources"
          value={summary.total_sources}
          color="from-blue-500 to-indigo-500"
        />
        <SummaryCard
          label="Total Leads"
          value={summary.total_leads}
          color="from-purple-500 to-pink-500"
        />
        <SummaryCard
          label="Meilleure Source"
          value={summary.best_source || 'N/A'}
          color="from-emerald-500 to-teal-500"
        />
      </div>

      {/* Sources Table */}
      <motion.div
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-xl font-semibold text-white mb-6">Performance par Source</h3>

        <div className="space-y-3">
          {sources.slice(0, 10).map((source, index) => (
            <motion.div
              key={source.source}
              className="p-4 bg-gray-700/30 rounded-lg"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="text-white font-semibold text-lg mb-1">{source.source}</div>
                  <div className="flex gap-4 text-sm text-gray-400">
                    <span>{source.total_leads} leads ({source.percentage_of_total}%)</span>
                    <span className="text-emerald-400">{source.won_count} gagnés</span>
                    <span className="text-rose-400">{source.lost_count} perdus</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-purple-400">#{index + 1}</div>
                  <div className="text-xs text-gray-400">Score ROI: {source.roi_score}</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="p-2 bg-gray-800/50 rounded text-center">
                  <div className="text-xs text-gray-400">Win Rate</div>
                  <div className={`text-lg font-bold ${
                    source.win_rate >= 50 ? 'text-emerald-400' :
                    source.win_rate >= 30 ? 'text-amber-400' :
                    'text-rose-400'
                  }`}>
                    {source.win_rate}%
                  </div>
                </div>
                <div className="p-2 bg-gray-800/50 rounded text-center">
                  <div className="text-xs text-gray-400">Revenus</div>
                  <div className="text-lg font-bold text-white">
                    {(source.total_revenue / 1000).toFixed(0)}k€
                  </div>
                </div>
                <div className="p-2 bg-gray-800/50 rounded text-center">
                  <div className="text-xs text-gray-400">Deal Moyen</div>
                  <div className="text-lg font-bold text-white">
                    {(source.avg_deal_size / 1000).toFixed(1)}k€
                  </div>
                </div>
                <div className="p-2 bg-gray-800/50 rounded text-center">
                  <div className="text-xs text-gray-400">Temps Conv.</div>
                  <div className="text-lg font-bold text-white">
                    {source.avg_conversion_days}j
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

// Summary Card Component
const SummaryCard = ({ label, value, color, subtitle }) => (
  <motion.div
    className={`p-6 rounded-xl bg-gradient-to-br ${color} bg-opacity-10 border border-gray-700`}
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
  >
    <div className="text-sm text-gray-300 mb-1">{label}</div>
    <div className="text-3xl font-bold text-white mb-1">{value}</div>
    {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
  </motion.div>
);

export default SalesPipeline;
