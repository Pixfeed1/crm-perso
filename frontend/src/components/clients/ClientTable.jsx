// src/components/clients/ClientTable.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiBriefcase, FiUser, FiMail, FiPhone, FiMapPin } from 'react-icons/fi';

const ClientTable = ({ clients, selectedClient, onSelectClient }) => {
  return (
    <div className="bg-gray-800/30 backdrop-blur rounded-xl overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900/50 border-b border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Client
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                Adresse
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                Valeur
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {clients.map((client, index) => (
              <motion.tr
                key={client.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => onSelectClient(client)}
                className={`cursor-pointer transition-colors hover:bg-gray-700/30 ${
                  selectedClient?.id === client.id ? 'bg-indigo-500/10' : ''
                }`}
              >
                {/* Client */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      client.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {client.type === 'company' ? <FiBriefcase /> : <FiUser />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{client.name}</div>
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
                      <div className="flex items-center gap-2 text-gray-300">
                        <FiMail className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-gray-300">
                        <FiPhone className="w-3 h-3 text-green-400 flex-shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Adresse */}
                <td className="px-4 py-4 hidden lg:table-cell">
                  {client.address ? (
                    <div className="flex items-start gap-2 text-sm text-gray-400">
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
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    client.status === 'active'
                      ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                      : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                  }`}>
                    {client.status === 'active' ? 'Actif' : 'Inactif'}
                  </span>
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
