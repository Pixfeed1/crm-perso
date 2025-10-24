// frontend/src/pages/QuoteEdit.jsx

import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import QuoteForm from '../components/quotes/QuoteForm';

/**
 * Page d'édition d'un devis existant
 */
const QuoteEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-xl
                 rounded-2xl border border-white/10 p-8"
      >
        <QuoteForm
          quoteId={id}
          onSuccess={() => navigate(`/quotes/${id}`)}
        />
      </motion.div>
    </div>
  );
};

export default QuoteEdit;
