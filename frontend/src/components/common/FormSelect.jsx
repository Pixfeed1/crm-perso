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
  ...props
}) => {
  const selectId = `select-${name}`;

  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-300 mb-2"
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
          bg-gray-800/50
          border ${error ? 'border-rose-500' : 'border-gray-700'}
          rounded-lg
          px-4 py-2.5
          text-white
          focus:outline-none
          focus:ring-2
          focus:ring-purple-500/50
          focus:border-purple-500
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
            className="bg-gray-800 text-white"
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
