import { forwardRef } from 'react';

const variants = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/25 focus:ring-primary-500',
  secondary:
    'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus:ring-gray-200',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-200',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 hover:shadow-lg hover:shadow-danger-500/25 focus:ring-danger-500',
  success:
    'bg-success-600 text-white hover:bg-success-700 hover:shadow-lg hover:shadow-success-500/25 focus:ring-success-500',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
  icon: 'p-2.5',
};

const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    loading = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    type = 'button',
    ...props
  },
  ref
) {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {!loading && LeftIcon && <LeftIcon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
      {children}
      {!loading && RightIcon && <RightIcon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
    </button>
  );
});

export default Button;
