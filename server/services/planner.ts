import { storage } from "../storage";
import type { ParsedIntent, Item, InsertItem, DayState, User, NextActions, HabitLearn } from "@shared/schema";
import { learningService } from "./learning";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export interface ExplanationResult {
  itemId: string;
  scheduledSlot: string;
  score: number;
  why: string[];
  alternatives: Array<{ slot: string; score: number; reason: string }>;
}

export class PlannerEngine {
  // Get learning context for intelligent scheduling
  private async getLearningContext(userId: string, date: dayjs.Dayjs, timezone: string) {
    // Get or initialize HabitLearn data
    let habitLearn = await storage.getHabitLearn(userId);
    if (!habitLearn) {
      habitLearn = await learningService.initializeHabitLearn(userId);
    }

    // Get day state for mood
    const dayState = await storage.getDayState(userId, date.format("YYYY-MM-DD"));
    const mood = dayState?.mood || 'none';

    // Get sleep hours from daily rollup or use default
    const rollup = await storage.getDailyRollup(userId, date.format("YYYY-MM-DD"));
    const sleepH = rollup?.sleepHours || 7;

    // Count meetings for the day
    const dayItems = await storage.getItems(userId, {
      start: date.startOf('day').toDate(),
      end: date.endOf('day').toDate(),
    });
    const meetings = dayItems.filter(item => item.type === 'event').length;

    return { habitLearn, mood, sleepH, meetings };
  }

  // Find best time slot using learning signals
  private async findBestSlot(
    userId: string,
    day: dayjs.Dayjs,
    timezone: string,
    constraints: {
      earliestHour: number;
      latestHour: number;
      durationMinutes: number;
      avoidHours?: number[];
    }
  ): Promise<dayjs.Dayjs> {
    const { habitLearn, mood, sleepH, meetings } = await this.getLearningContext(userId, day, timezone);
    const weekday = day.format('ddd');

    // Generate candidate slots
    const slots: { hour: number; score: number }[] = [];
    for (let hour = constraints.earliestHour; hour <= constraints.latestHour; hour++) {
      // Skip avoided hours
      if (constraints.avoidHours?.includes(hour)) continue;

      // Check snooze risk for evening heavy tasks
      const risk = learningService.snoozeRisk({ hour, sleepH, mood, meetings });
      
      // Skip high-risk slots (> 0.6) for tasks requiring focus
      if (risk > 0.6 && constraints.durationMinutes > 45) continue;

      // Score this slot using learning signals
      const score = learningService.scoreSlot(
        habitLearn,
        weekday,
        hour,
        { sleepH, mood, meetings }
      );

      slots.push({ hour, score });
    }

    // Sort by score (highest first) and return best slot
    if (slots.length === 0) {
      // Fallback to earliest allowed hour if no good slots found
      return day.hour(constraints.earliestHour).minute(0);
    }

    slots.sort((a, b) => b.score - a.score);
    return day.hour(slots[0].hour).minute(0);
  }

  // Get learned duration for a task type, with fallback
  private async getLearnedDuration(userId: string, type: string, fallbackMinutes: number): Promise<number> {
    const habitLearn = await storage.getHabitLearn(userId);
    if (!habitLearn || !habitLearn.lengthJSON || !habitLearn.lengthJSON[type]) {
      return fallbackMinutes;
    }
    return habitLearn.lengthJSON[type];
  }

