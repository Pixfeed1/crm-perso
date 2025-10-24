import React from 'react';
import { motion } from 'framer-motion';

/**
 * Composant d'input de formulaire réutilisable avec style cohérent
 * Supporte les thèmes sombre et clair
 */
const FormInput = ({
  label,
  type = 'text',
  name,
  value,
  onChange,
  error,
  placeholder,
  required = false,
  disabled = false,
  className = '',
  inputClassName = '',
  variant = 'dark', // 'dark' ou 'light'
  ...props
}) => {
  const inputId = `input-${name}`;

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
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}

      <input
        id={inputId}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${inputId}-error` : undefined}
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
          transition-all
          ${inputClassName}
        `}
        {...props}
      />

      {error && (
        <motion.p
          id={`${inputId}-error`}
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

export default FormInput;
