// src/components/quotes/QuoteForm.jsx - Version avec Stepper UX
import React, { useState, useEffect } from 'react';
import { FiPlus, FiTrash2, FiSave, FiX, FiEdit, FiChevronRight, FiChevronLeft, FiChevronDown, FiChevronUp, FiUpload, FiFileText } from 'react-icons/fi';
import { clientsAPI, projectsAPI, tvaRegimesAPI, paymentMethodsAPI, API_BASE_URL } from '../../services/api';
import FileUpload from '../common/FileUpload';
import SignaturePad from '../common/SignaturePad';
import Stepper from '../common/Stepper';

const QuoteForm = ({ quote = null, onSave, onCancel }) => {
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tvaRegimes, setTvaRegimes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showSignature, setShowSignature] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const [formData, setFormData] = useState({
    title: quote?.title || '',
    client_id: quote?.client_id || '',
    client_name: quote?.client_name || '',
    client_email: quote?.client_email || '',
    client_address: quote?.client_address || '',
    client_siret: quote?.client_siret || '',
    project_id: quote?.project_id || null,
    items: quote?.items || [{ type: 'product', description: '', quantity: 1, unit_price: 0 }],
    discount_type: quote?.discount_type || 'none',
    discount_value: quote?.discount_value || 0,
    tva_rate: quote?.tva_rate || 20,
    tva_applicable: quote?.tva_applicable !== undefined ? quote.tva_applicable : true,
    tva_regime: quote?.tva_regime || 'NORMAL',
    payment_methods: quote?.payment_methods || [],
    payment_details: quote?.payment_details || {
      VIREMENT: { iban: '', bic: '', titulaire: '', banque: '' },
      PAYPAL: { email: '', lien: '' },
      STRIPE: { lien: '' },
      CARTE: { instructions: '' }
    },
    cgv: quote?.cgv || '',
    cgv_type: quote?.cgv_type || 'text',
    cgv_pdf: null,
    acompte_type: quote?.acompte_type || 'none',
    acompte_value: quote?.acompte_value || 0,
    escompte_percent: quote?.escompte_percent || 0,
    escompte_days: quote?.escompte_days || 0,
    validity_days: quote?.validity_days || 30,
    additional_info: quote?.additional_info || '',
    notes: quote?.notes || ''
  });

  const steps = [
    { label: 'Informations' },
    { label: 'Articles & Prix' },
    { label: 'Conditions' },
    { label: 'Documents' },
    { label: 'Récapitulatif' }
  ];

  // Charger les données de référence
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientsData, projectsData, tvaRegimesData, paymentMethodsData] = await Promise.all([
          clientsAPI.getAll(),
          projectsAPI.getAll(),
          tvaRegimesAPI.getAll(),
          paymentMethodsAPI.getAll()
        ]);
        setClients(clientsData);
        setProjects(projectsData);
        setTvaRegimes(tvaRegimesData);
        setPaymentMethods(paymentMethodsData);
      } catch (error) {
        console.error('Erreur chargement des données:', error);
      }
    };
    fetchData();
  }, []);

  // Migrer les items existants pour ajouter le champ type s'il n'existe pas
  useEffect(() => {
    if (quote && quote.items) {
      const migratedItems = quote.items.map(item => ({
        ...item,
        type: item.type || 'product' // Par défaut, c'est un produit
      }));
      setFormData(prev => ({
        ...prev,
        items: migratedItems
      }));
    }
  }, [quote]);

  // Charger les fichiers du quote
  useEffect(() => {
    if (quote && quote.additional_files) {
      try {
        const files = typeof quote.additional_files === 'string'
          ? JSON.parse(quote.additional_files)
          : quote.additional_files;
        setUploadedFiles(files || []);
      } catch (e) {
        setUploadedFiles([]);
      }
    }
  }, [quote]);

  // Recharger les fichiers après upload/suppression
  const handleFilesUpdated = async () => {
    if (quote && quote.id) {
      try {
        const response = await fetch(`${API_BASE_URL}/quotes/${quote.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const updatedQuote = await response.json();
        const files = typeof updatedQuote.additional_files === 'string'
          ? JSON.parse(updatedQuote.additional_files)
          : (updatedQuote.additional_files || []);
        setUploadedFiles(files);
      } catch (error) {
        console.error('Erreur rechargement fichiers:', error);
      }
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
      items: [...formData.items, { type: 'product', description: '', quantity: 1, unit_price: 0 }]
    });
  };

  const addDetailLine = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { type: 'detail', description: '', quantity: 0, unit_price: 0 }]
    });
  };

  // Insérer une ligne de détail après un produit spécifique
  const insertDetailLineAfter = (index) => {
    const newItems = [...formData.items];
    newItems.splice(index + 1, 0, { type: 'detail', description: '', quantity: 0, unit_price: 0 });
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  // Calculs
  const calculateTotals = () => {
    // Total des items (uniquement les produits, pas les lignes de détail)
    const subtotal = formData.items.reduce((sum, item) => {
      if (item.type === 'detail') return sum; // Ignorer les lignes de détail
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    }, 0);

    // Remise
    let discount_amount = 0;
    if (formData.discount_type === 'percent') {
      discount_amount = subtotal * (formData.discount_value / 100);
    } else if (formData.discount_type === 'fixed') {
      discount_amount = parseFloat(formData.discount_value) || 0;
    }

    const total_ht = subtotal - discount_amount;
    const tva_amount = formData.tva_applicable ? (total_ht * (formData.tva_rate / 100)) : 0;
    const total_ttc = total_ht + tva_amount;

    // Acompte
    let acompte_amount = 0;
    if (formData.acompte_type === 'percent') {
      acompte_amount = total_ttc * (formData.acompte_value / 100);
    } else if (formData.acompte_type === 'fixed') {
      acompte_amount = parseFloat(formData.acompte_value) || 0;
    }

    const reste_a_payer = total_ttc - acompte_amount;

    return { subtotal, discount_amount, total_ht, tva_amount, total_ttc, acompte_amount, reste_a_payer };
  };

  // Gérer le changement de régime TVA
  const handleTvaRegimeChange = (e) => {
    const regimeCode = e.target.value;
    const regime = tvaRegimes.regimes?.find(r => r.code === regimeCode) ||
                   tvaRegimes.find(r => r.code === regimeCode);
    if (regime) {
      setFormData({
        ...formData,
        tva_regime: regimeCode,
        tva_rate: regime.taux || 0,
        tva_applicable: regime.calcul_type === 'normal' || regime.calcul_type === 'marge'
      });
    }
  };

  // Gérer les moyens de paiement
  const handlePaymentMethodToggle = (methodCode) => {
    const current = formData.payment_methods || [];
    const exists = current.includes(methodCode);

    setFormData({
      ...formData,
      payment_methods: exists
        ? current.filter(code => code !== methodCode)
        : [...current, methodCode]
    });
  };

  // Gérer les détails de paiement
  const handlePaymentDetailChange = (methodCode, field, value) => {
    setFormData({
      ...formData,
      payment_details: {
        ...formData.payment_details,
        [methodCode]: {
          ...formData.payment_details[methodCode],
          [field]: value
        }
      }
    });
  };

  // Gérer l'upload du PDF CGV
  const handleCgvPdfUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      if (file.size > 5 * 1024 * 1024) {
        alert('Le fichier ne doit pas dépasser 5MB');
        return;
      }
      setFormData({ ...formData, cgv_pdf: file });
    } else {
      alert('Veuillez sélectionner un fichier PDF');
    }
  };

  // Validation par étape
  const validateStep = (step) => {
    switch (step) {
      case 0: // Informations
        if (!formData.client_name.trim()) {
          alert('Le nom du client est requis');
          return false;
        }
        return true;
      case 1: // Articles
        // Vérifier qu'il y a au moins un produit (pas juste des lignes de détail)
        const hasProducts = formData.items.some(item => item.type !== 'detail' && item.description.trim());
        if (!hasProducts) {
          alert('Au moins un article/produit est requis');
          return false;
        }
        return true;
      case 2: // Conditions
      case 3: // Documents
      case 4: // Récapitulatif
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleStepClick = (step) => {
    if (step < currentStep || validateStep(currentStep)) {
      setCurrentStep(step);
    }
  };

  // Nettoyage des données avant envoi
  // Convertit les chaînes vides en null pour les champs numériques/dates
  // Évite l'erreur PostgreSQL "invalid input syntax for integer: ''"
  const sanitizeFormData = (data) => {
    return {
      ...data,
      client_id: data.client_id === '' ? null : data.client_id,
      project_id: data.project_id === '' ? null : data.project_id,
      validity_days: data.validity_days === '' ? null : data.validity_days,
      discount_value: data.discount_value === '' ? null : data.discount_value,
      acompte_value: data.acompte_value === '' ? null : data.acompte_value,
      escompte_percent: data.escompte_percent === '' ? null : data.escompte_percent,
      escompte_days: data.escompte_days === '' ? null : data.escompte_days,
      tva_rate: data.tva_rate === '' ? null : data.tva_rate
    };
  };

  // Soumission
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.client_name.trim()) {
      alert('Le nom du client est requis');
      return;
    }

    // Vérifier qu'il y a au moins un produit (pas juste des lignes de détail)
    const hasProducts = formData.items.some(item => item.type !== 'detail' && item.description.trim());
    if (!hasProducts) {
      alert('Au moins un article/produit est requis');
      return;
    }

    // Nettoyer les données avant l'envoi
    const cleanedData = sanitizeFormData(formData);
    onSave(cleanedData);
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderInfoStep();
      case 1:
        return renderItemsStep();
      case 2:
        return renderConditionsStep();
      case 3:
        return renderDocumentsStep();
      case 4:
        return renderSummaryStep();
      default:
        return null;
    }
  };

  const renderInfoStep = () => (
    <div className="space-y-6 animate-fadeIn">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Informations générales</h3>

      {/* Titre et Projet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Titre du devis
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Site web e-commerce, Refonte graphique..."
            className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Projet associé
          </label>
          <select
            value={formData.project_id || ''}
            onChange={(e) => setFormData({ ...formData, project_id: e.target.value ? parseInt(e.target.value) : null })}
            className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
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

      {/* Informations client */}
      <div className="space-y-4 mt-6">
        <h4 className="text-md font-semibold text-text-primary">Informations client</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Sélectionner un client
            </label>
            <select
              value={formData.client_id}
              onChange={handleClientChange}
              className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
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
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Nom du client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              placeholder="Nom ou raison sociale"
              className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.client_email}
              onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
              placeholder="email@example.com"
              className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              SIRET
            </label>
            <input
              type="text"
              value={formData.client_siret}
              onChange={(e) => setFormData({ ...formData, client_siret: e.target.value })}
              placeholder="123 456 789 00010"
              className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Adresse
            </label>
            <textarea
              value={formData.client_address}
              onChange={(e) => setFormData({ ...formData, client_address: e.target.value })}
              rows={3}
              placeholder="Adresse complète du client"
              className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderItemsStep = () => {
    const totals = calculateTotals();

    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-text-primary">Articles / Services</h3>
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm shadow-lg"
          >
            <FiPlus className="w-4 h-4" />
            Ajouter un produit
          </button>
        </div>

        <div className="space-y-2">
          {formData.items.map((item, index) => (
            <div key={index}>
              {item.type === 'detail' ? (
                // Ligne de détail (texte libre, pas de calcul)
                <div className="bg-amber-900/10 border-l-4 border-amber-500 p-3 rounded-r-lg ml-4">
                  <div className="flex gap-3 items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FiEdit className="w-3 h-3 text-amber-400" />
                        <label className="text-xs font-medium text-amber-400">
                          Note / Détail
                        </label>
                      </div>
                      <textarea
                        placeholder="Ajoutez des précisions, conditions, notes..."
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 bg-surface/30 border border-amber-700/30 rounded text-amber-100 text-sm focus:outline-none focus:border-amber-500 min-h-[50px] placeholder-amber-700/50"
                        rows={2}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1.5 text-amber-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Supprimer"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                // Ligne produit (avec quantité et prix)
                <>
                  <div className="grid grid-cols-12 gap-3 items-start bg-surface/30 p-4 rounded-lg border border-border/50 hover:border-border-strong transition-colors">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-xs font-medium text-text-muted mb-1">Description</label>
                      <input
                        type="text"
                        placeholder="Ex: Développement site web"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <label className="block text-xs font-medium text-text-muted mb-1">Quantité</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 bg-surface border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <label className="block text-xs font-medium text-text-muted mb-1">Prix unitaire (€)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 bg-surface border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex items-end justify-center">
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          title="Supprimer"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="col-span-12 flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => insertDetailLineAfter(index)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/30 rounded-md transition-colors"
                        title="Ajouter une note ou détail sous ce produit"
                      >
                        <FiPlus className="w-3 h-3" />
                        <FiEdit className="w-3 h-3" />
                        <span>Ajouter une note</span>
                      </button>
                      <div className="text-sm text-text-muted">
                        Total: <span className="text-text-primary font-semibold">{((item.quantity || 0) * (item.unit_price || 0)).toFixed(2)} €</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Remise */}
        <div className="bg-surface/30 border border-border/50 rounded-lg p-4 space-y-4">
          <h4 className="text-md font-medium text-text-primary">Remise</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Type de remise
              </label>
              <select
                value={formData.discount_type}
                onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
              >
                <option value="none">Aucune</option>
                <option value="percent">Pourcentage</option>
                <option value="fixed">Montant fixe</option>
              </select>
            </div>

            {formData.discount_type !== 'none' && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {formData.discount_type === 'percent' ? 'Pourcentage (%)' : 'Montant (€)'}
                </label>
                <input
                  type="number"
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* TVA */}
        <div className="bg-surface/30 border border-border/50 rounded-lg p-4 space-y-4">
          <h4 className="text-md font-medium text-text-primary">TVA</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Régime TVA
              </label>
              <select
                value={formData.tva_regime}
                onChange={handleTvaRegimeChange}
                className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
              >
                {tvaRegimes.grouped && (
                  <>
                    <optgroup label="Taux normal et réduits">
                      {tvaRegimes.grouped.taux_normal?.map(regime => (
                        <option key={regime.code} value={regime.code}>
                          {regime.label}
                        </option>
                      ))}
                      {tvaRegimes.grouped.taux_reduit?.map(regime => (
                        <option key={regime.code} value={regime.code}>
                          {regime.label}
                        </option>
                      ))}
                    </optgroup>

                    {tvaRegimes.grouped.taux_reduit_specifique?.length > 0 && (
                      <optgroup label="Taux réduits spécifiques">
                        {tvaRegimes.grouped.taux_reduit_specifique.map(regime => (
                          <option key={regime.code} value={regime.code}>
                            {regime.label}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {tvaRegimes.grouped.non_application?.length > 0 && (
                      <optgroup label="Non-application de TVA">
                        {tvaRegimes.grouped.non_application.map(regime => (
                          <option key={regime.code} value={regime.code}>
                            {regime.label}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {tvaRegimes.grouped.exoneration?.length > 0 && (
                      <optgroup label="Exonération de TVA">
                        {tvaRegimes.grouped.exoneration.map(regime => (
                          <option key={regime.code} value={regime.code}>
                            {regime.label}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {tvaRegimes.grouped.autoliquidation?.length > 0 && (
                      <optgroup label="Autoliquidation de TVA">
                        {tvaRegimes.grouped.autoliquidation.map(regime => (
                          <option key={regime.code} value={regime.code}>
                            {regime.label}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {tvaRegimes.grouped.regime_particulier?.length > 0 && (
                      <optgroup label="Régimes particuliers">
                        {tvaRegimes.grouped.regime_particulier.map(regime => (
                          <option key={regime.code} value={regime.code}>
                            {regime.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </>
                )}

                {!tvaRegimes.grouped && tvaRegimes.length > 0 && tvaRegimes.map(regime => (
                  <option key={regime.code} value={regime.code}>
                    {regime.label}
                  </option>
                ))}
              </select>

              {/* Afficher la mention légale si elle existe */}
              {formData.tva_regime && (() => {
                const currentRegime = tvaRegimes.regimes?.find(r => r.code === formData.tva_regime) ||
                                    tvaRegimes.find(r => r.code === formData.tva_regime);
                return currentRegime?.mention_legale && (
                  <p className="text-xs text-text-muted mt-1 italic">
                    Mention légale : {currentRegime.mention_legale}
                  </p>
                );
              })()}
            </div>

            {formData.tva_applicable && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Taux TVA
                </label>
                <div className="px-4 py-2 bg-surface-strong/50 border border-border-strong rounded-lg text-text-primary">
                  {formData.tva_rate}%
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mini récapitulatif */}
        <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Sous-total</span>
            <span className="text-text-primary">{totals.subtotal.toFixed(2)} €</span>
          </div>
          {formData.discount_type !== 'none' && totals.discount_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Remise</span>
              <span className="text-red-400">- {totals.discount_amount.toFixed(2)} €</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold border-t border-indigo-500/30 pt-2">
            <span className="text-text-primary">Total HT</span>
            <span className="text-text-primary">{totals.total_ht.toFixed(2)} €</span>
          </div>
          {formData.tva_applicable && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">TVA ({formData.tva_rate}%)</span>
              <span className="text-text-primary">{totals.tva_amount.toFixed(2)} €</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t border-indigo-500/30 pt-2">
            <span className="text-text-primary">Total TTC</span>
            <span className="text-indigo-300">{totals.total_ttc.toFixed(2)} €</span>
          </div>
        </div>
      </div>
    );
  };

  const renderConditionsStep = () => (
    <div className="space-y-6 animate-fadeIn">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Conditions commerciales</h3>

      {/* Acompte */}
      <div className="bg-surface/30 border border-border/50 rounded-lg p-4 space-y-4">
        <h4 className="text-md font-medium text-text-primary">Acompte</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Type d'acompte
            </label>
            <select
              value={formData.acompte_type}
              onChange={(e) => setFormData({ ...formData, acompte_type: e.target.value })}
              className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
            >
              <option value="none">Aucun</option>
              <option value="percent">Pourcentage</option>
              <option value="fixed">Montant fixe</option>
            </select>
          </div>

          {formData.acompte_type !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                {formData.acompte_type === 'percent' ? 'Pourcentage (%)' : 'Montant (€)'}
              </label>
              <input
                type="number"
                value={formData.acompte_value}
                onChange={(e) => setFormData({ ...formData, acompte_value: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Options avancées - Collapsible */}
      <div className="bg-surface/30 border border-border/50 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
          className="w-full flex items-center justify-between p-4 hover:bg-surface/50 transition-colors"
        >
          <h4 className="text-md font-medium text-text-primary">Escompte (optionnel)</h4>
          {showAdvancedOptions ? (
            <FiChevronUp className="w-5 h-5 text-text-muted" />
          ) : (
            <FiChevronDown className="w-5 h-5 text-text-muted" />
          )}
        </button>

        {showAdvancedOptions && (
          <div className="p-4 pt-0 space-y-4 border-t border-border/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Pourcentage (%)
                </label>
                <input
                  type="number"
                  value={formData.escompte_percent}
                  onChange={(e) => setFormData({ ...formData, escompte_percent: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.1"
                  className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Si paiement sous (jours)
                </label>
                <input
                  type="number"
                  value={formData.escompte_days}
                  onChange={(e) => setFormData({ ...formData, escompte_days: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Validité */}
      <div className="bg-surface/30 border border-border/50 rounded-lg p-4">
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Validité du devis (jours)
        </label>
        <input
          type="number"
          value={formData.validity_days}
          onChange={(e) => setFormData({ ...formData, validity_days: parseInt(e.target.value) || 30 })}
          min="1"
          className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Moyens de paiement */}
      <div className="bg-surface/30 border border-border/50 rounded-lg p-4 space-y-4">
        <h4 className="text-md font-medium text-text-primary">Moyens de paiement acceptés</h4>

        {/* Checkboxes */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {paymentMethods.map(method => (
            <label key={method.id} className="flex items-center gap-2 p-3 bg-surface-strong/30 rounded-lg cursor-pointer hover:bg-surface-strong/50 transition-colors">
              <input
                type="checkbox"
                checked={(formData.payment_methods || []).includes(method.code)}
                onChange={() => handlePaymentMethodToggle(method.code)}
                className="w-4 h-4 text-indigo-600 bg-surface border-border rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-text-secondary">{method.label}</span>
            </label>
          ))}
        </div>

        {/* Champs conditionnels - Virement */}
        {(formData.payment_methods || []).includes('VIREMENT') && (
          <div className="bg-surface-strong/30 rounded-lg p-4 space-y-3">
            <h5 className="text-sm font-medium text-indigo-300">Informations Virement Bancaire</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">IBAN *</label>
                <input
                  type="text"
                  value={formData.payment_details?.VIREMENT?.iban || ''}
                  onChange={(e) => handlePaymentDetailChange('VIREMENT', 'iban', e.target.value)}
                  placeholder="FR76 1234 5678 9012 3456 7890 123"
                  className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">BIC</label>
                <input
                  type="text"
                  value={formData.payment_details?.VIREMENT?.bic || ''}
                  onChange={(e) => handlePaymentDetailChange('VIREMENT', 'bic', e.target.value)}
                  placeholder="BNPAFRPPXXX"
                  className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Titulaire du compte *</label>
                <input
                  type="text"
                  value={formData.payment_details?.VIREMENT?.titulaire || ''}
                  onChange={(e) => handlePaymentDetailChange('VIREMENT', 'titulaire', e.target.value)}
                  placeholder="Nom de l'entreprise"
                  className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Banque</label>
                <input
                  type="text"
                  value={formData.payment_details?.VIREMENT?.banque || ''}
                  onChange={(e) => handlePaymentDetailChange('VIREMENT', 'banque', e.target.value)}
                  placeholder="BNP Paribas"
                  className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Champs conditionnels - PayPal */}
        {(formData.payment_methods || []).includes('PAYPAL') && (
          <div className="bg-surface-strong/30 rounded-lg p-4 space-y-3">
            <h5 className="text-sm font-medium text-indigo-300">Informations PayPal</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Email PayPal *</label>
                <input
                  type="email"
                  value={formData.payment_details?.PAYPAL?.email || ''}
                  onChange={(e) => handlePaymentDetailChange('PAYPAL', 'email', e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Lien de paiement PayPal</label>
                <input
                  type="url"
                  value={formData.payment_details?.PAYPAL?.lien || ''}
                  onChange={(e) => handlePaymentDetailChange('PAYPAL', 'lien', e.target.value)}
                  placeholder="https://paypal.me/votrecompte"
                  className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Champs conditionnels - Stripe */}
        {(formData.payment_methods || []).includes('STRIPE') && (
          <div className="bg-surface-strong/30 rounded-lg p-4 space-y-3">
            <h5 className="text-sm font-medium text-indigo-300">Informations Stripe</h5>
            <div>
              <label className="block text-xs text-text-muted mb-1">Lien de paiement Stripe *</label>
              <input
                type="url"
                value={formData.payment_details?.STRIPE?.lien || ''}
                onChange={(e) => handlePaymentDetailChange('STRIPE', 'lien', e.target.value)}
                placeholder="https://buy.stripe.com/..."
                className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Champs conditionnels - Carte */}
        {(formData.payment_methods || []).includes('CARTE') && (
          <div className="bg-surface-strong/30 rounded-lg p-4 space-y-3">
            <h5 className="text-sm font-medium text-indigo-300">Informations Carte Bancaire</h5>
            <div>
              <label className="block text-xs text-text-muted mb-1">Instructions</label>
              <textarea
                value={formData.payment_details?.CARTE?.instructions || ''}
                onChange={(e) => handlePaymentDetailChange('CARTE', 'instructions', e.target.value)}
                placeholder="Ex: Paiement sur place ou lien TPE..."
                rows="2"
                className="w-full px-3 py-2 bg-surface/50 border border-border rounded text-text-primary text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderDocumentsStep = () => (
    <div className="space-y-6 animate-fadeIn">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Documents et informations complémentaires</h3>

      {/* Upload fichiers */}
      {quote && quote.id && (
        <div className="bg-surface/30 border border-border/50 rounded-lg p-4 space-y-4">
          <h4 className="text-md font-medium text-text-primary">Fichiers joints</h4>
          <FileUpload
            entityType="quote"
            entityId={quote.id}
            uploadedFiles={uploadedFiles}
            onFilesUpdated={handleFilesUpdated}
          />
        </div>
      )}

      {/* CGV */}
      <div className="bg-surface/30 border border-border/50 rounded-lg p-4 space-y-4">
        <h4 className="text-md font-medium text-text-primary">Conditions Générales de Vente (CGV)</h4>

        {/* Toggle : Texte ou PDF */}
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cgv_type"
              value="text"
              checked={formData.cgv_type === 'text' || !formData.cgv_type}
              onChange={(e) => setFormData({ ...formData, cgv_type: e.target.value })}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm text-text-secondary">Saisir le texte</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cgv_type"
              value="pdf"
              checked={formData.cgv_type === 'pdf'}
              onChange={(e) => setFormData({ ...formData, cgv_type: e.target.value })}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm text-text-secondary">Uploader un PDF</span>
          </label>
        </div>

        {/* Textarea pour texte */}
        {(!formData.cgv_type || formData.cgv_type === 'text') && (
          <div>
            <textarea
              value={formData.cgv}
              onChange={(e) => setFormData({ ...formData, cgv: e.target.value })}
              rows={8}
              className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500 resize-none text-sm"
              placeholder="Vos conditions générales de vente..."
            />
          </div>
        )}

        {/* Upload PDF */}
        {formData.cgv_type === 'pdf' && (
          <div className="border-2 border-dashed border-border-strong rounded-lg p-6">
            <input
              type="file"
              id="cgv-pdf-upload"
              accept=".pdf"
              onChange={handleCgvPdfUpload}
              className="hidden"
            />
            <label
              htmlFor="cgv-pdf-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <FiUpload className="w-10 h-10 text-text-muted mb-2" />
              <p className="text-text-secondary font-medium">Cliquez pour sélectionner un fichier PDF</p>
              <p className="text-sm text-gray-500 mt-1">Format accepté : PDF uniquement (max 5MB)</p>
            </label>

            {formData.cgv_pdf && (
              <div className="mt-4 flex items-center justify-between p-3 bg-surface-strong/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <FiFileText className="text-2xl text-text-secondary" />
                  <span className="text-sm text-text-primary">{formData.cgv_pdf.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cgv_pdf: null })}
                  className="text-red-400 hover:text-red-300"
                >
                  <FiTrash2 />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Informations complémentaires */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Informations complémentaires
        </label>
        <textarea
          value={formData.additional_info}
          onChange={(e) => setFormData({ ...formData, additional_info: e.target.value })}
          rows={3}
          placeholder="Informations supplémentaires à afficher sur le devis..."
          className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500 text-sm"
        />
      </div>

      {/* Notes internes */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Notes internes (non visibles sur le devis)
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          placeholder="Notes pour usage interne..."
          className="w-full px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500 text-sm"
        />
      </div>
    </div>
  );

  const renderSummaryStep = () => {
    const totals = calculateTotals();

    return (
      <div className="space-y-6 animate-fadeIn">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Récapitulatif du devis</h3>

        {/* Informations générales */}
        <div className="bg-surface/30 border border-border/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-secondary mb-3">Informations générales</h4>
          <div className="space-y-2 text-sm">
            {formData.title && (
              <div className="flex justify-between">
                <span className="text-text-muted">Titre:</span>
                <span className="text-text-primary font-medium">{formData.title}</span>
              </div>
            )}
            {formData.project_id && (
              <div className="flex justify-between">
                <span className="text-text-muted">Projet:</span>
                <span className="text-text-primary">
                  {projects.find(p => p.id === formData.project_id)?.name || 'N/A'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-muted">Validité:</span>
              <span className="text-text-primary">{formData.validity_days} jours</span>
            </div>
          </div>
        </div>

        {/* Client */}
        <div className="bg-surface/30 border border-border/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-secondary mb-3">Client</h4>
          <div className="text-sm text-text-muted space-y-1">
            <p className="text-text-primary font-medium">{formData.client_name}</p>
            {formData.client_email && <p>{formData.client_email}</p>}
            {formData.client_siret && <p>SIRET: {formData.client_siret}</p>}
            {formData.client_address && <p className="text-xs">{formData.client_address}</p>}
          </div>
        </div>

        {/* Articles */}
        <div className="bg-surface/30 border border-border/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-secondary mb-3">Articles ({formData.items.length})</h4>
          <div className="space-y-2">
            {formData.items.map((item, index) => (
              item.type === 'detail' ? (
                // Ligne de détail
                <div key={index} className="py-1 text-sm">
                  <p className="text-amber-300/80 italic text-xs">{item.description}</p>
                </div>
              ) : (
                // Ligne produit
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-text-muted">
                    {item.description} <span className="text-xs">({item.quantity} × {parseFloat(item.unit_price).toFixed(2)}€)</span>
                  </span>
                  <span className="text-text-primary font-medium">
                    {((item.quantity || 0) * (item.unit_price || 0)).toFixed(2)} €
                  </span>
                </div>
              )
            ))}
          </div>
        </div>

        {/* Totaux */}
        <div className="bg-accent/10 border border-indigo-500/30 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Sous-total</span>
            <span className="text-text-primary">{totals.subtotal.toFixed(2)} €</span>
          </div>
          {formData.discount_type !== 'none' && totals.discount_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Remise</span>
              <span className="text-red-400">- {totals.discount_amount.toFixed(2)} €</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-text-primary">Total HT</span>
            <span className="text-text-primary">{totals.total_ht.toFixed(2)} €</span>
          </div>
          {formData.tva_applicable && (
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">TVA ({formData.tva_rate}%)</span>
              <span className="text-text-primary">{totals.tva_amount.toFixed(2)} €</span>
            </div>
          )}
          <div className="flex justify-between text-lg border-t border-indigo-500/30 pt-2 font-bold">
            <span className="text-text-primary">Total TTC</span>
            <span className="text-indigo-300">{totals.total_ttc.toFixed(2)} €</span>
          </div>
          {formData.acompte_type !== 'none' && totals.acompte_amount > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Acompte</span>
                <span className="text-text-primary">{totals.acompte_amount.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Reste à payer</span>
                <span className="text-text-primary font-semibold">{totals.reste_a_payer.toFixed(2)} €</span>
              </div>
            </>
          )}
        </div>

        {/* Moyens de paiement */}
        {formData.payment_methods && formData.payment_methods.length > 0 && (
          <div className="bg-surface/30 border border-border/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-text-secondary mb-2">Moyens de paiement acceptés</h4>
            <div className="flex flex-wrap gap-2">
              {formData.payment_methods.map(methodId => {
                const method = paymentMethods.find(m => m.id === methodId);
                return method ? (
                  <span key={methodId} className="px-3 py-1 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">
                    {method.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Signature */}
        {quote && quote.id && (
          <div className="bg-surface/30 border border-border/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text-secondary">Signature client</h4>
              <button
                type="button"
                onClick={() => setShowSignature(!showSignature)}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showSignature ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showSignature && (
              <SignaturePad
                quoteId={quote.id}
                existingSignature={quote.client_signature}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
          {quote ? 'Modifier le devis' : 'Nouveau devis'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-strong rounded-lg transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>
      </div>

      {/* Stepper */}
      <Stepper
        steps={steps}
        currentStep={currentStep}
        onStepClick={handleStepClick}
      />

      {/* Step Content */}
      <div className="min-h-[400px]">
        {renderStepContent()}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between items-center pt-6 border-t border-border">
        <button
          type="button"
          onClick={prevStep}
          disabled={currentStep === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            currentStep === 0
              ? 'bg-surface-strong/50 text-gray-500 cursor-not-allowed'
              : 'bg-surface-strong hover:bg-border-strong text-text-primary'
          }`}
        >
          <FiChevronLeft className="w-4 h-4" />
          <span>Précédent</span>
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg transition-colors"
          >
            Annuler
          </button>

          {currentStep === steps.length - 1 ? (
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg transition-all shadow-lg shadow-indigo-500/30"
            >
              <FiSave />
              <span>{quote ? 'Enregistrer' : 'Créer le devis'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center gap-2 px-6 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              <span>Suivant</span>
              <FiChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
};

export default QuoteForm;
