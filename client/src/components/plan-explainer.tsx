import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { InfoIcon, TrendingUpIcon, ClockIcon, ArrowRightIcon } from "lucide-react";

interface ExplanationResult {
  itemId: string;
  scheduledSlot: string;
  score: number;
  why: string[];
  alternatives: Array<{ slot: string; score: number; reason: string }>;
}

interface PlanExplainerProps {
  itemId: string;
  itemTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlanExplainer({ itemId, itemTitle, open, onOpenChange }: PlanExplainerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: explanation, isLoading, error } = useQuery<ExplanationResult>({
    queryKey: ["/api/plan/explain", itemId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/plan/explain/${itemId}`);
      return response.json();
    },
    enabled: open,
  });

  const moveToSlotMutation = useMutation({
    mutationFn: async (newSlot: string) => {
      const [day, time] = newSlot.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      
      const now = new Date();
      const daysMap: Record<string, number> = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
      };
      
      const currentDay = now.getDay();
      const targetDay = daysMap[day];
      const dayDiff = targetDay - currentDay;
      
      const newDate = new Date(now);
      newDate.setDate(now.getDate() + dayDiff);
      newDate.setHours(hours, minutes, 0, 0);
      
      const response = await apiRequest("PATCH", `/api/tasks/${itemId}`, {
        start: newDate.toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/next"] });
      toast({
        title: "Task moved",
        description: "Task has been rescheduled to the new time slot.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to move task. Please try again.",
      });
    },
  });

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-600 bg-green-50";
    if (score >= 0.5) return "text-amber-600 bg-amber-50";
    return "text-red-600 bg-red-50";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.7) return "Excellent";
    if (score >= 0.5) return "Good";
    return "Fair";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="plan-explainer-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="plan-explainer-title">
            <InfoIcon className="w-5 h-5 text-primary" />
            Why is this scheduled here?
          </DialogTitle>
          <DialogDescription data-testid="plan-explainer-description">
            {itemTitle}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-muted-foreground" data-testid="plan-explainer-loading">
            Loading explanation...
          </div>
        )}

        {error && (
          <div className="py-8 text-center" data-testid="plan-explainer-error">
            <p className="text-destructive">Failed to load explanation</p>
            <p className="text-sm text-muted-foreground mt-2">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {explanation && (
          <div className="space-y-6">
            {/* Current Slot */}
            <div className="space-y-3" data-testid="current-slot-section">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold" data-testid="scheduled-slot">
                    {explanation.scheduledSlot}
                  </span>
                </div>
                <Badge className={getScoreColor(explanation.score)} data-testid="score-badge">
                  {getScoreLabel(explanation.score)} ({Math.round(explanation.score * 100)}%)
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Slot Quality</span>
                  <span className="font-medium" data-testid="score-percentage">
                    {Math.round(explanation.score * 100)}%
                  </span>
                </div>
                <Progress 
                  value={explanation.score * 100} 
                  className="h-2"
                  data-testid="score-progress"
                />
              </div>
            </div>

            {/* Explanations */}
            <div className="space-y-3" data-testid="explanations-section">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <TrendingUpIcon className="w-4 h-4" />
                Why this time works
              </h4>
              <ul className="space-y-2">
                {explanation.why.map((reason, index) => (
                  <li 
                    key={index} 
                    className="flex items-start gap-2 text-sm"
                    data-testid={`explanation-reason-${index}`}
                  >
                    <span className="text-primary mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Alternative Slots */}
            {explanation.alternatives.length > 0 && (
              <div className="space-y-3" data-testid="alternatives-section">
                <h4 className="font-semibold text-sm">Alternative Time Slots</h4>
                <div className="space-y-2">
                  {explanation.alternatives.map((alt, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                      data-testid={`alternative-slot-${index}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium" data-testid={`alternative-time-${index}`}>
                            {alt.slot}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={getScoreColor(alt.score)}
                            data-testid={`alternative-score-${index}`}
                          >
                            {Math.round(alt.score * 100)}%
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1" data-testid={`alternative-reason-${index}`}>
                          {alt.reason}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveToSlotMutation.mutate(alt.slot)}
                        disabled={moveToSlotMutation.isPending}
                        data-testid={`button-move-to-slot-${index}`}
                      >
                        <ArrowRightIcon className="w-4 h-4" />
                        Move here
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
