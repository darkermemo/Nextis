import { X } from 'lucide-react';
import { useState } from 'react';

interface NotificationBannerProps {
  message: string;
  onAccept?: () => void;
  onSnooze?: () => void;
  onDismiss?: () => void;
}

export function NotificationBanner({ message, onAccept, onSnooze, onDismiss }: NotificationBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <div className="bg-primary text-primary-foreground px-4 py-2.5 border-b border-primary-light/20">
      <div className="flex items-start justify-between gap-3 max-w-screen-lg mx-auto">
        <p className="text-[13px] flex-1">{message}</p>
        <div className="flex items-center gap-2">
          {onAccept && (
            <button
              onClick={onAccept}
              className="text-[11px] px-2.5 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-all active:scale-95"
            >
              Accept
            </button>
          )}
          {onSnooze && (
            <button
              onClick={onSnooze}
              className="text-[11px] px-2.5 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-all active:scale-95"
            >
              Snooze
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/20 rounded-lg transition-all active:scale-95"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
