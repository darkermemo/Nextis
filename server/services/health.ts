import { storage } from "../storage";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export class HealthService {
  async checkWaterReminder(userId: string, now: Date): Promise<{ shouldRemind: boolean; message?: string }> {
    const user = await storage.getUser(userId);
    if (!user || !user.waterGoalMl) {
      return { shouldRemind: false };
    }

    const today = dayjs(now).format('YYYY-MM-DD');
    const rollup = await storage.getDailyRollup(userId, today);
    const currentWaterMl = rollup?.waterMl || 0;
    const goalMl = user.waterGoalMl;
    const percentage = (currentWaterMl / goalMl) * 100;

    if (percentage >= 80) {
      return { shouldRemind: false };
    }

    const lastWaterNotification = await this.getLastWaterNotification(userId);
    if (lastWaterNotification) {
      const minutesSinceLastReminder = dayjs(now).diff(dayjs(lastWaterNotification.createdAt), 'minutes');
      if (minutesSinceLastReminder < 90) {
        return { shouldRemind: false };
      }
    }

    const message = `💧 Time to hydrate! You're at ${Math.round(percentage)}% of your daily goal (${currentWaterMl}ml / ${goalMl}ml)`;
    return { shouldRemind: true, message };
  }

  async checkSitBreakReminder(userId: string, now: Date): Promise<{ shouldRemind: boolean; message?: string }> {
    const user = await storage.getUser(userId);
    if (!user) {
      return { shouldRemind: false };
    }

    const nowDayjs = dayjs(now).tz(user.timezone);
    const startTime = nowDayjs.subtract(60, 'minutes').toDate();
    const endTime = nowDayjs.toDate();

    const recentItems = await storage.getItems(userId, {
      start: startTime,
      end: endTime,
    });

    let sedentaryMinutes = 0;
    let hasBreak = false;

    for (const item of recentItems) {
      if (!item.start || !item.end) continue;

      const itemStart = dayjs(item.start);
      const itemEnd = dayjs(item.end);
      
      if (itemEnd.isBefore(nowDayjs.subtract(30, 'minutes'))) {
        continue;
      }

      if (item.type === 'breakTime') {
        hasBreak = true;
        continue;
      }

      if (item.type === 'task' || item.type === 'event') {
        const duration = itemEnd.diff(itemStart, 'minutes');
        sedentaryMinutes += duration;
      }
    }

    if (hasBreak || sedentaryMinutes <= 30) {
      return { shouldRemind: false };
    }

    const lastSitBreakNotification = await this.getLastSitBreakNotification(userId);
    if (lastSitBreakNotification) {
      const minutesSinceLastReminder = dayjs(now).diff(dayjs(lastSitBreakNotification.createdAt), 'minutes');
      if (minutesSinceLastReminder < 45) {
        return { shouldRemind: false };
      }
    }

    const message = `🚶 You've been sitting for ${sedentaryMinutes} minutes. Time for a quick walk!`;
    return { shouldRemind: true, message };
  }

  async ingestHealthData(
    userId: string,
    data: {
      waterMl?: number;
      sedentaryMinutes?: number;
      activeMinutes?: number;
      sleepHours?: number;
    }
  ): Promise<void> {
    const today = dayjs().format('YYYY-MM-DD');
    const existingRollup = await storage.getDailyRollup(userId, today);

    const updateData: any = {
      userId,
      date: today,
    };

    if (data.waterMl !== undefined) {
      updateData.waterMl = (existingRollup?.waterMl || 0) + data.waterMl;
    }

    if (data.sedentaryMinutes !== undefined) {
      updateData.sedentaryMinutes = (existingRollup?.sedentaryMinutes || 0) + data.sedentaryMinutes;
    }

    if (data.activeMinutes !== undefined) {
      updateData.activeMinutes = (existingRollup?.activeMinutes || 0) + data.activeMinutes;
    }

    if (data.sleepHours !== undefined) {
      updateData.sleepHours = data.sleepHours;
    }

    await storage.upsertDailyRollup(updateData);

    await storage.logEvent({
      userId,
      kind: 'health_ingested',
      context: {
        waterMl: data.waterMl,
        sedentaryMinutes: data.sedentaryMinutes,
        activeMinutes: data.activeMinutes,
        sleepHours: data.sleepHours,
      },
    });
  }

  private async getLastWaterNotification(userId: string) {
    const notifications = await storage.getPendingNotifications(userId, new Date());
    const waterNotifications = notifications.filter(n => n.kind === 'water');
    return waterNotifications.length > 0 ? waterNotifications[0] : null;
  }

  private async getLastSitBreakNotification(userId: string) {
    const notifications = await storage.getPendingNotifications(userId, new Date());
    const sitBreakNotifications = notifications.filter(n => n.kind === 'sitBreak');
    return sitBreakNotifications.length > 0 ? sitBreakNotifications[0] : null;
  }
}

export const healthService = new HealthService();
