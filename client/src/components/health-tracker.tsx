import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Droplet, Armchair, Target } from "lucide-react";

interface UserSettings {
  waterGoalMl?: number | null;
}

interface DailyRollupData {
  waterMl?: number | null;
  sedentaryMinutes?: number | null;
}

export function HealthTracker() {
  const { toast } = useToast();
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [customWaterAmount, setCustomWaterAmount] = useState("");
  const [waterGoalInput, setWaterGoalInput] = useState("");

  const { data: userSettings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ['/api/settings'],
    enabled: true,
  });

  const { data: dayStateData, isLoading: dayStateLoading } = useQuery({
    queryKey: ['/api/day-state'],
    enabled: true,
  });

  const { data: rollupData } = useQuery<DailyRollupData>({
    queryKey: ['/api/daily-rollup'],
    enabled: true,
  });

  const setWaterGoalMutation = useMutation({
    mutationFn: async (mlPerDay: number) => {
      const res = await apiRequest('POST', '/api/hydration/goal', { mlPerDay });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: "Water goal updated",
        description: "Your daily water goal has been set successfully.",
      });
      setGoalDialogOpen(false);
      setWaterGoalInput("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update water goal. Please try again.",
        variant: "destructive",
      });
    },
  });

  const logWaterMutation = useMutation({
    mutationFn: async (waterMl: number) => {
      const res = await apiRequest('POST', '/api/health/ingest', { waterMl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-rollup'] });
      toast({
        title: "Water logged",
        description: "Water intake recorded successfully.",
      });
      setCustomWaterAmount("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log water intake. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSetWaterGoal = () => {
    const goal = parseInt(waterGoalInput);
    if (isNaN(goal) || goal <= 0) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid number greater than 0.",
        variant: "destructive",
      });
      return;
    }
    setWaterGoalMutation.mutate(goal);
  };

  const handleLogWater = (ml: number) => {
    logWaterMutation.mutate(ml);
  };

  const handleLogCustomWater = () => {
    const ml = parseInt(customWaterAmount);
    if (isNaN(ml) || ml <= 0) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid amount.",
        variant: "destructive",
      });
      return;
    }
    handleLogWater(ml);
  };

  const waterGoalMl = userSettings?.waterGoalMl || 0;
  const currentWaterMl = rollupData?.waterMl || 0;
  const waterProgress = waterGoalMl > 0 ? Math.min((currentWaterMl / waterGoalMl) * 100, 100) : 0;
  const sedentaryMinutes = rollupData?.sedentaryMinutes || 0;

  if (settingsLoading || dayStateLoading) {
    return <div data-testid="health-tracker-loading">Loading health data...</div>;
  }

  return (
    <div className="space-y-4" data-testid="health-tracker">
      <Card data-testid="card-water-tracker">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplet className="h-5 w-5 text-blue-500" />
            Hydration Tracker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {waterGoalMl > 0 ? (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span data-testid="text-water-current">{currentWaterMl} ml</span>
                  <span data-testid="text-water-goal">{waterGoalMl} ml</span>
                </div>
                <Progress value={waterProgress} data-testid="progress-water" />
                <p className="text-xs text-muted-foreground text-center" data-testid="text-water-percentage">
                  {Math.round(waterProgress)}% of daily goal
                </p>
              </div>

              <div className="space-y-2">
                <Label>Quick Log</Label>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleLogWater(250)}
                    variant="outline"
                    size="sm"
                    disabled={logWaterMutation.isPending}
                    data-testid="button-log-water-250"
                  >
                    +250ml
                  </Button>
                  <Button
                    onClick={() => handleLogWater(500)}
                    variant="outline"
                    size="sm"
                    disabled={logWaterMutation.isPending}
                    data-testid="button-log-water-500"
                  >
                    +500ml
                  </Button>
                  <div className="flex gap-1 flex-1">
                    <Input
                      type="number"
                      placeholder="Custom ml"
                      value={customWaterAmount}
                      onChange={(e) => setCustomWaterAmount(e.target.value)}
                      className="flex-1"
                      data-testid="input-water-custom"
                    />
                    <Button
                      onClick={handleLogCustomWater}
                      variant="outline"
                      size="sm"
                      disabled={logWaterMutation.isPending || !customWaterAmount}
                      data-testid="button-log-water-custom"
                    >
                      Log
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-no-water-goal">
              Set a daily water goal to start tracking your hydration.
            </p>
          )}

          <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full" data-testid="button-set-water-goal">
                <Target className="h-4 w-4 mr-2" />
                {waterGoalMl > 0 ? "Update Water Goal" : "Set Water Goal"}
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-water-goal">
              <DialogHeader>
                <DialogTitle>Set Daily Water Goal</DialogTitle>
                <DialogDescription>
                  Enter your daily water intake goal in milliliters (ml).
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="water-goal">Water Goal (ml)</Label>
                  <Input
                    id="water-goal"
                    type="number"
                    placeholder="e.g., 2000"
                    value={waterGoalInput}
                    onChange={(e) => setWaterGoalInput(e.target.value)}
                    data-testid="input-water-goal"
                  />
                  <p className="text-xs text-muted-foreground">
                    Recommended: 2000-3000 ml per day
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleSetWaterGoal}
                  disabled={setWaterGoalMutation.isPending}
                  data-testid="button-save-water-goal"
                >
                  {setWaterGoalMutation.isPending ? "Saving..." : "Save Goal"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card data-testid="card-sedentary-tracker">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Armchair className="h-5 w-5 text-orange-500" />
            Sedentary Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-3xl font-bold" data-testid="text-sedentary-minutes">
              {sedentaryMinutes} min
            </p>
            <p className="text-sm text-muted-foreground">
              Today's sedentary time
            </p>
            {sedentaryMinutes > 120 && (
              <p className="text-sm text-orange-600 dark:text-orange-400" data-testid="text-sedentary-warning">
                ⚠️ Consider taking a break and moving around
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
