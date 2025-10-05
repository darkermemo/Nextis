import { users, items, dayStates, events, habitLearn, dailyRollup, notifications, weeklySummary, workoutPreferences, type User, type InsertUser, type Item, type InsertItem, type UpdateItem, type DayState, type InsertDayState, type UpdateDayState, type Event, type InsertEvent, type HabitLearn, type DailyRollup, type Notification, type InsertNotification, type WeeklySummary, type InsertWeeklySummary, type WorkoutPreferences, type InsertWorkoutPreferences } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // Item methods
  getItems(userId: string, options?: { start?: Date; end?: Date; type?: string }): Promise<Item[]>;
  getItem(id: string, userId: string): Promise<Item | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, userId: string, updates: UpdateItem): Promise<Item | undefined>;
  deleteItem(id: string, userId: string): Promise<boolean>;

  // Day state methods
  getDayState(userId: string, date: string): Promise<DayState | undefined>;
  upsertDayState(dayState: InsertDayState): Promise<DayState>;

  // Event logging methods
  logEvent(event: InsertEvent): Promise<Event>;
  getRecentEvents(userId: string, days: number): Promise<Event[]>;

  // Habit learning methods
  getHabitLearn(userId: string): Promise<HabitLearn | null>;
  upsertHabitLearn(data: {
    userId: string;
    windowJSON?: any;
    lengthJSON?: any;
    penalties?: any;
    preferences?: any;
  }): Promise<HabitLearn>;
  deleteHabitLearn(userId: string): Promise<boolean>;

  // Daily rollup methods
  getDailyRollup(userId: string, date: string): Promise<DailyRollup | null>;
  upsertDailyRollup(data: {
    userId: string;
    date: string;
    focusBlocksCompleted?: number;
    snoozes?: number;
    skips?: number;
    avgStartDelayMin?: number;
    sleepHours?: number;
    waterMl?: number;
    activeMinutes?: number;
    sedentaryMinutes?: number;
  }): Promise<DailyRollup>;

  // Notification methods
  createNotification(notification: InsertNotification): Promise<Notification>;
  getPendingNotifications(userId: string, now: Date): Promise<Notification[]>;
  markNotificationSent(id: string, sentAt: Date): Promise<void>;
  dismissNotification(id: string): Promise<void>;

  // Weekly summary methods
  getWeeklySummary(userId: string, weekStart: string): Promise<WeeklySummary | null>;
  createWeeklySummary(summary: InsertWeeklySummary): Promise<WeeklySummary>;
  getRecentWeeklySummaries(userId: string, limit: number): Promise<WeeklySummary[]>;

  // Workout preferences methods
  getWorkoutPreferences(userId: string): Promise<WorkoutPreferences | null>;
  upsertWorkoutPreferences(prefs: InsertWorkoutPreferences & { userId: string }): Promise<WorkoutPreferences>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async getItems(userId: string, options: { start?: Date; end?: Date; type?: string } = {}): Promise<Item[]> {
    const conditions = [eq(items.userId, userId)];

    if (options.start) {
      conditions.push(gte(items.start, options.start));
    }

    if (options.end) {
      conditions.push(lte(items.end, options.end));
    }

    if (options.type) {
      conditions.push(eq(items.type, options.type as any));
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    return db
      .select()
      .from(items)
      .where(whereClause)
      .orderBy(asc(items.start), desc(items.priority));
  }

  async getItem(id: string, userId: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(
      and(eq(items.id, id), eq(items.userId, userId))
    );
    return item || undefined;
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db
      .insert(items)
      .values(item as any)
      .returning();
    return newItem;
  }

  async updateItem(id: string, userId: string, updates: UpdateItem): Promise<Item | undefined> {
    const [updatedItem] = await db
      .update(items)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning();
    return updatedItem || undefined;
  }

  async deleteItem(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(items)
      .where(and(eq(items.id, id), eq(items.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getDayState(userId: string, date: string): Promise<DayState | undefined> {
    const [dayState] = await db.select().from(dayStates).where(
      and(eq(dayStates.userId, userId), eq(dayStates.date, date))
    );
    return dayState || undefined;
  }

  async upsertDayState(dayState: InsertDayState): Promise<DayState> {
    const existing = await this.getDayState(dayState.userId, dayState.date);
    
    if (existing) {
      const [updated] = await db
        .update(dayStates)
        .set({ ...dayState, updatedAt: new Date() })
        .where(and(eq(dayStates.userId, dayState.userId), eq(dayStates.date, dayState.date)))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(dayStates)
        .values(dayState)
        .returning();
      return created;
    }
  }

  async logEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db
      .insert(events)
      .values(event as any)
      .returning();
    return newEvent;
  }

  async getRecentEvents(userId: string, days: number): Promise<Event[]> {
    return db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          gte(events.createdAt, sql`now() - interval '${sql.raw(days.toString())} days'`)
        )
      )
      .orderBy(desc(events.createdAt));
  }

  async getHabitLearn(userId: string): Promise<HabitLearn | null> {
    const [habit] = await db.select().from(habitLearn).where(eq(habitLearn.userId, userId));
    return habit || null;
  }

  async upsertHabitLearn(data: {
    userId: string;
    windowJSON?: any;
    lengthJSON?: any;
    penalties?: any;
    preferences?: any;
  }): Promise<HabitLearn> {
    const existing = await this.getHabitLearn(data.userId);
    
    if (existing) {
      const [updated] = await db
        .update(habitLearn)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(habitLearn.userId, data.userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(habitLearn)
        .values(data)
        .returning();
      return created;
    }
  }

  async deleteHabitLearn(userId: string): Promise<boolean> {
    const result = await db
      .delete(habitLearn)
      .where(eq(habitLearn.userId, userId));
    return (result.rowCount ?? 0) > 0;
  }

  async getDailyRollup(userId: string, date: string): Promise<DailyRollup | null> {
    const [rollup] = await db.select().from(dailyRollup).where(
      and(eq(dailyRollup.userId, userId), eq(dailyRollup.date, date))
    );
    return rollup || null;
  }

  async upsertDailyRollup(data: {
    userId: string;
    date: string;
    focusBlocksCompleted?: number;
    snoozes?: number;
    skips?: number;
    avgStartDelayMin?: number;
    sleepHours?: number;
    waterMl?: number;
    activeMinutes?: number;
    sedentaryMinutes?: number;
  }): Promise<DailyRollup> {
    const existing = await this.getDailyRollup(data.userId, data.date);
    
    if (existing) {
      const [updated] = await db
        .update(dailyRollup)
        .set(data)
        .where(and(eq(dailyRollup.userId, data.userId), eq(dailyRollup.date, data.date)))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(dailyRollup)
        .values(data)
        .returning();
      return created;
    }
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values(notification as any)
      .returning();
    return newNotification;
  }

  async getPendingNotifications(userId: string, now: Date): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          sql`${notifications.sentAt} IS NULL`,
          lte(notifications.scheduled, now)
        )
      )
      .orderBy(asc(notifications.scheduled));
  }

  async markNotificationSent(id: string, sentAt: Date): Promise<void> {
    await db
      .update(notifications)
      .set({ sentAt })
      .where(eq(notifications.id, id));
  }

  async dismissNotification(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ sentAt: new Date() })
      .where(eq(notifications.id, id));
  }

  async getWeeklySummary(userId: string, weekStart: string): Promise<WeeklySummary | null> {
    const [summary] = await db.select().from(weeklySummary).where(
      and(eq(weeklySummary.userId, userId), eq(weeklySummary.weekStart, weekStart))
    );
    return summary || null;
  }

  async createWeeklySummary(summary: InsertWeeklySummary): Promise<WeeklySummary> {
    const [newSummary] = await db
      .insert(weeklySummary)
      .values(summary as any)
      .returning();
    return newSummary;
  }

  async getRecentWeeklySummaries(userId: string, limit: number): Promise<WeeklySummary[]> {
    return db
      .select()
      .from(weeklySummary)
      .where(eq(weeklySummary.userId, userId))
      .orderBy(desc(weeklySummary.weekStart))
      .limit(limit);
  }

  async getWorkoutPreferences(userId: string): Promise<WorkoutPreferences | null> {
    const [prefs] = await db.select().from(workoutPreferences).where(eq(workoutPreferences.userId, userId));
    return prefs || null;
  }

  async upsertWorkoutPreferences(prefs: InsertWorkoutPreferences & { userId: string }): Promise<WorkoutPreferences> {
    const existing = await this.getWorkoutPreferences(prefs.userId);
    
    if (existing) {
      const [updated] = await db
        .update(workoutPreferences)
        .set({ ...prefs, updatedAt: new Date() })
        .where(eq(workoutPreferences.userId, prefs.userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(workoutPreferences)
        .values(prefs)
        .returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
