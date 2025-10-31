# 🔧 Corrections à Apporter aux Formulaires Devis/Factures

## Problèmes Identifiés et Solutions

### 1. Moyens de Paiement - INCOMPLET ❌

**Problème actuel :**
- On peut cocher les moyens de paiement (Virement, PayPal, Carte, etc.)
- Mais AUCUN champ pour saisir les informations associées :
  - Virement → pas de champ IBAN, BIC, titulaire
  - PayPal → pas de champ lien/email PayPal
  - Stripe → pas de champ lien de paiement
  - etc.

**Solution à implémenter :**

Ajouter un state `payment_details` dans formData :
```javascript
const [formData, setFormData] = useState({
  // ... existant
  payment_methods: [],
  payment_details: {
    VIREMENT: {
      iban: '',
      bic: '',
      titulaire: '',
      banque: ''
    },
    PAYPAL: {
      email: '',
      lien: ''
    },
    STRIPE: {
      lien: ''
    },
    CARTE: {
      instructions: ''
    }
  }
});
```

Modifier la section moyens de paiement pour afficher les champs conditionnels :

```jsx
{/* Moyens de paiement */}
<div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-4">
  <h4 className="text-md font-medium text-white">Moyens de paiement acceptés</h4>

  {/* Checkboxes */}
  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    {paymentMethods.map(method => (
      <label key={method.id} className="flex items-center gap-2 p-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors">
        <input
          type="checkbox"
          checked={(formData.payment_methods || []).includes(method.code)}
          onChange={() => handlePaymentMethodToggle(method.code)}
          className="w-4 h-4 text-indigo-600 bg-gray-800 border-gray-700 rounded focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-300">{method.label}</span>
      </label>
    ))}
  </div>

  {/* Champs conditionnels pour chaque moyen */}
  {(formData.payment_methods || []).includes('VIREMENT') && (
    <div className="bg-gray-700/30 rounded-lg p-4 space-y-3">
      <h5 className="text-sm font-medium text-indigo-300">Informations Virement Bancaire</h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">IBAN *</label>
          <input
            type="text"
            value={formData.payment_details?.VIREMENT?.iban || ''}
            onChange={(e) => setFormData({
              ...formData,
              payment_details: {
                ...formData.payment_details,
                VIREMENT: { ...formData.payment_details?.VIREMENT, iban: e.target.value }
              }
            })}
            placeholder="FR76 1234 5678 9012 3456 7890 123"
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">BIC</label>
          <input
            type="text"
            value={formData.payment_details?.VIREMENT?.bic || ''}
            onChange={(e) => setFormData({
              ...formData,
              payment_details: {
                ...formData.payment_details,
                VIREMENT: { ...formData.payment_details?.VIREMENT, bic: e.target.value }
              }
            })}
            placeholder="BNPAFRPPXXX"
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Titulaire du compte *</label>
          <input
            type="text"
            value={formData.payment_details?.VIREMENT?.titulaire || ''}
            onChange={(e) => setFormData({
              ...formData,
              payment_details: {
                ...formData.payment_details,
                VIREMENT: { ...formData.payment_details?.VIREMENT, titulaire: e.target.value }
              }
            })}
            placeholder="Nom de l'entreprise"
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Banque</label>
          <input
            type="text"
            value={formData.payment_details?.VIREMENT?.banque || ''}
            onChange={(e) => setFormData({
              ...formData,
              payment_details: {
                ...formData.payment_details,
                VIREMENT: { ...formData.payment_details?.VIREMENT, banque: e.target.value }
              }
            })}
            placeholder="BNP Paribas"
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>
    </div>
  )}

  {(formData.payment_methods || []).includes('PAYPAL') && (
    <div className="bg-gray-700/30 rounded-lg p-4 space-y-3">
      <h5 className="text-sm font-medium text-indigo-300">Informations PayPal</h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Email PayPal *</label>
          <input
            type="email"
            value={formData.payment_details?.PAYPAL?.email || ''}
            onChange={(e) => setFormData({
              ...formData,
              payment_details: {
                ...formData.payment_details,
                PAYPAL: { ...formData.payment_details?.PAYPAL, email: e.target.value }
              }
            })}
            placeholder="votre@email.com"
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Lien de paiement PayPal</label>
          <input
            type="url"
            value={formData.payment_details?.PAYPAL?.lien || ''}
            onChange={(e) => setFormData({
              ...formData,
              payment_details: {
                ...formData.payment_details,
                PAYPAL: { ...formData.payment_details?.PAYPAL, lien: e.target.value }
              }
            })}
            placeholder="https://paypal.me/votrecompte"
            className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>
    </div>
  )}

  {(formData.payment_methods || []).includes('STRIPE') && (
    <div className="bg-gray-700/30 rounded-lg p-4 space-y-3">
      <h5 className="text-sm font-medium text-indigo-300">Informations Stripe</h5>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Lien de paiement Stripe *</label>
        <input
          type="url"
          value={formData.payment_details?.STRIPE?.lien || ''}
          onChange={(e) => setFormData({
            ...formData,
            payment_details: {
              ...formData.payment_details,
              STRIPE: { ...formData.payment_details?.STRIPE, lien: e.target.value }
            }
          })}
          placeholder="https://buy.stripe.com/..."
          className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
        />
      </div>
    </div>
  )}

  {(formData.payment_methods || []).includes('CARTE') && (
    <div className="bg-gray-700/30 rounded-lg p-4 space-y-3">
      <h5 className="text-sm font-medium text-indigo-300">Informations Carte Bancaire</h5>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Instructions</label>
        <textarea
          value={formData.payment_details?.CARTE?.instructions || ''}
          onChange={(e) => setFormData({
            ...formData,
            payment_details: {
              ...formData.payment_details,
              CARTE: { ...formData.payment_details?.CARTE, instructions: e.target.value }
            }
          })}
          placeholder="Ex: Paiement sur place ou lien TPE..."
          rows="2"
          className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded text-white text-sm"
        />
      </div>
    </div>
  )}
</div>
```

