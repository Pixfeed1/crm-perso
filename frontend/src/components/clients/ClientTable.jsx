// src/components/clients/ClientTable.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiBriefcase, FiUser, FiMail, FiPhone, FiMapPin, FiTool } from 'react-icons/fi';

const ClientTable = ({ clients, selectedClient, onSelectClient, onMaintenanceClick }) => {
  return (
    <div className="bg-surface/30 backdrop-blur rounded-xl overflow-hidden border border-border">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Client
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">
                Adresse
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider hidden xl:table-cell">
                Valeur
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.map((client, index) => (
              <motion.tr
                key={client.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => onSelectClient(client)}
                className={`cursor-pointer transition-colors hover:bg-surface-strong/30 ${
                  selectedClient?.id === client.id ? 'bg-indigo-500/10' : ''
                }`}
              >
                {/* Client */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      client.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-text-muted'
                    }`}>
                      {client.type === 'company' ? <FiBriefcase /> : <FiUser />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-text-primary font-medium truncate">{client.name}</div>
                      {client.company && (
                        <div className="text-sm text-indigo-300 truncate">{client.company}</div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contact */}
                <td className="px-4 py-4 hidden md:table-cell">
                  <div className="space-y-1 text-sm">
                    {client.email && (
                      <div className="flex items-center gap-2 text-text-secondary">
                        <FiMail className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-text-secondary">
                        <FiPhone className="w-3 h-3 text-green-400 flex-shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Adresse */}
                <td className="px-4 py-4 hidden lg:table-cell">
                  {client.address ? (
                    <div className="flex items-start gap-2 text-sm text-text-muted">
                      <FiMapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{client.address}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600">-</span>
                  )}
                </td>

                {/* Valeur */}
                <td className="px-4 py-4 hidden xl:table-cell">
                  {client.lifetime_value ? (
                    <div className="text-sm font-medium text-green-400">
                      {Math.round(client.lifetime_value)}€
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600">-</span>
                  )}
                </td>

                {/* Statut */}
                <td className="px-4 py-4">
                  <div className="flex flex-col items-start gap-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      client.status === 'active'
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : 'bg-gray-500/20 text-text-secondary border border-gray-500/30'
                    }`}>
                      {client.status === 'active' ? 'Actif' : 'Inactif'}
                    </span>
                    {client.maintenance_count > 0 && client.maintenance_status && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (onMaintenanceClick) onMaintenanceClick(client, e); }}
                        title="Voir le(s) contrat(s) de maintenance"
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition hover:brightness-110 ${
                          client.maintenance_status === 'past_due'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : client.maintenance_status === 'canceling'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        }`}
                      >
                        <FiTool size={11} /> Maintenance{client.maintenance_count > 1 ? ` (${client.maintenance_count})` : ''}
                      </button>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientTable;
