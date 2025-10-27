// src/hooks/useToast.js
import { useContext } from 'react';
import { ToastContext } from '../contexts/ToastContext';

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast doit être utilisé dans un ToastProvider');
  }

  return context;
};
