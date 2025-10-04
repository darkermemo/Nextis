import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useToast } from "../hooks/use-toast";

const MOOD_OPTIONS = [
  { value: "tired", emoji: "😫", label: "Tired" },
  { value: "stressed", emoji: "😰", label: "Stressed" },
  { value: "motivated", emoji: "💪", label: "Motivated" },
  { value: "focused", emoji: "🎯", label: "Focused" },
  { value: "relaxed", emoji: "😌", label: "Relaxed" },
];

interface MoodCheckInProps {
  onClose: () => void;
  currentMood?: string;
}

export function MoodCheckIn({ onClose, currentMood }: MoodCheckInProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const moodMutation = useMutation({
    mutationFn: (mood: string) => api.updateMood(mood),
    onSuccess: (data) => {
      toast({
        title: "Mood updated",
        description: "Your schedule has been adjusted accordingly.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/next"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      onClose();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update mood. Please try again.",
      });
    },
  });

  if (currentMood && currentMood !== "none") {
    return null; // Already set today
  }

  return (
    <div className="bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border px-4 py-3 sm:px-6 animate-slide-up">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-foreground">How are you feeling today?</span>
        </div>
        <div className="flex items-center gap-2">
          {MOOD_OPTIONS.map((mood) => (
            <button
              key={mood.value}
              onClick={() => moodMutation.mutate(mood.value)}
              disabled={moodMutation.isPending}
              className="px-3 py-1.5 rounded-full bg-card hover:bg-muted text-xs font-medium transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`mood-${mood.value}`}
            >
              {mood.emoji} {mood.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
