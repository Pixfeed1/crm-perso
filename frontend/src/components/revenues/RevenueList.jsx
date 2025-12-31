// src/components/revenues/RevenueList.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiFileText, FiRefreshCw, FiPackage, FiDollarSign, FiArrowUp, FiArrowDown } from 'react-icons/fi';

const RevenueList = ({ revenues, selectedRevenue, onSelectRevenue }) => {
  const [sortConfig, setSortConfig] = useState({
    key: 'date',
    direction: 'desc'
  });

  // Gestion du tri
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Obtenir le class name pour l'indicateur de tri
  const getSortDirectionIcon = (key) => {
    if (sortConfig.key !== key) {
      return <FiRefreshCw />;
    }
    return sortConfig.direction === 'asc' ? <FiArrowUp /> : <FiArrowDown />;
  };
  
  // Trier les revenus
  const sortedRevenues = [...revenues].sort((a, b) => {
    if (sortConfig.key === 'date') {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return sortConfig.direction === 'asc' 
        ? dateA - dateB 
        : dateB - dateA;
    } else if (sortConfig.key === 'amount') {
      return sortConfig.direction === 'asc' 
        ? a.amount - b.amount 
        : b.amount - a.amount;
    } else if (sortConfig.key === 'project') {
      const projectA = a.project_name || '';
      const projectB = b.project_name || '';
      return sortConfig.direction === 'asc' 
        ? projectA.localeCompare(projectB) 
        : projectB.localeCompare(projectA);
    } else if (sortConfig.key === 'status') {
      return sortConfig.direction === 'asc' 
        ? a.status.localeCompare(b.status) 
        : b.status.localeCompare(a.status);
    }
    return 0;
  });
  
  // Formater la date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };
  
  // Configuration des couleurs de statut
  const statusConfig = {
    'paid': {
      bg: 'bg-green-900/30',
      text: 'text-green-300',
      label: 'Payé'
    },
    'pending': {
      bg: 'bg-amber-900/30',
      text: 'text-amber-300',
      label: 'En attente'
    },
    'planned': {
      bg: 'bg-blue-900/30',
      text: 'text-blue-300',
      label: 'Planifié'
    }
  };
  
  // Configuration des types
  const typeConfig = {
    'invoice': {
      icon: <FiFileText />,
      label: 'Facture'
    },
    'recurring': {
      icon: <FiRefreshCw />,
      label: 'Récurrent'
    },
    'other': {
      icon: <FiPackage />,
      label: 'Autre'
    }
  };

  if (revenues.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-gray-900/30 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3"><FiDollarSign /></div>
          <h4 className="text-lg font-medium text-gray-300 mb-2">Aucun revenu</h4>
          <p className="text-gray-400 text-sm">
            Ajoutez vos premiers revenus pour commencer à suivre vos finances.
          </p>
        </div>
      </div>
    );
  }
  
  // Solution pour éviter la double barre de défilement :
  // Activer le scroll vertical pour pouvoir défiler dans la liste
  return (
    <div className="flex-1 overflow-y-auto">
      <table className="min-w-full divide-y divide-gray-700">
        <thead className="sticky top-0 bg-gray-800/80 backdrop-blur-sm z-10">
          <tr>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
              onClick={() => requestSort('date')}
            >
              <div className="flex items-center">
                <span>Date</span>
                <span className="ml-1">{getSortDirectionIcon('date')}</span>
              </div>
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
              onClick={() => requestSort('amount')}
            >
              <div className="flex items-center">
                <span>Montant</span>
                <span className="ml-1">{getSortDirectionIcon('amount')}</span>
              </div>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Description
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
              onClick={() => requestSort('project')}
            >
              <div className="flex items-center">
                <span>Projet</span>
                <span className="ml-1">{getSortDirectionIcon('project')}</span>
              </div>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Type
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
              onClick={() => requestSort('status')}
            >
              <div className="flex items-center">
                <span>Statut</span>
                <span className="ml-1">{getSortDirectionIcon('status')}</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {sortedRevenues.map((revenue) => {
            const isSelected = selectedRevenue && selectedRevenue.id === revenue.id;
            const statusStyle = statusConfig[revenue.status] || {
              bg: 'bg-gray-900/30',
              text: 'text-gray-300',
              label: revenue.status
            };
            const typeInfo = typeConfig[revenue.type] || {
              icon: <FiPackage />,
              label: revenue.type
            };
            
            return (
              <motion.tr 
                key={revenue.id}
                className={`cursor-pointer hover:bg-gray-700/30 ${isSelected ? 'bg-teal-900/20' : ''}`}
                whileHover={{ scale: 1.01 }}
                onClick={() => onSelectRevenue(revenue)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                  {formatDate(revenue.date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-white">{revenue.amount.toLocaleString()} €</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-white truncate max-w-xs">{revenue.description}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {revenue.project_name ? (
                    <span className="text-sm text-teal-300">{revenue.project_name}</span>
                  ) : (
                    <span className="text-sm text-gray-500">-</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-white flex items-center">
                    <span className="mr-1">{typeInfo.icon}</span>
                    <span>{typeInfo.label}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                    {statusStyle.label}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default RevenueList;