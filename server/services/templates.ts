import { storage } from "../storage";
import { learningService } from "./learning";
import type { Item, User } from "@shared/schema";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  params: {
    [key: string]: {
      type: 'string' | 'number' | 'array';
      required: boolean;
      description: string;
    };
  };
}

export class TemplateService {
  private async getLearningContext(userId: string, date: dayjs.Dayjs, timezone: string) {
    let habitLearn = await storage.getHabitLearn(userId);
    if (!habitLearn) {
      habitLearn = await learningService.initializeHabitLearn(userId);
    }

    const dayState = await storage.getDayState(userId, date.format("YYYY-MM-DD"));
    const mood = dayState?.mood || 'none';

    const rollup = await storage.getDailyRollup(userId, date.format("YYYY-MM-DD"));
    const sleepH = rollup?.sleepHours || 7;

    const dayItems = await storage.getItems(userId, {
      start: date.startOf('day').toDate(),
      end: date.endOf('day').toDate(),
    });
    const meetings = dayItems.filter(item => item.type === 'event').length;

    return { habitLearn, mood, sleepH, meetings };
  }

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

    const slots: { hour: number; score: number }[] = [];
    for (let hour = constraints.earliestHour; hour <= constraints.latestHour; hour++) {
      if (constraints.avoidHours?.includes(hour)) continue;

      const risk = learningService.snoozeRisk({ hour, sleepH, mood, meetings });
      
      if (risk > 0.6 && constraints.durationMinutes > 45) continue;

      const score = learningService.scoreSlot(
        habitLearn,
        weekday,
        hour,
        { sleepH, mood, meetings }
      );

      slots.push({ hour, score });
    }

    if (slots.length === 0) {
      return day.hour(constraints.earliestHour).minute(0);
    }

