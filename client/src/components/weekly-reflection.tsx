import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Moon, 
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  RefreshCw
} from "lucide-react";
import dayjs from "dayjs";

interface WeeklySummary {
  id: string;
  userId: string;
  weekStart: string;
  tasksDone: number;
  tasksSkipped: number;
  snoozes: number;
  avgStartDelayMin: number | null;
  sleepMedianH: number | null;
  activeMin: number | null;
  notes: string | null;
  createdAt: string;
}

export function WeeklyReflection() {
  const { toast } = useToast();
  const [selectedWeek, setSelectedWeek] = useState<string | undefined>(undefined);

  // Get current week's summary
  const { data: currentSummary, isLoading: currentLoading } = useQuery<WeeklySummary>({
    queryKey: ["/api/weekly/summary", selectedWeek],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedWeek) {
        params.append("weekStart", selectedWeek);
      }
      const res = await fetch(`/api/weekly/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  // Get recent summaries
  const { data: recentSummaries = [], isLoading: recentLoading } = useQuery<WeeklySummary[]>({
    queryKey: ["/api/weekly/recent"],
    queryFn: async () => {
      const res = await fetch("/api/weekly/recent?limit=4");
      if (!res.ok) throw new Error("Failed to fetch recent summaries");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (weekStart?: string) => {
      const res = await apiRequest("POST", "/api/weekly/generate", {
        weekStart,
        timezone: "Asia/Riyadh",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weekly/recent"] });
      toast({
        title: "Weekly summary generated",
        description: "Your weekly reflection has been created with AI insights.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate weekly summary. Please try again.",
      });
    },
  });

  const getTrendIcon = (current: number, previous: number | undefined) => {
    if (!previous) return <Minus className="w-4 h-4 text-muted-foreground" />;
    if (current > previous) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (current < previous) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getCompletionRate = (summary: WeeklySummary) => {
    const total = summary.tasksDone + summary.tasksSkipped;
    return total > 0 ? Math.round((summary.tasksDone / total) * 100) : 0;
  };

  if (currentLoading || recentLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const previousSummary = recentSummaries[1]; // Second most recent

  return (
    <div className="space-y-6">
      {/* Current Week Summary */}
      <Card data-testid="card-current-week">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Week of {dayjs(currentSummary?.weekStart).format("MMM D, YYYY")}
              </CardTitle>
              <CardDescription>Your weekly productivity reflection</CardDescription>
            </div>
            <Button
              onClick={() => generateMutation.mutate(selectedWeek)}
              disabled={generateMutation.isPending}
              size="sm"
              data-testid="button-generate-week"
            >
              {generateMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate This Week
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2" data-testid="stat-tasks-done">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm text-muted-foreground">Tasks Done</span>
                {getTrendIcon(currentSummary?.tasksDone || 0, previousSummary?.tasksDone)}
              </div>
              <p className="text-2xl font-bold" data-testid="text-tasks-done">
                {currentSummary?.tasksDone || 0}
              </p>
            </div>

            <div className="space-y-2" data-testid="stat-tasks-skipped">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <span className="text-sm text-muted-foreground">Tasks Skipped</span>
                {getTrendIcon(currentSummary?.tasksSkipped || 0, previousSummary?.tasksSkipped)}
              </div>
              <p className="text-2xl font-bold" data-testid="text-tasks-skipped">
                {currentSummary?.tasksSkipped || 0}
              </p>
            </div>

            <div className="space-y-2" data-testid="stat-snoozes">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <span className="text-sm text-muted-foreground">Snoozes</span>
                {getTrendIcon(currentSummary?.snoozes || 0, previousSummary?.snoozes)}
              </div>
              <p className="text-2xl font-bold" data-testid="text-snoozes">
                {currentSummary?.snoozes || 0}
              </p>
            </div>

            {currentSummary?.avgStartDelayMin !== null && currentSummary?.avgStartDelayMin !== undefined && (
              <div className="space-y-2" data-testid="stat-avg-delay">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-muted-foreground">Avg Start Delay</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-avg-delay">
                  {currentSummary.avgStartDelayMin}m
                </p>
              </div>
            )}

            {currentSummary?.sleepMedianH !== null && currentSummary?.sleepMedianH !== undefined && (
              <div className="space-y-2" data-testid="stat-sleep">
                <div className="flex items-center gap-2">
                  <Moon className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm text-muted-foreground">Median Sleep</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-sleep">
                  {currentSummary.sleepMedianH.toFixed(1)}h
                </p>
              </div>
            )}

            {currentSummary?.activeMin !== null && currentSummary?.activeMin !== undefined && (
              <div className="space-y-2" data-testid="stat-active">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-muted-foreground">Active Time</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-active">
                  {Math.round(currentSummary.activeMin / 60)}h
                </p>
              </div>
            )}
          </div>

          {/* Completion Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Completion Rate</span>
              <span className="text-sm text-muted-foreground" data-testid="text-completion-rate">
                {getCompletionRate(currentSummary || { tasksDone: 0, tasksSkipped: 0 } as WeeklySummary)}%
              </span>
            </div>
            <Progress 
              value={getCompletionRate(currentSummary || { tasksDone: 0, tasksSkipped: 0 } as WeeklySummary)} 
              className="h-2"
              data-testid="progress-completion"
            />
          </div>

          {/* AI Insights */}
          {currentSummary?.notes && (
            <>
              <Separator />
              <div className="space-y-2" data-testid="section-insights">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">AI Insights & Tweaks</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-insights">
                  {currentSummary.notes}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Weeks */}
      {recentSummaries.length > 0 && (
        <Card data-testid="card-recent-weeks">
          <CardHeader>
            <CardTitle>Recent Weeks</CardTitle>
            <CardDescription>Your productivity trends over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentSummaries.map((summary, index) => (
                <div
                  key={summary.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedWeek(summary.weekStart)}
                  data-testid={`row-week-${index}`}
                >
                  <div className="space-y-1">
                    <p className="font-medium" data-testid={`text-week-date-${index}`}>
                      {dayjs(summary.weekStart).format("MMM D, YYYY")}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span data-testid={`text-week-done-${index}`}>
                        ✓ {summary.tasksDone}
                      </span>
                      <span data-testid={`text-week-skipped-${index}`}>
                        ✗ {summary.tasksSkipped}
                      </span>
                      <span data-testid={`text-week-snoozes-${index}`}>
                        ⏰ {summary.snoozes}
                      </span>
                    </div>
                  </div>
                  <Badge variant={getCompletionRate(summary) >= 70 ? "default" : "secondary"}>
                    {getCompletionRate(summary)}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
