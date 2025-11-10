import React from 'react';

interface ButtonLoaderProps {
  size?: 'sm' | 'md';
  color?: 'white' | 'current';
}

const ButtonLoader: React.FC<ButtonLoaderProps> = ({ size = 'sm', color = 'current' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-5 h-5 border-2',
  };

  const colorClasses = {
    white: 'border-white border-t-transparent',
    current: 'border-current border-t-transparent',
  };

  return (
    <div
      className={`inline-block animate-spin rounded-full ${sizeClasses[size]} ${colorClasses[color]}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default ButtonLoader;

