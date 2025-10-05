import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Event, HabitLearn, Item } from '@shared/schema';
import { storage } from '../storage';
import type { IStorage } from '../storage';

dayjs.extend(utc);
dayjs.extend(timezone);

export class LearningService {
  private storage: IStorage;
  private readonly ALPHA = 0.8;
  private readonly MIN_DURATION = 30;
  private readonly MAX_DURATION = 90;
  private readonly MICRO_MOOD_MIN_DURATION = 15;
  private readonly MICRO_MOOD_MAX_DURATION = 120;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  async updateWindows(userId: string, dayEvents: Event[]): Promise<void> {
    let learn = await this.storage.getHabitLearn(userId);
    if (!learn) {
      learn = await this.initializeHabitLearn(userId);
    }

    if (dayEvents.length === 0) return;

    const firstEventDate = dayEvents[0].createdAt;
    const weekday = dayjs(firstEventDate).format('ddd');

    const currentWindow = learn.windowJSON[weekday as keyof typeof learn.windowJSON] || Array(24).fill(0.5);

    const hourBuckets: { done: number; planned: number }[] = Array(24).fill(null).map(() => ({ done: 0, planned: 0 }));

    for (const event of dayEvents) {
      const hour = dayjs(event.createdAt).hour();

      if (event.kind === 'item_done') {
        hourBuckets[hour].done += 1;
        hourBuckets[hour].planned += 1;
      } else if (event.kind === 'item_started') {
        hourBuckets[hour].planned += 1;
      } else if (event.kind === 'item_skipped' || event.kind === 'item_snoozed') {
        hourBuckets[hour].planned += 1;
      }
    }

    const newWindow = currentWindow.map((oldScore, hour) => {
      const bucket = hourBuckets[hour];
      if (bucket.planned === 0) {
        return oldScore;
      }
      const todayRate = bucket.done / bucket.planned;
      return this.ALPHA * oldScore + (1 - this.ALPHA) * todayRate;
    });

    const updatedWindowJSON = {
      ...learn.windowJSON,
      [weekday]: newWindow,
    };

    await this.storage.upsertHabitLearn({
      userId,
      windowJSON: updatedWindowJSON,
    });
  }

  async updateLengths(userId: string, doneItems: Item[]): Promise<void> {
    let learn = await this.storage.getHabitLearn(userId);
    if (!learn) {
      learn = await this.initializeHabitLearn(userId);
    }

    const typeGroups: Record<string, number[]> = {};

    for (const item of doneItems) {
      if (!item.done || !item.start || !item.end) continue;

      const actualDuration = dayjs(item.end).diff(dayjs(item.start), 'minute');
      if (actualDuration <= 0) continue;

      if (!typeGroups[item.type]) {
        typeGroups[item.type] = [];
      }
      typeGroups[item.type].push(actualDuration);
    }

    const updatedLengthJSON = { ...learn.lengthJSON };

    for (const [type, durations] of Object.entries(typeGroups)) {
      if (durations.length === 0) continue;

      const avgActual = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const oldLength = updatedLengthJSON[type] || 60;
      const newLength = this.ALPHA * oldLength + (1 - this.ALPHA) * avgActual;

      updatedLengthJSON[type] = Math.max(this.MIN_DURATION, Math.min(this.MAX_DURATION, newLength));
    }

    await this.storage.upsertHabitLearn({
      userId,
      lengthJSON: updatedLengthJSON,
    });
  }

  snoozeRisk(ctx: { hour: number; sleepH: number; mood: string; meetings: number }): number {
    let risk = 0;

    if (ctx.hour >= 21) {
      risk += 0.4;
    }

    if (ctx.sleepH < 6) {
      risk += 0.4;
    }

    if (ctx.mood === 'tired' || ctx.mood === 'stressed') {
      risk += 0.3;
    }

    if (ctx.meetings >= 3) {
      risk += 0.2;
    }

    return Math.min(1.0, risk);
  }

  scoreSlot(
    learn: HabitLearn,
    weekday: string,
    hour: number,
    ctx: { sleepH: number; mood: string; meetings: number }
  ): number {
    const windowScores = learn.windowJSON[weekday as keyof typeof learn.windowJSON] || Array(24).fill(0.5);
    const baseScore = windowScores[hour] ?? 0.5;

    const risk = this.snoozeRisk({ hour, sleepH: ctx.sleepH, mood: ctx.mood, meetings: ctx.meetings });

    const nightHeavyPenalty = learn.penalties?.nightHeavy || 0.3;
    const curfewPenalty = hour >= 21 ? nightHeavyPenalty : 0;

    return baseScore - risk - curfewPenalty;
  }

