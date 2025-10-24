import React from 'react';
import { motion } from 'framer-motion';

/**
 * Composant select de formulaire réutilisable avec style cohérent
 */
const FormSelect = ({
  label,
  name,
  value,
  onChange,
  error,
  required = false,
  disabled = false,
  options = [],
  placeholder = 'Sélectionner...',
  className = '',
  selectClassName = '',
  variant = 'dark', // 'dark' ou 'light'
  ...props
}) => {
  const selectId = `select-${name}`;

  // Styles selon le variant
  const variantStyles = {
    dark: {
      bg: 'bg-gray-800/50',
      border: error ? 'border-rose-500' : 'border-gray-700',
      text: 'text-white',
      ring: 'focus:ring-purple-500/50 focus:border-purple-500',
      option: 'bg-gray-800 text-white'
    },
    light: {
      bg: 'bg-white/90',
      border: error ? 'border-rose-500' : 'border-gray-300',
      text: 'text-gray-900',
      ring: 'focus:ring-purple-500 focus:border-transparent',
      option: 'bg-white text-gray-900'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      )}

      <select
        id={selectId}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        aria-required={required}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={`
          w-full
          ${styles.bg}
          border ${styles.border}
          rounded-lg
          px-4 py-2
          ${styles.text}
          focus:outline-none
          focus:ring-2
          ${styles.ring}
          disabled:opacity-50
          disabled:cursor-not-allowed
          transition-all
          ${selectClassName}
        `}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className={styles.option}
          >
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <motion.p
          id={`${selectId}-error`}
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

export default FormSelect;
