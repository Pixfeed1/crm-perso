#!/bin/bash

# Script pour corriger l'erreur PDF "autoTable is not a function"

echo "🔧 Correction de l'erreur PDF autoTable..."
echo ""

# Aller dans le dossier frontend
cd frontend || exit 1

echo "📦 Vérification des packages installés..."
if [ -d "node_modules" ]; then
    echo "✓ node_modules existe"

    # Vérifier si jspdf-autotable est installé
    if [ -d "node_modules/jspdf-autotable" ]; then
        echo "✓ jspdf-autotable est installé"
    else
        echo "✗ jspdf-autotable n'est PAS installé"
        echo ""
        echo "🔄 Installation de jspdf-autotable..."
        npm install jspdf-autotable@^5.0.2
    fi

    # Vérifier si jspdf est installé
    if [ -d "node_modules/jspdf" ]; then
        echo "✓ jspdf est installé"
    else
        echo "✗ jspdf n'est PAS installé"
        echo ""
        echo "🔄 Installation de jspdf..."
        npm install jspdf@^3.0.3
    fi
else
    echo "✗ node_modules n'existe pas"
    echo ""
    echo "🔄 Installation de toutes les dépendances..."
    npm install
fi

echo ""
echo "📋 Versions installées :"
npm list jspdf jspdf-autotable 2>/dev/null | grep -E "(jspdf|└|├)" || echo "Packages non trouvés"

echo ""
echo "✅ Correction terminée !"
echo ""
echo "📝 Prochaines étapes :"
echo "   1. Redémarrer le serveur : npm start"
echo "   2. Aller sur la page Reports"
echo "   3. Cliquer sur 'Exporter en PDF'"
echo ""
echo "📖 Consultez FIX_PDF_EXPORT.md pour plus d'infos"
