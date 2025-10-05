import OpenAI from "openai";
import dayjs from "dayjs";
import { plannerEngine, compactDay as compactDayFn } from "./planner";
import { storage } from "../storage";
import { GmailService } from "./gmail";
import { WeeklyService } from "./weekly";

export const COORDINATOR_PROMPT = `
You are WeekMind's Coordinator Agent.
Rules:
- You NEVER write start/end times yourself.
- You ONLY modify the plan by calling allowed tools.
- Prefer minimal, local changes; ask for confirmation on destructive ones.
- Be concise. When summarizing, 1–3 sentences max.
`;

export const tools = [
  {
    type: "function" as const,
    name: "apply_intent",
    description: "Apply a parsed scheduling intent (planner decides times).",
    parameters: {
      type: "object",
      required: ["userId", "timezone", "intent"],
      properties: {
        userId: { type: "string" },
        timezone: { type: "string" },
        intent: {
          type: "object",
          required: ["kind"],
          additionalProperties: true,
          properties: {
            kind: { type: "string" },
            title: { type: "string" },
            date: { type: "string" },
            time: { type: "string" },
            count: { type: "number" },
            durationMinutes: { type: "number" },
            priority: { type: "string" },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "propose_reschedule",
    description: "Suggest next best slot for a missed item within 1–3 days.",
    parameters: {
      type: "object",
      required: ["userId", "missedItemId", "now", "timezone"],
      properties: {
        userId: { type: "string" },
        missedItemId: { type: "string" },
        now: { type: "string" },
        timezone: { type: "string" },
      },
    },
  },
  {
    type: "function" as const,
    name: "insert_micro_breaks",
    description: "Insert 5–10 min breaks before risky/long focus (no conflicts).",
    parameters: {
      type: "object",
      required: ["userId", "now"],
      properties: { userId: { type: "string" }, now: { type: "string" } },
    },
  },
  {
    type: "function" as const,
    name: "compact_day",
    description: "Left-shift movable items today to remove small gaps.",
    parameters: {
      type: "object",
      required: ["userId", "isoDate", "timezone"],
      properties: { userId: { type: "string" }, isoDate: { type: "string" }, timezone: { type: "string" } },
    },
  },
  {
    type: "function" as const,
    name: "fetch_calendar_range",
    description: "Read-only: return items/events between startISO and endISO.",
    parameters: {
      type: "object",
      required: ["userId", "startISO", "endISO"],
      properties: { userId: { type: "string" }, startISO: { type: "string" }, endISO: { type: "string" } },
    },
  },
  {
    type: "function" as const,
    name: "fetch_email_candidates",
    description: "Read-only: Gmail triage—return detected invites/deadlines from inbox.",
    parameters: {
      type: "object",
      required: ["userId", "newerThanDays"],
      properties: { userId: { type: "string" }, newerThanDays: { type: "number" } },
    },
  },
  {
    type: "function" as const,
    name: "summarize_week",
    description: "Generate a short weekly reflection (done/late/changes) without editing plan.",
    parameters: {
      type: "object",
      required: ["userId", "weekStartISO", "timezone"],
      properties: { userId: { type: "string" }, weekStartISO: { type: "string" }, timezone: { type: "string" } },
    },
  },
];

export async function dispatchTool(name: string, args: any) {
  switch (name) {
    case "apply_intent": {
      const result = await plannerEngine.applyIntent(args.intent, args.userId, args.timezone);
      return { changes: result.changes ?? [], created: (result.items ?? []).length };
    }
    case "propose_reschedule": {
      const out = await plannerEngine.proposeReschedule(
        args.userId,
        args.missedItemId,
        new Date(args.now),
        args.timezone
      );
      return out ?? { message: "No better slot in next 3 days." };
    }
    case "insert_micro_breaks": {
      const res = await plannerEngine.insertMicroBreaks(args.userId, new Date(args.now));
      return { inserted: res.length };
    }
    case "compact_day": {
      await compactDayFn(args.userId, args.isoDate, args.timezone);
      return { compacted: true };
    }
    case "fetch_calendar_range": {
      const items = await storage.getItems(args.userId, {
        start: new Date(args.startISO),
        end: new Date(args.endISO),
      });
      return items.map((i) => ({ id: i.id, title: i.title, start: i.start, end: i.end, fixed: i.fixed, type: i.type }));
    }
    case "fetch_email_candidates": {
      const gmail = new GmailService(storage);
      const ids = await gmail.fetchRecentEmails(args.userId, 25);
      const out: any[] = [];
      for (const id of ids.slice(0, 25)) {
        const m = await gmail.getMessageDetails(args.userId, id);
        const headers = (m as any)?.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
        const from = headers.find((h: any) => h.name === 'From')?.value || '';
        const date = headers.find((h: any) => h.name === 'Date')?.value || '';
        const sLower = subject.toLowerCase();
        let category: 'invite'|'deadline'|'action'|'pr_review'|'other' = 'other';
        if (sLower.includes('pull request') || sLower.includes('review requested')) category = 'pr_review';
        else if (sLower.includes('deadline') || sLower.includes('due') || sLower.includes('submit') || sLower.includes('by')) category = 'deadline';
        else if (sLower.includes('invitation') || sLower.includes('event') || sLower.includes('meeting') || sLower.includes('rsvp') || sLower.includes('calendar')) category = 'invite';
        else if (sLower.includes('action required') || sLower.includes('follow up') || sLower.includes('reply') || sLower.includes('respond')) category = 'action';
        out.push({ id, category, subject, from, date });
      }
      return out;
    }
    case "summarize_week": {
      const weekly = new WeeklyService(storage);
      const summary = await weekly.generateWeeklySummary(args.userId, new Date(args.weekStartISO));
      return { summary: summary.notes, stats: {
        tasksDone: summary.tasksDone,
        tasksSkipped: summary.tasksSkipped,
        snoozes: summary.snoozes,
        avgStartDelayMin: summary.avgStartDelayMin,
        sleepMedianH: summary.sleepMedianH,
      }};
    }
    default:
      return { error: "unknown_tool" };
  }
}

export const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });


