// src/components/common/Button.jsx
import React from 'react';
import { motion } from 'framer-motion';

const Button = ({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  icon: Icon,
  disabled = false,
  type = 'button',
  ...props
}) => {
  // Variantes de couleur
  const variants = {
    primary: 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white',
    secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    outline: 'border border-gray-600 hover:bg-gray-700 text-white bg-transparent',
  };

  // Tailles
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const baseClasses = 'rounded-lg flex items-center justify-center gap-2 transition-colors font-medium';
  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;
  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <motion.button
      type={type}
      onClick={disabled ? undefined : onClick}
      className={`${baseClasses} ${variantClass} ${sizeClass} ${disabledClass} ${className}`}
      whileHover={disabled ? {} : { scale: 1.05 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      disabled={disabled}
      {...props}
    >
      {Icon && <Icon className="flex-shrink-0" />}
      {children}
    </motion.button>
  );
};

export default Button;
