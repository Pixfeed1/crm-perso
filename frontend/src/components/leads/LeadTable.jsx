// src/components/leads/LeadTable.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiBriefcase, FiUser, FiMail, FiPhone, FiDollarSign } from 'react-icons/fi';

const LeadTable = ({ leads, selectedLead, onSelectLead }) => {
  const statusConfig = {
    new: { label: 'Nouveau', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    contacted: { label: 'Contacté', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    qualified: { label: 'Qualifié', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    proposal: { label: 'Proposition', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    negotiation: { label: 'Négociation', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    won: { label: 'Gagné', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
    lost: { label: 'Perdu', color: 'bg-red-500/20 text-red-300 border-red-500/30' }
  };

  return (
    <div className="bg-gray-800/30 backdrop-blur rounded-xl overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900/50 border-b border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Lead
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                Entreprise
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                Budget
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {leads.map((lead, index) => (
              <motion.tr
                key={lead.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => onSelectLead(lead)}
                className={`cursor-pointer transition-colors hover:bg-gray-700/30 ${
                  selectedLead?.id === lead.id ? 'bg-indigo-500/10' : ''
                }`}
              >
                {/* Lead */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      lead.status === 'won'
                        ? 'bg-green-500/20 text-green-400'
                        : lead.status === 'lost'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-indigo-500/20 text-indigo-400'
                    }`}>
                      {lead.company ? <FiBriefcase /> : <FiUser />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{lead.name}</div>
                      {lead.title && (
                        <div className="text-sm text-gray-400 truncate">{lead.title}</div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contact */}
                <td className="px-4 py-4 hidden md:table-cell">
                  <div className="space-y-1 text-sm">
                    {lead.email && (
                      <div className="flex items-center gap-2 text-gray-300">
                        <FiMail className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-2 text-gray-300">
                        <FiPhone className="w-3 h-3 text-green-400 flex-shrink-0" />
                        <span>{lead.phone}</span>
                      </div>
                    )}
                  </div>
                </td>

                {/* Entreprise */}
                <td className="px-4 py-4 hidden lg:table-cell">
                  {lead.company ? (
                    <div className="text-sm text-gray-300">
                      {lead.company}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600">-</span>
                  )}
                </td>

                {/* Budget */}
                <td className="px-4 py-4 hidden xl:table-cell">
                  {lead.budget ? (
                    <div className="flex items-center gap-1 text-sm font-medium text-green-400">
                      <FiDollarSign className="w-3 h-3" />
                      {Math.round(lead.budget)}€
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600">-</span>
                  )}
                </td>

                {/* Statut */}
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    statusConfig[lead.status]?.color || 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                  }`}>
                    {statusConfig[lead.status]?.label || lead.status}
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

export default LeadTable;
