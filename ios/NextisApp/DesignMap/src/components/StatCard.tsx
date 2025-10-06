import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

export function StatCard({ icon: Icon, value, label, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'bg-accent',
    primary: 'bg-primary/10',
    success: 'bg-green-500/10',
    warning: 'bg-orange-500/10',
  };

  return (
    <div className={`p-3 rounded-lg ${variantStyles[variant]}`}>
      <Icon size={20} className="text-primary mb-2" />
      <p className="text-[17px]">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
