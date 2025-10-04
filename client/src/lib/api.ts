import { apiRequest } from "./queryClient";
import type { NextActions, TasksResponse, CalendarResponse, ChatResponse, DayState, Task } from "../types";

export const api = {
  // Chat and planning
  async sendChatMessage(message: string, timezone = "Asia/Riyadh"): Promise<ChatResponse> {
    const response = await apiRequest("POST", "/api/chat/parse", {
      message,
      timezone,
    });
    return response.json();
  },

  async getNextActions(timezone = "Asia/Riyadh"): Promise<NextActions> {
    const response = await apiRequest("GET", `/api/next?timezone=${encodeURIComponent(timezone)}`);
    return response.json();
  },

  // Tasks
  async getTasks(timezone = "Asia/Riyadh"): Promise<TasksResponse> {
    const response = await apiRequest("GET", `/api/tasks?timezone=${encodeURIComponent(timezone)}`);
    return response.json();
  },

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const response = await apiRequest("PATCH", `/api/tasks/${id}`, updates);
    return response.json();
  },

  async toggleTaskComplete(id: string, done: boolean): Promise<Task> {
    const response = await apiRequest("PATCH", `/api/tasks/${id}`, { done });
    return response.json();
  },

  // Calendar
  async getCalendar(weekStart?: string, timezone = "Asia/Riyadh"): Promise<CalendarResponse> {
    const params = new URLSearchParams({ timezone });
    if (weekStart) params.append("weekStart", weekStart);
    
    const response = await apiRequest("GET", `/api/calendar?${params.toString()}`);
    return response.json();
  },

  // Day state and mood
  async getDayState(timezone = "Asia/Riyadh"): Promise<DayState> {
    const response = await apiRequest("GET", `/api/day-state?timezone=${encodeURIComponent(timezone)}`);
    return response.json();
  },

  async updateMood(mood: string, timezone = "Asia/Riyadh"): Promise<{ success: boolean; dayState: DayState }> {
    const response = await apiRequest("POST", "/api/mood", { mood, timezone });
    return response.json();
  },

  async toggleEarlyWork(earlyWork: boolean, timezone = "Asia/Riyadh"): Promise<{ success: boolean; dayState: DayState }> {
    const response = await apiRequest("POST", "/api/early-work", { earlyWork, timezone });
    return response.json();
  },
};
