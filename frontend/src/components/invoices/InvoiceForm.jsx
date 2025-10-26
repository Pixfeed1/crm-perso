// src/components/invoices/InvoiceForm.jsx
import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiSave, FiX } from 'react-icons/fi';
import { clientsAPI, projectsAPI, tvaRegimesAPI, paymentMethodsAPI } from '../../services/api';
import { quotesAPI } from '../../services/quotesAPI';
import FileUpload from '../common/FileUpload';

const InvoiceForm = ({ invoice = null, onSave, onCancel }) => {
  const [clients, setClients] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tvaRegimes, setTvaRegimes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [formData, setFormData] = useState({
    title: invoice?.title || '',
    quote_id: invoice?.quote_id || '',
    client_id: invoice?.client_id || '',
    client_name: invoice?.client_name || '',
    client_email: invoice?.client_email || '',
    client_address: invoice?.client_address || '',
    client_siret: invoice?.client_siret || '',
    project_id: invoice?.project_id || null,
    items: invoice?.items || [{ description: '', quantity: 1, unit_price: 0 }],
    discount_type: invoice?.discount_type || 'none',
    discount_value: invoice?.discount_value || 0,
    tva_rate: invoice?.tva_rate || 20,
    tva_applicable: invoice?.tva_applicable !== undefined ? invoice.tva_applicable : true,
    tva_regime: invoice?.tva_regime || 'NORMAL',
    payment_methods: invoice?.payment_methods || [],
    cgv: invoice?.cgv || '',
    acompte_type: invoice?.acompte_type || 'none',
    acompte_value: invoice?.acompte_value || 0,
    escompte_percent: invoice?.escompte_percent || 0,
    escompte_days: invoice?.escompte_days || 0,
    payment_terms_days: invoice?.payment_terms_days || 30,
    additional_info: invoice?.additional_info || '',
    notes: invoice?.notes || ''
  });

  // Charger les données de référence
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientsData, quotesData, projectsData, tvaRegimesData, paymentMethodsData] = await Promise.all([
          clientsAPI.getAll(),
          quotesAPI.getAll(),
          projectsAPI.getAll(),
          tvaRegimesAPI.getAll(),
          paymentMethodsAPI.getAll()
        ]);
        setClients(clientsData);
        // Ne montrer que les devis acceptés
        setQuotes(quotesData.filter(q => q.status === 'accepted'));
        setProjects(projectsData);
        setTvaRegimes(tvaRegimesData);
        setPaymentMethods(paymentMethodsData);
      } catch (error) {
        console.error('Erreur chargement données:', error);
      }
    };
    fetchData();
  }, []);

  // Charger les fichiers de la facture
  useEffect(() => {
    if (invoice && invoice.additional_files) {
      try {
        const files = typeof invoice.additional_files === 'string'
          ? JSON.parse(invoice.additional_files)
          : invoice.additional_files;
        setUploadedFiles(files || []);
      } catch (e) {
        setUploadedFiles([]);
      }
    }
  }, [invoice]);

  // Recharger les fichiers après upload/suppression
  const handleFilesUpdated = async () => {
    if (invoice && invoice.id) {
      try {
        // Recharger la facture pour avoir les fichiers à jour
        const response = await fetch(`http://localhost:5000/api/invoices/${invoice.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const updatedInvoice = await response.json();
        const files = typeof updatedInvoice.additional_files === 'string'
          ? JSON.parse(updatedInvoice.additional_files)
          : (updatedInvoice.additional_files || []);
        setUploadedFiles(files);
      } catch (error) {
        console.error('Erreur rechargement fichiers:', error);
      }
    }
  };

  // Sélection d'un devis (pré-remplissage)
  const handleQuoteChange = async (e) => {
    const quoteId = e.target.value;
    if (!quoteId) {
      // Réinitialiser
      setFormData({
        ...formData,
        quote_id: '',
        client_id: '',
        client_name: '',
        client_email: '',
        client_address: '',
        client_siret: '',
        items: [{ description: '', quantity: 1, unit_price: 0 }],
        cgv: '',
        tva_rate: 20,
        tva_applicable: true,
        acompte_type: 'none',
        acompte_value: 0,
        escompte_percent: 0,
        escompte_days: 0
      });
      return;
    }

    try {
      const quote = await quotesAPI.getById(quoteId);
      setFormData({
        ...formData,
        title: quote.title || '',
        quote_id: quote.id,
        client_id: quote.client_id,
        client_name: quote.client_name,
        client_email: quote.client_email || '',
        client_address: quote.client_address || '',
        client_siret: quote.client_siret || '',
        project_id: quote.project_id || null,
        items: quote.items || [{ description: '', quantity: 1, unit_price: 0 }],
        discount_type: quote.discount_type || 'none',
        discount_value: quote.discount_value || 0,
        cgv: quote.cgv || '',
        tva_rate: quote.tva_rate || 20,
        tva_applicable: quote.tva_applicable !== undefined ? quote.tva_applicable : true,
        tva_regime: quote.tva_regime || 'NORMAL',
        payment_methods: quote.payment_methods || [],
        acompte_type: quote.acompte_type || 'none',
        acompte_value: quote.acompte_value || 0,
        escompte_percent: quote.escompte_percent || 0,
        escompte_days: quote.escompte_days || 0,
        additional_info: quote.additional_info || ''
      });
    } catch (error) {
      console.error('Erreur chargement devis:', error);
    }
  };

  // Sélection d'un client
  const handleClientChange = (e) => {
    const clientId = e.target.value;
    const client = clients.find(c => c.id === parseInt(clientId));

    if (client) {
      setFormData({
        ...formData,
        client_id: client.id,
        client_name: client.name,
        client_email: client.email || '',
        client_address: client.address || '',
        client_siret: client.siret || ''
      });
    } else {
      setFormData({
        ...formData,
        client_id: '',
        client_name: '',
        client_email: '',
        client_address: '',
        client_siret: ''
      });
    }
  };

  // Gestion des lignes
  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unit_price: 0 }]
    });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  // Gestion des moyens de paiement
  const handlePaymentMethodToggle = (code) => {
    const currentMethods = formData.payment_methods || [];
    if (currentMethods.includes(code)) {
      setFormData({
        ...formData,
        payment_methods: currentMethods.filter(m => m !== code)
      });
    } else {
      setFormData({
        ...formData,
        payment_methods: [...currentMethods, code]
      });
    }
  };

  // Gérer le changement de régime TVA
  const handleTvaRegimeChange = (e) => {
    const regimeCode = e.target.value;
    const regime = tvaRegimes.find(r => r.code === regimeCode);
    if (regime) {
      setFormData({
        ...formData,
        tva_regime: regimeCode,
        tva_rate: regime.rate,
        tva_applicable: regime.rate > 0
      });
    }
  };

  // Calculs avec remise
  const calculateTotals = () => {
    const total_ht = formData.items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    }, 0);

    // Calcul de la remise
    let discount_amount = 0;
    if (formData.discount_type === 'percent') {
      discount_amount = total_ht * (parseFloat(formData.discount_value) / 100);
    } else if (formData.discount_type === 'fixed') {
      discount_amount = parseFloat(formData.discount_value) || 0;
    }

    // Application de la remise AVANT TVA
    const total_ht_after_discount = total_ht - discount_amount;

    // Calcul TVA sur montant après remise
    const tva_amount = formData.tva_applicable ? (total_ht_after_discount * (formData.tva_rate / 100)) : 0;
    const total_ttc = total_ht_after_discount + tva_amount;

    let acompte_amount = 0;
    if (formData.acompte_type === 'percent') {
      acompte_amount = total_ttc * (formData.acompte_value / 100);
    } else if (formData.acompte_type === 'fixed') {
      acompte_amount = parseFloat(formData.acompte_value) || 0;
    }

    const reste_a_payer = total_ttc - acompte_amount;

    return {
      total_ht,
      discount_amount,
      total_ht_after_discount,
      tva_amount,
      total_ttc,
      acompte_amount,
      reste_a_payer
    };
  };

  const totals = calculateTotals();

  // Soumission
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.client_name.trim()) {
      alert('Le nom du client est requis');
      return;
    }

    if (formData.items.length === 0 || !formData.items.some(item => item.description.trim())) {
      alert('Au moins un article est requis');
      return;
    }

    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
          {invoice ? 'Modifier la facture' : 'Nouvelle facture'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>
      </div>

      {/* Sélection devis (optionnel) */}
      {!invoice && (
        <div className="space-y-4 bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white">Créer depuis un devis (optionnel)</h3>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Sélectionner un devis accepté
            </label>
            <select
              value={formData.quote_id}
              onChange={handleQuoteChange}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">-- Nouveau (sans devis) --</option>
              {quotes.map(quote => (
                <option key={quote.id} value={quote.id}>
                  {quote.quote_number} - {quote.client_name} ({parseFloat(quote.total_ttc).toFixed(2)} €)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Titre et Projet */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Informations générales</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Titre de la facture
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ex: Facture site web e-commerce, Refonte graphique..."
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Projet associé
            </label>
            <select
              value={formData.project_id || ''}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">-- Aucun projet --</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Informations client */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Informations client</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Sélectionner un client
            </label>
            <select
              value={formData.client_id}
              onChange={handleClientChange}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              disabled={formData.quote_id !== ''}
            >
              <option value="">-- Nouveau client --</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.name} {client.company ? `(${client.company})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nom du client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.client_email}
              onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              SIRET
            </label>
            <input
              type="text"
              value={formData.client_siret}
              onChange={(e) => setFormData({ ...formData, client_siret: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Adresse
            </label>
            <textarea
              value={formData.client_address}
              onChange={(e) => setFormData({ ...formData, client_address: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Articles */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">Articles</h3>
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm"
          >
            <FiPlus className="w-4 h-4" />
            Ajouter
          </button>
        </div>

        <div className="space-y-3">
          {formData.items.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-3 items-start bg-gray-800/30 p-3 rounded-lg">
              <div className="col-span-12 sm:col-span-5">
                <input
                  type="text"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <input
                  type="number"
                  placeholder="Quantité"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <input
                  type="number"
                  placeholder="Prix unitaire"
                  value={item.unit_price}
                  onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-center">
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Remise */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Remise</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Type de remise
            </label>
            <select
              value={formData.discount_type}
              onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="none">Aucune</option>
              <option value="percent">Pourcentage</option>
              <option value="fixed">Montant fixe</option>
            </select>
          </div>

          {formData.discount_type !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {formData.discount_type === 'percent' ? 'Pourcentage (%)' : 'Montant (€)'}
              </label>
              <input
                type="number"
                value={formData.discount_value}
                onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* TVA */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">TVA</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Régime TVA
            </label>
            <select
              value={formData.tva_regime}
              onChange={handleTvaRegimeChange}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              {tvaRegimes.map(regime => (
                <option key={regime.code} value={regime.code}>
                  {regime.label} ({regime.rate}%)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center">
            <div className="text-sm text-gray-400">
              {tvaRegimes.find(r => r.code === formData.tva_regime)?.description || ''}
            </div>
          </div>
        </div>
      </div>

      {/* Acompte */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Acompte</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Type d'acompte
            </label>
            <select
              value={formData.acompte_type}
              onChange={(e) => setFormData({ ...formData, acompte_type: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="none">Aucun</option>
              <option value="percent">Pourcentage</option>
              <option value="fixed">Montant fixe</option>
            </select>
          </div>

          {formData.acompte_type !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {formData.acompte_type === 'percent' ? 'Pourcentage (%)' : 'Montant (€)'}
              </label>
              <input
                type="number"
                value={formData.acompte_value}
                onChange={(e) => setFormData({ ...formData, acompte_value: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Escompte */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Escompte</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Pourcentage (%)
            </label>
            <input
              type="number"
              value={formData.escompte_percent}
              onChange={(e) => setFormData({ ...formData, escompte_percent: parseFloat(e.target.value) || 0 })}
              min="0"
              step="0.1"
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Si paiement sous (jours)
            </label>
            <input
              type="number"
              value={formData.escompte_days}
              onChange={(e) => setFormData({ ...formData, escompte_days: parseInt(e.target.value) || 0 })}
              min="0"
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Délai de paiement */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Délai de paiement (jours)
        </label>
        <input
          type="number"
          value={formData.payment_terms_days}
          onChange={(e) => setFormData({ ...formData, payment_terms_days: parseInt(e.target.value) || 30 })}
          min="1"
          className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Moyens de paiement */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Moyens de paiement acceptés</h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {paymentMethods.map(method => (
            <label
              key={method.code}
              className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                formData.payment_methods.includes(method.code)
                  ? 'bg-indigo-600/20 border-indigo-500'
                  : 'bg-gray-800/30 border-gray-700 hover:border-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={formData.payment_methods.includes(method.code)}
                onChange={() => handlePaymentMethodToggle(method.code)}
                className="w-4 h-4 text-indigo-600 bg-gray-800 border-gray-700 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-300">{method.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* CGV et Notes */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Conditions Générales de Vente (CGV)
          </label>
          <textarea
            value={formData.cgv}
            onChange={(e) => setFormData({ ...formData, cgv: e.target.value })}
            rows={4}
            placeholder="Conditions générales..."
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Informations complémentaires
          </label>
          <textarea
            value={formData.additional_info}
            onChange={(e) => setFormData({ ...formData, additional_info: e.target.value })}
            rows={3}
            placeholder="Informations complémentaires pour le client..."
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            placeholder="Notes additionnelles..."
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Pièces jointes */}
      {invoice && invoice.id && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Pièces jointes</h3>
          <FileUpload
            entityType="invoice"
            entityId={invoice.id}
            existingFiles={uploadedFiles}
            onFilesUpdated={handleFilesUpdated}
          />
        </div>
      )}

      {/* Totaux */}
      <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-300">Total HT</span>
          <span className="font-semibold text-white">
            {totals.total_ht.toFixed(2)} €
          </span>
        </div>
        {formData.discount_type !== 'none' && totals.discount_amount > 0 && (
          <>
            <div className="flex justify-between text-sm text-green-400">
              <span>Remise ({formData.discount_type === 'percent' ? `${formData.discount_value}%` : 'fixe'})</span>
              <span>
                - {totals.discount_amount.toFixed(2)} €
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Total HT après remise</span>
              <span className="font-semibold text-white">
                {totals.total_ht_after_discount.toFixed(2)} €
              </span>
            </div>
          </>
        )}
        {formData.tva_applicable && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-300">TVA ({formData.tva_rate}%)</span>
            <span className="font-semibold text-white">
              {totals.tva_amount.toFixed(2)} €
            </span>
          </div>
        )}
        <div className="flex justify-between text-lg border-t border-indigo-500/30 pt-2">
          <span className="font-semibold text-white">Total TTC</span>
          <span className="font-bold text-indigo-300">
            {totals.total_ttc.toFixed(2)} €
          </span>
        </div>
        {formData.acompte_type !== 'none' && totals.acompte_amount > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Acompte</span>
              <span className="font-semibold text-white">
                {totals.acompte_amount.toFixed(2)} €
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Reste à payer</span>
              <span className="font-semibold text-white">
                {totals.reste_a_payer.toFixed(2)} €
              </span>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <FiSave />
          <span>{invoice ? 'Modifier' : 'Créer'} la facture</span>
        </button>
      </div>
    </form>
  );
};

export default InvoiceForm;
