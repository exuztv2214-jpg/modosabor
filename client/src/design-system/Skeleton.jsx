export default function Skeleton({ width, height, className = '', circle = false, count = 1 }) {
  const baseClasses = 'animate-pulse bg-gray-200';

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`${baseClasses} ${circle ? 'rounded-full' : 'rounded-lg'}`}
          style={{ width, height }}
        />
      ))}
    </div>
  );
}
