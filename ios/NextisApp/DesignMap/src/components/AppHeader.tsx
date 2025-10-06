import { Bell, Settings, Smile } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

interface AppHeaderProps {
  title: string;
  onMoodClick: () => void;
  showMoodIcon?: boolean;
}

export function AppHeader({ title, onMoodClick, showMoodIcon = true }: AppHeaderProps) {
  return (
    <div className="sticky top-0 glass-card border-b z-40">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-2xl flex items-center justify-center shadow-sm">
            <span className="text-[13px] text-primary-foreground font-semibold">P</span>
          </div>
          <h1 className="text-[20px] font-semibold">{title}</h1>
        </div>
        
        <div className="flex items-center gap-1">
          {showMoodIcon && (
            <button
              onClick={onMoodClick}
              className="p-2 hover:bg-accent rounded-xl transition-all active:scale-95"
              aria-label="Track mood"
            >
              <Smile size={22} className="text-foreground/60" />
            </button>
          )}
          <button
            className="p-2 hover:bg-accent rounded-xl transition-all active:scale-95 relative"
            aria-label="Notifications"
          >
            <Bell size={22} className="text-foreground/60" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
          </button>
          <button
            className="p-2 hover:bg-accent rounded-xl transition-all active:scale-95"
            aria-label="Settings"
          >
            <Settings size={22} className="text-foreground/60" />
          </button>
          <Avatar className="w-9 h-9 ring-2 ring-border">
            <AvatarImage src="" />
            <AvatarFallback className="text-[12px] bg-gradient-to-br from-primary to-info text-white font-medium">JD</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}
