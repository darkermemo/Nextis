import OpenAI from "openai";
import type { ParsedIntent } from "@shared/schema";
import { preParse } from "./preParse";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "sk-fake-key",
});

const MODEL = process.env.OPENAI_MODEL || "gpt-5";

// JSON Schema for structured outputs (Intent)
export const IntentJsonSchema = {
  name: "Intent",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind"],
    properties: {
      kind: {
        type: "string",
        enum: [
          "addEvent",
          "addExam",
          "addMeeting",
          "addAppointment",
          "addSocial",
          "addHomeworks",
          "addTask",
          "workoutPlan",
          "addBreaks",
          "addLeisureTV",
          "setMood",
          "setEarlyWork",
          "genericTask",
        ],
      },
      original: { type: "string" },
      title: { type: "string" },
      category: { type: "string", enum: ["meeting", "appointment", "social", "class", "other"] },
      date: { type: "string", description: "YYYY-MM-DD" },
      time: { type: "string", description: "HH:mm (24h)" },
      startTime: { type: "string", description: "HH:mm (24h)" },
      endTime: { type: "string", description: "HH:mm (24h)" },
      count: { type: "number" },
      durationMinutes: { type: "number" },
      estimateMinutes: { type: "number" },
      priority: { type: "string", enum: ["high", "normal", "low"] },
      earlyWorkTomorrow: { type: "boolean" },
      deadline: { type: "string", description: "ISO or YYYY-MM-DD HH:mm" },
      due: { type: "string", description: "ISO or YYYY-MM-DD" },
      before: { type: "string", description: "ISO or YYYY-MM-DD HH:mm" },
      rangeStart: { type: "string", description: "YYYY-MM-DD HH:mm" },
      rangeEnd: { type: "string", description: "YYYY-MM-DD HH:mm" },
    },
  },
  strict: true,
} as const;

