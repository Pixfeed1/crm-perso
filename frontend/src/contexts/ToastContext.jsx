// src/contexts/ToastContext.jsx
import React, { createContext, useState, useCallback } from 'react';
import ToastContainer from '../components/common/ToastContainer';

export const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // Ajouter un toast
  const addToast = useCallback(({ type = 'info', message, duration = 5000 }) => {
    const id = Date.now() + Math.random();

    setToasts((prev) => [
      ...prev,
      {
        id,
        type,
        message,
        duration
      }
    ]);

    return id;
  }, []);

  // Méthodes raccourcies pour chaque type
  const toast = useCallback({
    success: (message, duration) => addToast({ type: 'success', message, duration }),
    error: (message, duration) => addToast({ type: 'error', message, duration }),
    warning: (message, duration) => addToast({ type: 'warning', message, duration }),
    info: (message, duration) => addToast({ type: 'info', message, duration })
  }, [addToast]);

  // Supprimer un toast
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, toast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};
