import { storage } from "../storage";
import { plannerEngine } from "./planner";
import type { Item, WorkoutPreferences } from "@shared/schema";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

export class GymService {
  async planWeeklyWorkouts(userId: string, weekStart: Date, timezone: string = "Asia/Riyadh"): Promise<Item[]> {
    const prefs = await storage.getWorkoutPreferences(userId);
    if (!prefs) {
      return [];
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const weekStartDay = dayjs(weekStart).tz(timezone).startOf('isoWeek');
    const weekEndDay = weekStartDay.endOf('isoWeek');

    const existingWorkouts = await storage.getItems(userId, {
      start: weekStartDay.toDate(),
      end: weekEndDay.toDate(),
    });

    const workoutItems = existingWorkouts.filter(
      item => item.tags?.includes("workout") && item.tags?.includes("gym")
    );

    if (workoutItems.length >= prefs.perWeek) {
      return workoutItems;
    }

    const streakStatus = await this.checkStreakStatus(userId, timezone);
    const isStreakProtected = streakStatus.streakDays >= 2;

    const workoutsToCreate = prefs.perWeek - workoutItems.length;
    const createdWorkouts: Item[] = [];

    const targetDays = this.getTargetDays(prefs.perWeek, weekStartDay);

    for (let i = 0; i < workoutsToCreate && i < targetDays.length; i++) {
      const targetDay = targetDays[i];
      
      let workoutStart: dayjs.Dayjs;

      if (prefs.preferredWindows && prefs.preferredWindows.length > 0) {
        const windowForDay = this.findWindowForDay(prefs.preferredWindows, targetDay);
        if (windowForDay) {
          workoutStart = windowForDay;
        } else {
          workoutStart = await this.findBestWorkoutSlot(userId, targetDay, prefs.defaultDurationMin, user, timezone);
        }
      } else {
        workoutStart = await this.findBestWorkoutSlot(userId, targetDay, prefs.defaultDurationMin, user, timezone);
      }

      const workout = await storage.createItem({
        userId,
        type: "leisure",
        title: "Gym Workout",
        start: workoutStart.toDate(),
        end: workoutStart.add(prefs.defaultDurationMin, 'minutes').toDate(),
        durationMinutes: prefs.defaultDurationMin,
        priority: isStreakProtected ? "high" : "normal",
        tags: ["workout", "gym"],
      });

      createdWorkouts.push(workout);
    }

    return [...workoutItems, ...createdWorkouts];
  }

  async checkStreakStatus(userId: string, timezone: string = "Asia/Riyadh"): Promise<{
    streakDays: number;
    lastWorkout: Date | null;
    protected: boolean;
  }> {
    const now = dayjs().tz(timezone);
    let streakWeeks = 0;
    let lastWorkoutDate: Date | null = null;

    for (let weekOffset = 1; weekOffset <= 12; weekOffset++) {
      const weekStart = now.subtract(weekOffset, 'weeks').startOf('isoWeek');
      const weekEnd = weekStart.endOf('isoWeek');

      const weekItems = await storage.getItems(userId, {
        start: weekStart.toDate(),
        end: weekEnd.toDate(),
      });

      const completedWorkouts = weekItems.filter(
        item => item.tags?.includes("workout") && item.tags?.includes("gym") && item.done
      );

      if (completedWorkouts.length > 0) {
        streakWeeks++;
        if (!lastWorkoutDate) {
          const latestWorkout = completedWorkouts.reduce((latest, current) => {
            const latestEnd = latest.end || latest.start;
            const currentEnd = current.end || current.start;
            if (!latestEnd) return current;
            if (!currentEnd) return latest;
            return dayjs(currentEnd).isAfter(dayjs(latestEnd)) ? current : latest;
          });
          lastWorkoutDate = latestWorkout.end || latestWorkout.start || null;
        }
      } else {
        break;
      }
    }

    return {
      streakDays: streakWeeks * 7,
      lastWorkout: lastWorkoutDate,
      protected: streakWeeks >= 2,
    };
  }

  private getTargetDays(perWeek: number, weekStart: dayjs.Dayjs): dayjs.Dayjs[] {
    const days: dayjs.Dayjs[] = [];
    
    if (perWeek === 3) {
      days.push(weekStart.day(1));
      days.push(weekStart.day(3));
      days.push(weekStart.day(5));
    } else if (perWeek === 2) {
      days.push(weekStart.day(1));
      days.push(weekStart.day(4));
    } else if (perWeek === 4) {
      days.push(weekStart.day(1));
      days.push(weekStart.day(2));
      days.push(weekStart.day(4));
      days.push(weekStart.day(5));
    } else if (perWeek === 5) {
      days.push(weekStart.day(1));
      days.push(weekStart.day(2));
      days.push(weekStart.day(3));
      days.push(weekStart.day(4));
      days.push(weekStart.day(5));
    } else if (perWeek === 6) {
      days.push(weekStart.day(1));
      days.push(weekStart.day(2));
      days.push(weekStart.day(3));
      days.push(weekStart.day(4));
      days.push(weekStart.day(5));
      days.push(weekStart.day(6));
    } else if (perWeek === 7) {
      for (let i = 1; i <= 7; i++) {
        days.push(weekStart.day(i === 7 ? 0 : i));
      }
    } else {
      const interval = Math.floor(7 / perWeek);
      for (let i = 0; i < perWeek; i++) {
        const dayNum = (i * interval + 1) % 7;
        days.push(weekStart.day(dayNum === 0 ? 7 : dayNum));
      }
    }

    return days;
  }

  private findWindowForDay(preferredWindows: string[], targetDay: dayjs.Dayjs): dayjs.Dayjs | null {
    const dayName = targetDay.format('ddd');
    
    for (const window of preferredWindows) {
      const [day, timeRange] = window.split(':');
      if (day === dayName && timeRange) {
        const [startHour] = timeRange.split('-').map(h => parseInt(h));
        if (!isNaN(startHour)) {
          return targetDay.hour(startHour).minute(0).second(0);
        }
      }
    }

    return null;
  }

  private async findBestWorkoutSlot(
    userId: string,
    targetDay: dayjs.Dayjs,
    durationMinutes: number,
    user: any,
    timezone: string
  ): Promise<dayjs.Dayjs> {
    const dayItems = await storage.getItems(userId, {
      start: targetDay.startOf('day').toDate(),
      end: targetDay.endOf('day').toDate(),
    });

    const occupiedSlots = dayItems
      .filter(item => item.start && item.end)
      .map(item => ({
        start: dayjs(item.start).tz(timezone),
        end: dayjs(item.end).tz(timezone),
      }));

    const preferredStartHour = 18;
    const preferredEndHour = 20;
    
    for (let hour = preferredStartHour; hour <= preferredEndHour; hour++) {
      const candidateStart = targetDay.hour(hour).minute(0);
      const candidateEnd = candidateStart.add(durationMinutes, 'minutes');

      const hasConflict = occupiedSlots.some(slot => {
        return candidateStart.isBefore(slot.end) && candidateEnd.isAfter(slot.start);
      });

      if (!hasConflict) {
        return candidateStart;
      }
    }

    const morningHour = 7;
    return targetDay.hour(morningHour).minute(0);
  }
}

export const gymService = new GymService();
