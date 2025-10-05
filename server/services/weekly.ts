import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import OpenAI from "openai";
import type { IStorage } from '../storage';
import type { WeeklySummary } from '@shared/schema';

dayjs.extend(utc);
dayjs.extend(timezone);

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "sk-fake-key"
});

export class WeeklyService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  async generateWeeklySummary(userId: string, weekStart: Date): Promise<WeeklySummary> {
    const weekStartStr = dayjs(weekStart).format('YYYY-MM-DD');
    
    // Check if summary already exists
    const existing = await this.storage.getWeeklySummary(userId, weekStartStr);
    if (existing) {
      return existing;
    }

    // Calculate week end (7 days later)
    const weekEnd = dayjs(weekStart).add(7, 'days').toDate();

    // Get events for the week
    const allEvents = await this.storage.getRecentEvents(userId, 14); // Get extra to ensure we have all
    const weekEvents = allEvents.filter(e => {
      const eventDate = dayjs(e.createdAt);
      return eventDate.isAfter(weekStart) && eventDate.isBefore(weekEnd);
    });

    // Calculate statistics
    const tasksDone = weekEvents.filter(e => e.kind === 'item_done').length;
    const tasksSkipped = weekEvents.filter(e => e.kind === 'item_skipped').length;
    const snoozes = weekEvents.filter(e => e.kind === 'item_snoozed').length;

    // Calculate average start delay
    let avgStartDelayMin: number | null = null;
    const startEvents = weekEvents.filter(e => 
      e.kind === 'item_started' && 
      e.context?.startPlanned && 
      e.context?.startActual
    );

    if (startEvents.length > 0) {
      const delays = startEvents.map(e => {
        const planned = dayjs(e.context!.startPlanned!);
        const actual = dayjs(e.context!.startActual!);
        return actual.diff(planned, 'minute');
      });
      avgStartDelayMin = Math.round(delays.reduce((sum, d) => sum + d, 0) / delays.length);
    }

    // Extract sleep data
    const healthEvents = weekEvents.filter(e => 
      e.kind === 'health_ingested' && 
      e.context?.sleepHours !== undefined
    );

    let sleepMedianH: number | null = null;
    let activeMin: number | null = null;

    if (healthEvents.length > 0) {
      // Calculate median sleep
      const sleepHours = healthEvents
        .map(e => e.context?.sleepHours!)
        .filter(h => h !== undefined)
        .sort((a, b) => a - b);

      if (sleepHours.length > 0) {
        const mid = Math.floor(sleepHours.length / 2);
        sleepMedianH = sleepHours.length % 2 === 0
          ? (sleepHours[mid - 1] + sleepHours[mid]) / 2
          : sleepHours[mid];
      }

      // Note: activeMinutes not currently in context, but can be added in future
      // For now, activeMin remains null
    }

    // Generate AI insights
    const notes = await this.generateAIInsights({
      tasksDone,
      tasksSkipped,
      snoozes,
      avgStartDelayMin,
      sleepMedianH,
      weekEvents,
      weekStart: weekStartStr,
    });

    // Create and save summary
    const summary = await this.storage.createWeeklySummary({
      userId,
      weekStart: weekStartStr,
      tasksDone,
      tasksSkipped,
      snoozes,
      avgStartDelayMin,
      sleepMedianH,
      activeMin,
      notes,
    });

    return summary;
  }

  private async generateAIInsights(data: {
    tasksDone: number;
    tasksSkipped: number;
    snoozes: number;
    avgStartDelayMin: number | null;
    sleepMedianH: number | null;
    weekEvents: any[];
    weekStart: string;
  }): Promise<string> {
    try {
      // Analyze patterns by day of week and hour
      const skipsByDay: Record<string, number> = {};
      const skipsByHour: Record<number, number> = {};

      data.weekEvents
        .filter(e => e.kind === 'item_skipped')
        .forEach(e => {
          const day = dayjs(e.createdAt).format('ddd');
          const hour = dayjs(e.createdAt).hour();
          
          skipsByDay[day] = (skipsByDay[day] || 0) + 1;
          skipsByHour[hour] = (skipsByHour[hour] || 0) + 1;
        });

      const systemPrompt = `You are a productivity coach analyzing a user's weekly performance. Generate 2-3 actionable plan tweaks based on the data.

Week of ${data.weekStart}:
- Tasks completed: ${data.tasksDone}
- Tasks skipped: ${data.tasksSkipped}
- Tasks snoozed: ${data.snoozes}
- Average start delay: ${data.avgStartDelayMin !== null ? `${data.avgStartDelayMin} minutes` : 'N/A'}
- Median sleep: ${data.sleepMedianH !== null ? `${data.sleepMedianH.toFixed(1)} hours` : 'N/A'}

Patterns:
- Skips by day: ${JSON.stringify(skipsByDay)}
- Skips by hour: ${JSON.stringify(skipsByHour)}

Provide 2-3 specific, actionable tweaks. Examples:
- "You skipped 5 tasks on Fri evenings (9-11pm) - try scheduling them earlier in the day"
- "Sleep dropped below 6h on Wed/Thu - protect your 10pm bedtime by blocking evening tasks"
- "20min avg delay suggests morning sluggishness - add 15min buffer to first task"

Keep it concise and actionable.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate insights for this week." }
        ],
        max_completion_tokens: 300,
      });

      return response.choices[0].message.content || "No specific insights this week. Keep up the good work!";
    } catch (error) {
      console.error("AI insights generation error:", error);
      
      // Fallback insights
      const insights: string[] = [];
      
      if (data.tasksSkipped > 5) {
        insights.push(`You skipped ${data.tasksSkipped} tasks this week - consider reviewing your schedule for overcommitment.`);
      }
      
      if (data.sleepMedianH !== null && data.sleepMedianH < 6) {
        insights.push(`Median sleep was ${data.sleepMedianH.toFixed(1)}h - prioritize earlier bedtime for better energy.`);
      }
      
      if (data.avgStartDelayMin !== null && data.avgStartDelayMin > 15) {
        insights.push(`Average ${data.avgStartDelayMin}min delay in starting tasks - add buffer time to your schedule.`);
      }

      if (insights.length === 0) {
        insights.push("Good week overall! Keep maintaining your current habits.");
      }

      return insights.join(' ');
    }
  }
}
