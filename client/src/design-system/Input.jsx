import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  {
    label,
    error,
    helper,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    className = '',
    inputClassName = '',
    labelClassName = '',
    ...props
  },
  ref
) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={props.id}
          className={`mb-1.5 block text-xs font-bold text-gray-700 ${labelClassName}`}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {LeftIcon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <LeftIcon size={18} />
          </div>
        )}
        <input
          ref={ref}
          className={`
            w-full rounded-xl border bg-white text-gray-800 placeholder:text-gray-400
            transition-all duration-200
            focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10
            hover:border-gray-300
            disabled:bg-gray-50 disabled:text-gray-400
            ${LeftIcon ? 'pl-10' : 'px-4'}
            ${RightIcon ? 'pr-10' : 'px-4'}
            ${error ? 'border-danger-300 focus:border-danger-500 focus:ring-danger-500/10' : 'border-gray-200'}
            ${inputClassName}
          `}
          {...props}
        />
        {RightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <RightIcon size={18} />
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>}
      {helper && !error && <p className="mt-1.5 text-xs text-gray-500">{helper}</p>}
    </div>
  );
});

export default Input;