export class LLMService {
  async parseCommand(text: string, timezone: string = "Asia/Riyadh"): Promise<ParsedIntent> {
    try {
      const now = new Date();
      const hints = preParse(text, timezone);
      
      const systemPrompt = `You are an intelligent planning assistant. Extract structured intent from natural language commands.

CURRENT CONTEXT:
- Date: ${now.toLocaleDateString('en-CA')}
- Time: ${now.toLocaleTimeString('en-GB', { timeZone: timezone })}
- Timezone: ${timezone}

AVAILABLE ACTIONS (kinds):
1. "addExam" - Schedule an exam/test with automatic study blocks, quiz sessions, and reminders
   - Use for: exams, tests, quizzes, assessments
   - Creates: exam event + study preparation blocks (D-3, D-2, D-1) + quiz blocks + reminders
   
2. "addMeeting" - Schedule a meeting/appointment with reminders and break buffer
   - Use for: meetings, appointments, calls, consultations, interviews
   - Creates: event + pre-meeting coffee break + reminders (D-2 and T-5h)
   
3. "addHomeworks" - Add multiple homework/assignment tasks distributed over time
   - Use for: homework assignments, projects with multiple parts
   - Creates: multiple tasks spread across the due range
   
4. "addBreaks" - Insert coffee breaks during work hours
   - Use for: break requests, rest time, coffee time
   - Creates: multiple 15-min breaks spaced throughout work hours
   
5. "addLeisureTV" - Schedule TV/leisure time in the evening
   - Use for: TV, movies, entertainment, relaxation time
   - Creates: leisure blocks in evening slots
   
6. "setMood" - Update current mood to adjust schedule intensity
   - Use for: mood changes, energy level updates
   - Effects: tired/stressed → shorter blocks + earlier bedtime; motivated/focused → longer sessions
   
7. "setEarlyWork" - Signal early morning work to adjust evening schedule
   - Use for: early morning commitments, early work tomorrow
   - Effects: moves bedtime earlier, reduces evening activities
   
8. "genericTask" - Create a general task/todo item
   - Use for: any task that doesn't fit other categories
   - Creates: single task item with title and priority

ITEM TYPES WE CAN STORE:
- task: General todos and assignments
- event: Fixed-time meetings and exams
- breakTime: Coffee breaks and rest periods
- leisure: TV time and entertainment
- quiz: Quick test preparation sessions

VALID VALUES:
- Moods: tired, stressed, motivated, focused, relaxed, none
- Priorities: high, normal, low
- Dates: YYYY-MM-DD format
- Times: HH:mm format (24-hour)

EXAMPLES:
"I have exam on economics next Friday" → {"kind":"addExam", "title":"Economics Exam", "date":"2025-10-10"}
"Meeting with dentist tomorrow 3pm" → {"kind":"addMeeting", "title":"Dentist Appointment", "date":"2025-10-06", "time":"15:00"}
"I have 3 homeworks due next week" → {"kind":"addHomeworks", "count":3, "dueRange":"next-week"}
"I'm feeling tired today" → {"kind":"setMood", "mood":"tired"}
"Need to work early tomorrow" → {"kind":"setEarlyWork", "earlyWorkTomorrow":true}
"Add coffee breaks" → {"kind":"addBreaks"}
"Watch TV tonight" → {"kind":"addLeisureTV"}
"Buy groceries tomorrow" → {"kind":"genericTask", "title":"Buy groceries", "priority":"normal"}

INSTRUCTIONS:
- Extract ONE JSON object matching the schema
- Choose the most specific kind that fits the request
- If unsure between kinds, prefer the more specific one (e.g., addExam over genericTask for test-related requests)
- Do not explain, just return valid JSON`;

      // Prefer structured outputs via Responses API with pre-parse hints
      const r = await openai.responses.create({
        model: MODEL,
        input: [
          { role: "system", content: systemPrompt + "\n\nGUIDELINES:\n- Use provided seed fields as authoritative; fill ONLY missing ones.\n- exam/midterm/test -> addExam with date,startTime,durationMinutes\n- meeting/sync -> addMeeting with date,startTime,durationMinutes\n- dentist/doctor/appointment -> addAppointment\n- wedding/party/dinner/social -> addSocial\n- 'from X to Y' -> use startTime/endTime\n- 'due'/'by'/'before' -> set due or before\n- 'estimate' -> set estimateMinutes\n- gym/workout sessions -> workoutPlan with count\n- If you cannot find date/time for an event, leave them null (do NOT invent)." },
          { role: "user", content: `Seed: ${JSON.stringify(hints)}\n\nUser: ${text}\nTimezone: ${timezone}` },
        ],
        response_format: { type: "json_schema", json_schema: IntentJsonSchema },
      });

      const asText = (r as any)?.output?.[0]?.content?.[0]?.text as string | undefined;
      let result = asText ? JSON.parse(asText) : {};
      
      // Merge: preParse values are authoritative; only use model values if preParse didn't extract them
      const merged: any = {};
      for (const key of Object.keys({ ...hints, ...result })) {
        // If preParse extracted a value (non-null/non-undefined), use it; otherwise use model's value
        merged[key] = (hints[key] !== null && hints[key] !== undefined) ? hints[key] : result[key];
      }
      
      result = merged;
      
      // Validate the response structure
      if (!result.kind) {
        console.error("LLM response missing 'kind' field. This should not happen with sufficient tokens.");
        throw new Error("Invalid response from LLM: missing kind");
      }

      return result as ParsedIntent;
    } catch (error: any) {
      console.error("LLM parsing error, using fallback:", error?.message || error);
      
      // Fallback regex parsing (safety net for network issues)
      return this.fallbackParse(text);
    }
  }

  private fallbackParse(text: string): ParsedIntent {
    const lowerText = text.toLowerCase();

    // Simple regex patterns as fallback
    if (lowerText.includes("exam")) {
      return {
        kind: "addExam",
        title: text,
        priority: "high"
      };
    }

    if (lowerText.includes("meeting") || lowerText.includes("appointment") || lowerText.includes(" meet ") || lowerText.startsWith("meet ")) {
      return {
        kind: "addMeeting",
        title: text,
        priority: "normal"
      };
    }

    if (lowerText.includes("homework") || lowerText.includes("assignment")) {
      const countMatch = text.match(/(\d+)/);
      return {
        kind: "addHomeworks",
        count: countMatch ? parseInt(countMatch[1]) : 1,
        dueRange: "next-week"
      };
    }

    if (lowerText.includes("tired")) {
      return {
        kind: "setMood",
        mood: "tired"
      };
    }

    if (lowerText.includes("stressed")) {
      return {
        kind: "setMood",
        mood: "stressed"
      };
    }

    if (lowerText.includes("early work") || lowerText.includes("work early")) {
      return {
        kind: "setEarlyWork",
        earlyWorkTomorrow: true
      };
    }

    if (lowerText.includes("break") || lowerText.includes("coffee")) {
      return {
        kind: "addBreaks"
      };
    }

    if (lowerText.includes("tv") || lowerText.includes("television")) {
      return {
        kind: "addLeisureTV"
      };
    }

    // Default to generic task
    return {
      kind: "genericTask",
      title: text,
      priority: "normal"
    };
  }
}

export const llmService = new LLMService();
