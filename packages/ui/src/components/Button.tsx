import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variants: Record<string, string> = {
    primary:
      'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 focus:ring-indigo-500',
    secondary:
      'bg-white/10 text-white hover:bg-white/20 active:bg-white/30 focus:ring-white/50 border border-white/20',
    danger:
      'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500',
    ghost:
      'bg-transparent text-white/70 hover:text-white hover:bg-white/10 focus:ring-white/30',
  };

  const sizes: Record<string, string> = {
    sm: 'px-3 py-2 text-sm min-h-[36px]',
    md: 'px-5 py-3 text-base min-h-[48px]',
    lg: 'px-6 py-4 text-lg min-h-[56px]',
  };

  const classes = [
    base,
    variants[variant] ?? variants['primary'],
    sizes[size] ?? sizes['md'],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...props} disabled={disabled ?? loading} className={classes}>
      {loading ? (
        <span className="flex items-center gap-2">
          <Spinner size={size === 'sm' ? 'xs' : 'sm'} />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner({ size = 'sm' }: { size?: 'xs' | 'sm' }) {
  const s = size === 'xs' ? 'h-3 w-3' : 'h-4 w-4';
  return (
    <svg
      className={`${s} animate-spin`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