  async runDailyUpdate(userId: string, timezone: string): Promise<void> {
    const yesterday = dayjs().tz(timezone).subtract(1, 'day');
    const yesterdayStart = yesterday.startOf('day').toDate();
    const yesterdayEnd = yesterday.endOf('day').toDate();

    const events = await this.storage.getRecentEvents(userId, 2);
    const yesterdayEvents = events.filter(e => {
      const eventDate = dayjs(e.createdAt);
      return eventDate.isAfter(yesterdayStart) && eventDate.isBefore(yesterdayEnd);
    });

    const allItems = await this.storage.getItems(userId, {
      start: yesterdayStart,
      end: yesterdayEnd,
    });
    const doneItems = allItems.filter(item => item.done);

    await this.updateWindows(userId, yesterdayEvents);
    await this.updateLengths(userId, doneItems);

    const snoozeCount = yesterdayEvents.filter(e => e.kind === 'item_snoozed').length;
    const skipCount = yesterdayEvents.filter(e => e.kind === 'item_skipped').length;
    const focusBlocksCompleted = doneItems.filter(item =>
      item.type === 'task' || item.type === 'quiz'
    ).length;

    const startEvents = yesterdayEvents.filter(e => e.kind === 'item_started');
    let avgStartDelayMin: number | undefined;
    if (startEvents.length > 0) {
      const delays = startEvents
        .filter(e => e.context?.startPlanned && e.context?.startActual)
        .map(e => {
          const planned = dayjs(e.context!.startPlanned!);
          const actual = dayjs(e.context!.startActual!);
          return actual.diff(planned, 'minute');
        });

      if (delays.length > 0) {
        avgStartDelayMin = delays.reduce((sum, d) => sum + d, 0) / delays.length;
      }
    }

    await this.storage.upsertDailyRollup({
      userId,
      date: yesterday.format('YYYY-MM-DD'),
      focusBlocksCompleted,
      snoozes: snoozeCount,
      skips: skipCount,
      avgStartDelayMin,
    });
  }

  async initializeHabitLearn(userId: string): Promise<HabitLearn> {
    const defaultWindow = Array(24).fill(0.5);
    defaultWindow[18] = 0.6;
    defaultWindow[19] = 0.6;
    defaultWindow[20] = 0.6;

    const windowJSON = {
      Mon: [...defaultWindow],
      Tue: [...defaultWindow],
      Wed: [...defaultWindow],
      Thu: [...defaultWindow],
      Fri: [...defaultWindow],
      Sat: [...defaultWindow],
      Sun: [...defaultWindow],
    };

    const lengthJSON = {
      study: 60,
      quiz: 15,
      task: 45,
      event: 60,
      breakTime: 15,
      leisure: 60,
    };

    const penalties = {
      nightHeavy: 0.3,
      lowSleep: 0.2,
    };

    const preferences = {
      preferEvening: false,
      maxContinuousFocus: 60,
      pinnedWindows: [],
      bannedWindows: [],
    };

    return await this.storage.upsertHabitLearn({
      userId,
      windowJSON,
      lengthJSON,
      penalties,
      preferences,
    });
  }

  async applyMicroMoodFeedback(
    userId: string,
    itemType: string,
    rating: "easy" | "ok" | "hard",
    slot: { weekday: string; hour: number }
  ): Promise<number> {
    let learn = await this.storage.getHabitLearn(userId);
    if (!learn) {
      learn = await this.initializeHabitLearn(userId);
    }

    const updatedLengthJSON = { ...learn.lengthJSON };
    const currentDuration = updatedLengthJSON[itemType] || 60;
    
    let newDuration = currentDuration;
    if (rating === 'easy') {
      newDuration = currentDuration * 0.9;
    } else if (rating === 'hard') {
      newDuration = currentDuration * 1.1;
    }
    
    updatedLengthJSON[itemType] = Math.max(
      this.MICRO_MOOD_MIN_DURATION,
      Math.min(this.MICRO_MOOD_MAX_DURATION, newDuration)
    );

    const updatedWindowJSON = { ...learn.windowJSON };
    const weekdayKey = slot.weekday as keyof typeof learn.windowJSON;
    const currentWindowScores = updatedWindowJSON[weekdayKey] || Array(24).fill(0.5);
    const newWindowScores = [...currentWindowScores];
    
    if (rating === 'easy') {
      newWindowScores[slot.hour] = Math.min(1.0, (newWindowScores[slot.hour] || 0.5) + 0.05);
    } else if (rating === 'hard') {
      newWindowScores[slot.hour] = Math.max(0.0, (newWindowScores[slot.hour] || 0.5) - 0.05);
    }
    
    updatedWindowJSON[weekdayKey] = newWindowScores;

    await this.storage.upsertHabitLearn({
      userId,
      windowJSON: updatedWindowJSON,
      lengthJSON: updatedLengthJSON,
    });

    return updatedLengthJSON[itemType];
  }
}

export const learningService = new LearningService(storage);
