// src/hooks/useConfirm.js
import { useState } from 'react';

export const useConfirm = () => {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    config: {}
  });

  const confirm = (config = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        config: {
          ...config,
          onConfirm: () => {
            resolve(true);
            setConfirmState({ isOpen: false, config: {} });
          },
          onClose: () => {
            resolve(false);
            setConfirmState({ isOpen: false, config: {} });
          }
        }
      });
    });
  };

  return {
    confirm,
    confirmState
  };
};
