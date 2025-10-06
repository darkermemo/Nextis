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
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import OpenAI from "openai";
import { IntentJsonSchema } from "./services/openai";
import { client as agentClient, tools as agentTools, COORDINATOR_PROMPT, dispatchTool } from "./services/agent";
import { preParse } from "./services/preParse";

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
      const gmailState = await storage.getGmailState(mockUser.id);

      if (!gmailState) {
        return res.status(401).json({ error: "Gmail not connected" });
      }

      const result = await gmailService.syncUserGmail(mockUser.id, timezone);

      res.json({
        success: true,
        itemsCreated: result.itemsCreated,
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

      // Pre-parse to extract relative/explicit time hints
      const pre = preParse(message, timezone);
      const parsed = await llmService.parseCommand(message, timezone);

      // If model did not provide time/date but pre-parse found relative or explicit time, inject them
      if ((parsed as any)?.kind === 'genericTask') {
        const p: any = parsed;
        if (!p.time && !p.startTime && pre.startTime) p.time = pre.startTime;
        if (!p.date && pre.date) p.date = pre.date;
        if (!p.durationMinutes && pre.durationMinutes) p.durationMinutes = pre.durationMinutes;
      }

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

  // Tool-calling: model orchestrates planner tools
  app.post("/api/plan/apply", async (req, res) => {
    try {
      const { userId = MOCK_USER_ID, timezone = "Asia/Riyadh", intent, now, mode = "auto" } = req.body || {};
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MODEL || "gpt-5";

      // A) DIRECT MODE: apply intent immediately without model
      if (mode === "direct" && intent) {
        const parsed = parsedIntentSchema.parse(intent);
        const out = await plannerEngine.applyIntent(parsed, userId, timezone);
        return res.json({ applied: true, changes: out.changes ?? [], items: out.items ?? [] });
      }

      const tools = [
        {
          type: "function",
          name: "apply_intent",
          description: "Apply a parsed scheduling intent and return changes.",
          parameters: {
            type: "object",
            required: ["intent", "timezone", "userId"],
            properties: {
              userId: { type: "string" },
              timezone: { type: "string" },
              intent: (IntentJsonSchema as any).schema,
            },
          },
        },
        {
          type: "function",
          name: "propose_reschedule",
          description: "Suggest next best slot for a missed item (1-3 days).",
          parameters: {
            type: "object",
            required: ["userId", "missedItemId", "now", "timezone"],
            properties: {
              userId: { type: "string" },
              missedItemId: { type: "string" },
              now: { type: "string" },
              timezone: { type: "string" },
            },
          },
        },
      ];

      const r = await client.responses.create({
        model,
        input: [
          { role: "system", content: "You are a planning orchestrator. Call tools, then summarize changes succinctly." },
          { role: "user", content: JSON.stringify({ userId, timezone, intent, now: now || new Date().toISOString() }) },
        ],
        tools,
        tool_choice: "auto",
      });

      const toolResults: any[] = [];
      for (const item of ((r as any).output ?? [])) {
        for (const c of (item?.content ?? [])) {
          if (c.type === "tool_call" && c.name === "apply_intent") {
            const args = JSON.parse(c.arguments || '{}');
            const parsed = parsedIntentSchema.parse(args.intent);
            const out = await plannerEngine.applyIntent(parsed, args.userId, args.timezone);
            toolResults.push({ tool: c.name, id: c.id, output: out });
          }
          if (c.type === "tool_call" && c.name === "propose_reschedule") {
            const args = JSON.parse(c.arguments || '{}');
            const out = await plannerEngine.proposeReschedule(args.userId, args.missedItemId, new Date(args.now), args.timezone);
            toolResults.push({ tool: c.name, id: c.id, output: out });
          }
        }
      }

      // Fallback: apply directly if no tool calls but we have an intent
      if (toolResults.length === 0 && intent) {
        const parsed = parsedIntentSchema.parse(intent);
        const out = await plannerEngine.applyIntent(parsed, userId, timezone);
        return res.json({ applied: true, changes: out.changes ?? [], items: out.items ?? [] });
      }

      return res.json({ applied: toolResults.length > 0, toolResults });
    } catch (err: any) {
      console.error("/api/plan/apply error:", err?.message || err);
      res.status(500).json({ error: "failed_to_apply_plan" });
    }
  });

  // Realtime session: ephemeral session token for client to start Realtime (placeholder)
  app.post("/api/realtime/session", async (_req, res) => {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_REALTIME_MODEL || process.env.OPENAI_MODEL || "gpt-realtime";
      const session = await client.realtime.sessions.create({ model });
      res.json(session);
    } catch (err: any) {
      console.error("/api/realtime/session error:", err?.message || err);
      res.status(500).json({ error: "failed_to_create_session" });
    }
  });

  // Agent text endpoint: model chooses tools; we execute, then summarize
  app.post("/api/agent/respond", async (req, res) => {
    try {
      const { userId = MOCK_USER_ID, timezone = process.env.TZ || "Asia/Riyadh", message } = req.body || {};
      if (!message) return res.status(400).json({ error: "message_required" });

      const model = process.env.OPENAI_MODEL || "gpt-5";
      const MUST_CALL = "\nYou MUST call at least one tool to modify or inspect the plan. Never reply with text only when the user asks to schedule, move, reschedule, plan, or summarize.";
      const resp = await agentClient.responses.create({
        model,
        input: [
          { role: "system", content: COORDINATOR_PROMPT + MUST_CALL },
          { role: "user", content: message },
        ],
        tools: agentTools as any,
        tool_choice: "auto",
      });

      const toolOutputs: any[] = [];
      for (const block of ((resp as any).output ?? [])) {
        for (const c of (block?.content ?? [])) {
          if (c.type === "tool_call") {
            const args = JSON.parse(c.arguments || "{}");
            if (!args.userId) args.userId = userId;
            if (!args.timezone) args.timezone = timezone;
            const out = await dispatchTool(c.name, args);
            toolOutputs.push({ id: c.id, name: c.name, output: out });
          }
        }
      }

      // Force a tool if none emitted but message clearly requests scheduling
      if (toolOutputs.length === 0 && /\b(add|schedule|move|reschedule|plan)\b/i.test(message)) {
        const out = await dispatchTool("apply_intent", { userId, timezone, intent: { kind: "genericTask", title: message } });
        toolOutputs.push({ id: "forced-apply", name: "apply_intent", output: out });
      }

      let summary = "";
      if (toolOutputs.length) {
        const s = await agentClient.responses.create({
          model,
          input: [
            { role: "system", content: "Summarize the changes in \u22642 sentences, actionable and specific." },
            { role: "user", content: JSON.stringify(toolOutputs) },
          ],
        });
        summary = (s as any)?.output?.[0]?.content?.[0]?.text ?? "";
      }

      res.json({ tools: toolOutputs, summary });
    } catch (err: any) {
      console.error("/api/agent/respond error:", err?.message || err);
      res.status(500).json({ error: "failed_to_respond" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

