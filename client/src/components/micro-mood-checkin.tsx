import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import { Smile, Meh, Frown, X } from "lucide-react";
import { apiRequest } from "../lib/queryClient";

interface MicroMoodCheckinProps {
  itemId: string;
  itemTitle: string;
  itemType: string;
  onClose: () => void;
}

const EXCLUDED_TYPES = ["breakTime", "leisure", "quiz"];
const AUTO_DISMISS_MS = 10000;

export function MicroMoodCheckin({ itemId, itemTitle, itemType, onClose }: MicroMoodCheckinProps) {
  const { toast } = useToast();
  const [timeLeft, setTimeLeft] = useState(AUTO_DISMISS_MS / 1000);

  useEffect(() => {
    const lastCheckedItem = localStorage.getItem("lastMicroMoodItem");
    if (lastCheckedItem === itemId) {
      onClose();
      return;
    }

    if (EXCLUDED_TYPES.includes(itemType)) {
      onClose();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [itemId, itemType, onClose]);

  const submitRatingMutation = useMutation({
    mutationFn: async (rating: "easy" | "ok" | "hard") => {
      const response = await apiRequest("POST", "/api/mood/checkin", {
        afterItemId: itemId,
        rating,
      });
      return response.json();
    },
    onSuccess: (data: { updatedDuration: number; message: string }) => {
      localStorage.setItem("lastMicroMoodItem", itemId);
      toast({
        title: "Thanks for the feedback!",
        description: data.message,
      });
      onClose();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to record your feedback. Please try again.",
      });
    },
  });

  const handleRating = (rating: "easy" | "ok" | "hard") => {
    submitRatingMutation.mutate(rating);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      <Card className="bg-card border-primary/20 shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">How was this task?</h3>
            <p className="text-xs text-muted-foreground truncate">{itemTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 p-1 hover:bg-muted rounded transition-colors"
            data-testid="mood-checkin-close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2 mb-2">
          <button
            onClick={() => handleRating("easy")}
            disabled={submitRatingMutation.isPending}
            className="flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border border-border hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950 transition-colors disabled:opacity-50"
            data-testid="mood-checkin-easy"
          >
            <Smile className="w-6 h-6 text-green-600" />
            <span className="text-xs font-medium text-foreground">Easy</span>
          </button>

          <button
            onClick={() => handleRating("ok")}
            disabled={submitRatingMutation.isPending}
            className="flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border border-border hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors disabled:opacity-50"
            data-testid="mood-checkin-ok"
          >
            <Meh className="w-6 h-6 text-blue-600" />
            <span className="text-xs font-medium text-foreground">OK</span>
          </button>

          <button
            onClick={() => handleRating("hard")}
            disabled={submitRatingMutation.isPending}
            className="flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border border-border hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors disabled:opacity-50"
            data-testid="mood-checkin-hard"
          >
            <Frown className="w-6 h-6 text-orange-600" />
            <span className="text-xs font-medium text-foreground">Hard</span>
          </button>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Auto-closes in {timeLeft}s
          </p>
        </div>
      </Card>
    </div>
  );
}
