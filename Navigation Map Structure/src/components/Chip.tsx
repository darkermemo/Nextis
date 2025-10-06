interface ChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'priority-high' | 'priority-medium' | 'priority-low' | 'type';
  onClick?: () => void;
  selected?: boolean;
}

export function Chip({ children, variant = 'default', onClick, selected }: ChipProps) {
  const variantStyles = {
    default: 'bg-accent text-accent-foreground',
    'priority-high': 'bg-destructive/10 text-destructive',
    'priority-medium': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    'priority-low': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    type: 'bg-primary/10 text-primary',
  };

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        inline-flex items-center px-2 py-0.5 rounded-full text-[11px] transition-colors
        ${variantStyles[variant]}
        ${selected ? 'ring-2 ring-primary' : ''}
        ${onClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}
      `}
    >
      {children}
    </button>
  );
}
