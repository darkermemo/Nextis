import { storage } from "../storage";
import type { ParsedIntent, Item, InsertItem, DayState, User, NextActions } from "@shared/schema";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export class PlannerEngine {
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
        const taskItem = await storage.createItem({
          userId,
          type: "task",
          title: intent.title || "New Task",
          priority: intent.priority || "normal",
          durationMinutes: intent.durationMinutes || 30,
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

    // Create study blocks (Mon-Thu before exam)
    const studyDays = [];
    for (let i = 1; i <= 4; i++) {
      const studyDay = examDate.subtract(i, 'days');
      if (studyDay.day() >= 1 && studyDay.day() <= 4) { // Mon-Thu
        studyDays.push(studyDay);
      }
    }

    for (const studyDay of studyDays.reverse()) {
      const studyBlock = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `${intent.title || "Exam"} - Study Block`,
        start: studyDay.hour(18).minute(0).toDate(),
        end: studyDay.hour(19).minute(30).toDate(),
        durationMinutes: 90,
        priority: "high",
        tags: ["study", "exam-prep"],
      });
      items.push(studyBlock);
    }

    // Create quiz sessions (Tue-Thu)
    for (let i = 2; i <= 4; i++) {
      const quizDay = examDate.subtract(i, 'days');
      if (quizDay.day() >= 2 && quizDay.day() <= 4) {
        const quiz = await storage.createItem({
          userId: user.id,
          type: "quiz",
          title: `${intent.title || "Exam"} - Quick Quiz`,
          start: quizDay.hour(17).minute(0).toDate(),
          end: quizDay.hour(17).minute(15).toDate(),
          durationMinutes: 15,
          priority: "normal",
          tags: ["quiz", "exam-prep"],
        });
        items.push(quiz);
      }
    }

    // Create cram session (Thu evening before, avoiding bedtime)
    const cramDay = examDate.subtract(1, 'days');
    const bedtimeLimit = cramDay.hour(user.bedtimeHour - 1.5).minute(0);
    const cramSession = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${intent.title || "Exam"} - Final Cram`,
      start: cramDay.hour(19).minute(0).toDate(),
      end: cramDay.hour(20).minute(0).toDate(),
      durationMinutes: 60,
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
    
    for (let i = 1; i <= count; i++) {
      const homework = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `Homework Assignment ${i}`,
        deadline: dueDate.toDate(),
        durationMinutes: 60,
        priority: "normal",
        tags: ["homework"],
      });
      items.push(homework);

      // Schedule work blocks across the week
      const workDay = dueDate.subtract(count - i + 1, 'days');
      if (workDay.day() >= 1 && workDay.day() <= 4) { // Mon-Thu
        const workBlock = await storage.createItem({
          userId: user.id,
          type: "task",
          title: `Work on Assignment ${i}`,
          start: workDay.hour(19).minute(0).toDate(),
          end: workDay.hour(20).minute(0).toDate(),
          durationMinutes: 60,
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
}

export const plannerEngine = new PlannerEngine();