    slots.sort((a, b) => b.score - a.score);
    return day.hour(slots[0].hour).minute(0);
  }

  private async getLearnedDuration(userId: string, type: string, fallbackMinutes: number): Promise<number> {
    const habitLearn = await storage.getHabitLearn(userId);
    if (!habitLearn || !habitLearn.lengthJSON || !habitLearn.lengthJSON[type]) {
      return fallbackMinutes;
    }
    return habitLearn.lengthJSON[type];
  }

  getAvailableTemplates(): TemplateDefinition[] {
    return [
      {
        id: 'exam',
        name: 'Exam Preparation',
        description: 'Creates exam event with study blocks, quiz sessions, and reminders',
        params: {
          subject: { type: 'string', required: true, description: 'Subject or exam name' },
          date: { type: 'string', required: true, description: 'Exam date (YYYY-MM-DD)' },
          duration: { type: 'number', required: false, description: 'Exam duration in minutes (default: 120)' },
        },
      },
      {
        id: 'presentation',
        name: 'Presentation',
        description: 'Creates outline, slides preparation, and rehearsal tasks',
        params: {
          topic: { type: 'string', required: true, description: 'Presentation topic' },
          date: { type: 'string', required: true, description: 'Presentation date (YYYY-MM-DD)' },
        },
      },
      {
        id: 'homework',
        name: 'Homework Assignment',
        description: 'Creates homework task with optimal scheduling',
        params: {
          subject: { type: 'string', required: true, description: 'Subject name' },
          deadline: { type: 'string', required: true, description: 'Due date (YYYY-MM-DD)' },
          estimatedHours: { type: 'number', required: false, description: 'Estimated hours (default: 2)' },
        },
      },
      {
        id: 'project',
        name: 'Project Milestones',
        description: 'Creates milestone tasks distributed over project duration',
        params: {
          name: { type: 'string', required: true, description: 'Project name' },
          deadline: { type: 'string', required: true, description: 'Project deadline (YYYY-MM-DD)' },
          phases: { type: 'array', required: true, description: 'Project phases (array of strings)' },
        },
      },
      {
        id: 'reading',
        name: 'Reading Assignment',
        description: 'Creates reading tasks with break suggestions based on page count',
        params: {
          title: { type: 'string', required: true, description: 'Book or article title' },
          pages: { type: 'number', required: true, description: 'Number of pages' },
          deadline: { type: 'string', required: true, description: 'Completion deadline (YYYY-MM-DD)' },
        },
      },
      {
        id: 'lab',
        name: 'Lab Work',
        description: 'Creates prep, lab event, and report tasks',
        params: {
          subject: { type: 'string', required: true, description: 'Lab subject' },
          labDate: { type: 'string', required: true, description: 'Lab date (YYYY-MM-DD)' },
        },
      },
    ];
  }

  async applyExamTemplate(
    userId: string,
    params: { subject: string; date: string; duration?: number },
    timezone: string = "Asia/Riyadh"
  ): Promise<Item[]> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const items: Item[] = [];
    const examDate = dayjs(params.date).tz(timezone);
    const examDuration = params.duration || 120;

    const exam = await storage.createItem({
      userId: user.id,
      type: "event",
      title: `${params.subject} Exam`,
      start: examDate.hour(10).minute(0).toDate(),
      end: examDate.add(examDuration, 'minutes').toDate(),
      fixed: true,
      priority: "high",
      reminders: [
        examDate.subtract(2, 'days').hour(9).minute(0).toISOString(),
        examDate.subtract(5, 'hours').toISOString(),
      ],
    });
    items.push(exam);

    const studyDuration = await this.getLearnedDuration(user.id, 'task', 60);

    const studyDays = [];
    for (let i = 1; i <= 4; i++) {
      const studyDay = examDate.subtract(i, 'days');
      if (studyDay.day() >= 1 && studyDay.day() <= 4) {
        studyDays.push(studyDay);
      }
    }

    for (const studyDay of studyDays.reverse()) {
      const bestSlot = await this.findBestSlot(user.id, studyDay, timezone, {
        earliestHour: user.workEndHour,
        latestHour: user.bedtimeHour - 2,
        durationMinutes: studyDuration,
      });

      const studyBlock = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `${params.subject} - Study Session`,
        start: bestSlot.toDate(),
        end: bestSlot.add(studyDuration, 'minutes').toDate(),
        durationMinutes: studyDuration,
        priority: "high",
        tags: ["study", "exam-prep"],
      });
      items.push(studyBlock);
    }

    const quizDuration = await this.getLearnedDuration(user.id, 'quiz', 15);

    for (let i = 2; i <= 3; i++) {
      const quizDay = examDate.subtract(i, 'days');
      if (quizDay.day() >= 2 && quizDay.day() <= 4) {
        const bestSlot = await this.findBestSlot(user.id, quizDay, timezone, {
          earliestHour: user.workEndHour,
          latestHour: user.bedtimeHour - 1,
          durationMinutes: quizDuration,
        });

        const quiz = await storage.createItem({
          userId: user.id,
          type: "quiz",
          title: `${params.subject} - Practice Quiz`,
          start: bestSlot.toDate(),
          end: bestSlot.add(quizDuration, 'minutes').toDate(),
          durationMinutes: quizDuration,
          priority: "normal",
          tags: ["quiz", "exam-prep"],
        });
        items.push(quiz);
      }
    }

    return items;
  }

  async applyPresentationTemplate(
    userId: string,
    params: { topic: string; date: string },
    timezone: string = "Asia/Riyadh"
  ): Promise<Item[]> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const items: Item[] = [];
    const presentationDate = dayjs(params.date).tz(timezone);

    const outlineDay = presentationDate.subtract(3, 'days');
    const outlineDuration = await this.getLearnedDuration(user.id, 'task', 45);
    const outlineSlot = await this.findBestSlot(user.id, outlineDay, timezone, {
      earliestHour: user.workEndHour,
      latestHour: user.bedtimeHour - 2,
      durationMinutes: outlineDuration,
    });

    const outline = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${params.topic} - Create Outline`,
      start: outlineSlot.toDate(),
      end: outlineSlot.add(outlineDuration, 'minutes').toDate(),
      durationMinutes: outlineDuration,
      priority: "high",
      tags: ["presentation"],
    });
    items.push(outline);

    const slidesDay = presentationDate.subtract(2, 'days');
    const slidesDuration = await this.getLearnedDuration(user.id, 'task', 90);
    const slidesSlot = await this.findBestSlot(user.id, slidesDay, timezone, {
      earliestHour: user.workEndHour,
      latestHour: user.bedtimeHour - 2,
      durationMinutes: slidesDuration,
    });

    const slides = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${params.topic} - Prepare Slides`,
      start: slidesSlot.toDate(),
      end: slidesSlot.add(slidesDuration, 'minutes').toDate(),
      durationMinutes: slidesDuration,
      priority: "high",
      tags: ["presentation"],
    });
    items.push(slides);

    const rehearsalDay = presentationDate.subtract(1, 'days');
    const rehearsalDuration = await this.getLearnedDuration(user.id, 'task', 30);
    const rehearsalSlot = await this.findBestSlot(user.id, rehearsalDay, timezone, {
      earliestHour: user.workEndHour,
      latestHour: user.bedtimeHour - 1,
      durationMinutes: rehearsalDuration,
    });

    const rehearsal = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${params.topic} - Rehearsal`,
      start: rehearsalSlot.toDate(),
      end: rehearsalSlot.add(rehearsalDuration, 'minutes').toDate(),
      durationMinutes: rehearsalDuration,
      priority: "normal",
      tags: ["presentation", "rehearsal"],
    });
    items.push(rehearsal);

    return items;
  }

  async applyHomeworkTemplate(
    userId: string,
    params: { subject: string; deadline: string; estimatedHours?: number },
    timezone: string = "Asia/Riyadh"
  ): Promise<Item[]> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const items: Item[] = [];
    const deadline = dayjs(params.deadline).tz(timezone);
    const estimatedMinutes = (params.estimatedHours || 2) * 60;
    const learnedDuration = await this.getLearnedDuration(user.id, 'task', estimatedMinutes);

    const workDay = deadline.subtract(1, 'days');
    const bestSlot = await this.findBestSlot(user.id, workDay, timezone, {
      earliestHour: user.workEndHour,
      latestHour: user.bedtimeHour - 2,
      durationMinutes: learnedDuration,
    });

    const homework = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${params.subject} - Homework`,
      start: bestSlot.toDate(),
      end: bestSlot.add(learnedDuration, 'minutes').toDate(),
      durationMinutes: learnedDuration,
      deadline: deadline.toDate(),
      priority: "normal",
      tags: ["homework"],
    });
    items.push(homework);

    return items;
  }

  async applyProjectTemplate(
    userId: string,
    params: { name: string; deadline: string; phases: string[] },
    timezone: string = "Asia/Riyadh"
  ): Promise<Item[]> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const items: Item[] = [];
    const deadline = dayjs(params.deadline).tz(timezone);
    const phases = params.phases;
    const phaseCount = phases.length;

    const totalDays = deadline.diff(dayjs().tz(timezone), 'days');
    const daysPerPhase = Math.floor(totalDays / phaseCount);

    for (let i = 0; i < phaseCount; i++) {
      const phaseDeadline = deadline.subtract((phaseCount - i - 1) * daysPerPhase, 'days');
      const phaseWorkDay = phaseDeadline.subtract(1, 'days');

      const phaseDuration = await this.getLearnedDuration(user.id, 'task', 90);
      const bestSlot = await this.findBestSlot(user.id, phaseWorkDay, timezone, {
        earliestHour: user.workEndHour,
        latestHour: user.bedtimeHour - 2,
        durationMinutes: phaseDuration,
      });

      const phaseTask = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `${params.name} - ${phases[i]}`,
        start: bestSlot.toDate(),
        end: bestSlot.add(phaseDuration, 'minutes').toDate(),
        durationMinutes: phaseDuration,
        deadline: phaseDeadline.toDate(),
        priority: "high",
        tags: ["project", params.name.toLowerCase().replace(/\s+/g, '-')],
      });
      items.push(phaseTask);
    }

    return items;
  }

  async applyReadingTemplate(
    userId: string,
    params: { title: string; pages: number; deadline: string },
    timezone: string = "Asia/Riyadh"
  ): Promise<Item[]> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const items: Item[] = [];
    const deadline = dayjs(params.deadline).tz(timezone);
    const pages = params.pages;
    const chunksNeeded = Math.ceil(pages / 30);

    const totalDays = deadline.diff(dayjs().tz(timezone), 'days');
    const daysPerChunk = Math.max(1, Math.floor(totalDays / chunksNeeded));

    for (let i = 0; i < chunksNeeded; i++) {
      const chunkDeadline = deadline.subtract((chunksNeeded - i - 1) * daysPerChunk, 'days');
      const readingDay = chunkDeadline.subtract(1, 'days');

      const pagesInChunk = i === chunksNeeded - 1 ? pages - (i * 30) : 30;
      const readingDuration = Math.min(90, pagesInChunk * 2);

      const bestSlot = await this.findBestSlot(user.id, readingDay, timezone, {
        earliestHour: user.workEndHour,
        latestHour: user.bedtimeHour - 1,
        durationMinutes: readingDuration,
      });

      const readingTask = await storage.createItem({
        userId: user.id,
        type: "task",
        title: `${params.title} - Read ${pagesInChunk} pages`,
        start: bestSlot.toDate(),
        end: bestSlot.add(readingDuration, 'minutes').toDate(),
        durationMinutes: readingDuration,
        priority: "normal",
        tags: ["reading"],
        notes: `Pages ${i * 30 + 1}-${i * 30 + pagesInChunk}`,
      });
      items.push(readingTask);

      if (readingDuration > 45) {
        const breakTime = bestSlot.add(45, 'minutes');
        const breakTask = await storage.createItem({
          userId: user.id,
          type: "breakTime",
          title: "Reading Break",
          start: breakTime.toDate(),
          end: breakTime.add(10, 'minutes').toDate(),
          durationMinutes: 10,
          priority: "low",
          tags: ["break", "reading"],
        });
        items.push(breakTask);
      }
    }

    return items;
  }

  async applyLabTemplate(
    userId: string,
    params: { subject: string; labDate: string },
    timezone: string = "Asia/Riyadh"
  ): Promise<Item[]> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found");

    const items: Item[] = [];
    const labDate = dayjs(params.labDate).tz(timezone);

    const prepDay = labDate.subtract(1, 'days');
    const prepDuration = await this.getLearnedDuration(user.id, 'task', 45);
    const prepSlot = await this.findBestSlot(user.id, prepDay, timezone, {
      earliestHour: user.workEndHour,
      latestHour: user.bedtimeHour - 2,
      durationMinutes: prepDuration,
    });

    const prep = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${params.subject} Lab - Preparation`,
      start: prepSlot.toDate(),
      end: prepSlot.add(prepDuration, 'minutes').toDate(),
      durationMinutes: prepDuration,
      priority: "high",
      tags: ["lab", "prep"],
    });
    items.push(prep);

    const lab = await storage.createItem({
      userId: user.id,
      type: "event",
      title: `${params.subject} Lab`,
      start: labDate.hour(14).minute(0).toDate(),
      end: labDate.hour(16).minute(0).toDate(),
      fixed: true,
      priority: "high",
      tags: ["lab"],
    });
    items.push(lab);

    const reportDay = labDate.add(2, 'days');
    const reportDuration = await this.getLearnedDuration(user.id, 'task', 90);
    const reportSlot = await this.findBestSlot(user.id, reportDay, timezone, {
      earliestHour: user.workEndHour,
      latestHour: user.bedtimeHour - 2,
      durationMinutes: reportDuration,
    });

    const report = await storage.createItem({
      userId: user.id,
      type: "task",
      title: `${params.subject} Lab - Report`,
      start: reportSlot.toDate(),
      end: reportSlot.add(reportDuration, 'minutes').toDate(),
      durationMinutes: reportDuration,
      priority: "high",
      tags: ["lab", "report"],
    });
    items.push(report);

    return items;
  }
}

export const templateService = new TemplateService();
