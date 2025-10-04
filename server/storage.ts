import { users, items, dayStates, type User, type InsertUser, type Item, type InsertItem, type UpdateItem, type DayState, type InsertDayState, type UpdateDayState } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Item methods
  getItems(userId: string, options?: { start?: Date; end?: Date; type?: string }): Promise<Item[]>;
  getItem(id: string, userId: string): Promise<Item | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, userId: string, updates: UpdateItem): Promise<Item | undefined>;
  deleteItem(id: string, userId: string): Promise<boolean>;

  // Day state methods
  getDayState(userId: string, date: string): Promise<DayState | undefined>;
  upsertDayState(dayState: InsertDayState): Promise<DayState>;
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

  async getItems(userId: string, options: { start?: Date; end?: Date; type?: string } = {}): Promise<Item[]> {
    const conditions = [eq(items.userId, userId)];

    if (options.start) {
      conditions.push(gte(items.start, options.start.toISOString()));
    }

    if (options.end) {
      conditions.push(lte(items.end, options.end.toISOString()));
    }

    if (options.type) {
      conditions.push(eq(items.type, options.type));
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
}

export const storage = new DatabaseStorage();