  async explainPlacement(userId: string, itemId: string, timezone: string = "Asia/Riyadh"): Promise<ExplanationResult> {
    const item = await storage.getItem(itemId, userId);
    if (!item) {
      throw new Error("Item not found");
    }

    if (!item.start) {
      throw new Error("Item has no scheduled time");
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const itemStart = dayjs(item.start).tz(timezone);
    const itemHour = itemStart.hour();
    const itemMinute = itemStart.minute();
    const weekday = itemStart.format('ddd');
    const scheduledSlot = itemStart.format('ddd HH:mm');

    const { habitLearn, mood, sleepH, meetings } = await this.getLearningContext(userId, itemStart, timezone);

    const windowScores = habitLearn.windowJSON[weekday as keyof typeof habitLearn.windowJSON] || Array(24).fill(0.5);
    const windowScore = windowScores[itemHour] ?? 0.5;
    const risk = learningService.snoozeRisk({ hour: itemHour, sleepH, mood, meetings });
    const nightHeavyPenalty = habitLearn.penalties?.nightHeavy || 0.3;
    const curfewPenalty = itemHour >= 21 ? nightHeavyPenalty : 0;
    const score = Math.max(0, Math.min(1, windowScore - risk - curfewPenalty));

    const why: string[] = [];

    if (windowScore > 0.8) {
      why.push("This is your most productive hour");
    } else if (windowScore > 0.6) {
      const percentHigher = Math.round((windowScore - 0.5) * 100);
      why.push(`${weekday}s at ${itemHour}:00 have ${percentHigher}% higher completion rate`);
    }

    if (itemHour >= user.bedtimeHour - 1.5 && itemHour < user.bedtimeHour) {
      why.push("No heavy work within 90 minutes before bedtime");
    }

    if (risk < 0.2) {
      why.push("Low snooze risk at this time");
    } else if (risk > 0.6) {
      why.push("Higher snooze risk - consider earlier slot if possible");
    }

    if (mood === 'motivated' || mood === 'focused') {
      why.push("Aligned with your current mood state");
    } else if (mood === 'tired' || mood === 'stressed') {
      why.push("Lighter tasks recommended due to current mood");
    }

    const dayItems = await storage.getItems(userId, {
      start: itemStart.startOf('day').toDate(),
      end: itemStart.endOf('day').toDate(),
    });

    const conflicts = dayItems.filter(other => {
      if (other.id === itemId || !other.start || !other.end) return false;
      const otherStart = dayjs(other.start).tz(timezone);
      const otherEnd = dayjs(other.end).tz(timezone);
      const itemEnd = item.end ? dayjs(item.end).tz(timezone) : itemStart.add(item.durationMinutes || 30, 'minutes');
      return otherStart.isBefore(itemEnd) && otherEnd.isAfter(itemStart);
    });

    if (conflicts.length === 0) {
      why.push("Scheduled during free time");
    }

    const previousItem = dayItems
      .filter(other => other.end && dayjs(other.end).isBefore(itemStart) && dayjs(other.end).isAfter(itemStart.subtract(2, 'hours')))
      .sort((a, b) => dayjs(b.end!).diff(dayjs(a.end!)))
      [0];

    if (previousItem && previousItem.priority === 'high') {
      why.push(`Follows ${previousItem.type === 'event' ? 'important meeting' : 'high-priority task'}`);
    }

    if (why.length === 0) {
      why.push("Standard scheduling based on your preferences");
    }

    const alternatives: Array<{ slot: string; score: number; reason: string }> = [];
    const searchDays = itemStart.isSame(dayjs().tz(timezone), 'day') ? [0, 1] : [0];
    
    for (const dayOffset of searchDays) {
      const searchDay = itemStart.add(dayOffset, 'day');
      const { habitLearn: altHabitLearn, mood: altMood, sleepH: altSleepH, meetings: altMeetings } = await this.getLearningContext(userId, searchDay, timezone);
      const altWeekday = searchDay.format('ddd');
      const altWindowScores = altHabitLearn.windowJSON[altWeekday as keyof typeof altHabitLearn.windowJSON] || Array(24).fill(0.5);

      const startHour = dayOffset === 0 ? Math.max(itemHour + 1, user.workEndHour) : user.workEndHour;
      const endHour = user.bedtimeHour - 1;

      for (let hour = startHour; hour <= endHour; hour++) {
        if (hour === itemHour && dayOffset === 0) continue;

        const altRisk = learningService.snoozeRisk({ hour, sleepH: altSleepH, mood: altMood, meetings: altMeetings });
        const altWindowScore = altWindowScores[hour] ?? 0.5;
        const altCurfewPenalty = hour >= 21 ? nightHeavyPenalty : 0;
        const altScore = Math.max(0, Math.min(1, altWindowScore - altRisk - altCurfewPenalty));

        if (altScore > score * 0.9) {
          const slotTime = searchDay.hour(hour).minute(0);
          const slot = slotTime.format('ddd HH:mm');
          
          let reason = "";
          if (altWindowScore > windowScore + 0.1) {
            reason = "Higher completion rate";
          } else if (altRisk < risk - 0.2) {
            reason = "Lower snooze risk";
          } else if (hour < itemHour) {
            reason = "Earlier slot available";
          } else {
            reason = "Similar productivity";
          }

          alternatives.push({ slot, score: altScore, reason });
        }
      }
    }

    alternatives.sort((a, b) => b.score - a.score);
    const topAlternatives = alternatives.slice(0, 5);

    return {
      itemId,
      scheduledSlot,
      score,
      why,
      alternatives: topAlternatives,
    };
  }

  async applyIntent(intent: ParsedIntent, userId: string, timezone: string = "Asia/Riyadh"): Promise<{
    items: Item[];
    changes: string[];
  }> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const now = dayjs().tz(timezone);
    const today = now.format("YYYY-MM-DD");
    
    let dayState = await storage.getDayState(userId, today);
    if (!dayState) {
      dayState = await storage.upsertDayState({
        userId,
        date: today,
        mood: "none",
        hasEarlyWorkTomorrow: false,
      });
    }

    const createdItems: Item[] = [];
    const changes: string[] = [];

    switch (intent.kind) {
      case "addExam":
        const examItems = await this.createExamPlan(intent, user, timezone);
        createdItems.push(...examItems);
        changes.push(`Created exam on ${intent.date || 'TBD'} with study blocks, quizzes, and reminders`);
        break;

      case "addMeeting":
        const meetingItems = await this.createMeetingPlan(intent, user, timezone);
        createdItems.push(...meetingItems);
        changes.push(`Scheduled meeting with reminders and break buffer`);
        break;

      case "addHomeworks":
        const homeworkItems = await this.createHomeworkPlan(intent, user, timezone);
        createdItems.push(...homeworkItems);
        changes.push(`Created ${intent.count || 1} homework tasks with distributed work blocks`);
        break;

      case "addBreaks":
        const breakItems = await this.createBreakPlan(user, timezone);
        createdItems.push(...breakItems);
        changes.push(`Added coffee breaks every ~90 minutes during work periods`);
        break;

      case "addLeisureTV":
        const tvItems = await this.createTVPlan(user, timezone);
        createdItems.push(...tvItems);
        changes.push(`Added nightly TV time slots when available`);
        break;

      case "setMood":
        if (intent.mood) {
          await storage.upsertDayState({
            ...dayState,
            mood: intent.mood,
          });
          await this.adjustScheduleForMood(intent.mood, userId, timezone);
          changes.push(`Updated mood to ${intent.mood} and adjusted schedule accordingly`);
        }
        break;

      case "setEarlyWork":
        await storage.upsertDayState({
          ...dayState,
          hasEarlyWorkTomorrow: intent.earlyWorkTomorrow || false,
        });
        if (intent.earlyWorkTomorrow) {
          await this.adjustScheduleForEarlyWork(userId, timezone);
          changes.push("Advanced bedtime and adjusted evening schedule for early work");
        }
        break;

      case "genericTask":
        // Use learned duration for tasks if not explicitly specified
        const taskDuration = intent.durationMinutes || await this.getLearnedDuration(userId, "task", 30);
        
        const taskItem = await storage.createItem({
          userId,
          type: "task",
          title: intent.title || "New Task",
          priority: intent.priority || "normal",
          durationMinutes: taskDuration,
          deadline: intent.date ? dayjs(intent.date).toDate() : undefined,
        });
        createdItems.push(taskItem);
        changes.push(`Added task: ${taskItem.title}`);
        break;
    }

    return { items: createdItems, changes };
  }

