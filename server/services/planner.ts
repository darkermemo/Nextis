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

// Check if a given window is conflict-free
async function isWindowFree(
  userId: string,
  slotStart: dayjs.Dayjs,
  minutes: number,
  tz: string
): Promise<boolean> {
  const slotEnd = slotStart.add(minutes, "minute");
  const items = await storage.getItems(userId, {
    start: slotStart.toDate(),
    end: slotEnd.toDate(),
  });
  return !items.some((it) => {
    if (!it.start) return false;
    const s = dayjs(it.start).tz(tz);
    const e = it.end ? dayjs(it.end).tz(tz) : s.add(it.durationMinutes || 30, "minute");
    return s.isBefore(slotEnd) && e.isAfter(slotStart);
  });
}

// Compact a single day by left-packing flexible items without causing conflicts
export async function compactDay(userId: string, isoDate: string, tz: string): Promise<void> {
  const user = await storage.getUser(userId);
  if (!user) return;

  const dayStart = dayjs.tz(isoDate, tz).startOf("day");
  const dayEnd = dayStart.endOf("day");

  const items = (await storage.getItems(userId, {
    start: dayStart.toDate(),
    end: dayEnd.toDate(),
  }))
    .filter((i) => i.start && !i.fixed)
    .sort((a, b) => dayjs(a.start!).valueOf() - dayjs(b.start!).valueOf());

  let cursor = dayStart.hour(user.workStartHour).minute(0);
  for (const it of items) {
    const plannedStart = dayjs(it.start!).tz(tz);
    const duration = it.durationMinutes
      || (it.end ? dayjs(it.end).diff(plannedStart, "minute") : 30);

    // Nudge cursor forward to avoid past and to within work hours
    if (cursor.isBefore(dayStart.hour(user.workStartHour))) {
      cursor = dayStart.hour(user.workStartHour).minute(0);
    }

    // Pack if free; otherwise, keep original
    if (await isWindowFree(userId, cursor, duration, tz)) {
      await storage.updateItem(it.id, userId, {
        start: cursor.toDate(),
        end: cursor.add(duration, "minute").toDate(),
      } as any);
      cursor = cursor.add(duration, "minute");
    } else {
      // Try a small scan forward (simple compaction)
      let placed = false;
      let probe = cursor;
      for (let k = 0; k < 6; k++) { // up to +30 minutes in 5-min steps
        probe = probe.add(5, "minute");
        if (await isWindowFree(userId, probe, duration, tz)) {
          await storage.updateItem(it.id, userId, {
            start: probe.toDate(),
            end: probe.add(duration, "minute").toDate(),
          } as any);
          cursor = probe.add(duration, "minute");
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Keep original placement and move cursor after it
        cursor = plannedStart.add(duration, "minute");
      }
    }
  }
}

// Given a set of same-day flexible tasks with deadlines, drop longest to reduce lateness (Moore–Hodgson)
function dropLongestToReduceLateness(tasks: Array<{ id: string; duration: number; deadline: dayjs.Dayjs }>) {
  const sorted = tasks
    .slice()
    .sort((a, b) => a.deadline.valueOf() - b.deadline.valueOf());
  const kept: typeof tasks = [];
  let total = 0;

  for (const t of sorted) {
    kept.push(t);
    total += t.duration;
    // If finishing after t.deadline, remove the longest so far
    if (dayjs().add(total, "minute").isAfter(t.deadline)) {
      kept.sort((x, y) => y.duration - x.duration);
      const removed = kept.shift();
      total -= removed!.duration;
    }
  }
  return kept;
}

// Attempt to repair an overfull day by dropping the longest task among deadline-constrained flexible tasks
async function repairDayWithMooreHodgson(userId: string, isoDate: string, tz: string): Promise<number> {
  const dayStart = dayjs.tz(isoDate, tz).startOf("day");
  const dayEnd = dayStart.endOf("day");
  const items = await storage.getItems(userId, {
    start: dayStart.toDate(),
    end: dayEnd.toDate(),
  });

  // Consider flexible tasks with deadlines
  const candidates = items.filter((i) => i.type === "task" && !i.fixed && i.deadline);
  if (candidates.length === 0) return 0;

  const mhInput = candidates.map((i) => ({
    id: i.id,
    duration: i.durationMinutes || 30,
    deadline: dayjs(i.deadline as Date).tz(tz),
  }));

  const kept = dropLongestToReduceLateness(mhInput);
  const keptIds = new Set(kept.map((k) => k.id));
  const toDrop = candidates.filter((c) => !keptIds.has(c.id));

  for (const d of toDrop) {
    await storage.updateItem(d.id, userId, {
      start: null as any,
      end: null as any,
      notes: (d as any).notes ? `${(d as any).notes} | Dropped for lateness` : "Dropped for lateness",
      tags: [...(d.tags || []), "reschedule"],
    } as any);
  }

  return toDrop.length;
}

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
      deadline?: dayjs.Dayjs;
    }
  ): Promise<dayjs.Dayjs> {
    const { habitLearn, mood, sleepH, meetings } = await this.getLearningContext(userId, day, timezone);
    const weekday = day.format('ddd');

    // Generate candidate slots
    const slots: { hour: number; score: number }[] = [];
    for (let hour = constraints.earliestHour; hour <= constraints.latestHour; hour++) {
      // Skip avoided hours
      if (constraints.avoidHours?.includes(hour)) continue;

      const slotStart = day.hour(hour).minute(0);

      // 1) Filter conflicts first
      const free = await isWindowFree(userId, slotStart, constraints.durationMinutes, timezone);
      if (!free) continue;

      // 2) Compute risk + learned score
      const risk = learningService.snoozeRisk({ hour, sleepH, mood, meetings });
      if (risk > 0.6 && constraints.durationMinutes > 45) continue;

      const learnedScore = learningService.scoreSlot(
        habitLearn,
        weekday,
        hour,
        { sleepH, mood, meetings }
      );

      // 3) Add deadline pressure (EDF/LST signal)
      let deadlineUrgency = 0;
      if (constraints.deadline) {
        const slackMin = Math.max(
          1,
          constraints.deadline.diff(slotStart, "minute") - (constraints.durationMinutes || 0)
        );
        deadlineUrgency = 1 / (1 + slackMin);
      }

      const score = learnedScore - risk + deadlineUrgency; // curfew penalty baked into scoreSlot

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
        {
          const meeting = meetingItems.find(i => i.type === 'event' && i.start);
          if (meeting && meeting.start) {
            const start = dayjs(meeting.start).tz(timezone);
            const end = meeting.end
              ? dayjs(meeting.end).tz(timezone)
              : start.add(meeting.durationMinutes || 60, 'minutes');

            changes.push(
              `Meeting scheduled ${start.format('ddd MMM D, h:mm A')}–${end.format('h:mm A')}`,
            );

            // Detect conflicts on the same day
            const dayItems = await storage.getItems(user.id, {
              start: start.startOf('day').toDate(),
              end: start.endOf('day').toDate(),
            });
            const conflicts = dayItems.filter(other => {
              if (other.id === meeting.id || !other.start) return false;
              const otherStart = dayjs(other.start).tz(timezone);
              const otherEnd = other.end
                ? dayjs(other.end).tz(timezone)
                : otherStart.add(other.durationMinutes || 30, 'minutes');
              return otherStart.isBefore(end) && otherEnd.isAfter(start);
            });

            if (conflicts.length === 0) {
              changes.push('No conflicts found');
            } else {
              const samples = conflicts.slice(0, 3)
                .map(c => {
                  const cs = dayjs(c.start!).tz(timezone);
                  const ce = c.end ? dayjs(c.end).tz(timezone) : cs.add(c.durationMinutes || 30, 'minutes');
                  return `${c.title} (${cs.format('h:mm A')}–${ce.format('h:mm A')})`;
                })
                .join(', ');
              changes.push(
                `Conflicts with ${conflicts.length} item(s): ${samples}${conflicts.length > 3 ? ', …' : ''}`,
              );
            }

            // Note coffee break if added
            const hadBreak = meetingItems.some(i => i.type === 'breakTime');
            if (hadBreak) {
              const br = meetingItems.find(i => i.type === 'breakTime');
              if (br && br.start) {
                const bs = dayjs(br.start).tz(timezone);
                const be = br.end ? dayjs(br.end).tz(timezone) : bs.add(br.durationMinutes || 15, 'minutes');
                changes.push(`Added Coffee Break ${bs.format('h:mm A')}–${be.format('h:mm A')}`);
              } else {
                changes.push('Added Coffee Break before meeting');
              }
            }

            changes.push('Calendar updated');
          } else {
            changes.push('Scheduled meeting with reminders and break buffer');
          }
        }
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

      case "addEvent":
      case "addAppointment":
      case "addSocial":
        // Fixed-time events (appointment, social, general event)
        const eventItems = await this.createEventPlan(intent, user, timezone);
        createdItems.push(...eventItems);
        {
          const evt = eventItems.find(i => i.type === 'event' && i.start);
          if (evt && evt.start) {
            const start = dayjs(evt.start).tz(timezone);
            const end = evt.end ? dayjs(evt.end).tz(timezone) : start.add(evt.durationMinutes || 60, 'minutes');
            changes.push(`${intent.category || 'Event'} scheduled ${start.format('ddd MMM D, h:mm A')}–${end.format('h:mm A')}`);
            changes.push('Calendar updated');
          }
        }
        break;

      case "addTask":
        // Flexible task with deadline/estimate
        const flexTaskItem = await this.createFlexibleTask(intent, user, timezone);
        createdItems.push(flexTaskItem);
        changes.push(`Added task: ${flexTaskItem.title}${intent.due || intent.before ? ` (due ${dayjs(intent.due || intent.before).format('MMM D')})` : ''}`);
        break;

      case "workoutPlan":
        // Gym/workout sessions
        const workoutItems = await this.createWorkoutPlan(intent, user, timezone);
        createdItems.push(...workoutItems);
        changes.push(`Scheduled ${workoutItems.length} workout sessions (${intent.estimateMinutes || 60}m each)`);
        break;

      case "genericTask":
        // Use learned duration and schedule by default
        const taskDuration = intent.durationMinutes || await this.getLearnedDuration(userId, "task", 45);

        // If a specific time is present, use it; otherwise pick best slot today within work/betdime window
        const dateBase = intent.date ? dayjs(intent.date).tz(timezone) : now;
        const timeStr = (intent as any).startTime || (intent as any).time;
        let start: dayjs.Dayjs;
        if (timeStr) {
          start = dayjs(`${dateBase.format('YYYY-MM-DD')} ${timeStr}`).tz(timezone);
        } else {
          // Find best slot today using learning signals (between work end and bedtime - 1h)
          start = await this.findBestSlot(user.id, dateBase, timezone, {
            earliestHour: user.workEndHour,
            latestHour: user.bedtimeHour - 1,
            durationMinutes: taskDuration,
          });
        }

        const scheduledTask = await storage.createItem({
          userId,
          type: "task",
          title: intent.title || "New Task",
          start: start.toDate(),
          end: start.add(taskDuration, 'minutes').toDate(),
          durationMinutes: taskDuration,
          priority: intent.priority || "normal",
          deadline: intent.date ? dayjs(intent.date).toDate() : undefined,
          tags: ["auto-scheduled"],
        });
        createdItems.push(scheduledTask);
        changes.push(`Scheduled task: ${scheduledTask.title} at ${start.format('h:mm A')}`);
        break;
    }

    return { items: createdItems, changes };
  }

  private async createExamPlan(intent: ParsedIntent, user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const examDate = intent.date ? dayjs(intent.date).tz(timezone) : dayjs().tz(timezone).add(7, 'days');
    const examDuration = intent.durationMinutes ?? 120;
    const timeStr = intent.startTime || intent.time;
    const examStart = timeStr
      ? dayjs(`${examDate.format('YYYY-MM-DD')} ${timeStr}`).tz(timezone)
      : examDate.hour(10).minute(0);
    const examEnd = examStart.add(examDuration, 'minutes');
    
    // Create exam event
    const exam = await storage.createItem({
      userId: user.id,
      type: "event",
      title: intent.title || "Exam",
      start: examStart.toDate(),
      end: examEnd.toDate(),
      fixed: true,
      priority: "high",
      reminders: [
        examStart.subtract(2, 'days').hour(9).minute(0).toISOString(), // D-2
        examStart.subtract(5, 'hours').toISOString(), // T-5h
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
        deadline: examDate.endOf('day'),
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
          deadline: examDate.endOf('day'),
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
      deadline: examDate.endOf('day'),
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

    // Compact exam day and the previous study days
    await compactDay(user.id, examDate.format('YYYY-MM-DD'), timezone);
    for (const sd of studyDays) {
      await compactDay(user.id, sd.format('YYYY-MM-DD'), timezone);
    }

    // If still overfull, drop one by Moore–Hodgson on exam day
    await repairDayWithMooreHodgson(user.id, examDate.format('YYYY-MM-DD'), timezone);

    return items;
  }

  private async createMeetingPlan(intent: ParsedIntent, user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const meetingDate = intent.date ? dayjs(intent.date).tz(timezone) : dayjs().tz(timezone).add(1, 'days');
    const timeStr = intent.startTime || intent.time;
    const meetingStart = timeStr 
      ? dayjs(`${meetingDate.format('YYYY-MM-DD')} ${timeStr}`).tz(timezone)
      : meetingDate.hour(21).minute(0);
    
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

  private async createEventPlan(intent: ParsedIntent, user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const eventDate = intent.date ? dayjs(intent.date).tz(timezone) : dayjs().tz(timezone).add(1, 'days');
    
    // Use startTime if provided, otherwise time, otherwise default based on category
    const timeStr = intent.startTime || intent.time;
    let eventStart: dayjs.Dayjs;
    if (timeStr) {
      eventStart = dayjs(`${eventDate.format('YYYY-MM-DD')} ${timeStr}`).tz(timezone);
    } else {
      // Default times by category
      const defaultHour = intent.category === 'appointment' ? 15 : intent.category === 'social' ? 19 : 21;
      eventStart = eventDate.hour(defaultHour).minute(0);
    }

    // Determine end time
    let eventEnd: dayjs.Dayjs;
    if (intent.endTime) {
      eventEnd = dayjs(`${eventDate.format('YYYY-MM-DD')} ${intent.endTime}`).tz(timezone);
    } else if (intent.durationMinutes) {
      eventEnd = eventStart.add(intent.durationMinutes, 'minutes');
    } else {
      // Default duration by category
      const defaultDuration = intent.category === 'appointment' ? 30 : intent.category === 'social' ? 120 : 60;
      eventEnd = eventStart.add(defaultDuration, 'minutes');
    }

    const event = await storage.createItem({
      userId: user.id,
      type: "event",
      title: intent.title || "Event",
      start: eventStart.toDate(),
      end: eventEnd.toDate(),
      fixed: true,
      priority: intent.priority || "normal",
      reminders: intent.category !== 'social' ? [
        eventStart.subtract(2, 'days').hour(9).minute(0).toISOString(),
        eventStart.subtract(5, 'hours').toISOString(),
      ] : [],
    });
    items.push(event);

    // Add coffee break before evening events
    if (eventStart.hour() >= 19 && intent.category !== 'social') {
      const coffeeBreak = await storage.createItem({
        userId: user.id,
        type: "breakTime",
        title: "Coffee Break",
        start: eventStart.subtract(30, 'minutes').toDate(),
        end: eventStart.subtract(15, 'minutes').toDate(),
        durationMinutes: 15,
        priority: "low",
        tags: ["coffee", "pre-event"],
      });
      items.push(coffeeBreak);
    }

    return items;
  }

  private async createFlexibleTask(intent: ParsedIntent, user: User, timezone: string): Promise<Item> {
    const duration = intent.estimateMinutes || intent.durationMinutes || await this.getLearnedDuration(user.id, "task", 45);
    
    // Parse deadline
    let deadline: Date | undefined;
    if (intent.due || intent.before || intent.deadline) {
      const deadlineStr = intent.before || intent.due || intent.deadline;
      deadline = dayjs(deadlineStr!).tz(timezone).toDate();
    }

    const task = await storage.createItem({
      userId: user.id,
      type: "task",
      title: intent.title || "Task",
      priority: intent.priority || "normal",
      durationMinutes: duration,
      deadline,
    });

    return task;
  }

  private async createWorkoutPlan(intent: ParsedIntent, user: User, timezone: string): Promise<Item[]> {
    const items: Item[] = [];
    const count = intent.count || 3;
    const duration = intent.estimateMinutes || intent.durationMinutes || 60;
    const endDate = intent.due ? dayjs(intent.due).tz(timezone) : dayjs().tz(timezone).add(7, 'days');

    // Distribute gym sessions across available days
    for (let i = 0; i < count; i++) {
      const sessionDay = dayjs().tz(timezone).add(i * 2, 'days'); // Every other day
      if (sessionDay.isAfter(endDate)) break;

      const session = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `Gym Session ${i + 1}`,
        durationMinutes: duration,
        priority: "normal",
        tags: ["gym", "workout"],
        deadline: endDate.toDate(),
      });
      items.push(session);
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
          deadline: dueDate.endOf('day'),
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

    // Compact each work day and due day
    await compactDay(user.id, dueDate.format('YYYY-MM-DD'), timezone);
    for (let i = 1; i <= count; i++) {
      const workDay = dueDate.subtract(count - i + 1, 'days');
      if (workDay.day() >= 1 && workDay.day() <= 4) {
        await compactDay(user.id, workDay.format('YYYY-MM-DD'), timezone);
      }
    }

    // Attempt lateness repair on due date
    await repairDayWithMooreHodgson(user.id, dueDate.format('YYYY-MM-DD'), timezone);

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

    // Tiny compaction after squeezing
    const todayIso = dayjs().tz(timezone).format('YYYY-MM-DD');
    await compactDay(userId, todayIso, timezone);
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
          const gapMin = itemStart.diff(prevEnd, 'minute');
          if (prevEnd.isSame(itemStart, 'day') && gapMin >= 0 && gapMin < 10) {
            const streak = (prevItem.durationMinutes || 0) + (item.durationMinutes || 0);
            if (streak >= 60) {
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

    // Check if we have at least 45 minutes of free time right now within ok window
    const currentHour = nowDayjs.hour();
    const okWindow = currentHour >= user.workEndHour && currentHour < user.bedtimeHour - 1;
    if (!okWindow) {
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
        earliestHour: dayOffset === 0 ? Math.max(nowDayjs.add(1, 'hour').hour(), user.workStartHour) : user.workStartHour,
        latestHour: user.bedtimeHour - 1,
        durationMinutes: missedItem.durationMinutes || 30,
        deadline: missedItem.deadline ? dayjs(missedItem.deadline).tz(timezone) : undefined,
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
