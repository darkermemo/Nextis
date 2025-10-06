import { Clock, Play } from 'lucide-react';
import { Chip } from './Chip';

interface NextActionRowProps {
  index: number;
  title: string;
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
  onAction?: () => void;
}

export function NextActionRow({ index, title, priority, deadline, onAction }: NextActionRowProps) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-accent/50 transition-colors">
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-[11px] shrink-0">
        {index}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="truncate">{title}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {priority && (
          <Chip variant={`priority-${priority}`}>
            {priority}
          </Chip>
        )}
        {deadline && (
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Clock size={12} />
            <span>{deadline}</span>
          </div>
        )}
        {onAction && (
          <button
            onClick={onAction}
            className="p-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            aria-label="Start action"
          >
            <Play size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
