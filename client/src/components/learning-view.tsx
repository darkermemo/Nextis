import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Card } from "./ui/card";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Progress } from "./ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Brain, TrendingUp, Clock, BarChart3, RefreshCw, RotateCcw } from "lucide-react";
import type { LearningPreferencesResponse, LearningInsights } from "../types";

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function LearningView() {
  const { toast } = useToast();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [localPreferEvening, setLocalPreferEvening] = useState<boolean>(false);
  const [localMaxFocus, setLocalMaxFocus] = useState<number>(60);

  const { data: preferencesData, isLoading: prefsLoading } = useQuery<LearningPreferencesResponse>({
    queryKey: ["/api/learning/preferences"],
  });

  useEffect(() => {
    if (preferencesData) {
      setLocalPreferEvening(preferencesData.preferences.preferEvening ?? false);
      setLocalMaxFocus(preferencesData.preferences.maxContinuousFocus ?? 60);
    }
  }, [preferencesData]);

  const { data: insights, isLoading: insightsLoading } = useQuery<LearningInsights>({
    queryKey: ["/api/learning/insights"],
  });

  const updatePrefsMutation = useMutation({
    mutationFn: async (data: { preferEvening?: boolean; maxContinuousFocus?: number }) => {
      const res = await apiRequest("PATCH", "/api/learning/preferences", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/learning/insights"] });
      toast({
        title: "Preferences updated",
        description: "Your learning preferences have been saved.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update preferences. Please try again.",
      });
    },
  });

  const updateLearningMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/learning/update", { timezone: "Asia/Riyadh" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/learning/insights"] });
      toast({
        title: "Learning updated",
        description: "Daily learning update completed successfully.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update learning data. Please try again.",
      });
    },
  });

  const resetLearningMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/learning/reset", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/learning/insights"] });
      toast({
        title: "Learning reset",
        description: "All learning data has been reset to defaults.",
      });
      setShowResetDialog(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to reset learning data. Please try again.",
      });
    },
  });

  const handlePreferEveningToggle = (checked: boolean) => {
    setLocalPreferEvening(checked);
    updatePrefsMutation.mutate({ preferEvening: checked });
  };

  const handleMaxFocusChange = (value: number[]) => {
    setLocalMaxFocus(value[0]);
  };

  const handleMaxFocusCommit = (value: number[]) => {
    updatePrefsMutation.mutate({ maxContinuousFocus: value[0] });
  };

  const formatHour = (hour: number) => {
    const h = hour % 12 || 12;
    const ampm = hour < 12 ? "AM" : "PM";
    return `${h}:00 ${ampm}`;
  };

  const getWeekdayScore = (weekday: string) => {
    return insights?.weekdayPatterns[weekday] ?? 0;
  };

  const maxWeekdayScore = Math.max(
    ...WEEKDAY_NAMES.map((day) => getWeekdayScore(day)),
    0.01
  );

  if (prefsLoading) {
    return (
      <div className="h-full overflow-y-auto px-4 py-6 sm:px-6 space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Learning Dashboard</h2>
            <p className="text-sm text-muted-foreground">Habit patterns and preferences</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateLearningMutation.mutate()}
            disabled={updateLearningMutation.isPending}
            data-testid="button-update-learning"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${updateLearningMutation.isPending ? "animate-spin" : ""}`} />
            Update Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            disabled={resetLearningMutation.isPending}
            data-testid="button-reset-learning"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {/* Learning Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekday Success Patterns */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Weekday Success Patterns</h3>
          </div>
          {insightsLoading ? (
            <div className="space-y-3">
              {WEEKDAY_NAMES.map((day) => (
                <Skeleton key={day} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {WEEKDAY_NAMES.map((day) => {
                const score = getWeekdayScore(day);
                const percentage = (score / maxWeekdayScore) * 100;
                return (
                  <div key={day} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{day}</span>
                      <span className="text-muted-foreground">{(score * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Best Time Windows */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Best Time Windows</h3>
          </div>
          {prefsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {preferencesData?.stats.topWindows.slice(0, 5).map((window, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                  data-testid={`text-top-window-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? "bg-primary/10 text-primary" :
                      index === 1 ? "bg-accent/10 text-accent" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {window.weekday} {formatHour(window.hour)}
                      </p>
                      <p className="text-xs text-muted-foreground">Success: {(window.score * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                  <Progress value={window.score * 100} className="w-20 h-2" />
                </div>
              ))}
              {(!preferencesData?.stats.topWindows || preferencesData.stats.topWindows.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No time window data yet. Complete more tasks to see patterns.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Learned Session Lengths */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Learned Session Lengths</h3>
        </div>
        {prefsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Object.entries(preferencesData?.stats.learnedLengths ?? {}).map(([type, duration]) => (
              <div key={type} className="p-4 rounded-lg bg-muted/50 border border-border text-center">
                <p className="text-sm font-medium text-muted-foreground capitalize mb-1">{type}</p>
                <p className="text-2xl font-bold text-foreground">{Math.round(duration)}</p>
                <p className="text-xs text-muted-foreground">minutes</p>
              </div>
            ))}
            {Object.keys(preferencesData?.stats.learnedLengths ?? {}).length === 0 && (
              <div className="col-span-full text-sm text-muted-foreground text-center py-4">
                No session data yet. Complete tasks to learn optimal durations.
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Recent Trends & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Trends */}
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Recent Trends (Last 7 Days)</h3>
          {insightsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium text-foreground">Completion Rate</span>
                <span className="text-lg font-bold text-primary" data-testid="text-completion-rate">
                  {((insights?.recentTrends.completionRate ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium text-foreground">Avg Snoozes/Day</span>
                <span className="text-lg font-bold text-warning">
                  {(insights?.recentTrends.avgSnoozes ?? 0).toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium text-foreground">Avg Skips/Day</span>
                <span className="text-lg font-bold text-destructive">
                  {(insights?.recentTrends.avgSkips ?? 0).toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Total Stats */}
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Total Statistics</h3>
          {prefsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium text-foreground">Days Tracked</span>
                <span className="text-lg font-bold text-accent">
                  {preferencesData?.stats.daysTracked ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium text-foreground">Total Events Logged</span>
                <span className="text-lg font-bold text-accent">
                  {preferencesData?.stats.totalEvents ?? 0}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Preferences Control Section */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-6">Learning Preferences</h3>
        <div className="space-y-6">
          {/* Prefer Evening Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex-1">
              <label htmlFor="prefer-evening" className="text-sm font-medium text-foreground cursor-pointer">
                Prefer Evening Slots
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                Schedule tasks in the evening (6 PM - 9 PM) when possible
              </p>
            </div>
            <Switch
              id="prefer-evening"
              checked={localPreferEvening}
              onCheckedChange={handlePreferEveningToggle}
              disabled={updatePrefsMutation.isPending}
              data-testid="toggle-prefer-evening"
            />
          </div>

          {/* Max Continuous Focus Slider */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="max-focus" className="text-sm font-medium text-foreground">
                Max Continuous Focus Time
              </label>
              <span className="text-sm font-bold text-primary">{localMaxFocus} min</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Maximum duration for a single focus session before suggesting a break
            </p>
            <Slider
              id="max-focus"
              value={[localMaxFocus]}
              onValueChange={handleMaxFocusChange}
              onValueCommit={handleMaxFocusCommit}
              min={30}
              max={120}
              step={15}
              disabled={updatePrefsMutation.isPending}
              data-testid="slider-max-focus"
            />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>30 min</span>
              <span>120 min</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Learning Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all learned patterns, time windows, session lengths, and preferences to their default values. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetLearningMutation.mutate()}
              disabled={resetLearningMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetLearningMutation.isPending ? "Resetting..." : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
