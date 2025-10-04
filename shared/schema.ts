import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  timezone: text("timezone").notNull().default("Asia/Riyadh"),
  workStartHour: integer("work_start_hour").notNull().default(9),
  workEndHour: integer("work_end_hour").notNull().default(18),
  bedtimeHour: integer("bedtime_hour").notNull().default(22),
  allowEveningStudy: boolean("allow_evening_study").notNull().default(true),
  defaultTVStartHour: integer("default_tv_start_hour").notNull().default(22),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const itemTypeEnum = z.enum(["task", "event", "breakTime", "leisure", "quiz"]);
export const priorityEnum = z.enum(["high", "normal", "low"]);
export const moodEnum = z.enum(["tired", "stressed", "motivated", "focused", "relaxed", "none"]);
export const eventKindEnum = z.enum([
  "item_started",
  "item_done",
  "item_skipped",
  "item_snoozed",
  "item_moved",
  "plan_autorescheduled",
  "bedtime_hit",
  "health_ingested"
]);

export const items = pgTable("items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<z.infer<typeof itemTypeEnum>>().notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  start: timestamp("start"),
  end: timestamp("end"),
  durationMinutes: integer("duration_minutes"),
  deadline: timestamp("deadline"),
  fixed: boolean("fixed").notNull().default(false),
  priority: text("priority").$type<z.infer<typeof priorityEnum>>().notNull().default("normal"),
  subtasks: jsonb("subtasks").$type<Array<{id: string, title: string, done: boolean}>>().notNull().default([]),
  reminders: jsonb("reminders").$type<string[]>().notNull().default([]), // ISO timestamps
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const dayStates = pgTable("day_states", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD format
  mood: text("mood").$type<z.infer<typeof moodEnum>>().notNull().default("none"),
  hasEarlyWorkTomorrow: boolean("has_early_work_tomorrow").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<z.infer<typeof eventKindEnum>>().notNull(),
  itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }),
  context: jsonb("context").$type<{
    itemId?: string;
    type?: string;
    durationPlanned?: number;
    durationActual?: number;
    startPlanned?: string;
    startActual?: string;
    mood?: string;
    earlyWork?: boolean;
    sleepHours?: number;
    dayOfWeek?: string;
    hourOfDay?: number;
  }>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const habitLearn = pgTable("habit_learn", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  windowJSON: jsonb("window_json").$type<{
    Mon?: number[];
    Tue?: number[];
    Wed?: number[];
    Thu?: number[];
    Fri?: number[];
    Sat?: number[];
    Sun?: number[];
  }>().notNull().default({}),
  lengthJSON: jsonb("length_json").$type<Record<string, number>>().notNull().default({}),
  penalties: jsonb("penalties").$type<Record<string, number>>().notNull().default({}),
  preferences: jsonb("preferences").$type<{
    preferEvening?: boolean;
    maxContinuousFocus?: number;
    pinnedWindows?: string[];
    bannedWindows?: string[];
  }>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const dailyRollup = pgTable("daily_rollup", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD format
  focusBlocksCompleted: integer("focus_blocks_completed").notNull().default(0),
  snoozes: integer("snoozes").notNull().default(0),
  skips: integer("skips").notNull().default(0),
  avgStartDelayMin: integer("avg_start_delay_min"),
  sleepHours: integer("sleep_hours"),
  waterMl: integer("water_ml"),
  activeMinutes: integer("active_minutes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  type: itemTypeEnum,
  priority: priorityEnum,
});

export const insertDayStateSchema = createInsertSchema(dayStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  mood: moodEnum,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
}).extend({
  kind: eventKindEnum,
});

export const insertHabitLearnSchema = createInsertSchema(habitLearn).omit({
  id: true,
  updatedAt: true,
});

export const insertDailyRollupSchema = createInsertSchema(dailyRollup).omit({
  id: true,
  createdAt: true,
});

// Update schemas
export const updateItemSchema = insertItemSchema.partial();
export const updateDayStateSchema = insertDayStateSchema.partial();

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type UpdateItem = z.infer<typeof updateItemSchema>;
export type Item = typeof items.$inferSelect;
export type InsertDayState = z.infer<typeof insertDayStateSchema>;
export type UpdateDayState = z.infer<typeof updateDayStateSchema>;
export type DayState = typeof dayStates.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;
export type InsertHabitLearn = z.infer<typeof insertHabitLearnSchema>;
export type HabitLearn = typeof habitLearn.$inferSelect;
export type InsertDailyRollup = z.infer<typeof insertDailyRollupSchema>;
export type DailyRollup = typeof dailyRollup.$inferSelect;

// API schemas
export const parsedIntentSchema = z.object({
  kind: z.enum(["addExam", "addMeeting", "addHomeworks", "addBreaks", "addLeisureTV", "setMood", "setEarlyWork", "genericTask"]),
  title: z.string().optional(),
  date: z.string().optional(), // YYYY-MM-DD
  time: z.string().optional(), // HH:mm
  count: z.number().optional(),
  dueRange: z.string().optional(),
  durationMinutes: z.number().optional(),
  priority: priorityEnum.optional(),
  mood: moodEnum.optional(),
  earlyWorkTomorrow: z.boolean().optional(),
});

export const nextActionsSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    type: itemTypeEnum,
    priority: priorityEnum,
    durationMinutes: z.number().nullable(),
    deadline: z.string().nullable(), // ISO timestamp
    start: z.string().nullable(), // ISO timestamp
  })),
});

export type ParsedIntent = z.infer<typeof parsedIntentSchema>;
export type NextActions = z.infer<typeof nextActionsSchema>;
