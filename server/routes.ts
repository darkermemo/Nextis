import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { llmService } from "./services/openai";
import { plannerEngine } from "./services/planner";
import { learningService } from "./services/learning";
import { z } from "zod";
import { parsedIntentSchema, type Item } from "@shared/schema";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Mock user for MVP - in production, use proper auth
const MOCK_USER_ID = "mock-user-id";

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

  const httpServer = createServer(app);
  return httpServer;
}
