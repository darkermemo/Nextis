import { Clock, Play, MoreHorizontal } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Chip } from './Chip';

interface TaskRowProps {
  id: string;
  title: string;
  completed?: boolean;
  priority?: 'high' | 'medium' | 'low';
  duration?: string;
  dueDate?: string;
  onToggle?: (id: string) => void;
  onPlay?: (id: string) => void;
  onMore?: (id: string) => void;
}

export function TaskRow({ 
  id, 
  title, 
  completed, 
  priority, 
  duration, 
  dueDate, 
  onToggle, 
  onPlay,
  onMore 
}: TaskRowProps) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 min-h-[52px] hover:bg-accent/50 transition-colors">
      <Checkbox
        checked={completed}
        onCheckedChange={() => onToggle?.(id)}
        className="shrink-0"
      />
      
      <div className="flex-1 min-w-0">
        <p className={`${completed ? 'line-through text-muted-foreground' : ''}`}>
          {title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {priority && (
            <Chip variant={`priority-${priority}`}>
              {priority}
            </Chip>
          )}
          {duration && (
            <Chip>{duration}</Chip>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {dueDate && (
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Clock size={12} />
            <span>{dueDate}</span>
          </div>
        )}
        {onPlay && !completed && (
          <button
            onClick={() => onPlay(id)}
            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
            aria-label="Start task"
          >
            <Play size={16} className="text-primary" />
          </button>
        )}
        {onMore && (
          <button
            onClick={() => onMore(id)}
            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
