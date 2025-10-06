import { Plus } from 'lucide-react';

interface QuickAddFABProps {
  onClick: () => void;
}

export function QuickAddFAB({ onClick }: QuickAddFABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full ios-shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 z-40"
      aria-label="Quick add"
    >
      <Plus size={24} className="mx-auto" strokeWidth={2.5} />
    </button>
  );
}
