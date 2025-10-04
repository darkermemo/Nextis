import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { llmService } from "./services/openai";
import { plannerEngine } from "./services/planner";
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

  const httpServer = createServer(app);
  return httpServer;
}
