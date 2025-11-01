# 🐛 Diagnostic : Erreur "invalid input syntax for integer: '[object Object]'"

## ✅ Statut de la correction

**Le bug a été corrigé dans le code** (commit `3ec6d39`).

## 🔍 Vérification

Tous les appels à `onUpdate()` dans `LeadDetails.jsx` passent maintenant correctement `lead.id` :

```javascript
// ✅ CORRECT (version actuelle dans git)
await onUpdate(lead.id, { status: newStatus });
await onUpdate(lead.id, formData);
await onUpdate(lead.id, { status: 'won' });
```

## ⚠️ Pourquoi l'erreur persiste

Le problème vient probablement de l'une de ces causes :

### 1. Cache du navigateur
Le navigateur utilise encore l'ancienne version du JavaScript.

**Solution :**
- Appuyez sur `Ctrl + Shift + R` (Windows/Linux) ou `Cmd + Shift + R` (Mac)
- Ou videz le cache du navigateur
- Ou ouvrez en navigation privée pour tester

### 2. Serveur frontend non redémarré
Si vous développez en local, le serveur n'a peut-être pas recompilé le code.

**Solution :**
```bash
cd frontend
npm run build  # Pour la production
# OU
# Redémarrez npm start si en mode développement
```

### 3. Code non déployé en production
Si vous testez sur `https://crm.pixfeed.net`, le code n'a peut-être pas été déployé.

**Solution :**
- Vérifier que le dernier commit est bien déployé
- Redéployer l'application

## 🧪 Test de vérification

Pour confirmer que vous avez la bonne version :

1. Ouvrez la console du navigateur (F12)
2. Essayez de modifier un lead
3. Regardez l'URL dans la console :
   - ❌ Si vous voyez : `PUT /api/leads/[object Object]` → Cache à vider
   - ✅ Si vous voyez : `PUT /api/leads/123` → Version correcte !

## 📝 Fichiers corrigés

- `frontend/src/components/leads/LeadDetails.jsx` (6 occurrences)
  - Ligne 88: `handleStatusChange`
  - Ligne 97: `handleSaveEdit`
  - Ligne 201: `handleConvertToClient`
  - Ligne 221: `handleCreateClient`
  - Ligne 235: `handleLinkClient`
  - Ligne 261: `handleUnlinkClient`

## ✅ Commit

```
3ec6d39 - Fix: Correction erreur 500 'invalid input syntax for integer' lors de la mise à jour de leads
```
