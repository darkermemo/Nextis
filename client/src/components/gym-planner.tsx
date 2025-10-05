import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Dumbbell, Calendar, Flame, Settings, Plus, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

interface WorkoutPreferences {
  id: string;
  userId: string;
  perWeek: number;
  defaultDurationMin: number;
  preferredWindows: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface Item {
  id: string;
  type: string;
  title: string;
  start: string | null;
  end: string | null;
  durationMinutes: number | null;
  priority: string;
  tags: string[];
  done: boolean;
}

interface StreakStatus {
  streakDays: number;
  lastWorkout: Date | null;
  protected: boolean;
}

export function GymPlanner() {
  const { toast } = useToast();
  const [prefsDialogOpen, setPrefsDialogOpen] = useState(false);
  const [perWeek, setPerWeek] = useState(3);
  const [defaultDurationMin, setDefaultDurationMin] = useState(60);
  const [preferredWindows, setPreferredWindows] = useState<string[]>([]);
  const [newWindow, setNewWindow] = useState("");

  const { data: prefsData, isLoading: prefsLoading } = useQuery<{ preferences: WorkoutPreferences | null }>({
    queryKey: ['/api/workout/prefs'],
  });

  const { data: streakData } = useQuery<StreakStatus>({
    queryKey: ['/api/workout/streak'],
  });

  const { data: workoutsData, isLoading: workoutsLoading } = useQuery<{ workouts: Item[]; streakProtected: boolean }>({
    queryKey: ['/api/workout/plan'],
    enabled: false,
  });

  const savePreferencesMutation = useMutation({
    mutationFn: async (data: { perWeek: number; defaultDurationMin: number; preferredWindows?: string[] }) => {
      const res = await apiRequest('POST', '/api/workout/prefs', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workout/prefs'] });
      toast({
        title: "Preferences saved",
        description: "Your workout preferences have been updated.",
      });
      setPrefsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive",
      });
    },
  });

  const planWorkoutsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/workout/plan', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workout/plan'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar'] });
      toast({
        title: "Workouts planned",
        description: "Your workouts have been scheduled for this week.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to plan workouts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOpenPrefsDialog = () => {
    if (prefsData?.preferences) {
      setPerWeek(prefsData.preferences.perWeek);
      setDefaultDurationMin(prefsData.preferences.defaultDurationMin);
      setPreferredWindows(prefsData.preferences.preferredWindows || []);
    }
    setPrefsDialogOpen(true);
  };

  const handleSavePreferences = () => {
    if (perWeek < 1 || perWeek > 7) {
      toast({
        title: "Invalid input",
        description: "Workouts per week must be between 1 and 7.",
        variant: "destructive",
      });
      return;
    }

    if (defaultDurationMin < 15 || defaultDurationMin > 240) {
      toast({
        title: "Invalid input",
        description: "Duration must be between 15 and 240 minutes.",
        variant: "destructive",
      });
      return;
    }

    savePreferencesMutation.mutate({
      perWeek,
      defaultDurationMin,
      preferredWindows: preferredWindows.length > 0 ? preferredWindows : undefined,
    });
  };

  const handleAddWindow = () => {
    if (!newWindow) return;
    
    const windowRegex = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun):\d{1,2}-\d{1,2}$/;
    if (!windowRegex.test(newWindow)) {
      toast({
        title: "Invalid format",
        description: "Use format: Day:HH-HH (e.g., Mon:18-20)",
        variant: "destructive",
      });
      return;
    }

    setPreferredWindows([...preferredWindows, newWindow]);
    setNewWindow("");
  };

  const handleRemoveWindow = (index: number) => {
    setPreferredWindows(preferredWindows.filter((_, i) => i !== index));
  };

  const handlePlanWorkouts = () => {
    planWorkoutsMutation.mutate();
  };

  const currentPrefs = prefsData?.preferences;
  const streak = streakData;
  const workouts = workoutsData?.workouts || [];

  if (prefsLoading) {
    return <div data-testid="gym-planner-loading">Loading gym planner...</div>;
  }