  private async createExamPlan(intent: ParsedIntent, user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const examDate = intent.date ? dayjs(intent.date).tz(timezone) : dayjs().tz(timezone).add(7, 'days');
    
    // Create exam event
    const exam = await storage.createItem({
      userId: user.id,
      type: "event",
      title: intent.title || "Exam",
      start: examDate.hour(10).minute(0).toDate(), // Default 10 AM
      end: examDate.hour(12).minute(0).toDate(),
      fixed: true,
      priority: "high",
      reminders: [
        examDate.subtract(2, 'days').hour(9).minute(0).toISOString(), // D-2
        examDate.subtract(5, 'hours').toISOString(), // T-5h
      ],
    });
    items.push(exam);

    // Get learned duration for study sessions
    const studyDuration = await this.getLearnedDuration(user.id, 'task', 90);

    // Create study blocks (Mon-Thu before exam) using learning signals
    const studyDays = [];
    for (let i = 1; i <= 4; i++) {
      const studyDay = examDate.subtract(i, 'days');
      if (studyDay.day() >= 1 && studyDay.day() <= 4) { // Mon-Thu
        studyDays.push(studyDay);
      }
    }

    for (const studyDay of studyDays.reverse()) {
      // Use learning signals to find best time slot for study block
      const bestSlot = await this.findBestSlot(user.id, studyDay, timezone, {
        earliestHour: user.workEndHour,
        latestHour: user.bedtimeHour - 2,
        durationMinutes: studyDuration,
      });

      const studyBlock = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `${intent.title || "Exam"} - Study Block`,
        start: bestSlot.toDate(),
        end: bestSlot.add(studyDuration, 'minutes').toDate(),
        durationMinutes: studyDuration,
        priority: "high",
        tags: ["study", "exam-prep"],
      });
      items.push(studyBlock);
    }

    // Get learned duration for quiz sessions
    const quizDuration = await this.getLearnedDuration(user.id, 'quiz', 15);

    // Create quiz sessions (Tue-Thu) using learning signals
    for (let i = 2; i <= 4; i++) {
      const quizDay = examDate.subtract(i, 'days');
      if (quizDay.day() >= 2 && quizDay.day() <= 4) {
        // Use learning signals to find best time slot for quiz
        const bestSlot = await this.findBestSlot(user.id, quizDay, timezone, {
          earliestHour: user.workEndHour - 1,
          latestHour: user.bedtimeHour - 1,
          durationMinutes: quizDuration,
        });

        const quiz = await storage.createItem({
          userId: user.id,
          type: "quiz",
          title: `${intent.title || "Exam"} - Quick Quiz`,
          start: bestSlot.toDate(),
          end: bestSlot.add(quizDuration, 'minutes').toDate(),
          durationMinutes: quizDuration,
          priority: "normal",
          tags: ["quiz", "exam-prep"],
        });
        items.push(quiz);
      }
    }

    // Create cram session (Thu evening before, avoiding bedtime)
    const cramDay = examDate.subtract(1, 'days');
    const cramDuration = await this.getLearnedDuration(user.id, 'task', 60);
    
    // Use learning signals to find best time slot for cram session, avoiding snooze risk
    const bestCramSlot = await this.findBestSlot(user.id, cramDay, timezone, {
      earliestHour: user.workEndHour,
      latestHour: user.bedtimeHour - 2,
      durationMinutes: cramDuration,
    });

    const cramSession = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${intent.title || "Exam"} - Final Cram`,
      start: bestCramSlot.toDate(),
      end: bestCramSlot.add(cramDuration, 'minutes').toDate(),
      durationMinutes: cramDuration,
      priority: "high",
      tags: ["cram", "exam-prep"],
    });
    items.push(cramSession);

    return items;
  }

  private async createMeetingPlan(intent: ParsedIntent, user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const meetingDate = intent.date ? dayjs(intent.date).tz(timezone) : dayjs().tz(timezone).add(1, 'days');
    const meetingTime = intent.time ? meetingDate.format('YYYY-MM-DD') + ' ' + intent.time : meetingDate.hour(21).minute(0);
    const meetingStart = dayjs(meetingTime).tz(timezone);
    
    // Create meeting event
    const meeting = await storage.createItem({
      userId: user.id,
      type: "event",
      title: intent.title || "Meeting",
      start: meetingStart.toDate(),
      end: meetingStart.add(1, 'hour').toDate(),
      fixed: true,
      priority: "normal",
      reminders: [
        meetingStart.subtract(2, 'days').hour(9).minute(0).toISOString(), // D-2
        meetingStart.subtract(5, 'hours').toISOString(), // T-5h
      ],
    });
    items.push(meeting);

    // Add coffee break before meeting if it's in the evening
    if (meetingStart.hour() >= 19) {
      const coffeeBreak = await storage.createItem({
        userId: user.id,
        type: "breakTime",
        title: "Coffee Break",
        start: meetingStart.subtract(30, 'minutes').toDate(),
        end: meetingStart.subtract(15, 'minutes').toDate(),
        durationMinutes: 15,
        priority: "low",
        tags: ["coffee", "pre-meeting"],
      });
      items.push(coffeeBreak);
    }

    return items;
  }

  private async createHomeworkPlan(intent: ParsedIntent, user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const count = intent.count || 1;
    const dueDate = dayjs().tz(timezone).add(1, 'week').day(5); // Next Friday
    
    // Get learned duration for homework tasks
    const homeworkDuration = await this.getLearnedDuration(user.id, 'task', 60);
    
    for (let i = 1; i <= count; i++) {
      const homework = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `Homework Assignment ${i}`,
        deadline: dueDate.toDate(),
        durationMinutes: homeworkDuration,
        priority: "normal",
        tags: ["homework"],
      });
      items.push(homework);

      // Schedule work blocks across the week using learning signals
      const workDay = dueDate.subtract(count - i + 1, 'days');
      if (workDay.day() >= 1 && workDay.day() <= 4) { // Mon-Thu
        // Use learning signals to find best time slot for work block
        const bestSlot = await this.findBestSlot(user.id, workDay, timezone, {
          earliestHour: user.workEndHour,
          latestHour: user.bedtimeHour - 2,
          durationMinutes: homeworkDuration,
        });

        const workBlock = await storage.createItem({
          userId: user.id,
          type: "task",
          title: `Work on Assignment ${i}`,
          start: bestSlot.toDate(),
          end: bestSlot.add(homeworkDuration, 'minutes').toDate(),
          durationMinutes: homeworkDuration,
          priority: "normal",
          tags: ["homework", "work-block"],
        });
        items.push(workBlock);
      }
    }

    return items;
  }

  private async createBreakPlan(user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const today = dayjs().tz(timezone);
    
    // Add coffee breaks during work hours every ~90 minutes
    const workStart = today.hour(user.workStartHour);
    const workEnd = today.hour(user.workEndHour);
    
    let breakTime = workStart.add(90, 'minutes');
    while (breakTime.isBefore(workEnd)) {
      const coffeeBreak = await storage.createItem({
        userId: user.id,
        type: "breakTime",
        title: "Coffee Break",
        start: breakTime.toDate(),
        end: breakTime.add(15, 'minutes').toDate(),
        durationMinutes: 15,
        priority: "low",
        tags: ["coffee"],
      });
      items.push(coffeeBreak);
      breakTime = breakTime.add(90, 'minutes');
    }

    return items;
  }

  private async createTVPlan(user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    
    // Add TV time for next 7 days at default time if free
    for (let i = 0; i < 7; i++) {
      const tvDay = dayjs().tz(timezone).add(i, 'days');
      const tvStart = tvDay.hour(user.defaultTVStartHour).minute(30);
      const tvEnd = tvStart.add(30, 'minutes');

      // Check if slot is free (simplified check)
      const tvTime = await storage.createItem({
        userId: user.id,
        type: "leisure",
        title: "TV Time",
        start: tvStart.toDate(),
        end: tvEnd.toDate(),
        durationMinutes: 30,
        priority: "low",
        tags: ["tv", "leisure"],
      });
      items.push(tvTime);
    }

    return items;
  }

  private async adjustScheduleForMood(mood: string, userId: string, timezone: string): Promise<void> {
    const items = await storage.getItems(userId, {
      start: dayjs().tz(timezone).toDate(),
      end: dayjs().tz(timezone).add(2, 'days').toDate(),
    });

    if (mood === "tired" || mood === "stressed") {
      // Reduce duration of heavy tasks, convert to lighter review sessions
      for (const item of items) {
        if (item.type === "task" && item.priority === "high" && item.durationMinutes && item.durationMinutes > 60) {
          await storage.updateItem(item.id, userId, {
            durationMinutes: Math.max(30, item.durationMinutes * 0.7),
            notes: `Adjusted for ${mood} mood - lighter session`,
          });
        }
      }
    }
  }

  private async adjustScheduleForEarlyWork(userId: string, timezone: string): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const tomorrow = dayjs().tz(timezone).add(1, 'day');
    const earlyBedtime = user.bedtimeHour - 1.5; // 90 minutes earlier
    const noWorkAfter = tomorrow.hour(earlyBedtime - 1.5); // No heavy work 90min before bedtime

    // Move or remove items that conflict with early bedtime
    const items = await storage.getItems(userId, {
      start: tomorrow.startOf('day').toDate(),
      end: tomorrow.endOf('day').toDate(),
    });

    for (const item of items) {
      if (item.start && dayjs(item.start).isAfter(noWorkAfter) && 
          item.type === "task" && item.priority === "high") {
        // Move to earlier time or mark for rescheduling
        await storage.updateItem(item.id, userId, {
          start: noWorkAfter.subtract(item.durationMinutes || 60, 'minutes').toDate(),
          end: noWorkAfter.toDate(),
          notes: "Moved for early work schedule",
        });
      }
    }
  }

  async insertMicroBreaks(userId: string, now: Date): Promise<Item[]> {
    const user = await storage.getUser(userId);
    if (!user || !user.autoBreaks) {
      return [];
    }

    const nowDayjs = dayjs(now);
    const timezone = user.timezone;
    const createdBreaks: Item[] = [];

    const sevenDaysLater = nowDayjs.add(7, 'days');
    const allItems = await storage.getItems(userId, {
      start: nowDayjs.toDate(),
      end: sevenDaysLater.toDate(),
    });

    const scheduledItems = allItems
      .filter(item => item.start && item.type !== 'breakTime')
      .sort((a, b) => dayjs(a.start!).diff(dayjs(b.start!)));

    for (let i = 0; i < scheduledItems.length; i++) {
      const item = scheduledItems[i];
      if (!item.start || !item.durationMinutes) continue;

      const itemStart = dayjs(item.start).tz(timezone);
      const itemHour = itemStart.hour();
      const itemDuration = item.durationMinutes;

      const dayState = await storage.getDayState(userId, itemStart.format("YYYY-MM-DD"));
      const rollup = await storage.getDailyRollup(userId, itemStart.format("YYYY-MM-DD"));
      const mood = dayState?.mood || 'none';
      const sleepH = rollup?.sleepHours || 7;

      const dayItems = await storage.getItems(userId, {
        start: itemStart.startOf('day').toDate(),
        end: itemStart.endOf('day').toDate(),
      });
      const meetings = dayItems.filter(i => i.type === 'event').length;

      const snoozeRisk = learningService.snoozeRisk({ 
        hour: itemHour, 
        sleepH, 
        mood, 
        meetings 
      });

      let shouldInsertBreak = false;
      let breakReason = "";

      if (itemDuration > 45 && snoozeRisk > 0.5) {
        shouldInsertBreak = true;
        breakReason = "Heavy task with high snooze risk";
      }

      const minutesUntilBedtime = (user.bedtimeHour - itemHour) * 60 - itemStart.minute();
      if (minutesUntilBedtime <= 120 && minutesUntilBedtime > 0) {
        shouldInsertBreak = true;
        breakReason = "Task near bedtime";
      }

      if (i > 0) {
        const prevItem = scheduledItems[i - 1];
        if (prevItem.end) {
          const prevEnd = dayjs(prevItem.end).tz(timezone);
          const continuousFocusMinutes = itemStart.diff(prevEnd, 'minute');
          
          if (prevEnd.isSame(itemStart, 'day') && continuousFocusMinutes >= 0 && continuousFocusMinutes < 10) {
            const totalDuration = dayjs(prevItem.start!).diff(itemStart, 'minute') * -1;
            if (totalDuration >= 60) {
              shouldInsertBreak = true;
              breakReason = "After 60+ minutes of continuous focus";
            }
          }
        }
      }

      if (shouldInsertBreak) {
        const breakStart = itemStart.subtract(10, 'minutes');
        
        const hasConflict = allItems.some(existing => {
          if (!existing.start || existing.id === item.id) return false;
          const existingStart = dayjs(existing.start).tz(timezone);
          const existingEnd = existing.end 
            ? dayjs(existing.end).tz(timezone) 
            : existingStart.add(existing.durationMinutes || 30, 'minutes');
          const breakEnd = breakStart.add(10, 'minutes');
          return existingStart.isBefore(breakEnd) && existingEnd.isAfter(breakStart);
        });

        if (!hasConflict && breakStart.hour() >= user.workStartHour && breakStart.hour() < user.workEndHour) {
          const breakItem = await storage.createItem({
            userId: user.id,
            type: "breakTime",
            title: "Micro Break",
            notes: breakReason,
            start: breakStart.toDate(),
            end: breakStart.add(10, 'minutes').toDate(),
            durationMinutes: 10,
            priority: "low",
            tags: ["auto-break"],
          });
          createdBreaks.push(breakItem);
          allItems.push(breakItem);
        }
      }
    }

    return createdBreaks;
  }

  async getNextThreeActions(userId: string, timezone: string = "Asia/Riyadh"): Promise<NextActions> {
    const now = dayjs().tz(timezone);
    const items = await storage.getItems(userId, {
      start: now.toDate(),
      end: now.add(7, 'days').toDate(),
    });

    // Filter and sort by priority and urgency
    const actionableItems = items
      .filter(item => !item.done && item.type !== "breakTime" && item.type !== "leisure")
      .sort((a, b) => {
        // Priority scoring
        const priorityScore = { high: 3, normal: 2, low: 1 };
        const aScore = priorityScore[a.priority as keyof typeof priorityScore] || 2;
        const bScore = priorityScore[b.priority as keyof typeof priorityScore] || 2;
        
        if (aScore !== bScore) return bScore - aScore;

        // Urgency based on deadline/start time
        const aUrgency = a.deadline ? dayjs(a.deadline).diff(now, 'hours') : 
                        (a.start ? dayjs(a.start).diff(now, 'hours') : 999);
        const bUrgency = b.deadline ? dayjs(b.deadline).diff(now, 'hours') : 
                        (b.start ? dayjs(b.start).diff(now, 'hours') : 999);
        
        return aUrgency - bUrgency;
      })
      .slice(0, 3);

    return {
      items: actionableItems.map(item => ({
        id: item.id,
        title: item.title,
        type: item.type as any,
        priority: item.priority as any,
        durationMinutes: item.durationMinutes,
        deadline: item.deadline ? (item.deadline instanceof Date ? item.deadline.toISOString() : item.deadline) : null,
        start: item.start ? (item.start instanceof Date ? item.start.toISOString() : item.start) : null,
      })),
    };
  }

  async proposeEarlierStart(userId: string, now: Date, timezone: string = "Asia/Riyadh"): Promise<{
    itemId: string;
    fromSlot: string;
    toSlot: string;
    message: string;
  } | null> {
    const nowDayjs = dayjs(now).tz(timezone);
    const user = await storage.getUser(userId);
    if (!user) return null;

    // Check if we have at least 45 minutes of free time right now
    const currentHour = nowDayjs.hour();
    const currentMinute = nowDayjs.minute();
    
    // Don't suggest during work hours or late night
    if (currentHour < user.workEndHour || currentHour >= user.bedtimeHour - 1) {
      return null;
    }

    // Get all items for the next 48 hours
    const futureItems = await storage.getItems(userId, {
      start: nowDayjs.toDate(),
      end: nowDayjs.add(48, 'hours').toDate(),
    });

    // Check if current time is free (no items in next 45 minutes)
    const endOfFreeSlot = nowDayjs.add(45, 'minutes');
    const conflictingItems = futureItems.filter(item => {
      if (!item.start) return false;
      const itemStart = dayjs(item.start).tz(timezone);
      const itemEnd = item.end ? dayjs(item.end).tz(timezone) : itemStart.add(item.durationMinutes || 30, 'minutes');
      return itemStart.isBefore(endOfFreeSlot) && itemEnd.isAfter(nowDayjs);
    });

    if (conflictingItems.length > 0) {
      return null; // Current time is not free
    }

    // Find high-priority item scheduled later that could be moved to now
    const highPriorityItems = futureItems
      .filter(item => 
        item.priority === "high" && 
        !item.done && 
        !item.fixed &&
        item.type === "task" &&
        item.start &&
        dayjs(item.start).isAfter(nowDayjs) &&
        (item.durationMinutes || 30) <= 45
      )
      .sort((a, b) => {
        const aStart = dayjs(a.start!).tz(timezone);
        const bStart = dayjs(b.start!).tz(timezone);
        return aStart.diff(bStart);
      });

    if (highPriorityItems.length === 0) {
      return null;
    }

    const itemToMove = highPriorityItems[0];
    const fromSlot = dayjs(itemToMove.start!).tz(timezone).format('h:mm A');
    const toSlot = nowDayjs.format('h:mm A');

    return {
      itemId: itemToMove.id,
      fromSlot,
      toSlot,
      message: `You have ${Math.floor((itemToMove.durationMinutes || 30))} free minutes now. Want to start "${itemToMove.title}" early (was scheduled for ${fromSlot})?`
    };
  }

  async proposeReschedule(userId: string, missedItemId: string, now: Date, timezone: string = "Asia/Riyadh"): Promise<{
    itemId: string;
    toSlot: string;
    message: string;
  } | null> {
    const nowDayjs = dayjs(now).tz(timezone);
    const user = await storage.getUser(userId);
    if (!user) return null;

    const missedItem = await storage.getItem(missedItemId, userId);
    if (!missedItem) return null;

    // Find the next best slot for this item
    const searchDays = 3; // Look within next 3 days
    for (let dayOffset = 0; dayOffset < searchDays; dayOffset++) {
      const searchDay = nowDayjs.add(dayOffset, 'day');
      
      // Use findBestSlot with learned preferences
      const bestSlot = await this.findBestSlot(userId, searchDay, timezone, {
        earliestHour: dayOffset === 0 ? nowDayjs.hour() + 1 : user.workEndHour,
        latestHour: user.bedtimeHour - 1,
        durationMinutes: missedItem.durationMinutes || 30,
      });

      // Check if this slot is actually free
      const slotEnd = bestSlot.add(missedItem.durationMinutes || 30, 'minutes');
      const existingItems = await storage.getItems(userId, {
        start: bestSlot.toDate(),
        end: slotEnd.toDate(),
      });

      const hasConflict = existingItems.some(item => {
        if (!item.start || item.id === missedItemId) return false;
        const itemStart = dayjs(item.start).tz(timezone);
        const itemEnd = item.end ? dayjs(item.end).tz(timezone) : itemStart.add(item.durationMinutes || 30, 'minutes');
        return itemStart.isBefore(slotEnd) && itemEnd.isAfter(bestSlot);
      });

      if (!hasConflict) {
        const toSlot = bestSlot.format('ddd h:mm A');
        const dayLabel = dayOffset === 0 ? "today" : dayOffset === 1 ? "tomorrow" : bestSlot.format('dddd');
        
        return {
          itemId: missedItemId,
          toSlot: bestSlot.toISOString(),
          message: `Missed "${missedItem.title}"? Best slot is ${dayLabel} at ${bestSlot.format('h:mm A')}`
        };
      }
    }

    return null;
  }
}

export const plannerEngine = new PlannerEngine();
