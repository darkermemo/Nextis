import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import type { NextActions, ChatResponse } from "../types";
import dayjs from "dayjs";

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  response?: ChatResponse;
}

export function ChatView() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "assistant",
      content: "👋 Hi! I'm WeekMind, your intelligent planning assistant. I can help you manage tasks, schedule events, and optimize your time.\n\nTry saying things like:\n• \"I have an exam on economics next Friday\"\n• \"Meeting Thursday at 9:00 pm\"\n• \"I have 3 homeworks next week\"\n• \"Add coffee breaks and TV time\"",
      timestamp: new Date(),
    }
  ]);
  const [earlyWork, setEarlyWork] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: nextActions, isLoading: nextLoading } = useQuery<NextActions>({
    queryKey: ["/api/next"],
    refetchInterval: 120000, // Refresh every 2 minutes
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) => api.sendChatMessage(message),
    onSuccess: (response, message) => {
      // Add user message
      const userMessage: ChatMessage = {
        id: Date.now() + "-user",
        type: "user",
        content: message,
        timestamp: new Date(),
      };

      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: Date.now() + "-assistant",
        type: "assistant",
        content: response.message,
        timestamp: new Date(),
        response,
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);
      
      // Show success toast
      toast({
        title: "Changes applied",
        description: response.message,
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/next"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process message. Please try again.",
      });
    },
  });

  const earlyWorkMutation = useMutation({
    mutationFn: (enabled: boolean) => api.toggleEarlyWork(enabled),
    onSuccess: () => {
      toast({
        title: "Schedule updated",
        description: earlyWork ? "Early work schedule enabled" : "Early work schedule disabled",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/next"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    
    chatMutation.mutate(input.trim());
    setInput("");
  };

  const handleEarlyWorkToggle = () => {
    const newValue = !earlyWork;
    setEarlyWork(newValue);
    earlyWorkMutation.mutate(newValue);
  };

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
      case "quiz": return "text-success";
      case "event": return "text-primary";
      default: return "text-foreground";
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Next 3 Actions Card */}
      <div className="bg-gradient-to-br from-primary/5 to-accent/5 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Next 3 Actions
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {nextLoading ? "Loading..." : "Updated 2m ago"}
          </span>
        </div>
        
        <div className="space-y-2">
          {nextActions?.items.length ? (
            nextActions.items.map((item, index) => (
              <div key={item.id} className="bg-card rounded-lg p-3 border border-border hover:border-primary/50 transition-colors cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? "bg-destructive/10 text-destructive" :
                      index === 1 ? "bg-warning/10 text-warning" :
                      "bg-accent/10 text-accent"
                    }`}>
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(item.priority)}`}>
                        {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {item.durationMinutes && (
                        <span className="flex items-center gap-1 font-mono">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {item.durationMinutes} min
                        </span>
                      )}
                      {(item.deadline || item.start) && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {item.deadline ? `Due ${dayjs(item.deadline).format('MMM D')}` :
                           item.start ? dayjs(item.start).format('MMM D') : ''}
                        </span>
                      )}
                      {item.type === "quiz" && (
                        <span className={`flex items-center gap-1 ${getTypeColor(item.type)}`}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Quiz
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded" data-testid={`start-task-${item.id}`}>
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-card rounded-lg p-4 border border-border text-center text-muted-foreground">
              {nextLoading ? "Loading your next actions..." : "No pending actions. Add some tasks to get started!"}
            </div>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.type === "user" ? "justify-end" : ""} animate-slide-up`}>
            {message.type === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex-shrink-0 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            )}
            
            <div className={`flex-1 max-w-2xl ${message.type === "user" ? "flex flex-col items-end" : ""}`}>
              <div className={`rounded-lg px-4 py-3 shadow-sm ${
                message.type === "user" 
                  ? "bg-primary text-primary-foreground rounded-tr-none" 
                  : "bg-card border border-border rounded-tl-none"
              }`}>
                <div className="text-sm whitespace-pre-line">
                  {message.content}
                </div>
                
                {message.response && message.response.changes.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 mt-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">Changes made:</p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {message.response.changes.map((change, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <svg className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              <span className="text-xs text-muted-foreground mt-1">
                {message.type === "user" ? "You" : "WeekMind"} • {dayjs(message.timestamp).fromNow()}
              </span>
            </div>

            {message.type === "user" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-primary flex-shrink-0 flex items-center justify-center text-white font-semibold text-sm">
                AM
              </div>
            )}
          </div>
        ))}
        
        {chatMutation.isPending && (
          <div className="flex gap-3 animate-slide-up">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex-shrink-0 flex items-center justify-center">
              <svg className="w-5 h-5 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 max-w-2xl">
              <div className="bg-card rounded-lg rounded-tl-none border border-border p-4 shadow-sm">
                <p className="text-sm text-muted-foreground">Processing your request...</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Input Area */}
      <div className="border-t border-border bg-card px-4 py-4 sm:px-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message... (e.g., 'Meeting tomorrow at 2pm' or 'I have 3 homeworks')"
              className="w-full px-4 py-3 pr-10 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              disabled={chatMutation.isPending}
              data-testid="chat-input"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
          <button 
            type="submit" 
            disabled={!input.trim() || chatMutation.isPending}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="chat-send"
          >
            <span>Send</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
        
        <div className="mt-2 flex items-center gap-2">
          <button 
            onClick={handleEarlyWorkToggle}
            disabled={earlyWorkMutation.isPending}
            className={`text-xs hover:text-foreground transition-colors flex items-center gap-1 ${
              earlyWork ? "text-foreground" : "text-muted-foreground"
            }`}
            data-testid="early-work-toggle"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Early work tomorrow {earlyWork ? "✓" : ""}
          </button>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground font-mono">Asia/Riyadh • {dayjs().format('MMM D, YYYY')}</span>
        </div>
      </div>
    </div>
  );
}