  return (
    <div className="space-y-4" data-testid="gym-planner">
      <Card data-testid="card-streak-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Workout Streak
          </CardTitle>
        </CardHeader>
        <CardContent>
          {streak && streak.streakDays > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold" data-testid="text-streak-days">
                  {streak.streakDays}
                </p>
                <p className="text-sm text-muted-foreground">days streak</p>
                {streak.protected && (
                  <Badge variant="default" data-testid="badge-streak-protected">
                    🔥 Protected
                  </Badge>
                )}
              </div>
              {streak.lastWorkout && (
                <p className="text-xs text-muted-foreground" data-testid="text-last-workout">
                  Last workout: {dayjs(streak.lastWorkout).format('MMM D, YYYY')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-no-streak">
              Start a workout streak by completing workouts this week!
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-preferences">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Workout Preferences
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenPrefsDialog}
              data-testid="button-edit-preferences"
            >
              <Settings className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentPrefs ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Workouts per week:</span>
                <span className="font-medium" data-testid="text-prefs-per-week">
                  {currentPrefs.perWeek}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Duration:</span>
                <span className="font-medium" data-testid="text-prefs-duration">
                  {currentPrefs.defaultDurationMin} min
                </span>
              </div>
              {currentPrefs.preferredWindows && currentPrefs.preferredWindows.length > 0 && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Preferred times:</span>
                  <div className="flex flex-wrap gap-1" data-testid="list-preferred-windows">
                    {currentPrefs.preferredWindows.map((window, idx) => (
                      <Badge key={idx} variant="secondary" data-testid={`badge-window-${idx}`}>
                        {window}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-no-preferences">
              Set your workout preferences to get started.
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-plan-workouts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            This Week's Workouts
          </CardTitle>
          <CardDescription>
            Week of {dayjs().startOf('isoWeek').format('MMM D')} - {dayjs().endOf('isoWeek').format('MMM D')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workouts.length > 0 ? (
            <div className="space-y-2">
              {workouts.map((workout) => (
                <div
                  key={workout.id}
                  className="flex items-center justify-between p-2 border rounded"
                  data-testid={`workout-item-${workout.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm" data-testid={`text-workout-title-${workout.id}`}>
                        {workout.title}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid={`text-workout-time-${workout.id}`}>
                        {workout.start ? dayjs(workout.start).format('ddd, MMM D [at] h:mm A') : 'Not scheduled'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {workout.priority === 'high' && (
                      <Badge variant="destructive" data-testid={`badge-priority-${workout.id}`}>
                        High Priority
                      </Badge>
                    )}
                    {workout.done && (
                      <Badge variant="default" data-testid={`badge-done-${workout.id}`}>
                        ✓ Done
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-no-workouts">
              No workouts planned yet. Click "Plan This Week" to schedule your workouts.
            </p>
          )}

          <Button
            onClick={handlePlanWorkouts}
            disabled={!currentPrefs || planWorkoutsMutation.isPending}
            className="w-full"
            data-testid="button-plan-workouts"
          >
            <Calendar className="h-4 w-4 mr-2" />
            {planWorkoutsMutation.isPending ? "Planning..." : "Plan This Week"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={prefsDialogOpen} onOpenChange={setPrefsDialogOpen}>
        <DialogContent data-testid="dialog-preferences">
          <DialogHeader>
            <DialogTitle>Edit Workout Preferences</DialogTitle>
            <DialogDescription>
              Set your workout frequency, duration, and preferred times.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="per-week">Workouts per Week</Label>
              <Select
                value={perWeek.toString()}
                onValueChange={(val) => setPerWeek(parseInt(val))}
              >
                <SelectTrigger id="per-week" data-testid="select-per-week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num} {num === 1 ? 'workout' : 'workouts'} per week
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Default Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={15}
                max={240}
                value={defaultDurationMin}
                onChange={(e) => setDefaultDurationMin(parseInt(e.target.value) || 60)}
                data-testid="input-duration"
              />
              <p className="text-xs text-muted-foreground">Between 15 and 240 minutes</p>
            </div>

            <div className="space-y-2">
              <Label>Preferred Time Windows (optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Mon:18-20"
                  value={newWindow}
                  onChange={(e) => setNewWindow(e.target.value)}
                  data-testid="input-new-window"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddWindow}
                  data-testid="button-add-window"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {preferredWindows.length > 0 && (
                <div className="space-y-1" data-testid="list-windows">
                  {preferredWindows.map((window, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 border rounded"
                      data-testid={`window-item-${idx}`}
                    >
                      <span className="text-sm">{window}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveWindow(idx)}
                        data-testid={`button-remove-window-${idx}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Format: Day:HH-HH (e.g., Mon:18-20, Wed:18-20)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSavePreferences}
              disabled={savePreferencesMutation.isPending}
              data-testid="button-save-preferences"
            >
              {savePreferencesMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
