import { forwardRef } from 'react';

const Card = forwardRef(function Card(
  { children, className = '', hover = false, padding = 'normal', ...props },
  ref
) {
  const paddings = {
    none: '',
    sm: 'p-4',
    normal: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      ref={ref}
      className={`
        bg-white rounded-2xl border border-gray-100 shadow-card
        transition-all duration-200
        ${hover ? 'hover:shadow-soft hover:-translate-y-0.5' : ''}
        ${paddings[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
});

export default Card;
