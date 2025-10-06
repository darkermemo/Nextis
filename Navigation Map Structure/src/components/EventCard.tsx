interface EventCardProps {
  title: string;
  timeRange: string;
  type: 'study' | 'event' | 'break' | 'leisure' | 'quiz';
  onClick?: () => void;
}

export function EventCard({ title, timeRange, type, onClick }: EventCardProps) {
  const typeStyles = {
    study: 'border-l-blue-500 bg-blue-500/5',
    event: 'border-l-purple-500 bg-purple-500/5',
    break: 'border-l-green-500 bg-green-500/5',
    leisure: 'border-l-orange-500 bg-orange-500/5',
    quiz: 'border-l-red-500 bg-red-500/5',
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-1 rounded border-l-4 transition-all hover:shadow-sm
        ${typeStyles[type]}
      `}
    >
      <p className="text-[11px] truncate">{title}</p>
      <p className="text-[9px] text-muted-foreground">{timeRange}</p>
    </button>
  );
}