---

### 2. CGV - À AMÉLIORER ⚠️

**Problème actuel :**
- Seule option : textarea pour écrire les CGV
- Pas d'option pour uploader un PDF

**Solution à implémenter :**

Modifier la section CGV pour permettre les DEUX options :

```jsx
{/* CGV */}
<div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-4">
  <h4 className="text-md font-medium text-white">Conditions Générales de Vente (CGV)</h4>

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
      <span className="text-sm text-gray-300">Saisir le texte</span>
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
      <span className="text-sm text-gray-300">Uploader un PDF</span>
    </label>
  </div>

  {/* Textarea pour texte */}
  {(!formData.cgv_type || formData.cgv_type === 'text') && (
    <div>
      <textarea
        value={formData.cgv}
        onChange={(e) => setFormData({ ...formData, cgv: e.target.value })}
        rows="8"
        className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 resize-none"
        placeholder="Vos conditions générales de vente..."
      />
    </div>
  )}

  {/* Upload PDF */}
  {formData.cgv_type === 'pdf' && (
    <div className="border-2 border-dashed border-gray-600 rounded-lg p-6">
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
        <FiUpload className="w-10 h-10 text-gray-400 mb-2" />
        <p className="text-gray-300 font-medium">Cliquez pour sélectionner un fichier PDF</p>
        <p className="text-sm text-gray-500 mt-1">Format accepté : PDF uniquement (max 5MB)</p>
      </label>

      {formData.cgv_pdf && (
        <div className="mt-4 flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📄</span>
            <span className="text-sm text-white">{formData.cgv_pdf.name}</span>
          </div>
          <button
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
```

Ajouter le handler :
```javascript
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
```

---

### 3. Escompte - À VÉRIFIER ✓

**État actuel :**
```javascript
escompte_percent: quote?.escompte_percent || 0,
escompte_days: quote?.escompte_days || 0,
```

La structure est présente dans formData mais il faut vérifier si elle est affichée dans le formulaire.

**Recherche à faire :**
Vérifier s'il y a une section "Escompte" dans le formulaire avec les champs :
- Pourcentage d'escompte
- Nombre de jours pour bénéficier de l'escompte

---

## Fichiers à Modifier

### QuoteForm.jsx
- [ ] Ajouter `payment_details` dans formData initial
- [ ] Ajouter `cgv_type` et `cgv_pdf` dans formData
- [ ] Modifier la section moyens de paiement (ligne ~686)
- [ ] Modifier la section CGV (ligne ~723)
- [ ] Ajouter le handler `handleCgvPdfUpload`
- [ ] Modifier le handler `handlePaymentMethodToggle` pour utiliser `code` au lieu de `id`
- [ ] Vérifier/ajouter la section Escompte

### InvoiceForm.jsx
- [ ] Mêmes modifications que QuoteForm.jsx

---

## Prochaines Étapes

1. **Moyens de paiement** : Implémenter les champs conditionnels
2. **CGV** : Ajouter l'option PDF en plus du textarea
3. **Escompte** : Vérifier et améliorer si nécessaire
4. **Backend** : Modifier les routes pour sauvegarder `payment_details` et `cgv_pdf`

**Veux-tu que je commence à implémenter ces corrections maintenant ?**
