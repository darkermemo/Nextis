import { Pin, ArrowRight, Play } from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

interface PlanExplainerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: {
    title: string;
    time: string;
    reason: string;
    alternatives: Array<{ time: string; reason: string }>;
  };
}

export function PlanExplainerSheet({ open, onOpenChange, event }: PlanExplainerSheetProps) {
  if (!event) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[60vh]">
        <SheetHeader>
          <SheetTitle>{event.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Current Slot */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px]">Scheduled Time</span>
              <span className="text-[15px]">{event.time}</span>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {event.reason}
            </p>
          </div>

          {/* Why this time? */}
          <div>
            <h4 className="text-[13px] mb-2">Why this time?</h4>
            <p className="text-[13px] text-muted-foreground">
              Based on your productivity patterns and existing commitments, this time slot maximizes your focus potential while maintaining work-life balance.
            </p>
          </div>

          {/* Alternatives */}
          {event.alternatives.length > 0 && (
            <div>
              <h4 className="text-[13px] mb-2">Alternative times</h4>
              <div className="space-y-2">
                {event.alternatives.map((alt, index) => (
                  <button
                    key={index}
                    className="w-full flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <div className="flex-1">
                      <div className="text-[13px] mb-1">{alt.time}</div>
                      <div className="text-[11px] text-muted-foreground">{alt.reason}</div>
                    </div>
                    <ArrowRight size={16} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-4 border-t border-border">
            <Button variant="outline" className="flex-1">
              <Pin size={16} className="mr-2" />
              Pin
            </Button>
            <Button variant="outline" className="flex-1">
              <ArrowRight size={16} className="mr-2" />
              Move
            </Button>
            <Button className="flex-1">
              <Play size={16} className="mr-2" />
              Start
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
