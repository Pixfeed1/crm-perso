// src/components/common/Stepper.jsx
import React from 'react';
import { FiCheck } from 'react-icons/fi';
import { motion } from 'framer-motion';

const Stepper = ({ steps, currentStep, onStepClick }) => {
  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        {/* Ligne de progression */}
        <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-700 -z-10">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
            initial={{ width: '0%' }}
            animate={{ width: `${((currentStep) / (steps.length - 1)) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = index <= currentStep || isCompleted;

          return (
            <div
              key={index}
              className="flex flex-col items-center relative z-10"
              style={{ flex: 1 }}
            >
              <motion.button
                type="button"
                onClick={() => isClickable && onStepClick(index)}
                disabled={!isClickable}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
                  transition-all duration-300
                  ${isCompleted
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                    : isCurrent
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/30'
                    : 'bg-gray-700 text-gray-400'}
                  ${isClickable ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed opacity-50'}
                `}
                whileHover={isClickable ? { scale: 1.1 } : {}}
                whileTap={isClickable ? { scale: 0.95 } : {}}
              >
                {isCompleted ? (
                  <FiCheck className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </motion.button>

              <span className={`
                mt-2 text-xs font-medium text-center
                ${isCurrent ? 'text-indigo-300' : isCompleted ? 'text-gray-300' : 'text-gray-500'}
              `}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Stepper;
