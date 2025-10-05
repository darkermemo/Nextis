import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { llmService } from "./services/openai";
import { plannerEngine } from "./services/planner";
import { learningService } from "./services/learning";
import { WeeklyService } from "./services/weekly";
import { templateService } from "./services/templates";
import { healthService } from "./services/health";
import { gymService } from "./services/gym";
import { GmailService } from "./services/gmail";
import { z } from "zod";
import { parsedIntentSchema, type Item } from "@shared/schema";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Mock user for MVP - in production, use proper auth
const MOCK_USER_ID = "mock-user-id";

// Initialize weekly service
const weeklyService = new WeeklyService(storage);
const gmailService = new GmailService(storage);

async function buildEventContext(item: Item, userId: string, kind: string) {
  const today = dayjs().format('YYYY-MM-DD');
  const dayState = await storage.getDayState(userId, today);
  const rollup = await storage.getDailyRollup(userId, today);
  
  return {
    itemId: item.id,
    type: item.type,
    durationPlanned: item.durationMinutes ?? undefined,
    durationActual: kind === 'item_done' ? item.durationMinutes ?? undefined : undefined,
    startPlanned: item.start?.toISOString(),
    startActual: new Date().toISOString(),
    mood: dayState?.mood,
    earlyWork: dayState?.hasEarlyWorkTomorrow,
    sleepHours: rollup?.sleepHours ?? undefined,
    dayOfWeek: dayjs().day().toString(),
    hourOfDay: dayjs().hour(),
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Ensure mock user exists
  let mockUser = await storage.getUserByUsername("demo");
  if (!mockUser) {
    mockUser = await storage.createUser({
      username: "demo",
      password: "demo",
      timezone: "Asia/Riyadh",
    });
  }

  // API Documentation endpoint
  app.get("/api/docs", async (req, res) => {
    try {
      const docs = 
{
              "version": "1.0.0",
              "disclaimer": "⚠️ This documentation reflects the current implementation as of generation time. Always validate endpoint behavior in your development environment before relying on it in production. Response formats and request parameters may evolve.",
              "baseUrl": req.protocol + "://" + req.get("host"),
              "authentication": {
                      "type": "mock",
                      "description": "Currently using mock authentication for MVP. All requests use a demo user automatically.",
                      "productionNote": "In production, implement proper authentication with JWT tokens or session-based auth. Include authentication token in Authorization header: 'Bearer {token}'"
              },
              "headers": {
                      "contentType": "application/json",
                      "corsEnabled": true,
                      "requiredHeaders": {
                              "Content-Type": "application/json",
                              "Accept": "application/json"
                      }
              },
              "commonErrors": {
                      "400": {
                              "description": "Bad Request - Invalid input parameters",
                              "example": {
                                      "error": "Message is required"
                              }
                      },
                      "401": {
                              "description": "Unauthorized - Authentication required or invalid",
                              "example": {
                                      "error": "Gmail not connected"
                              }
                      },
                      "404": {
                              "description": "Not Found - Resource doesn't exist",
                              "example": {
                                      "error": "Task not found"
                              }
                      },
                      "500": {
                              "description": "Internal Server Error - Something went wrong on the server",
                              "example": {
                                      "error": "Failed to process message"
                              }
                      }
              },
              "categories": {
                      "chat": {
                              "name": "Chat & AI Planning",
                              "description": "Natural language command processing and intelligent planning",
                              "endpoints": [
                                      {
                                              "method": "POST",
                                              "path": "/api/chat/parse",
                                              "description": "Parse natural language commands and create/update tasks using AI",
                                              "requestBody": {
                                                      "message": "string (required) - Natural language command",
                                                      "timezone": "string (optional) - Timezone, defaults to 'Asia/Riyadh'"
                                              },
                                              "requestExample": {
                                                      "message": "Add meeting with team tomorrow at 2pm for 1 hour",
                                                      "timezone": "Asia/Riyadh"
                                              },
                                              "responseExample": {
                                                      "intent": {
                                                              "kind": "addMeeting",
                                                              "title": "Meeting with team",
                                                              "start": "2025-10-06T14:00:00Z"
                                                      },
                                                      "items": [
                                                              {
                                                                      "id": "abc-123",
                                                                      "title": "Meeting with team",
                                                                      "type": "meeting"
                                                              }
                                                      ],
                                                      "changes": [
                                                              "Added meeting on Oct 6 at 2:00 PM"
                                                      ],
                                                      "message": "Added meeting on Oct 6 at 2:00 PM"
                                              }
                                      },
                                      {
                                              "method": "GET",
                                              "path": "/api/next",
                                              "description": "Get the next 3 recommended actions based on current time and priorities",
                                              "queryParams": {
                                                      "timezone": "string (optional) - User timezone, defaults to 'Asia/Riyadh'"
                                              },
                                              "responseExample": {
                                                      "items": [
                                                              {
                                                                      "id": "abc",
                                                                      "title": "Study Math",
                                                                      "type": "study",
                                                                      "start": "2025-10-05T10:00:00Z",
                                                                      "durationMinutes": 60
                                                              }
                                                      ]
                                              }
                                      },
                                      {
                                              "method": "GET",
                                              "path": "/api/plan/explain/:itemId",
                                              "description": "Get AI explanation for why a specific task was scheduled at its current time",
                                              "pathParams": {
                                                      "itemId": "string (required) - ID of the item to explain"
                                              },
                                              "queryParams": {
                                                      "timezone": "string (optional) - User timezone"
                                              },
                                              "responseExample": {
                                                      "itemId": "abc-123",
                                                      "explanation": "Scheduled during your most productive morning hours based on your completion patterns",
                                                      "factors": [
                                                              "High energy window",
                                                              "No conflicts",
                                                              "Optimal focus time"
                                                      ]
                                              }
                                      }
                              ]
                      },
                      "tasks": {
                              "name": "Tasks",
                              "description": "Manage tasks and to-do items",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/tasks",
                                              "description": "Get all tasks grouped by time period (today, this week, later, all)",
                                              "queryParams": {
                                                      "timezone": "string (optional) - User timezone"
                                              },
                                              "responseExample": {
                                                      "today": [
                                                              {
                                                                      "id": "abc",
                                                                      "title": "Study",
                                                                      "type": "study",
                                                                      "done": false,
                                                                      "start": "2025-10-05T10:00:00Z"
                                                              }
                                                      ],
                                                      "thisWeek": [
                                                              {
                                                                      "id": "def",
                                                                      "title": "Project",
                                                                      "type": "project",
                                                                      "done": false,
                                                                      "start": "2025-10-06T14:00:00Z"
                                                              }
                                                      ],
                                                      "later": [
                                                              {
                                                                      "id": "ghi",
                                                                      "title": "Reading",
                                                                      "type": "reading",
                                                                      "done": false
                                                              }
                                                      ],
                                                      "all": [
                                                              {
                                                                      "id": "abc",
                                                                      "title": "Study",
                                                                      "type": "study",
                                                                      "done": false
                                                              }
                                                      ]
                                              }
                                      },
                                      {
                                              "method": "PATCH",
                                              "path": "/api/tasks/:id",
                                              "description": "Update a task (mark as done, change title, etc.)",
                                              "pathParams": {
                                                      "id": "string (required) - Task ID"
                                              },
                                              "requestBody": {
                                                      "done": "boolean (optional) - Mark task as complete",
                                                      "title": "string (optional) - Update task title",
                                                      "notes": "string (optional) - Update task notes"
                                              },
                                              "requestExample": {
                                                      "done": true
                                              },
                                              "responseExample": {
                                                      "id": "abc-123",
                                                      "title": "Study Math",
                                                      "done": true,
                                                      "type": "study"
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/tasks/:id/snooze",
                                              "description": "Snooze a task to a later time",
                                              "pathParams": {
                                                      "id": "string (required) - Task ID"
                                              },
                                              "requestBody": {
                                                      "snoozeUntil": "string (required) - ISO 8601 timestamp for when task should be rescheduled"
                                              },
                                              "requestExample": {
                                                      "snoozeUntil": "2025-10-05T15:00:00Z"
                                              },
                                              "responseExample": {
                                                      "id": "abc-123",
                                                      "title": "Study Math",
                                                      "start": "2025-10-05T15:00:00Z"
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/tasks/:id/skip",
                                              "description": "Skip/delete a task permanently",
                                              "pathParams": {
                                                      "id": "string (required) - Task ID"
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "message": "Task skipped"
                                              }
                                      }
                              ]
                      },
                      "calendar": {
                              "name": "Calendar",
                              "description": "View and manage calendar events",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/calendar",
                                              "description": "Get calendar events for a specific week",
                                              "queryParams": {
                                                      "timezone": "string (optional) - User timezone",
                                                      "weekStart": "string (optional) - ISO date for week start, defaults to current week"
                                              },
                                              "responseExample": {
                                                      "items": [
                                                              {
                                                                      "id": "abc",
                                                                      "title": "Meeting",
                                                                      "start": "2025-10-05T10:00:00Z",
                                                                      "end": "2025-10-05T11:00:00Z"
                                                              }
                                                      ],
                                                      "weekStart": "2025-09-30T00:00:00Z",
                                                      "weekEnd": "2025-10-06T23:59:59Z"
                                              }
                                      }
                              ]
                      },
                      "templates": {
                              "name": "Templates",
                              "description": "Pre-built task templates for common scenarios (exams, projects, etc.)",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/templates",
                                              "description": "Get list of available task templates",
                                              "responseExample": {
                                                      "templates": [
                                                              "exam",
                                                              "presentation",
                                                              "homework",
                                                              "project",
                                                              "reading",
                                                              "lab"
                                                      ]
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/templates/apply",
                                              "description": "Apply a template to create multiple related tasks",
                                              "requestBody": {
                                                      "template": "string (required) - Template name (exam, presentation, homework, project, reading, lab)",
                                                      "params": "object (required) - Template-specific parameters",
                                                      "timezone": "string (optional) - User timezone"
                                              },
                                              "requestExample": {
                                                      "template": "exam",
                                                      "params": {
                                                              "subject": "Math",
                                                              "date": "2025-10-15"
                                                      },
                                                      "timezone": "Asia/Riyadh"
                                              },
                                              "responseExample": {
                                                      "items": [
                                                              {
                                                                      "id": "abc",
                                                                      "title": "Study Math - Review",
                                                                      "type": "study"
                                                              }
                                                      ],
                                                      "message": "Created exam preparation plan for Math with 5 items"
                                              }
                                      }
                              ]
                      },
                      "user": {
                              "name": "User",
                              "description": "User profile and daily state management",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/user",
                                              "description": "Get current user profile",
                                              "responseExample": {
                                                      "id": "user-123",
                                                      "username": "demo",
                                                      "timezone": "Asia/Riyadh",
                                                      "autoBreaks": false,
                                                      "waterGoalMl": 2000
                                              }
                                      },
                                      {
                                              "method": "GET",
                                              "path": "/api/day-state",
                                              "description": "Get current day's state (mood, early work flag)",
                                              "queryParams": {
                                                      "timezone": "string (optional) - User timezone"
                                              },
                                              "responseExample": {
                                                      "id": "state-123",
                                                      "userId": "user-123",
                                                      "date": "2025-10-05",
                                                      "mood": "energized",
                                                      "hasEarlyWorkTomorrow": false
                                              }
                                      }
                              ]
                      },
                      "mood": {
                              "name": "Mood & Wellbeing",
                              "description": "Track mood and energy levels for intelligent scheduling",
                              "endpoints": [
                                      {
                                              "method": "POST",
                                              "path": "/api/mood",
                                              "description": "Set mood for the day (affects task scheduling)",
                                              "requestBody": {
                                                      "mood": "string (required) - One of: 'energized', 'focused', 'tired', 'stressed', 'none'",
                                                      "timezone": "string (optional) - User timezone"
                                              },
                                              "requestExample": {
                                                      "mood": "energized",
                                                      "timezone": "Asia/Riyadh"
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "dayState": {
                                                              "mood": "energized",
                                                              "hasEarlyWorkTomorrow": false
                                                      }
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/mood/checkin",
                                              "description": "Provide feedback on task difficulty after completion (micro-mood check-in)",
                                              "requestBody": {
                                                      "afterItemId": "string (required) - ID of completed task",
                                                      "rating": "string (required) - 'easy', 'ok', or 'hard'"
                                              },
                                              "requestExample": {
                                                      "afterItemId": "abc-123",
                                                      "rating": "easy"
                                              },
                                              "responseExample": {
                                                      "updatedDuration": 45,
                                                      "message": "Great! Future study tasks will be shorter (45 min)."
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/early-work",
                                              "description": "Indicate if you have early work tomorrow (adjusts tomorrow's schedule)",
                                              "requestBody": {
                                                      "earlyWork": "boolean (required) - True if early work tomorrow",
                                                      "timezone": "string (optional) - User timezone"
                                              },
                                              "requestExample": {
                                                      "earlyWork": true
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "dayState": {
                                                              "hasEarlyWorkTomorrow": true
                                                      }
                                              }
                                      }
                              ]
                      },
                      "learning": {
                              "name": "Learning & Preferences",
                              "description": "AI learning system that adapts to your patterns",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/learning/preferences",
                                              "description": "Get learning preferences and statistics",
                                              "responseExample": {
                                                      "preferences": {
                                                              "preferEvening": false,
                                                              "maxContinuousFocus": 90,
                                                              "pinnedWindows": [],
                                                              "bannedWindows": [
                                                                      {
                                                                              "weekday": "Fri",
                                                                              "hour": 23
                                                                      }
                                                              ]
                                                      },
                                                      "stats": {
                                                              "topWindows": [
                                                                      {
                                                                              "weekday": "Mon",
                                                                              "hour": 9,
                                                                              "score": 0.95
                                                                      }
                                                              ],
                                                              "learnedLengths": {
                                                                      "study": 60,
                                                                      "meeting": 45
                                                              },
                                                              "totalEvents": 150,
                                                              "daysTracked": 30
                                                      }
                                              }
                                      },
                                      {
                                              "method": "PATCH",
                                              "path": "/api/learning/preferences",
                                              "description": "Update learning preferences",
                                              "requestBody": {
                                                      "preferEvening": "boolean (optional) - Prefer evening slots",
                                                      "maxContinuousFocus": "number (optional) - Max continuous focus time in minutes (30-120)",
                                                      "pinnedWindows": "array (optional) - Time windows to prefer",
                                                      "bannedWindows": "array (optional) - Time windows to avoid"
                                              },
                                              "requestExample": {
                                                      "preferEvening": true,
                                                      "maxContinuousFocus": 90
                                              },
                                              "responseExample": {
                                                      "preferences": {
                                                              "preferEvening": true,
                                                              "maxContinuousFocus": 90
                                                      }
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/learning/update",
                                              "description": "Manually trigger daily learning update",
                                              "requestBody": {
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "message": "Daily learning update completed",
                                                      "stats": {
                                                              "learnedLengths": {
                                                                      "study": 65
                                                              }
                                                      }
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/learning/reset",
                                              "description": "Reset learning data to defaults",
                                              "responseExample": {
                                                      "success": true,
                                                      "message": "Learning data reset to defaults"
                                              }
                                      },
                                      {
                                              "method": "GET",
                                              "path": "/api/learning/insights",
                                              "description": "Get insights about your productivity patterns",
                                              "responseExample": {
                                                      "weekdayPatterns": {
                                                              "Mon": 0.85,
                                                              "Tue": 0.78
                                                      },
                                                      "hourlyPatterns": {
                                                              "14": 0.65,
                                                              "09": 0.92
                                                      },
                                                      "recentTrends": {
                                                              "completionRate": 0.8,
                                                              "avgSnoozes": 1.2,
                                                              "avgSkips": 0.5
                                                      }
                                              }
                                      }
                              ]
                      },
                      "breaks": {
                              "name": "Breaks",
                              "description": "Automatic break insertion for better focus",
                              "endpoints": [
                                      {
                                              "method": "POST",
                                              "path": "/api/breaks/recompute",
                                              "description": "Manually trigger break insertion between tasks",
                                              "requestBody": {
                                                      "now": "string (optional) - ISO timestamp"
                                              },
                                              "responseExample": {
                                                      "breaksAdded": 3,
                                                      "breaks": [
                                                              {
                                                                      "id": "break-1",
                                                                      "title": "5min break",
                                                                      "start": "2025-10-05T11:00:00Z"
                                                              }
                                                      ]
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/breaks/auto-toggle",
                                              "description": "Enable/disable automatic break insertion",
                                              "requestBody": {
                                                      "enabled": "boolean (required)"
                                              },
                                              "requestExample": {
                                                      "enabled": true
                                              },
                                              "responseExample": {
                                                      "autoBreaks": true
                                              }
                                      }
                              ]
                      },
                      "health": {
                              "name": "Health & Hydration",
                              "description": "Track water intake and health metrics",
                              "endpoints": [
                                      {
                                              "method": "POST",
                                              "path": "/api/hydration/goal",
                                              "description": "Set daily water intake goal",
                                              "requestBody": {
                                                      "mlPerDay": "number (required) - Water goal in milliliters"
                                              },
                                              "requestExample": {
                                                      "mlPerDay": 2500
                                              },
                                              "responseExample": {
                                                      "waterGoalMl": 2500
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/health/ingest",
                                              "description": "Ingest health data from external sources (Apple Health, etc.)",
                                              "requestBody": {
                                                      "waterMl": "number (optional) - Water intake in ml",
                                                      "sedentaryMinutes": "number (optional) - Sedentary minutes",
                                                      "activeMinutes": "number (optional) - Active minutes",
                                                      "sleepHours": "number (optional) - Hours of sleep"
                                              },
                                              "requestExample": {
                                                      "sleepHours": 7.5,
                                                      "activeMinutes": 45,
                                                      "waterMl": 1800
                                              },
                                              "responseExample": {
                                                      "success": true
                                              }
                                      }
                              ]
                      },
                      "dailyRollup": {
                              "name": "Daily Rollup",
                              "description": "Daily summary and statistics",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/daily-rollup",
                                              "description": "Get today's activity rollup",
                                              "queryParams": {
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "date": "2025-10-05",
                                                      "focusBlocksCompleted": 5,
                                                      "snoozes": 2,
                                                      "skips": 1,
                                                      "sleepHours": 7.5,
                                                      "waterMl": 1800
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/daily-rollup",
                                              "description": "Manually update daily rollup",
                                              "requestBody": {
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "success": true
                                              }
                                      }
                              ]
                      },
                      "notifications": {
                              "name": "Notifications",
                              "description": "Smart notifications and reminders",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/notifications",
                                              "description": "Get pending notifications",
                                              "queryParams": {
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "notifications": [
                                                              {
                                                                      "id": "notif-123",
                                                                      "kind": "water",
                                                                      "payload": {
                                                                              "message": "Time to hydrate!"
                                                                      },
                                                                      "scheduled": "2025-10-05T15:00:00Z"
                                                              }
                                                      ]
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/notifications/ack",
                                              "description": "Acknowledge notification with action (accept, snooze, dismiss)",
                                              "requestBody": {
                                                      "notificationId": "string (required) - Notification ID",
                                                      "action": "string (required) - 'accept', 'snooze', or 'dismiss'",
                                                      "timezone": "string (optional) - User timezone, defaults to 'Asia/Riyadh'"
                                              },
                                              "requestExample": {
                                                      "notificationId": "notif-123",
                                                      "action": "accept",
                                                      "timezone": "Asia/Riyadh"
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "message": "Notification accepted and applied"
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/notifications/check",
                                              "description": "Manually trigger notification checks (missed tasks, breaks, water reminders)",
                                              "requestBody": {
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "created": 2,
                                                      "notifications": [
                                                              {
                                                                      "id": "notif-456",
                                                                      "kind": "rescheduleMiss",
                                                                      "payload": {}
                                                              }
                                                      ]
                                              }
                                      }
                              ]
                      },
                      "weekly": {
                              "name": "Weekly Summary",
                              "description": "Weekly reflection and AI-generated insights",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/weekly/summary",
                                              "description": "Get weekly summary for a specific week",
                                              "queryParams": {
                                                      "weekStart": "string (optional) - ISO date for Monday of the week",
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "id": "summary-123",
                                                      "weekStart": "2025-09-30",
                                                      "completionRate": 0.85,
                                                      "totalFocusMinutes": 1200,
                                                      "topPerformanceDay": "Monday",
                                                      "aiNotes": "Strong week overall. Productivity peaked on Monday mornings."
                                              }
                                      },
                                      {
                                              "method": "GET",
                                              "path": "/api/weekly/recent",
                                              "description": "Get recent weekly summaries",
                                              "queryParams": {
                                                      "limit": "number (optional) - Number of summaries to return, default 4"
                                              },
                                              "responseExample": [
                                                      {
                                                              "id": "sum-1",
                                                              "weekStart": "2025-09-30",
                                                              "completionRate": 0.85
                                                      }
                                              ]
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/weekly/generate",
                                              "description": "Manually generate weekly summary",
                                              "requestBody": {
                                                      "weekStart": "string (optional) - ISO date",
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "summary": {
                                                              "id": "sum-123",
                                                              "completionRate": 0.85
                                                      }
                                              }
                                      }
                              ]
                      },
                      "gmail": {
                              "name": "Gmail Integration",
                              "description": "Gmail integration for automatic event/task creation",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/gmail/status",
                                              "description": "Check Gmail connection status",
                                              "responseExample": {
                                                      "connected": true,
                                                      "emailAddress": "user@gmail.com",
                                                      "lastSyncAt": "2025-10-05T10:00:00Z"
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/gmail/sync",
                                              "description": "Manually trigger Gmail sync to import events/tasks",
                                              "requestBody": {
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "success": true,
                                                      "itemsCreated": 3,
                                                      "categories": {
                                                              "meetings": 2,
                                                              "deadlines": 1
                                                      }
                                              }
                                      },
                                      {
                                              "method": "GET",
                                              "path": "/api/gmail/connection-info",
                                              "description": "Get Gmail connection information (connection status and last sync time)",
                                              "responseExample": {
                                                      "connected": true,
                                                      "lastSync": "2025-10-05T10:00:00Z"
                                              }
                                      }
                              ]
                      },
                      "workout": {
                              "name": "Workout & Gym",
                              "description": "Workout planning and streak tracking",
                              "endpoints": [
                                      {
                                              "method": "GET",
                                              "path": "/api/workout/prefs",
                                              "description": "Get workout preferences",
                                              "responseExample": {
                                                      "preferences": {
                                                              "perWeek": 3,
                                                              "defaultDurationMin": 60,
                                                              "preferredWindows": [
                                                                      {
                                                                              "weekday": "Mon",
                                                                              "hour": 18
                                                                      }
                                                              ]
                                                      }
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/workout/prefs",
                                              "description": "Set/update workout preferences",
                                              "requestBody": {
                                                      "perWeek": "number (required) - Workouts per week (1-7)",
                                                      "defaultDurationMin": "number (required) - Duration in minutes (15-240)",
                                                      "preferredWindows": "array (optional) - Preferred time windows"
                                              },
                                              "requestExample": {
                                                      "perWeek": 4,
                                                      "defaultDurationMin": 45,
                                                      "preferredWindows": [
                                                              {
                                                                      "weekday": "Mon",
                                                                      "hour": 18
                                                              }
                                                      ]
                                              },
                                              "responseExample": {
                                                      "preferences": {
                                                              "perWeek": 4,
                                                              "defaultDurationMin": 45
                                                      }
                                              }
                                      },
                                      {
                                              "method": "POST",
                                              "path": "/api/workout/plan",
                                              "description": "Plan workouts for a specific week",
                                              "requestBody": {
                                                      "weekStart": "string (optional) - ISO date for week start",
                                                      "timezone": "string (optional) - User timezone"
                                              },
                                              "requestExample": {
                                                      "weekStart": "2025-10-07",
                                                      "timezone": "Asia/Riyadh"
                                              },
                                              "responseExample": {
                                                      "workouts": [
                                                              {
                                                                      "id": "workout-1",
                                                                      "title": "Workout",
                                                                      "start": "2025-10-07T18:00:00Z"
                                                              }
                                                      ],
                                                      "streakProtected": false
                                              }
                                      },
                                      {
                                              "method": "GET",
                                              "path": "/api/workout/streak",
                                              "description": "Get workout streak status",
                                              "queryParams": {
                                                      "timezone": "string (optional)"
                                              },
                                              "responseExample": {
                                                      "currentStreak": 3,
                                                      "longestStreak": 5,
                                                      "protected": false,
                                                      "lastWorkout": "2025-10-03T18:00:00Z"
                                              }
                                      }
                              ]
                      }
              }
      }
      };

      res.json(docs);
    } catch (error) {
      console.error("Docs error:", error);
      res.status(500).json({ error: "Failed to generate documentation" });
    }
  });

  // Get templates list
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = templateService.getAvailableTemplates();
      res.json({ templates });
    } catch (error) {
      console.error("Templates error:", error);
      res.status(500).json({ error: "Failed to get templates" });
    }
  });

  // Apply a template
  app.post("/api/templates/apply", async (req, res) => {
    try {
      const { template, params, timezone = "Asia/Riyadh" } = req.body;

      if (!template || !params) {
        return res.status(400).json({ error: "template and params are required" });
      }

      const items = await templateService.applyTemplate(mockUser.id, template, params, timezone);

      res.json({
        items,
        message: `Created ${template} plan with ${items.length} items`,
      });
    } catch (error: any) {
      console.error("Template apply error:", error);

      if (error.message === "Unknown template") {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Failed to apply template" });
    }
  });

  // Get Gmail status
  app.get("/api/gmail/status", async (req, res) => {
    try {
      const gmailState = await storage.getGmailState(mockUser.id);
      
      res.json({
        connected: !!gmailState,
        emailAddress: gmailState?.email || null,
        lastSyncAt: gmailState?.updatedAt?.toISOString() || null,
      });
    } catch (error) {
      console.error("Gmail status error:", error);
      res.status(500).json({ error: "Failed to get Gmail status" });
    }
  });

  // Manually trigger Gmail sync
  app.post("/api/gmail/sync", async (req, res) => {
    try {
      const { timezone = "Asia/Riyadh" } = req.body;
      const gmailState = await storage.getGmailState(mockUser.id);

      if (!gmailState) {
        return res.status(401).json({ error: "Gmail not connected" });
      }

      const result = await gmailService.scanAndCreateItems(mockUser.id, timezone);

      res.json({
        success: true,
        itemsCreated: result.itemsCreated.length,
        categories: result.categories,
      });
    } catch (error) {
      console.error("Gmail sync error:", error);
      res.status(500).json({ error: "Failed to sync Gmail" });
    }
  });

  // Get Gmail connection info
  app.get("/api/gmail/connection-info", async (req, res) => {
    try {
      const gmailState = await storage.getGmailState(MOCK_USER_ID);
      
      res.json({
        connected: !!gmailState,
        lastSync: gmailState?.updatedAt?.toISOString() || null,
      });
    } catch (error) {
      console.error("Gmail connection info error:", error);
      res.status(500).json({ error: "Failed to get Gmail connection info" });
    }
  });

  // Get next 3 actions
  app.get("/api/next", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const nextActions = await plannerEngine.getNextThreeActions(mockUser.id, timezone);
      res.json(nextActions);
    } catch (error) {
      console.error("Next actions error:", error);
      res.status(500).json({ error: "Failed to get next actions" });
    }
  });

  // Get all tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const now = dayjs().tz(timezone);
      
      const allItems = await storage.getItems(mockUser.id);
      
      // Group tasks by time period
      const today = allItems.filter(item => {
        if (!item.start) return false;
        const itemDate = dayjs(item.start).tz(timezone);
        return itemDate.isSame(now, 'day');
      });

      const thisWeek = allItems.filter(item => {
        if (!item.start && !item.deadline) return false;
        const itemDate = dayjs(item.start || item.deadline).tz(timezone);
        return itemDate.isSame(now, 'week') && !itemDate.isSame(now, 'day');
      });

      const later = allItems.filter(item => {
        if (!item.start && !item.deadline) return true; // No date = later
        const itemDate = dayjs(item.start || item.deadline).tz(timezone);
        return itemDate.isAfter(now.endOf('week'));
      });

      res.json({
        today,
        thisWeek,
        later,
        all: allItems,
      });
    } catch (error) {
      console.error("Tasks error:", error);
      res.status(500).json({ error: "Failed to get tasks" });
    }
  });

  // Get calendar events
  app.get("/api/calendar", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const weekStart = req.query.weekStart ? 
        dayjs(req.query.weekStart as string).tz(timezone) : 
        dayjs().tz(timezone).startOf('week');
      
      const weekEnd = weekStart.endOf('week');
      
      // Get all items for the user and filter in code
      const allItems = await storage.getItems(mockUser.id);
      
      // Filter items that overlap with the week (start before week end AND end after week start)
      const items = allItems.filter(item => {
        if (!item.start) return false;
        const itemStart = dayjs(item.start).tz(timezone);
        const itemEnd = item.end ? dayjs(item.end).tz(timezone) : itemStart;
        
        // Item overlaps with week if it starts before week ends AND ends after week starts
        return itemStart.isBefore(weekEnd) && itemEnd.isAfter(weekStart);
      });

      res.json({
        items,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      });
    } catch (error) {
      console.error("Calendar error:", error);
      res.status(500).json({ error: "Failed to get calendar data" });
    }
  });

  // Get plan explanation for an item
  app.get("/api/plan/explain/:itemId", async (req, res) => {
    try {
      const { itemId } = req.params;
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";

      const explanation = await plannerEngine.explainPlacement(mockUser.id, itemId, timezone);
      res.json(explanation);
    } catch (error: any) {
      console.error("Plan explanation error:", error);
      
      if (error.message === "Item not found" || error.message === "Item has no scheduled time") {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: "Failed to get plan explanation" });
    }
  });

  // Update mood
  app.post("/api/mood", async (req, res) => {
    try {
      const { mood, timezone = "Asia/Riyadh" } = req.body;
      const today = dayjs().tz(timezone).format("YYYY-MM-DD");
      
      // Get existing day state to preserve early work flag
      const existingState = await storage.getDayState(mockUser.id, today);
      
      const dayState = await storage.upsertDayState({
        userId: mockUser.id,
        date: today,
        mood,
        hasEarlyWorkTomorrow: existingState?.hasEarlyWorkTomorrow ?? false,
      });

      // Apply mood-based adjustments
      await plannerEngine.applyIntent({ kind: "setMood", mood }, mockUser.id, timezone);

      res.json({ success: true, dayState });
    } catch (error) {
      console.error("Mood error:", error);
      res.status(500).json({ error: "Failed to update mood" });
    }
  });

  // Micro-mood check-in after task completion
  app.post("/api/mood/checkin", async (req, res) => {
    try {
      const { afterItemId, rating } = req.body;
      
      if (!rating || !["easy", "ok", "hard"].includes(rating)) {
        return res.status(400).json({ error: "Invalid rating. Must be 'easy', 'ok', or 'hard'" });
      }
      
      const item = await storage.getItem(afterItemId, mockUser.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const actualDuration = item.durationMinutes || 60;
      const itemStart = item.start || new Date();
      const weekday = dayjs(itemStart).format('ddd');
      const hour = dayjs(itemStart).hour();
      
      const updatedDuration = await learningService.applyMicroMoodFeedback(
        mockUser.id,
        item.type,
        rating as "easy" | "ok" | "hard",
        { weekday, hour }
      );
      
      await storage.logEvent({
        userId: mockUser.id,
        kind: 'item_rated',
        itemId: afterItemId,
        context: {
          rating: rating as "easy" | "ok" | "hard",
          itemType: item.type,
          duration: actualDuration,
          type: item.type,
        },
      });
      
      let message = "";
      if (rating === "easy") {
        message = `Great! Future ${item.type} tasks will be shorter (${Math.round(updatedDuration)} min).`;
      } else if (rating === "hard") {
        message = `Noted! Future ${item.type} tasks will be longer (${Math.round(updatedDuration)} min).`;
      } else {
        message = `Got it! ${item.type} duration stays at ${Math.round(updatedDuration)} min.`;
      }
      
      res.json({ 
        updatedDuration: Math.round(updatedDuration),
        message 
      });
    } catch (error) {
      console.error("Micro-mood check-in error:", error);
      res.status(500).json({ error: "Failed to record mood check-in" });
    }
  });

  // Toggle early work tomorrow
  app.post("/api/early-work", async (req, res) => {
    try {
      const { earlyWork, timezone = "Asia/Riyadh" } = req.body;
      const today = dayjs().tz(timezone).format("YYYY-MM-DD");
      
      // Get existing day state to preserve mood
      const existingState = await storage.getDayState(mockUser.id, today);
      
      const dayState = await storage.upsertDayState({
        userId: mockUser.id,
        date: today,
        mood: existingState?.mood ?? "none",
        hasEarlyWorkTomorrow: Boolean(earlyWork),
      });

      if (earlyWork) {
        await plannerEngine.applyIntent({ 
          kind: "setEarlyWork", 
          earlyWorkTomorrow: true 
        }, mockUser.id, timezone);
      }

      res.json({ success: true, dayState });
    } catch (error) {
      console.error("Early work error:", error);
      res.status(500).json({ error: "Failed to update early work setting" });
    }
  });

  // Toggle task completion
  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const existingItem = await storage.getItem(id, mockUser.id);
      
      if (!existingItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updatedItem = await storage.updateItem(id, mockUser.id, updates);
      
      if (!updatedItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (updates.done && !existingItem.done) {
        try {
          const context = await buildEventContext(updatedItem, mockUser.id, 'item_done');
          await storage.logEvent({
            userId: mockUser.id,
            kind: 'item_done',
            itemId: id,
            context,
          });
        } catch (eventError) {
          console.error("Event logging error:", eventError);
        }
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Task update error:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Snooze task
  app.post("/api/tasks/:id/snooze", async (req, res) => {
    try {
      const { id } = req.params;
      const { snoozeUntil } = req.body;

      if (!snoozeUntil) {
        return res.status(400).json({ error: "snoozeUntil timestamp is required" });
      }

      const existingItem = await storage.getItem(id, mockUser.id);
      
      if (!existingItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updatedItem = await storage.updateItem(id, mockUser.id, {
        start: new Date(snoozeUntil),
      });

      if (!updatedItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      try {
        const context = await buildEventContext(existingItem, mockUser.id, 'item_snoozed');
        await storage.logEvent({
          userId: mockUser.id,
          kind: 'item_snoozed',
          itemId: id,
          context,
        });
      } catch (eventError) {
        console.error("Event logging error:", eventError);
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Snooze error:", error);
      res.status(500).json({ error: "Failed to snooze task" });
    }
  });

  // Skip task
  app.post("/api/tasks/:id/skip", async (req, res) => {
    try {
      const { id } = req.params;

      const existingItem = await storage.getItem(id, mockUser.id);
      
      if (!existingItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      try {
        const context = await buildEventContext(existingItem, mockUser.id, 'item_skipped');
        await storage.logEvent({
          userId: mockUser.id,
          kind: 'item_skipped',
          itemId: id,
          context,
        });
      } catch (eventError) {
        console.error("Event logging error:", eventError);
      }

      const deleted = await storage.deleteItem(id, mockUser.id);

      if (!deleted) {
        return res.status(404).json({ error: "Task not found" });
      }

      res.json({ success: true, message: "Task skipped" });
    } catch (error) {
      console.error("Skip error:", error);
      res.status(500).json({ error: "Failed to skip task" });
    }
  });

  // Get current user
  app.get("/api/user", async (req, res) => {
    try {
      const user = await storage.getUser(mockUser.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Get current day state (for mood check-in)
  app.get("/api/day-state", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const today = dayjs().tz(timezone).format("YYYY-MM-DD");
      
      let dayState = await storage.getDayState(mockUser.id, today);
      if (!dayState) {
        dayState = await storage.upsertDayState({
          userId: mockUser.id,
          date: today,
          mood: "none",
          hasEarlyWorkTomorrow: false,
        });
      }

      res.json(dayState);
    } catch (error) {
      console.error("Day state error:", error);
      res.status(500).json({ error: "Failed to get day state" });
    }
  });

  // Get learning preferences and stats
  app.get("/api/learning/preferences", async (req, res) => {
    try {
      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      const topWindows: Array<{weekday: string, hour: number, score: number}> = [];
      for (const [weekday, scores] of Object.entries(habitLearn.windowJSON)) {
        (scores as number[]).forEach((score, hour) => {
          topWindows.push({ weekday, hour, score });
        });
      }
      topWindows.sort((a, b) => b.score - a.score);
      const top5Windows = topWindows.slice(0, 5);

      const recentEvents = await storage.getRecentEvents(mockUser.id, 365);
      const totalEvents = recentEvents.length;

      const uniqueDates = new Set(recentEvents.map(e => dayjs(e.createdAt).format('YYYY-MM-DD')));
      const daysTracked = uniqueDates.size;

      res.json({
        preferences: habitLearn.preferences,
        stats: {
          topWindows: top5Windows,
          learnedLengths: habitLearn.lengthJSON,
          totalEvents,
          daysTracked
        }
      });
    } catch (error) {
      console.error("Learning prefs error:", error);
      res.status(500).json({ error: "Failed to get learning preferences" });
    }
  });

  // Update learning preferences
  app.patch("/api/learning/preferences", async (req, res) => {
    try {
      const { preferEvening, maxContinuousFocus, pinnedWindows, bannedWindows } = req.body;

      if (maxContinuousFocus !== undefined) {
        if (typeof maxContinuousFocus !== 'number' || maxContinuousFocus < 30 || maxContinuousFocus > 120) {
          return res.status(400).json({ error: "maxContinuousFocus must be between 30 and 120" });
        }
      }

      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      const updatedPreferences = {
        ...habitLearn.preferences,
        ...(preferEvening !== undefined && { preferEvening }),
        ...(maxContinuousFocus !== undefined && { maxContinuousFocus }),
        ...(pinnedWindows !== undefined && { pinnedWindows }),
        ...(bannedWindows !== undefined && { bannedWindows })
      };

      const updatedHabitLearn = await storage.upsertHabitLearn({
        userId: mockUser.id,
        preferences: updatedPreferences
      });

      res.json({ preferences: updatedHabitLearn.preferences });
    } catch (error) {
      console.error("Update preferences error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Manually trigger daily learning update
  app.post("/api/learning/update", async (req, res) => {
    try {
      const { timezone = "Asia/Riyadh" } = req.body;

      await learningService.runDailyUpdate(mockUser.id, timezone);

      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      res.json({
        success: true,
        message: "Daily learning update completed",
        stats: {
          learnedLengths: habitLearn.lengthJSON
        }
      });
    } catch (error) {
      console.error("Learning update error:", error);
      res.status(500).json({ error: "Failed to run learning update" });
    }
  });

  // Reset learning data to defaults
  app.post("/api/learning/reset", async (req, res) => {
    try {
      await storage.deleteHabitLearn(mockUser.id);

      const newHabitLearn = await learningService.initializeHabitLearn(mockUser.id);

      res.json({
        success: true,
        message: "Learning data reset to defaults",
        preferences: newHabitLearn.preferences
      });
    } catch (error) {
      console.error("Learning reset error:", error);
      res.status(500).json({ error: "Failed to reset learning data" });
    }
  });

  // Get learning insights
  app.get("/api/learning/insights", async (req, res) => {
    try {
      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      const weekdayPatterns: Record<string, number> = {};
      for (const [weekday, scores] of Object.entries(habitLearn.windowJSON)) {
        const avgScore = (scores as number[]).reduce((sum, s) => sum + s, 0) / (scores as number[]).length;
        weekdayPatterns[weekday] = avgScore;
      }

      const hourlyPatterns: Record<string, number> = {};
      for (let hour = 0; hour < 24; hour++) {
        let totalScore = 0;
        let count = 0;
        for (const scores of Object.values(habitLearn.windowJSON)) {
          totalScore += (scores as number[])[hour];
          count++;
        }
        hourlyPatterns[hour.toString().padStart(2, '0')] = totalScore / count;
      }

      const last7Days = [];
      const timezone = "Asia/Riyadh";
      for (let i = 0; i < 7; i++) {
        const date = dayjs().tz(timezone).subtract(i, 'day').format('YYYY-MM-DD');
        const rollup = await storage.getDailyRollup(mockUser.id, date);
        if (rollup) {
          last7Days.push(rollup);
        }
      }

      let completionRate = 0;
      let avgSnoozes = 0;
      let avgSkips = 0;

      if (last7Days.length > 0) {
        const totalFocus = last7Days.reduce((sum, r) => sum + (r.focusBlocksCompleted || 0), 0);
        const totalSnoozes = last7Days.reduce((sum, r) => sum + (r.snoozes || 0), 0);
        const totalSkips = last7Days.reduce((sum, r) => sum + (r.skips || 0), 0);

        const totalActions = totalFocus + totalSnoozes + totalSkips;
        completionRate = totalActions > 0 ? totalFocus / totalActions : 0;
        avgSnoozes = totalSnoozes / last7Days.length;
        avgSkips = totalSkips / last7Days.length;
      }

      res.json({
        weekdayPatterns,
        hourlyPatterns,
        recentTrends: {
          completionRate,
          avgSnoozes,
          avgSkips
        }
      });
    } catch (error) {
      console.error("Learning insights error:", error);
      res.status(500).json({ error: "Failed to get learning insights" });
    }
  });

  // Manually trigger break insertion
  app.post("/api/breaks/recompute", async (req, res) => {
    try {
      const { now } = req.body;
      const currentTime = now ? new Date(now) : new Date();

      const breaks = await plannerEngine.insertMicroBreaks(mockUser.id, currentTime);

      res.json({
        breaksAdded: breaks.length,
        breaks: breaks.map(b => ({
          id: b.id,
          title: b.title,
          start: b.start?.toISOString(),
          end: b.end?.toISOString(),
          notes: b.notes,
        })),
      });
    } catch (error) {
      console.error("Recompute breaks error:", error);
      res.status(500).json({ error: "Failed to recompute breaks" });
    }
  });

  // Toggle automatic break insertion
  app.post("/api/breaks/auto-toggle", async (req, res) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      const updatedUser = await storage.updateUser(mockUser.id, {
        autoBreaks: enabled,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        autoBreaks: updatedUser.autoBreaks,
      });
    } catch (error) {
      console.error("Auto-toggle breaks error:", error);
      res.status(500).json({ error: "Failed to toggle auto breaks" });
    }
  });

  // Set water goal
  app.post("/api/hydration/goal", async (req, res) => {
    try {
      const { mlPerDay } = req.body;

      if (!mlPerDay || typeof mlPerDay !== "number" || mlPerDay <= 0) {
        return res.status(400).json({ error: "Valid mlPerDay is required" });
      }

      const updatedUser = await storage.updateUser(mockUser.id, {
        waterGoalMl: mlPerDay,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ waterGoalMl: updatedUser.waterGoalMl });
    } catch (error) {
      console.error("Set water goal error:", error);
      res.status(500).json({ error: "Failed to set water goal" });
    }
  });

  // Ingest health data
  app.post("/api/health/ingest", async (req, res) => {
    try {
      const { waterMl, sedentaryMinutes, activeMinutes, sleepHours } = req.body;

      await healthService.ingestHealthData(mockUser.id, {
        waterMl,
        sedentaryMinutes,
        activeMinutes,
        sleepHours,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Ingest health data error:", error);
      res.status(500).json({ error: "Failed to ingest health data" });
    }
  });

  // Get pending notifications
  app.get("/api/notifications", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const now = dayjs().tz(timezone).toDate();
      
      const notifications = await storage.getPendingNotifications(mockUser.id, now);
      res.json({ notifications });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  // Acknowledge notification with action
  app.post("/api/notifications/ack", async (req, res) => {
    try {
      const { notificationId, action, timezone = "Asia/Riyadh" } = req.body;

      if (!notificationId || !action) {
        return res.status(400).json({ error: "notificationId and action are required" });
      }

      if (!["accept", "dismiss", "snooze"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept', 'dismiss', or 'snooze'" });
      }

      const notification = await storage.getPendingNotifications(mockUser.id, new Date());
      const targetNotification = notification.find(n => n.id === notificationId);

      if (!targetNotification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      const now = dayjs().tz(timezone);

      if (action === "accept") {
        // Apply the suggestion from payload
        if (targetNotification.kind === "suggestStart" && targetNotification.payload.itemId) {
          // Move the item to the suggested time slot
          const item = await storage.getItem(targetNotification.payload.itemId, mockUser.id);
          if (item && item.start) {
            const newStart = now.toDate();
            const newEnd = now.add(item.durationMinutes || 30, 'minutes').toDate();
            
            await storage.updateItem(targetNotification.payload.itemId, mockUser.id, {
              start: newStart,
              end: newEnd,
            });

            // Log the move event
            await storage.logEvent({
              userId: mockUser.id,
              kind: 'item_moved',
              itemId: targetNotification.payload.itemId,
              context: {
                startPlanned: item.start.toISOString(),
                startActual: newStart.toISOString(),
              },
            });
          }
        } else if (targetNotification.kind === "rescheduleMiss" && targetNotification.payload.itemId) {
          // Reschedule the missed item
          const newStart = dayjs(targetNotification.payload.toSlot).tz(timezone).toDate();
          const item = await storage.getItem(targetNotification.payload.itemId, mockUser.id);
          if (item) {
            const newEnd = dayjs(newStart).add(item.durationMinutes || 30, 'minutes').toDate();
            
            await storage.updateItem(targetNotification.payload.itemId, mockUser.id, {
              start: newStart,
              end: newEnd,
            });

            // Log the reschedule event
            await storage.logEvent({
              userId: mockUser.id,
              kind: 'plan_autorescheduled',
              itemId: targetNotification.payload.itemId,
              context: {
                startActual: newStart.toISOString(),
              },
            });
          }
        } else if (targetNotification.kind === "water") {
          // Log water intake (500ml default)
          await healthService.ingestHealthData(mockUser.id, { waterMl: 500 });
        } else if (targetNotification.kind === "sitBreak") {
          // Create a 5-minute walk break
          const breakStart = now.toDate();
          const breakEnd = now.add(5, 'minutes').toDate();
          
          await storage.createItem({
            userId: mockUser.id,
            type: 'breakTime',
            title: '🚶 Quick Walk Break',
            start: breakStart,
            end: breakEnd,
            durationMinutes: 5,
            fixed: false,
            priority: 'normal',
          });
        }

        await storage.markNotificationSent(notificationId, now.toDate());
        res.json({ success: true, message: "Notification accepted and applied" });
      } else if (action === "snooze") {
        // Update scheduled to now + 15 minutes
        const snoozeUntil = now.add(15, 'minutes').toDate();
        await storage.dismissNotification(notificationId);
        
        // Create a new notification with snoozed schedule
        await storage.createNotification({
          userId: mockUser.id,
          kind: targetNotification.kind as any,
          payload: targetNotification.payload,
          scheduled: snoozeUntil,
          sentAt: null,
        });

        res.json({ success: true, message: "Notification snoozed for 15 minutes" });
      } else if (action === "dismiss") {
        await storage.dismissNotification(notificationId);
        res.json({ success: true, message: "Notification dismissed" });
      }
    } catch (error) {
      console.error("Acknowledge notification error:", error);
      res.status(500).json({ error: "Failed to acknowledge notification" });
    }
  });

  // Manually trigger notification checks
  app.post("/api/notifications/check", async (req, res) => {
    try {
      const { timezone = "Asia/Riyadh" } = req.body;
      const now = dayjs().tz(timezone);
      const createdNotifications = [];

      // Check for missed blocks (items with end time < now and no item_done event)
      const recentItems = await storage.getItems(mockUser.id, {
        start: now.subtract(4, 'hours').toDate(),
        end: now.toDate(),
      });

      for (const item of recentItems) {
        if (!item.end || !item.start || item.done || item.type === "breakTime" || item.type === "leisure") {
          continue;
        }

        const itemEnd = dayjs(item.end).tz(timezone);
        if (itemEnd.isBefore(now)) {
          // Check if there's an item_done event for this item
          const events = await storage.getRecentEvents(mockUser.id, 1);
          const hasDoneEvent = events.some(e => e.itemId === item.id && e.kind === 'item_done');

          if (!hasDoneEvent) {
            // This item was missed, propose reschedule
            const proposal = await plannerEngine.proposeReschedule(mockUser.id, item.id, now.toDate(), timezone);
            
            if (proposal) {
              // Check if we already have a notification for this item
              const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
              const alreadyNotified = existingNotifications.some(
                n => n.payload.itemId === item.id && n.kind === 'rescheduleMiss'
              );

              if (!alreadyNotified) {
                const notification = await storage.createNotification({
                  userId: mockUser.id,
                  kind: 'rescheduleMiss',
                  payload: {
                    itemId: proposal.itemId,
                    toSlot: proposal.toSlot,
                    message: proposal.message,
                  },
                  scheduled: now.toDate(),
                  sentAt: null,
                });
                createdNotifications.push(notification);
              }
            }
          }
        }
      }

      // Check for free time opportunities
      const earlierStartProposal = await plannerEngine.proposeEarlierStart(mockUser.id, now.toDate(), timezone);
      
      if (earlierStartProposal) {
        // Check if we already have a notification for this
        const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
        const alreadyNotified = existingNotifications.some(
          n => n.payload.itemId === earlierStartProposal.itemId && n.kind === 'suggestStart'
        );

        if (!alreadyNotified) {
          const notification = await storage.createNotification({
            userId: mockUser.id,
            kind: 'suggestStart',
            payload: {
              itemId: earlierStartProposal.itemId,
              fromSlot: earlierStartProposal.fromSlot,
              toSlot: earlierStartProposal.toSlot,
              message: earlierStartProposal.message,
            },
            scheduled: now.toDate(),
            sentAt: null,
          });
          createdNotifications.push(notification);
        }
      }

      const user = await storage.getUser(mockUser.id);
      if (user && user.autoBreaks) {
        await plannerEngine.insertMicroBreaks(mockUser.id, now.toDate());
      }

      const waterCheck = await healthService.checkWaterReminder(mockUser.id, now.toDate());
      if (waterCheck.shouldRemind) {
        const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
        const alreadyNotified = existingNotifications.some(n => n.kind === 'water');

        if (!alreadyNotified) {
          const notification = await storage.createNotification({
            userId: mockUser.id,
            kind: 'water',
            payload: {
              message: waterCheck.message,
            },
            scheduled: now.toDate(),
            sentAt: null,
          });
          createdNotifications.push(notification);
        }
      }

      const sitBreakCheck = await healthService.checkSitBreakReminder(mockUser.id, now.toDate());
      if (sitBreakCheck.shouldRemind) {
        const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
        const alreadyNotified = existingNotifications.some(n => n.kind === 'sitBreak');

        if (!alreadyNotified) {
          const notification = await storage.createNotification({
            userId: mockUser.id,
            kind: 'sitBreak',
            payload: {
              message: sitBreakCheck.message,
            },
            scheduled: now.toDate(),
            sentAt: null,
          });
          createdNotifications.push(notification);
        }
      }

      res.json({
        success: true,
        created: createdNotifications.length,
        notifications: createdNotifications,
      });
    } catch (error) {
      console.error("Check notifications error:", error);
      res.status(500).json({ error: "Failed to check notifications" });
    }
  });

  // Get weekly summary for specific week
  app.get("/api/weekly/summary", async (req, res) => {
    try {
      const weekStartParam = req.query.weekStart as string | undefined;
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      
      // Default to last Monday if not provided
      const weekStart = weekStartParam
        ? dayjs(weekStartParam).tz(timezone).startOf('day').toDate()
        : dayjs().tz(timezone).startOf('week').toDate();

      const summary = await weeklyService.generateWeeklySummary(mockUser.id, weekStart);
      
      res.json(summary);
    } catch (error) {
      console.error("Get weekly summary error:", error);
      res.status(500).json({ error: "Failed to get weekly summary" });
    }
  });

  // Get recent weekly summaries
  app.get("/api/weekly/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 4;
      
      const summaries = await storage.getRecentWeeklySummaries(mockUser.id, limit);
      
      res.json(summaries);
    } catch (error) {
      console.error("Get recent summaries error:", error);
      res.status(500).json({ error: "Failed to get recent summaries" });
    }
  });

  // Manually trigger weekly summary generation
  app.post("/api/weekly/generate", async (req, res) => {
    try {
      const { weekStart: weekStartParam, timezone: userTimezone } = req.body;
      const timezone = userTimezone || "Asia/Riyadh";
      
      // Default to last Monday if not provided
      const weekStart = weekStartParam
        ? dayjs(weekStartParam).tz(timezone).startOf('day').toDate()
        : dayjs().tz(timezone).startOf('week').toDate();

      const summary = await weeklyService.generateWeeklySummary(mockUser.id, weekStart);
      
      // Optional: Update habit learning based on insights (future enhancement)
      // This could analyze the notes and adjust learning preferences
      
      res.json({
        success: true,
        summary,
      });
    } catch (error) {
      console.error("Generate weekly summary error:", error);
      res.status(500).json({ error: "Failed to generate weekly summary" });
    }
  });

  // Get workout preferences
  app.get("/api/workout/prefs", async (req, res) => {
    try {
      const preferences = await storage.getWorkoutPreferences(mockUser.id);
      res.json({ preferences });
    } catch (error) {
      console.error("Get workout preferences error:", error);
      res.status(500).json({ error: "Failed to get workout preferences" });
    }
  });

  // Set/update workout preferences
  app.post("/api/workout/prefs", async (req, res) => {
    try {
      const { perWeek, defaultDurationMin, preferredWindows } = req.body;

      if (typeof perWeek !== "number" || perWeek < 1 || perWeek > 7) {
        return res.status(400).json({ error: "perWeek must be between 1 and 7" });
      }

      if (typeof defaultDurationMin !== "number" || defaultDurationMin < 15 || defaultDurationMin > 240) {
        return res.status(400).json({ error: "defaultDurationMin must be between 15 and 240" });
      }

      if (preferredWindows && !Array.isArray(preferredWindows)) {
        return res.status(400).json({ error: "preferredWindows must be an array" });
      }

      const preferences = await storage.upsertWorkoutPreferences({
        userId: mockUser.id,
        perWeek,
        defaultDurationMin,
        preferredWindows: preferredWindows || null,
      });

      res.json({ preferences });
    } catch (error) {
      console.error("Set workout preferences error:", error);
      res.status(500).json({ error: "Failed to set workout preferences" });
    }
  });

  // Plan workouts for a week
  app.post("/api/workout/plan", async (req, res) => {
    try {
      const { weekStart: weekStartParam, timezone: userTimezone } = req.body;
      const timezone = userTimezone || "Asia/Riyadh";

      const weekStart = weekStartParam
        ? dayjs(weekStartParam).tz(timezone).toDate()
        : dayjs().tz(timezone).startOf('isoWeek').toDate();

      const workouts = await gymService.planWeeklyWorkouts(mockUser.id, weekStart, timezone);
      const streakStatus = await gymService.checkStreakStatus(mockUser.id, timezone);

      res.json({
        workouts,
        streakProtected: streakStatus.protected,
      });
    } catch (error) {
      console.error("Plan workouts error:", error);
      res.status(500).json({ error: "Failed to plan workouts" });
    }
  });

  // Get streak status
  app.get("/api/workout/streak", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const streakStatus = await gymService.checkStreakStatus(mockUser.id, timezone);
      res.json(streakStatus);
    } catch (error) {
      console.error("Get streak status error:", error);
      res.status(500).json({ error: "Failed to get streak status" });
    }
  });

  // Get daily rollup
  app.get("/api/daily-rollup", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const today = dayjs().tz(timezone).format("YYYY-MM-DD");
      
      const rollup = await storage.getDailyRollup(mockUser.id, today);
      
      res.json(rollup || {
        date: today,
        focusBlocksCompleted: 0,
        snoozes: 0,
        skips: 0,
        sleepHours: null,
        waterMl: null,
      });
    } catch (error) {
      console.error("Get daily rollup error:", error);
      res.status(500).json({ error: "Failed to get daily rollup" });
    }
  });

  // Manually update daily rollup
  app.post("/api/daily-rollup", async (req, res) => {
    try {
      const { timezone = "Asia/Riyadh" } = req.body;
      
      // For now, this is a placeholder. Could trigger recalculation of rollup
      res.json({ success: true });
    } catch (error) {
      console.error("Update daily rollup error:", error);
      res.status(500).json({ error: "Failed to update daily rollup" });
    }
  });

  // Chat parse endpoint
  app.post("/api/chat/parse", async (req, res) => {
    try {
      const { message, timezone = "Asia/Riyadh" } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const parsed = await llmService.parseIntent(message, timezone);

      const intent = parsedIntentSchema.parse(parsed);

      const result = await plannerEngine.applyIntent(intent, mockUser.id, timezone);

      res.json({
        intent,
        items: result.items,
        changes: result.changes,
        message: result.changes.join(". ") || "No changes made",
      });
    } catch (error: any) {
      console.error("Chat parse error:", error);

      if (error.message === "Failed to parse intent") {
        return res.status(400).json({ error: "Could not understand the command. Try rephrasing." });
      }

      res.status(500).json({ error: "Failed to process message" });
    }
  });
        headers: {
          contentType: "application/json",
          corsEnabled: true,
          requiredHeaders: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          }
        },
        commonErrors: {
          "400": {
            description: "Bad Request - Invalid input parameters",
            example: { error: "Message is required" }
          },
          "401": {
            description: "Unauthorized - Authentication required or invalid",
            example: { error: "Gmail not connected" }
          },
          "404": {
            description: "Not Found - Resource doesn't exist",
            example: { error: "Task not found" }
          },
          "500": {
            description: "Internal Server Error - Something went wrong on the server",
            example: { error: "Failed to process message" }
          }
        },
        categories: {
          chat: {
            name: "Chat & AI Planning",
            description: "Natural language command processing and intelligent planning",
            endpoints: [
              {
                method: "POST",
                path: "/api/chat/parse",
                description: "Parse natural language commands and create/update tasks using AI",
                requestBody: {
                  message: "string (required) - Natural language command",
                  timezone: "string (optional) - Timezone, defaults to 'Asia/Riyadh'"
                },
                requestExample: {
                  message: "Add meeting with team tomorrow at 2pm for 1 hour",
                  timezone: "Asia/Riyadh"
                },
                responseExample: {
                  intent: { kind: "addMeeting", title: "Meeting with team", start: "2025-10-06T14:00:00Z" },
                  items: [{ id: "abc-123", title: "Meeting with team", type: "meeting" }],
                  changes: ["Added meeting on Oct 6 at 2:00 PM"],
                  message: "Added meeting on Oct 6 at 2:00 PM"
                }
              },
              {
                method: "GET",
                path: "/api/next",
                description: "Get the next 3 recommended actions based on current time and priorities",
                queryParams: {
                  timezone: "string (optional) - User timezone, defaults to 'Asia/Riyadh'"
                },
                responseExample: {
                  items: [
                    { id: "abc", title: "Study Math", type: "study", start: "2025-10-05T10:00:00Z", durationMinutes: 60 }
                  ]
                }
              },
              {
                method: "GET",
                path: "/api/plan/explain/:itemId",
                description: "Get AI explanation for why a specific task was scheduled at its current time",
                pathParams: {
                  itemId: "string (required) - ID of the item to explain"
                },
                queryParams: {
                  timezone: "string (optional) - User timezone"
                },
                responseExample: {
                  itemId: "abc-123",
                  explanation: "Scheduled during your most productive morning hours based on your completion patterns",
                  factors: ["High energy window", "No conflicts", "Optimal focus time"]
                }
              }
            ]
          },
          tasks: {
            name: "Tasks",
            description: "Manage tasks and to-do items",
            endpoints: [
              {
                method: "GET",
                path: "/api/tasks",
                description: "Get all tasks grouped by time period (today, this week, later)",
                queryParams: {
                  timezone: "string (optional) - User timezone"
                },
                responseExample: {
                  today: [{ id: "abc", title: "Study", type: "study", done: false }],
                  thisWeek: [{ id: "def", title: "Project", type: "project", done: false }],
                  later: [{ id: "ghi", title: "Reading", type: "reading", done: false }],
                  all: []
                }
              },
              {
                method: "PATCH",
                path: "/api/tasks/:id",
                description: "Update a task (mark as done, change title, etc.)",
                pathParams: {
                  id: "string (required) - Task ID"
                },
                requestBody: {
                  done: "boolean (optional) - Mark task as complete",
                  title: "string (optional) - Update task title",
                  notes: "string (optional) - Update task notes"
                },
                requestExample: { done: true },
                responseExample: {
                  id: "abc-123",
                  title: "Study Math",
                  done: true,
                  type: "study"
                }
              },
              {
                method: "POST",
                path: "/api/tasks/:id/snooze",
                description: "Snooze a task to a later time",
                pathParams: {
                  id: "string (required) - Task ID"
                },
                requestBody: {
                  snoozeUntil: "string (required) - ISO 8601 timestamp for when task should be rescheduled"
                },
                requestExample: { snoozeUntil: "2025-10-05T15:00:00Z" },
                responseExample: {
                  id: "abc-123",
                  title: "Study Math",
                  start: "2025-10-05T15:00:00Z"
                }
              },
              {
                method: "POST",
                path: "/api/tasks/:id/skip",
                description: "Skip/delete a task permanently",
                pathParams: {
                  id: "string (required) - Task ID"
                },
                responseExample: {
                  success: true,
                  message: "Task skipped"
                }
              }
            ]
          },
          calendar: {
            name: "Calendar",
            description: "View and manage calendar events",
            endpoints: [
              {
                method: "GET",
                path: "/api/calendar",
                description: "Get calendar events for a specific week",
                queryParams: {
                  timezone: "string (optional) - User timezone",
                  weekStart: "string (optional) - ISO date for week start, defaults to current week"
                },
                responseExample: {
                  items: [{ id: "abc", title: "Meeting", start: "2025-10-05T10:00:00Z", end: "2025-10-05T11:00:00Z" }],
                  weekStart: "2025-09-30T00:00:00Z",
                  weekEnd: "2025-10-06T23:59:59Z"
                }
              }
            ]
          },
          templates: {
            name: "Templates",
            description: "Pre-built task templates for common scenarios (exams, projects, etc.)",
            endpoints: [
              {
                method: "GET",
                path: "/api/templates",
                description: "Get list of available task templates",
                responseExample: {
                  templates: ["exam", "presentation", "homework", "project", "reading", "lab"]
                }
              },
              {
                method: "POST",
                path: "/api/templates/apply",
                description: "Apply a template to create multiple related tasks",
                requestBody: {
                  template: "string (required) - Template name (exam, presentation, homework, project, reading, lab)",
                  params: "object (required) - Template-specific parameters",
                  timezone: "string (optional) - User timezone"
                },
                requestExample: {
                  template: "exam",
                  params: { subject: "Math", date: "2025-10-15" },
                  timezone: "Asia/Riyadh"
                },
                responseExample: {
                  items: [{ id: "abc", title: "Study Math - Review", type: "study" }],
                  message: "Created exam preparation plan for Math with 5 items"
                }
              }
            ]
          },
          user: {
            name: "User",
            description: "User profile and daily state management",
            endpoints: [
              {
                method: "GET",
                path: "/api/user",
                description: "Get current user profile",
                responseExample: {
                  id: "user-123",
                  username: "demo",
                  timezone: "Asia/Riyadh",
                  autoBreaks: false,
                  waterGoalMl: 2000
                }
              },
              {
                method: "GET",
                path: "/api/day-state",
                description: "Get current day's state (mood, early work flag)",
                queryParams: {
                  timezone: "string (optional) - User timezone"
                },
                responseExample: {
                  id: "state-123",
                  userId: "user-123",
                  date: "2025-10-05",
                  mood: "energized",
                  hasEarlyWorkTomorrow: false
                }
              }
            ]
          },
          mood: {
            name: "Mood & Wellbeing",
            description: "Track mood and energy levels for intelligent scheduling",
            endpoints: [
              {
                method: "POST",
                path: "/api/mood",
                description: "Set mood for the day (affects task scheduling)",
                requestBody: {
                  mood: "string (required) - One of: 'energized', 'focused', 'tired', 'stressed', 'none'",
                  timezone: "string (optional) - User timezone"
                },
                requestExample: { mood: "energized", timezone: "Asia/Riyadh" },
                responseExample: {
                  success: true,
                  dayState: { mood: "energized", hasEarlyWorkTomorrow: false }
                }
              },
              {
                method: "POST",
                path: "/api/mood/checkin",
                description: "Provide feedback on task difficulty after completion (micro-mood check-in)",
                requestBody: {
                  afterItemId: "string (required) - ID of completed task",
                  rating: "string (required) - 'easy', 'ok', or 'hard'"
                },
                requestExample: { afterItemId: "abc-123", rating: "easy" },
                responseExample: {
                  updatedDuration: 45,
                  message: "Great! Future study tasks will be shorter (45 min)."
                }
              },
              {
                method: "POST",
                path: "/api/early-work",
                description: "Indicate if you have early work tomorrow (adjusts tomorrow's schedule)",
                requestBody: {
                  earlyWork: "boolean (required) - True if early work tomorrow",
                  timezone: "string (optional) - User timezone"
                },
                requestExample: { earlyWork: true },
                responseExample: {
                  success: true,
                  dayState: { hasEarlyWorkTomorrow: true }
                }
              }
            ]
          },
          learning: {
            name: "Learning & Preferences",
            description: "AI learning system that adapts to your patterns",
            endpoints: [
              {
                method: "GET",
                path: "/api/learning/preferences",
                description: "Get learning preferences and statistics",
                responseExample: {
                  preferences: {
                    preferEvening: false,
                    maxContinuousFocus: 90,
                    pinnedWindows: [],
                    bannedWindows: [{ weekday: "Fri", hour: 23 }]
                  },
                  stats: {
                    topWindows: [{ weekday: "Mon", hour: 9, score: 0.95 }],
                    learnedLengths: { study: 60, meeting: 45 },
                    totalEvents: 150,
                    daysTracked: 30
                  }
                }
              },
              {
                method: "PATCH",
                path: "/api/learning/preferences",
                description: "Update learning preferences",
                requestBody: {
                  preferEvening: "boolean (optional) - Prefer evening slots",
                  maxContinuousFocus: "number (optional) - Max continuous focus time in minutes (30-120)",
                  pinnedWindows: "array (optional) - Time windows to prefer",
                  bannedWindows: "array (optional) - Time windows to avoid"
                },
                requestExample: { preferEvening: true, maxContinuousFocus: 90 },
                responseExample: {
                  preferences: { preferEvening: true, maxContinuousFocus: 90 }
                }
              },
              {
                method: "POST",
                path: "/api/learning/update",
                description: "Manually trigger daily learning update",
                requestBody: { timezone: "string (optional)" },
                responseExample: {
                  success: true,
                  message: "Daily learning update completed",
                  stats: { learnedLengths: { study: 65 } }
                }
              },
              {
                method: "POST",
                path: "/api/learning/reset",
                description: "Reset learning data to defaults",
                responseExample: {
                  success: true,
                  message: "Learning data reset to defaults"
                }
              },
              {
                method: "GET",
                path: "/api/learning/insights",
                description: "Get insights about your productivity patterns",
                responseExample: {
                  weekdayPatterns: { Mon: 0.85, Tue: 0.78 },
                  hourlyPatterns: { "09": 0.92, "14": 0.65 },
                  recentTrends: { completionRate: 0.8, avgSnoozes: 1.2, avgSkips: 0.5 }
                }
              }
            ]
          },
          breaks: {
            name: "Breaks",
            description: "Automatic break insertion for better focus",
            endpoints: [
              {
                method: "POST",
                path: "/api/breaks/recompute",
                description: "Manually trigger break insertion between tasks",
                requestBody: { now: "string (optional) - ISO timestamp" },
                responseExample: {
                  breaksAdded: 3,
                  breaks: [{ id: "break-1", title: "5min break", start: "2025-10-05T11:00:00Z" }]
                }
              },
              {
                method: "POST",
                path: "/api/breaks/auto-toggle",
                description: "Enable/disable automatic break insertion",
                requestBody: { enabled: "boolean (required)" },
                requestExample: { enabled: true },
                responseExample: { autoBreaks: true }
              }
            ]
          },
          health: {
            name: "Health & Hydration",
            description: "Track water intake and health metrics",
            endpoints: [
              {
                method: "POST",
                path: "/api/hydration/goal",
                description: "Set daily water intake goal",
                requestBody: { mlPerDay: "number (required) - Water goal in milliliters" },
                requestExample: { mlPerDay: 2500 },
                responseExample: { waterGoalMl: 2500 }
              },
              {
                method: "POST",
                path: "/api/health/ingest",
                description: "Ingest health data from external sources (Apple Health, etc.)",
                requestBody: {
                  date: "string (required) - ISO date",
                  sleepHours: "number (optional) - Hours of sleep",
                  steps: "number (optional) - Step count",
                  activeMinutes: "number (optional) - Active minutes",
                  waterMl: "number (optional) - Water intake in ml"
                },
                requestExample: {
                  date: "2025-10-05",
                  sleepHours: 7.5,
                  steps: 8500,
                  waterMl: 1800
                },
                responseExample: { success: true, message: "Health data recorded" }
              },
              {
                method: "POST",
                path: "/api/health/log-water",
                description: "Log water intake",
                requestBody: { ml: "number (required) - Amount in milliliters" },
                requestExample: { ml: 250 },
                responseExample: {
                  totalToday: 1500,
                  goal: 2000,
                  remaining: 500
                }
              },
              {
                method: "GET",
                path: "/api/health/today",
                description: "Get today's health summary",
                queryParams: { timezone: "string (optional)" },
                responseExample: {
                  waterMl: 1500,
                  waterGoalMl: 2000,
                  steps: 8500,
                  sleepHours: 7.5,
                  lastWaterLog: "2025-10-05T14:30:00Z"
                }
              },
              {
                method: "GET",
                path: "/api/settings",
                description: "Get user settings",
                responseExample: {
                  waterGoalMl: 2000,
                  autoBreaks: false,
                  timezone: "Asia/Riyadh"
                }
              },
              {
                method: "POST",
                path: "/api/settings",
                description: "Update user settings",
                requestBody: {
                  waterGoalMl: "number (optional)",
                  autoBreaks: "boolean (optional)",
                  timezone: "string (optional)"
                },
                requestExample: { waterGoalMl: 2500, autoBreaks: true },
                responseExample: { success: true }
              }
            ]
          },
          dailyRollup: {
            name: "Daily Rollup",
            description: "Daily summary and statistics",
            endpoints: [
              {
                method: "GET",
                path: "/api/daily-rollup",
                description: "Get today's activity rollup",
                queryParams: { timezone: "string (optional)" },
                responseExample: {
                  date: "2025-10-05",
                  focusBlocksCompleted: 5,
                  snoozes: 2,
                  skips: 1,
                  sleepHours: 7.5,
                  waterMl: 1800
                }
              },
              {
                method: "POST",
                path: "/api/daily-rollup",
                description: "Manually update daily rollup",
                requestBody: { timezone: "string (optional)" },
                responseExample: { success: true }
              }
            ]
          },
          notifications: {
            name: "Notifications",
            description: "Smart notifications and reminders",
            endpoints: [
              {
                method: "GET",
                path: "/api/notifications",
                description: "Get pending notifications",
                queryParams: { timezone: "string (optional)" },
                responseExample: {
                  notifications: [
                    {
                      id: "notif-123",
                      kind: "water",
                      payload: { message: "Time to hydrate!" },
                      scheduled: "2025-10-05T15:00:00Z"
                    }
                  ]
                }
              },
              {
                method: "POST",
                path: "/api/notifications/:id/action",
                description: "Take action on a notification (accept, snooze, dismiss)",
                pathParams: { id: "string (required) - Notification ID" },
                requestBody: {
                  action: "string (required) - 'accept', 'snooze', or 'dismiss'",
                  snoozeMinutes: "number (optional) - Minutes to snooze (default 15)"
                },
                requestExample: { action: "snooze", snoozeMinutes: 15 },
                responseExample: { success: true, message: "Notification snoozed for 15 minutes" }
              },
              {
                method: "POST",
                path: "/api/notifications/check",
                description: "Manually trigger notification checks (missed tasks, breaks, water reminders)",
                requestBody: { timezone: "string (optional)" },
                responseExample: {
                  success: true,
                  created: 2,
                  notifications: []
                }
              }
            ]
          },
          weekly: {
            name: "Weekly Summary",
            description: "Weekly reflection and AI-generated insights",
            endpoints: [
              {
                method: "GET",
                path: "/api/weekly/summary",
                description: "Get weekly summary for a specific week",
                queryParams: {
                  weekStart: "string (optional) - ISO date for Monday of the week",
                  timezone: "string (optional)"
                },
                responseExample: {
                  id: "summary-123",
                  weekStart: "2025-09-30",
                  completionRate: 0.85,
                  totalFocusMinutes: 1200,
                  topPerformanceDay: "Monday",
                  aiNotes: "Strong week overall. Productivity peaked on Monday mornings."
                }
              },
              {
                method: "GET",
                path: "/api/weekly/recent",
                description: "Get recent weekly summaries",
                queryParams: { limit: "number (optional) - Number of summaries to return, default 4" },
                responseExample: [
                  { id: "sum-1", weekStart: "2025-09-30", completionRate: 0.85 }
                ]
              },
              {
                method: "POST",
                path: "/api/weekly/generate",
                description: "Manually generate weekly summary",
                requestBody: {
                  weekStart: "string (optional) - ISO date",
                  timezone: "string (optional)"
                },
                responseExample: {
                  success: true,
                  summary: { id: "sum-123", completionRate: 0.85 }
                }
              }
            ]
          },
          gmail: {
            name: "Gmail Integration",
            description: "Gmail integration for automatic event/task creation",
            endpoints: [
              {
                method: "GET",
                path: "/api/gmail/status",
                description: "Check Gmail connection status",
                responseExample: {
                  connected: true,
                  emailAddress: "user@gmail.com",
                  lastSyncAt: "2025-10-05T10:00:00Z"
                }
              },
              {
                method: "POST",
                path: "/api/gmail/sync",
                description: "Manually trigger Gmail sync to import events/tasks",
                requestBody: { timezone: "string (optional)" },
                responseExample: {
                  success: true,
                  itemsCreated: 3,
                  categories: { meetings: 2, deadlines: 1 }
                }
              },
              {
                method: "GET",
                path: "/api/gmail/connection-info",
                description: "Get Gmail connection information",
                responseExample: {
                  connected: true,
                  lastSync: "2025-10-05T10:00:00Z"
                }
              }
            ]
          },
          workout: {
            name: "Workout & Gym",
            description: "Workout planning and streak tracking",
            endpoints: [
              {
                method: "GET",
                path: "/api/workout/prefs",
                description: "Get workout preferences",
                responseExample: {
                  preferences: {
                    perWeek: 3,
                    defaultDurationMin: 60,
                    preferredWindows: [{ weekday: "Mon", hour: 18 }]
                  }
                }
              },
              {
                method: "POST",
                path: "/api/workout/prefs",
                description: "Set/update workout preferences",
                requestBody: {
                  perWeek: "number (required) - Workouts per week (1-7)",
                  defaultDurationMin: "number (required) - Duration in minutes (15-240)",
                  preferredWindows: "array (optional) - Preferred time windows"
                },
                requestExample: {
                  perWeek: 4,
                  defaultDurationMin: 45,
                  preferredWindows: [{ weekday: "Mon", hour: 18 }]
                },
                responseExample: { preferences: { perWeek: 4, defaultDurationMin: 45 } }
              },
              {
                method: "POST",
                path: "/api/workout/plan",
                description: "Plan workouts for a week",
                requestBody: {
                  weekStart: "string (optional) - ISO date",
                  timezone: "string (optional)"
                },
                responseExample: {
                  workouts: [{ id: "workout-1", start: "2025-10-05T18:00:00Z", durationMinutes: 45 }],
                  streakProtected: true
                }
              },
              {
                method: "GET",
                path: "/api/workout/streak",
                description: "Get workout streak status",
                queryParams: { timezone: "string (optional)" },
                responseExample: {
                  streakDays: 7,
                  lastWorkout: "2025-10-04",
                  protected: true,
                  protectionExpiresAt: "2025-10-06T23:59:59Z"
                }
              }
            ]
          }
        },
        swiftIntegrationNotes: {
          networking: "Use URLSession for HTTP requests. All endpoints return JSON.",
          models: "Create Codable structs matching the response schemas for type-safe parsing.",
          errorHandling: "Handle HTTP status codes and parse error JSON objects.",
          timezones: "Send user's timezone in requests. Use ISO 8601 format for all dates.",
          example: `
// Swift example for fetching tasks
struct Task: Codable {
    let id: String
    let title: String
    let type: String
    let done: Bool
    let start: Date?
}

struct TasksResponse: Codable {
    let today: [Task]
    let thisWeek: [Task]
    let later: [Task]
}

func fetchTasks() async throws -> TasksResponse {
    let url = URL(string: "https://your-api.com/api/tasks?timezone=Asia/Riyadh")!
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONDecoder().decode(TasksResponse.self, from: data)
}
          `.trim()
        }
      };

      res.json(docs);
    } catch (error) {
      console.error("API docs error:", error);
      res.status(500).json({ error: "Failed to generate API documentation" });
    }
  });

  // Chat parsing endpoint
  app.post("/api/chat/parse", async (req, res) => {
    try {
      const { message, timezone = "Asia/Riyadh" } = req.body;
      
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      const intent = await llmService.parseCommand(message, timezone);
      const result = await plannerEngine.applyIntent(intent, mockUser.id, timezone);
      
      res.json({
        intent,
        items: result.items,
        changes: result.changes,
        message: result.changes.join(". "),
      });
    } catch (error) {
      console.error("Chat parse error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Get available templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = templateService.getAvailableTemplates();
      res.json({ templates });
    } catch (error) {
      console.error("Templates list error:", error);
      res.status(500).json({ error: "Failed to get templates" });
    }
  });

  // Apply a template
  app.post("/api/templates/apply", async (req, res) => {
    try {
      const { template, params, timezone = "Asia/Riyadh" } = req.body;

      if (!template || !params) {
        return res.status(400).json({ error: "Template and params are required" });
      }

      let items: Item[] = [];
      let message = "";

      switch (template) {
        case "exam":
          if (!params.subject || !params.date) {
            return res.status(400).json({ error: "Subject and date are required for exam template" });
          }
          items = await templateService.applyExamTemplate(mockUser.id, params, timezone);
          message = `Created exam preparation plan for ${params.subject} with ${items.length} items`;
          break;

        case "presentation":
          if (!params.topic || !params.date) {
            return res.status(400).json({ error: "Topic and date are required for presentation template" });
          }
          items = await templateService.applyPresentationTemplate(mockUser.id, params, timezone);
          message = `Created presentation plan for ${params.topic} with ${items.length} tasks`;
          break;

        case "homework":
          if (!params.subject || !params.deadline) {
            return res.status(400).json({ error: "Subject and deadline are required for homework template" });
          }
          items = await templateService.applyHomeworkTemplate(mockUser.id, params, timezone);
          message = `Created homework assignment for ${params.subject}`;
          break;

        case "project":
          if (!params.name || !params.deadline || !params.phases || !Array.isArray(params.phases)) {
            return res.status(400).json({ error: "Name, deadline, and phases array are required for project template" });
          }
          items = await templateService.applyProjectTemplate(mockUser.id, params, timezone);
          message = `Created project plan for ${params.name} with ${items.length} milestones`;
          break;

        case "reading":
          if (!params.title || !params.pages || !params.deadline) {
            return res.status(400).json({ error: "Title, pages, and deadline are required for reading template" });
          }
          items = await templateService.applyReadingTemplate(mockUser.id, params, timezone);
          message = `Created reading plan for ${params.title} with ${items.length} sessions`;
          break;

        case "lab":
          if (!params.subject || !params.labDate) {
            return res.status(400).json({ error: "Subject and labDate are required for lab template" });
          }
          items = await templateService.applyLabTemplate(mockUser.id, params, timezone);
          message = `Created lab plan for ${params.subject} with ${items.length} tasks`;
          break;

        default:
          return res.status(400).json({ error: `Unknown template: ${template}` });
      }

      res.json({ items, message });
    } catch (error) {
      console.error("Template apply error:", error);
      res.status(500).json({ error: "Failed to apply template" });
    }
  });

  // Get Gmail connection status
  app.get("/api/gmail/status", async (req, res) => {
    try {
      const gmailState = await storage.getGmailState(MOCK_USER_ID);
      
      res.json({
        connected: !!gmailState,
        emailAddress: gmailState?.emailAddress || null,
        lastSyncAt: gmailState?.updatedAt?.toISOString() || null,
      });
    } catch (error) {
      console.error("Gmail status error:", error);
      res.status(500).json({ error: "Failed to get Gmail status" });
    }
  });

  // Manually trigger Gmail sync
  app.post("/api/gmail/sync", async (req, res) => {
    try {
      const { timezone = "Asia/Riyadh" } = req.body;
      const result = await gmailService.syncUserGmail(MOCK_USER_ID, timezone);
      
      res.json({
        success: true,
        itemsCreated: result.itemsCreated,
        categories: result.categories,
      });
    } catch (error: any) {
      console.error("Gmail sync error:", error);
      
      if (error.message === "Gmail not connected") {
        return res.status(401).json({ success: false, error: "Gmail not connected" });
      }
      
      res.status(500).json({ success: false, error: "Failed to sync Gmail" });
    }
  });

  // Get Gmail connection info
  app.get("/api/gmail/connection-info", async (req, res) => {
    try {
      const gmailState = await storage.getGmailState(MOCK_USER_ID);
      
      res.json({
        connected: !!gmailState,
        lastSync: gmailState?.updatedAt?.toISOString() || null,
      });
    } catch (error) {
      console.error("Gmail connection info error:", error);
      res.status(500).json({ error: "Failed to get Gmail connection info" });
    }
  });

  // Get next 3 actions
  app.get("/api/next", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const nextActions = await plannerEngine.getNextThreeActions(mockUser.id, timezone);
      res.json(nextActions);
    } catch (error) {
      console.error("Next actions error:", error);
      res.status(500).json({ error: "Failed to get next actions" });
    }
  });

  // Get all tasks
  app.get("/api/tasks", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const now = dayjs().tz(timezone);
      
      const allItems = await storage.getItems(mockUser.id);
      
      // Group tasks by time period
      const today = allItems.filter(item => {
        if (!item.start) return false;
        const itemDate = dayjs(item.start).tz(timezone);
        return itemDate.isSame(now, 'day');
      });

      const thisWeek = allItems.filter(item => {
        if (!item.start && !item.deadline) return false;
        const itemDate = dayjs(item.start || item.deadline).tz(timezone);
        return itemDate.isSame(now, 'week') && !itemDate.isSame(now, 'day');
      });

      const later = allItems.filter(item => {
        if (!item.start && !item.deadline) return true; // No date = later
        const itemDate = dayjs(item.start || item.deadline).tz(timezone);
        return itemDate.isAfter(now.endOf('week'));
      });

      res.json({
        today,
        thisWeek,
        later,
        all: allItems,
      });
    } catch (error) {
      console.error("Tasks error:", error);
      res.status(500).json({ error: "Failed to get tasks" });
    }
  });

  // Get calendar events
  app.get("/api/calendar", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const weekStart = req.query.weekStart ? 
        dayjs(req.query.weekStart as string).tz(timezone) : 
        dayjs().tz(timezone).startOf('week');
      
      const weekEnd = weekStart.endOf('week');
      
      // Get all items for the user and filter in code
      const allItems = await storage.getItems(mockUser.id);
      
      // Filter items that overlap with the week (start before week end AND end after week start)
      const items = allItems.filter(item => {
        if (!item.start) return false;
        const itemStart = dayjs(item.start).tz(timezone);
        const itemEnd = item.end ? dayjs(item.end).tz(timezone) : itemStart;
        
        // Item overlaps with week if it starts before week ends AND ends after week starts
        return itemStart.isBefore(weekEnd) && itemEnd.isAfter(weekStart);
      });

      res.json({
        items,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      });
    } catch (error) {
      console.error("Calendar error:", error);
      res.status(500).json({ error: "Failed to get calendar data" });
    }
  });

  // Get plan explanation for an item
  app.get("/api/plan/explain/:itemId", async (req, res) => {
    try {
      const { itemId } = req.params;
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";

      const explanation = await plannerEngine.explainPlacement(mockUser.id, itemId, timezone);
      res.json(explanation);
    } catch (error: any) {
      console.error("Plan explanation error:", error);
      
      if (error.message === "Item not found" || error.message === "Item has no scheduled time") {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: "Failed to get plan explanation" });
    }
  });

  // Update mood
  app.post("/api/mood", async (req, res) => {
    try {
      const { mood, timezone = "Asia/Riyadh" } = req.body;
      const today = dayjs().tz(timezone).format("YYYY-MM-DD");
      
      // Get existing day state to preserve early work flag
      const existingState = await storage.getDayState(mockUser.id, today);
      
      const dayState = await storage.upsertDayState({
        userId: mockUser.id,
        date: today,
        mood,
        hasEarlyWorkTomorrow: existingState?.hasEarlyWorkTomorrow ?? false,
      });

      // Apply mood-based adjustments
      await plannerEngine.applyIntent({ kind: "setMood", mood }, mockUser.id, timezone);

      res.json({ success: true, dayState });
    } catch (error) {
      console.error("Mood error:", error);
      res.status(500).json({ error: "Failed to update mood" });
    }
  });

  // Micro-mood check-in after task completion
  app.post("/api/mood/checkin", async (req, res) => {
    try {
      const { afterItemId, rating } = req.body;
      
      if (!rating || !["easy", "ok", "hard"].includes(rating)) {
        return res.status(400).json({ error: "Invalid rating. Must be 'easy', 'ok', or 'hard'" });
      }
      
      const item = await storage.getItem(afterItemId, mockUser.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const actualDuration = item.durationMinutes || 60;
      const itemStart = item.start || new Date();
      const weekday = dayjs(itemStart).format('ddd');
      const hour = dayjs(itemStart).hour();
      
      const updatedDuration = await learningService.applyMicroMoodFeedback(
        mockUser.id,
        item.type,
        rating as "easy" | "ok" | "hard",
        { weekday, hour }
      );
      
      await storage.logEvent({
        userId: mockUser.id,
        kind: 'item_rated',
        itemId: afterItemId,
        context: {
          rating: rating as "easy" | "ok" | "hard",
          itemType: item.type,
          duration: actualDuration,
          type: item.type,
        },
      });
      
      let message = "";
      if (rating === "easy") {
        message = `Great! Future ${item.type} tasks will be shorter (${Math.round(updatedDuration)} min).`;
      } else if (rating === "hard") {
        message = `Noted! Future ${item.type} tasks will be longer (${Math.round(updatedDuration)} min).`;
      } else {
        message = `Got it! ${item.type} duration stays at ${Math.round(updatedDuration)} min.`;
      }
      
      res.json({ 
        updatedDuration: Math.round(updatedDuration),
        message 
      });
    } catch (error) {
      console.error("Micro-mood check-in error:", error);
      res.status(500).json({ error: "Failed to record mood check-in" });
    }
  });

  // Toggle early work tomorrow
  app.post("/api/early-work", async (req, res) => {
    try {
      const { earlyWork, timezone = "Asia/Riyadh" } = req.body;
      const today = dayjs().tz(timezone).format("YYYY-MM-DD");
      
      // Get existing day state to preserve mood
      const existingState = await storage.getDayState(mockUser.id, today);
      
      const dayState = await storage.upsertDayState({
        userId: mockUser.id,
        date: today,
        mood: existingState?.mood ?? "none",
        hasEarlyWorkTomorrow: Boolean(earlyWork),
      });

      if (earlyWork) {
        await plannerEngine.applyIntent({ 
          kind: "setEarlyWork", 
          earlyWorkTomorrow: true 
        }, mockUser.id, timezone);
      }

      res.json({ success: true, dayState });
    } catch (error) {
      console.error("Early work error:", error);
      res.status(500).json({ error: "Failed to update early work setting" });
    }
  });

  // Toggle task completion
  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const existingItem = await storage.getItem(id, mockUser.id);
      
      if (!existingItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updatedItem = await storage.updateItem(id, mockUser.id, updates);
      
      if (!updatedItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (updates.done && !existingItem.done) {
        try {
          const context = await buildEventContext(updatedItem, mockUser.id, 'item_done');
          await storage.logEvent({
            userId: mockUser.id,
            kind: 'item_done',
            itemId: id,
            context,
          });
        } catch (eventError) {
          console.error("Event logging error:", eventError);
        }
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Task update error:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Snooze task
  app.post("/api/tasks/:id/snooze", async (req, res) => {
    try {
      const { id } = req.params;
      const { snoozeUntil } = req.body;

      if (!snoozeUntil) {
        return res.status(400).json({ error: "snoozeUntil timestamp is required" });
      }

      const existingItem = await storage.getItem(id, mockUser.id);
      
      if (!existingItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updatedItem = await storage.updateItem(id, mockUser.id, {
        start: new Date(snoozeUntil),
      });

      if (!updatedItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      try {
        const context = await buildEventContext(existingItem, mockUser.id, 'item_snoozed');
        await storage.logEvent({
          userId: mockUser.id,
          kind: 'item_snoozed',
          itemId: id,
          context,
        });
      } catch (eventError) {
        console.error("Event logging error:", eventError);
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Snooze error:", error);
      res.status(500).json({ error: "Failed to snooze task" });
    }
  });

  // Skip task
  app.post("/api/tasks/:id/skip", async (req, res) => {
    try {
      const { id } = req.params;

      const existingItem = await storage.getItem(id, mockUser.id);
      
      if (!existingItem) {
        return res.status(404).json({ error: "Task not found" });
      }

      try {
        const context = await buildEventContext(existingItem, mockUser.id, 'item_skipped');
        await storage.logEvent({
          userId: mockUser.id,
          kind: 'item_skipped',
          itemId: id,
          context,
        });
      } catch (eventError) {
        console.error("Event logging error:", eventError);
      }

      const deleted = await storage.deleteItem(id, mockUser.id);

      if (!deleted) {
        return res.status(404).json({ error: "Task not found" });
      }

      res.json({ success: true, message: "Task skipped" });
    } catch (error) {
      console.error("Skip error:", error);
      res.status(500).json({ error: "Failed to skip task" });
    }
  });

  // Get current user
  app.get("/api/user", async (req, res) => {
    try {
      const user = await storage.getUser(mockUser.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Get current day state (for mood check-in)
  app.get("/api/day-state", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const today = dayjs().tz(timezone).format("YYYY-MM-DD");
      
      let dayState = await storage.getDayState(mockUser.id, today);
      if (!dayState) {
        dayState = await storage.upsertDayState({
          userId: mockUser.id,
          date: today,
          mood: "none",
          hasEarlyWorkTomorrow: false,
        });
      }

      res.json(dayState);
    } catch (error) {
      console.error("Day state error:", error);
      res.status(500).json({ error: "Failed to get day state" });
    }
  });

  // Get learning preferences and stats
  app.get("/api/learning/preferences", async (req, res) => {
    try {
      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      const topWindows: Array<{weekday: string, hour: number, score: number}> = [];
      for (const [weekday, scores] of Object.entries(habitLearn.windowJSON)) {
        (scores as number[]).forEach((score, hour) => {
          topWindows.push({ weekday, hour, score });
        });
      }
      topWindows.sort((a, b) => b.score - a.score);
      const top5Windows = topWindows.slice(0, 5);

      const recentEvents = await storage.getRecentEvents(mockUser.id, 365);
      const totalEvents = recentEvents.length;

      const uniqueDates = new Set(recentEvents.map(e => dayjs(e.createdAt).format('YYYY-MM-DD')));
      const daysTracked = uniqueDates.size;

      res.json({
        preferences: habitLearn.preferences,
        stats: {
          topWindows: top5Windows,
          learnedLengths: habitLearn.lengthJSON,
          totalEvents,
          daysTracked
        }
      });
    } catch (error) {
      console.error("Learning prefs error:", error);
      res.status(500).json({ error: "Failed to get learning preferences" });
    }
  });

  // Update learning preferences
  app.patch("/api/learning/preferences", async (req, res) => {
    try {
      const { preferEvening, maxContinuousFocus, pinnedWindows, bannedWindows } = req.body;

      if (maxContinuousFocus !== undefined) {
        if (typeof maxContinuousFocus !== 'number' || maxContinuousFocus < 30 || maxContinuousFocus > 120) {
          return res.status(400).json({ error: "maxContinuousFocus must be between 30 and 120" });
        }
      }

      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      const updatedPreferences = {
        ...habitLearn.preferences,
        ...(preferEvening !== undefined && { preferEvening }),
        ...(maxContinuousFocus !== undefined && { maxContinuousFocus }),
        ...(pinnedWindows !== undefined && { pinnedWindows }),
        ...(bannedWindows !== undefined && { bannedWindows })
      };

      const updatedHabitLearn = await storage.upsertHabitLearn({
        userId: mockUser.id,
        preferences: updatedPreferences
      });

      res.json({ preferences: updatedHabitLearn.preferences });
    } catch (error) {
      console.error("Update preferences error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Manually trigger daily learning update
  app.post("/api/learning/update", async (req, res) => {
    try {
      const { timezone = "Asia/Riyadh" } = req.body;

      await learningService.runDailyUpdate(mockUser.id, timezone);

      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      res.json({
        success: true,
        message: "Daily learning update completed",
        stats: {
          learnedLengths: habitLearn.lengthJSON
        }
      });
    } catch (error) {
      console.error("Learning update error:", error);
      res.status(500).json({ error: "Failed to run learning update" });
    }
  });

  // Reset learning data to defaults
  app.post("/api/learning/reset", async (req, res) => {
    try {
      await storage.deleteHabitLearn(mockUser.id);

      const newHabitLearn = await learningService.initializeHabitLearn(mockUser.id);

      res.json({
        success: true,
        message: "Learning data reset to defaults",
        preferences: newHabitLearn.preferences
      });
    } catch (error) {
      console.error("Learning reset error:", error);
      res.status(500).json({ error: "Failed to reset learning data" });
    }
  });

  // Get learning insights
  app.get("/api/learning/insights", async (req, res) => {
    try {
      let habitLearn = await storage.getHabitLearn(mockUser.id);
      if (!habitLearn) {
        habitLearn = await learningService.initializeHabitLearn(mockUser.id);
      }

      const weekdayPatterns: Record<string, number> = {};
      for (const [weekday, scores] of Object.entries(habitLearn.windowJSON)) {
        const avgScore = (scores as number[]).reduce((sum, s) => sum + s, 0) / (scores as number[]).length;
        weekdayPatterns[weekday] = avgScore;
      }

      const hourlyPatterns: Record<string, number> = {};
      for (let hour = 0; hour < 24; hour++) {
        let totalScore = 0;
        let count = 0;
        for (const scores of Object.values(habitLearn.windowJSON)) {
          totalScore += (scores as number[])[hour];
          count++;
        }
        hourlyPatterns[hour.toString().padStart(2, '0')] = totalScore / count;
      }

      const last7Days = [];
      const timezone = "Asia/Riyadh";
      for (let i = 0; i < 7; i++) {
        const date = dayjs().tz(timezone).subtract(i, 'day').format('YYYY-MM-DD');
        const rollup = await storage.getDailyRollup(mockUser.id, date);
        if (rollup) {
          last7Days.push(rollup);
        }
      }

      let completionRate = 0;
      let avgSnoozes = 0;
      let avgSkips = 0;

      if (last7Days.length > 0) {
        const totalFocus = last7Days.reduce((sum, r) => sum + (r.focusBlocksCompleted || 0), 0);
        const totalSnoozes = last7Days.reduce((sum, r) => sum + (r.snoozes || 0), 0);
        const totalSkips = last7Days.reduce((sum, r) => sum + (r.skips || 0), 0);

        const totalActions = totalFocus + totalSnoozes + totalSkips;
        completionRate = totalActions > 0 ? totalFocus / totalActions : 0;
        avgSnoozes = totalSnoozes / last7Days.length;
        avgSkips = totalSkips / last7Days.length;
      }

      res.json({
        weekdayPatterns,
        hourlyPatterns,
        recentTrends: {
          completionRate,
          avgSnoozes,
          avgSkips
        }
      });
    } catch (error) {
      console.error("Learning insights error:", error);
      res.status(500).json({ error: "Failed to get learning insights" });
    }
  });

  // Manually trigger break insertion
  app.post("/api/breaks/recompute", async (req, res) => {
    try {
      const { now } = req.body;
      const currentTime = now ? new Date(now) : new Date();

      const breaks = await plannerEngine.insertMicroBreaks(mockUser.id, currentTime);

      res.json({
        breaksAdded: breaks.length,
        breaks: breaks.map(b => ({
          id: b.id,
          title: b.title,
          start: b.start?.toISOString(),
          end: b.end?.toISOString(),
          notes: b.notes,
        })),
      });
    } catch (error) {
      console.error("Recompute breaks error:", error);
      res.status(500).json({ error: "Failed to recompute breaks" });
    }
  });

  // Toggle automatic break insertion
  app.post("/api/breaks/auto-toggle", async (req, res) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      const updatedUser = await storage.updateUser(mockUser.id, {
        autoBreaks: enabled,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        autoBreaks: updatedUser.autoBreaks,
      });
    } catch (error) {
      console.error("Auto-toggle breaks error:", error);
      res.status(500).json({ error: "Failed to toggle auto breaks" });
    }
  });

  // Set water goal
  app.post("/api/hydration/goal", async (req, res) => {
    try {
      const { mlPerDay } = req.body;

      if (!mlPerDay || typeof mlPerDay !== "number" || mlPerDay <= 0) {
        return res.status(400).json({ error: "Valid mlPerDay is required" });
      }

      const updatedUser = await storage.updateUser(mockUser.id, {
        waterGoalMl: mlPerDay,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ waterGoalMl: updatedUser.waterGoalMl });
    } catch (error) {
      console.error("Set water goal error:", error);
      res.status(500).json({ error: "Failed to set water goal" });
    }
  });

  // Ingest health data
  app.post("/api/health/ingest", async (req, res) => {
    try {
      const { waterMl, sedentaryMinutes, activeMinutes, sleepHours } = req.body;

      await healthService.ingestHealthData(mockUser.id, {
        waterMl,
        sedentaryMinutes,
        activeMinutes,
        sleepHours,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Ingest health data error:", error);
      res.status(500).json({ error: "Failed to ingest health data" });
    }
  });

  // Get pending notifications
  app.get("/api/notifications", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const now = dayjs().tz(timezone).toDate();
      
      const notifications = await storage.getPendingNotifications(mockUser.id, now);
      res.json({ notifications });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  // Acknowledge notification with action
  app.post("/api/notifications/ack", async (req, res) => {
    try {
      const { notificationId, action, timezone = "Asia/Riyadh" } = req.body;

      if (!notificationId || !action) {
        return res.status(400).json({ error: "notificationId and action are required" });
      }

      if (!["accept", "dismiss", "snooze"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept', 'dismiss', or 'snooze'" });
      }

      const notification = await storage.getPendingNotifications(mockUser.id, new Date());
      const targetNotification = notification.find(n => n.id === notificationId);

      if (!targetNotification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      const now = dayjs().tz(timezone);

      if (action === "accept") {
        // Apply the suggestion from payload
        if (targetNotification.kind === "suggestStart" && targetNotification.payload.itemId) {
          // Move the item to the suggested time slot
          const item = await storage.getItem(targetNotification.payload.itemId, mockUser.id);
          if (item && item.start) {
            const newStart = now.toDate();
            const newEnd = now.add(item.durationMinutes || 30, 'minutes').toDate();
            
            await storage.updateItem(targetNotification.payload.itemId, mockUser.id, {
              start: newStart,
              end: newEnd,
            });

            // Log the move event
            await storage.logEvent({
              userId: mockUser.id,
              kind: 'item_moved',
              itemId: targetNotification.payload.itemId,
              context: {
                startPlanned: item.start.toISOString(),
                startActual: newStart.toISOString(),
              },
            });
          }
        } else if (targetNotification.kind === "rescheduleMiss" && targetNotification.payload.itemId) {
          // Reschedule the missed item
          const newStart = dayjs(targetNotification.payload.toSlot).tz(timezone).toDate();
          const item = await storage.getItem(targetNotification.payload.itemId, mockUser.id);
          if (item) {
            const newEnd = dayjs(newStart).add(item.durationMinutes || 30, 'minutes').toDate();
            
            await storage.updateItem(targetNotification.payload.itemId, mockUser.id, {
              start: newStart,
              end: newEnd,
            });

            // Log the reschedule event
            await storage.logEvent({
              userId: mockUser.id,
              kind: 'plan_autorescheduled',
              itemId: targetNotification.payload.itemId,
              context: {
                startActual: newStart.toISOString(),
              },
            });
          }
        } else if (targetNotification.kind === "water") {
          // Log water intake (500ml default)
          await healthService.ingestHealthData(mockUser.id, { waterMl: 500 });
        } else if (targetNotification.kind === "sitBreak") {
          // Create a 5-minute walk break
          const breakStart = now.toDate();
          const breakEnd = now.add(5, 'minutes').toDate();
          
          await storage.createItem({
            userId: mockUser.id,
            type: 'breakTime',
            title: '🚶 Quick Walk Break',
            start: breakStart,
            end: breakEnd,
            durationMinutes: 5,
            fixed: false,
            priority: 'normal',
          });
        }

        await storage.markNotificationSent(notificationId, now.toDate());
        res.json({ success: true, message: "Notification accepted and applied" });
      } else if (action === "snooze") {
        // Update scheduled to now + 15 minutes
        const snoozeUntil = now.add(15, 'minutes').toDate();
        await storage.dismissNotification(notificationId);
        
        // Create a new notification with snoozed schedule
        await storage.createNotification({
          userId: mockUser.id,
          kind: targetNotification.kind as any,
          payload: targetNotification.payload,
          scheduled: snoozeUntil,
          sentAt: null,
        });

        res.json({ success: true, message: "Notification snoozed for 15 minutes" });
      } else if (action === "dismiss") {
        await storage.dismissNotification(notificationId);
        res.json({ success: true, message: "Notification dismissed" });
      }
    } catch (error) {
      console.error("Acknowledge notification error:", error);
      res.status(500).json({ error: "Failed to acknowledge notification" });
    }
  });

  // Manually trigger notification checks
  app.post("/api/notifications/check", async (req, res) => {
    try {
      const { timezone = "Asia/Riyadh" } = req.body;
      const now = dayjs().tz(timezone);
      const createdNotifications = [];

      // Check for missed blocks (items with end time < now and no item_done event)
      const recentItems = await storage.getItems(mockUser.id, {
        start: now.subtract(4, 'hours').toDate(),
        end: now.toDate(),
      });

      for (const item of recentItems) {
        if (!item.end || !item.start || item.done || item.type === "breakTime" || item.type === "leisure") {
          continue;
        }

        const itemEnd = dayjs(item.end).tz(timezone);
        if (itemEnd.isBefore(now)) {
          // Check if there's an item_done event for this item
          const events = await storage.getRecentEvents(mockUser.id, 1);
          const hasDoneEvent = events.some(e => e.itemId === item.id && e.kind === 'item_done');

          if (!hasDoneEvent) {
            // This item was missed, propose reschedule
            const proposal = await plannerEngine.proposeReschedule(mockUser.id, item.id, now.toDate(), timezone);
            
            if (proposal) {
              // Check if we already have a notification for this item
              const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
              const alreadyNotified = existingNotifications.some(
                n => n.payload.itemId === item.id && n.kind === 'rescheduleMiss'
              );

              if (!alreadyNotified) {
                const notification = await storage.createNotification({
                  userId: mockUser.id,
                  kind: 'rescheduleMiss',
                  payload: {
                    itemId: proposal.itemId,
                    toSlot: proposal.toSlot,
                    message: proposal.message,
                  },
                  scheduled: now.toDate(),
                  sentAt: null,
                });
                createdNotifications.push(notification);
              }
            }
          }
        }
      }

      // Check for free time opportunities
      const earlierStartProposal = await plannerEngine.proposeEarlierStart(mockUser.id, now.toDate(), timezone);
      
      if (earlierStartProposal) {
        // Check if we already have a notification for this
        const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
        const alreadyNotified = existingNotifications.some(
          n => n.payload.itemId === earlierStartProposal.itemId && n.kind === 'suggestStart'
        );

        if (!alreadyNotified) {
          const notification = await storage.createNotification({
            userId: mockUser.id,
            kind: 'suggestStart',
            payload: {
              itemId: earlierStartProposal.itemId,
              fromSlot: earlierStartProposal.fromSlot,
              toSlot: earlierStartProposal.toSlot,
              message: earlierStartProposal.message,
            },
            scheduled: now.toDate(),
            sentAt: null,
          });
          createdNotifications.push(notification);
        }
      }

      const user = await storage.getUser(mockUser.id);
      if (user && user.autoBreaks) {
        await plannerEngine.insertMicroBreaks(mockUser.id, now.toDate());
      }

      const waterCheck = await healthService.checkWaterReminder(mockUser.id, now.toDate());
      if (waterCheck.shouldRemind) {
        const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
        const alreadyNotified = existingNotifications.some(n => n.kind === 'water');

        if (!alreadyNotified) {
          const notification = await storage.createNotification({
            userId: mockUser.id,
            kind: 'water',
            payload: {
              message: waterCheck.message,
            },
            scheduled: now.toDate(),
            sentAt: null,
          });
          createdNotifications.push(notification);
        }
      }

      const sitBreakCheck = await healthService.checkSitBreakReminder(mockUser.id, now.toDate());
      if (sitBreakCheck.shouldRemind) {
        const existingNotifications = await storage.getPendingNotifications(mockUser.id, now.toDate());
        const alreadyNotified = existingNotifications.some(n => n.kind === 'sitBreak');

        if (!alreadyNotified) {
          const notification = await storage.createNotification({
            userId: mockUser.id,
            kind: 'sitBreak',
            payload: {
              message: sitBreakCheck.message,
            },
            scheduled: now.toDate(),
            sentAt: null,
          });
          createdNotifications.push(notification);
        }
      }

      res.json({
        success: true,
        created: createdNotifications.length,
        notifications: createdNotifications,
      });
    } catch (error) {
      console.error("Check notifications error:", error);
      res.status(500).json({ error: "Failed to check notifications" });
    }
  });

  // Get weekly summary for specific week
  app.get("/api/weekly/summary", async (req, res) => {
    try {
      const weekStartParam = req.query.weekStart as string | undefined;
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      
      // Default to last Monday if not provided
      const weekStart = weekStartParam
        ? dayjs(weekStartParam).tz(timezone).startOf('day').toDate()
        : dayjs().tz(timezone).startOf('week').toDate();

      const summary = await weeklyService.generateWeeklySummary(mockUser.id, weekStart);
      
      res.json(summary);
    } catch (error) {
      console.error("Get weekly summary error:", error);
      res.status(500).json({ error: "Failed to get weekly summary" });
    }
  });

  // Get recent weekly summaries
  app.get("/api/weekly/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 4;
      
      const summaries = await storage.getRecentWeeklySummaries(mockUser.id, limit);
      
      res.json(summaries);
    } catch (error) {
      console.error("Get recent summaries error:", error);
      res.status(500).json({ error: "Failed to get recent summaries" });
    }
  });

  // Manually trigger weekly summary generation
  app.post("/api/weekly/generate", async (req, res) => {
    try {
      const { weekStart: weekStartParam, timezone: userTimezone } = req.body;
      const timezone = userTimezone || "Asia/Riyadh";
      
      // Default to last Monday if not provided
      const weekStart = weekStartParam
        ? dayjs(weekStartParam).tz(timezone).startOf('day').toDate()
        : dayjs().tz(timezone).startOf('week').toDate();

      const summary = await weeklyService.generateWeeklySummary(mockUser.id, weekStart);
      
      // Optional: Update habit learning based on insights (future enhancement)
      // This could analyze the notes and adjust learning preferences
      
      res.json({
        success: true,
        summary,
      });
    } catch (error) {
      console.error("Generate weekly summary error:", error);
      res.status(500).json({ error: "Failed to generate weekly summary" });
    }
  });

  // Get workout preferences
  app.get("/api/workout/prefs", async (req, res) => {
    try {
      const preferences = await storage.getWorkoutPreferences(mockUser.id);
      res.json({ preferences });
    } catch (error) {
      console.error("Get workout preferences error:", error);
      res.status(500).json({ error: "Failed to get workout preferences" });
    }
  });

  // Set/update workout preferences
  app.post("/api/workout/prefs", async (req, res) => {
    try {
      const { perWeek, defaultDurationMin, preferredWindows } = req.body;

      if (typeof perWeek !== "number" || perWeek < 1 || perWeek > 7) {
        return res.status(400).json({ error: "perWeek must be between 1 and 7" });
      }

      if (typeof defaultDurationMin !== "number" || defaultDurationMin < 15 || defaultDurationMin > 240) {
        return res.status(400).json({ error: "defaultDurationMin must be between 15 and 240" });
      }

      if (preferredWindows && !Array.isArray(preferredWindows)) {
        return res.status(400).json({ error: "preferredWindows must be an array" });
      }

      const preferences = await storage.upsertWorkoutPreferences({
        userId: mockUser.id,
        perWeek,
        defaultDurationMin,
        preferredWindows: preferredWindows || null,
      });

      res.json({ preferences });
    } catch (error) {
      console.error("Set workout preferences error:", error);
      res.status(500).json({ error: "Failed to set workout preferences" });
    }
  });

  // Plan workouts for a week
  app.post("/api/workout/plan", async (req, res) => {
    try {
      const { weekStart: weekStartParam, timezone: userTimezone } = req.body;
      const timezone = userTimezone || "Asia/Riyadh";

      const weekStart = weekStartParam
        ? dayjs(weekStartParam).tz(timezone).toDate()
        : dayjs().tz(timezone).startOf('isoWeek').toDate();

      const workouts = await gymService.planWeeklyWorkouts(mockUser.id, weekStart, timezone);
      const streakStatus = await gymService.checkStreakStatus(mockUser.id, timezone);

      res.json({
        workouts,
        streakProtected: streakStatus.protected,
      });
    } catch (error) {
      console.error("Plan workouts error:", error);
      res.status(500).json({ error: "Failed to plan workouts" });
    }
  });

  // Get streak status
  app.get("/api/workout/streak", async (req, res) => {
    try {
      const timezone = (req.query.timezone as string) || "Asia/Riyadh";
      const streakStatus = await gymService.checkStreakStatus(mockUser.id, timezone);
      res.json(streakStatus);
    } catch (error) {
      console.error("Get streak status error:", error);
      res.status(500).json({ error: "Failed to get streak status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
