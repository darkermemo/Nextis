import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatView } from "../components/chat-view";
import { TasksView } from "../components/tasks-view";
import { CalendarView } from "../components/calendar-view";
import { LearningView } from "../components/learning-view";
import { WeeklyReflection } from "../components/weekly-reflection";
import { MoodCheckIn } from "../components/mood-check-in";
import { NotificationBanner } from "../components/notification-banner";
import { api } from "../lib/api";
import type { DayState } from "../types";

type Tab = "chat" | "tasks" | "calendar" | "learning" | "insights";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [showMoodCheckIn, setShowMoodCheckIn] = useState(true);

  const { data: dayState } = useQuery<DayState>({
    queryKey: ["/api/day-state"],
    refetchOnWindowFocus: false,
  });

  const shouldShowMoodCheckIn = showMoodCheckIn && 
    (!dayState || dayState.mood === "none");

  return (
    <div className="max-w-7xl mx-auto h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">WeekMind</h1>
              <p className="text-xs text-muted-foreground">Intelligent Planning Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-muted rounded-lg transition-colors" data-testid="settings-button">
              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center text-white font-semibold text-sm cursor-pointer">
              AM
            </div>
          </div>
        </div>
      </header>

      {/* Mood Check-in Banner */}
      {shouldShowMoodCheckIn && (
        <MoodCheckIn 
          onClose={() => setShowMoodCheckIn(false)}
          currentMood={dayState?.mood}
        />
      )}

      {/* Notification Banner */}
      <NotificationBanner />

      {/* Tab Navigation */}
      <nav className="bg-card border-b border-border px-3 sm:px-6 relative">
        <div className="flex gap-1">
          <button 
            onClick={() => setActiveTab("chat")}
            className={`px-3 py-3 text-sm font-medium transition-colors min-h-[44px] flex items-center ${
              activeTab === "chat" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            } sm:px-4`}
            data-testid="tab-chat"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="hidden xs:inline sm:inline">Chat</span>
            </div>
          </button>
          <button 
            onClick={() => setActiveTab("tasks")}
            className={`px-3 py-3 text-sm font-medium transition-colors min-h-[44px] flex items-center ${
              activeTab === "tasks" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            } sm:px-4`}
            data-testid="tab-tasks"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="hidden xs:inline sm:inline">Tasks</span>
            </div>
          </button>
          <button 
            onClick={() => setActiveTab("calendar")}
            className={`px-3 py-3 text-sm font-medium transition-colors min-h-[44px] flex items-center ${
              activeTab === "calendar" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            } sm:px-4`}
            data-testid="tab-calendar"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="hidden xs:inline sm:inline">Calendar</span>
            </div>
          </button>
          <button 
            onClick={() => setActiveTab("learning")}
            className={`px-3 py-3 text-sm font-medium transition-colors min-h-[44px] flex items-center ${
              activeTab === "learning" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            } sm:px-4`}
            data-testid="tab-learning"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="hidden xs:inline sm:inline">Learning</span>
            </div>
          </button>
          <button 
            onClick={() => setActiveTab("insights")}
            className={`px-3 py-3 text-sm font-medium transition-colors min-h-[44px] flex items-center ${
              activeTab === "insights" 
                ? "text-primary border-b-2 border-primary" 
                : "text-muted-foreground hover:text-foreground"
            } sm:px-4`}
            data-testid="tab-insights"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="hidden xs:inline sm:inline">Insights</span>
            </div>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "chat" && <ChatView />}
        {activeTab === "tasks" && <TasksView />}
        {activeTab === "calendar" && <CalendarView />}
        {activeTab === "learning" && <LearningView />}
        {activeTab === "insights" && <WeeklyReflection />}
      </main>
    </div>
  );
}
