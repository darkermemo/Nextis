import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import type { TasksResponse, Task } from "../types";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { PlanExplainer } from "./plan-explainer";
import { MicroMoodCheckin } from "./micro-mood-checkin";
import { Coffee } from "lucide-react";

dayjs.extend(relativeTime);

export function TasksView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [explainerItemId, setExplainerItemId] = useState<string | null>(null);
  const [explainerItemTitle, setExplainerItemTitle] = useState<string>("");
  const [completedItem, setCompletedItem] = useState<{ id: string; title: string; type: string } | null>(null);

  const { data: tasks, isLoading } = useQuery<TasksResponse>({
    queryKey: ["/api/tasks"],
    refetchInterval: 60000, // Refresh every minute
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, done, task }: { id: string; done: boolean; task?: Task }) => 
      api.toggleTaskComplete(id, done),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/next"] });
      
      if (variables.done && variables.task) {
        setCompletedItem({
          id: variables.task.id,
          title: variables.task.title,
          type: variables.task.type,
        });
      }
      
      toast({
        title: "Task updated",
        description: "Task completion status has been updated.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update task. Please try again.",
      });
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-destructive/10 text-destructive";
      case "normal": return "bg-warning/10 text-warning";
      case "low": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "task": return "bg-indigo-100 text-indigo-700";
      case "event": return "bg-blue-100 text-blue-700";
      case "breakTime": return "bg-amber-100 text-amber-700";
      case "leisure": return "bg-pink-100 text-pink-700";
      case "quiz": return "bg-green-100 text-green-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const formatTaskTime = (task: Task) => {
    if (task.start && task.end) {
      return `${dayjs(task.start).format('HH:mm')} - ${dayjs(task.end).format('HH:mm')}`;
    }
    if (task.deadline) {
      return `Due ${dayjs(task.deadline).format('MMM D')}`;
    }
    if (task.durationMinutes) {
      return `${task.durationMinutes} min`;
    }
    return null;
  };

  const TaskItem = ({ task }: { task: Task }) => (
    <div className="bg-card rounded-lg border border-border p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        <input 
          type="checkbox" 
          checked={task.done}
          onChange={(e) => toggleMutation.mutate({ id: task.id, done: e.target.checked, task })}
          disabled={toggleMutation.isPending}
          className="task-checkbox mt-0.5" 
          data-testid={`task-checkbox-${task.id}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${task.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {task.type === "breakTime" && <Coffee className="w-4 h-4 shrink-0" />}
              <span>{task.title}</span>
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeColor(task.type)}`}>
              {task.type === "breakTime" ? "Break" : task.type.charAt(0).toUpperCase() + task.type.slice(1)}
            </span>
          </div>
          
          {task.notes && (
            <p className="text-xs text-muted-foreground mb-2">{task.notes}</p>
          )}
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {formatTaskTime(task) && (
              <span className="flex items-center gap-1 font-mono">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatTaskTime(task)}
              </span>
            )}
            
            {task.reminders.length > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {task.reminders.length} reminder{task.reminders.length !== 1 ? 's' : ''}
              </span>
            )}
            
            {task.subtasks.length > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {task.start && (
            <button 
              className="p-2 hover:bg-muted rounded transition-colors" 
              onClick={() => {
                setExplainerItemId(task.id);
                setExplainerItemTitle(task.title);
              }}
              data-testid={`button-why-here-${task.id}`}
              title="Why is this scheduled here?"
            >
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
          <button className="p-2 hover:bg-muted rounded transition-colors" data-testid={`task-details-${task.id}`}>
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto px-4 py-6 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-8">
            <div className="text-muted-foreground">Loading tasks...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {completedItem && (
        <MicroMoodCheckin
          itemId={completedItem.id}
          itemTitle={completedItem.title}
          itemType={completedItem.type}
          onClose={() => setCompletedItem(null)}
        />
      )}
      
      <div className="h-full overflow-y-auto px-4 py-6 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Today Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Today
              </h2>
              <span className="text-sm text-muted-foreground">{tasks?.today.length || 0} tasks</span>
            </div>
            
            <div className="space-y-3">
              {tasks?.today.length ? (
                tasks.today.map((task) => <TaskItem key={task.id} task={task} />)
              ) : (
                <div className="bg-card rounded-lg border border-border p-6 text-center text-muted-foreground">
                  No tasks scheduled for today. Great job staying on top of things!
                </div>
              )}
            </div>
          </section>

          {/* This Week Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                This Week
              </h2>
              <span className="text-sm text-muted-foreground">{tasks?.thisWeek.length || 0} tasks</span>
            </div>
            
            <div className="space-y-3">
              {tasks?.thisWeek.length ? (
                tasks.thisWeek.map((task) => <TaskItem key={task.id} task={task} />)
              ) : (
                <div className="bg-card rounded-lg border border-border p-6 text-center text-muted-foreground">
                  No tasks scheduled for this week. Add some tasks through the chat to get started!
                </div>
              )}
            </div>
          </section>

          {/* Later Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Later
              </h2>
              <span className="text-sm text-muted-foreground">{tasks?.later.length || 0} tasks</span>
            </div>
            
            <div className="space-y-3">
              {tasks?.later.length ? (
                tasks.later.map((task) => <TaskItem key={task.id} task={task} />)
              ) : (
                <div className="bg-card rounded-lg border border-border p-6 text-center text-muted-foreground">
                  No future tasks scheduled. Your calendar looks clear ahead!
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      
      {explainerItemId && (
        <PlanExplainer
          itemId={explainerItemId}
          itemTitle={explainerItemTitle}
          open={explainerItemId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setExplainerItemId(null);
              setExplainerItemTitle("");
            }
          }}
        />
      )}
    </>
  );
}
