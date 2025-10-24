import React from 'react';
import { motion } from 'framer-motion';

/**
 * Composant textarea de formulaire réutilisable avec style cohérent
 */
const FormTextarea = ({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  required = false,
  disabled = false,
  rows = 3,
  className = '',
  textareaClassName = '',
  variant = 'dark', // 'dark' ou 'light'
  ...props
}) => {
  const textareaId = `textarea-${name}`;

  // Styles selon le variant
  const variantStyles = {
    dark: {
      bg: 'bg-gray-800/50',
      border: error ? 'border-rose-500' : 'border-gray-700',
      text: 'text-white',
      placeholder: 'placeholder-gray-500',
      ring: 'focus:ring-purple-500/50 focus:border-purple-500'
    },
    light: {
      bg: 'bg-white/90',
      border: error ? 'border-rose-500' : 'border-gray-300',
      text: 'text-gray-900',
      placeholder: 'placeholder-gray-500',
      ring: 'focus:ring-purple-500 focus:border-transparent'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}

      <textarea
        id={textareaId}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        rows={rows}
        aria-required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${textareaId}-error` : undefined}
        className={`
          w-full
          ${styles.bg}
          border ${styles.border}
          rounded-lg
          px-4 py-2
          ${styles.text}
          ${styles.placeholder}
          focus:outline-none
          focus:ring-2
          ${styles.ring}
          disabled:opacity-50
          disabled:cursor-not-allowed
          resize-none
          transition-all
          ${textareaClassName}
        `}
        {...props}
      />

      {error && (
        <motion.p
          id={`${textareaId}-error`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-xs text-rose-500"
          role="alert"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
};

export default FormTextarea;
