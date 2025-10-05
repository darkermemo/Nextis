import OpenAI from "openai";
import type { ParsedIntent } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "sk-fake-key"
});

export class LLMService {
  async parseCommand(text: string, timezone: string = "Asia/Riyadh"): Promise<ParsedIntent> {
    try {
      const now = new Date();
      const systemPrompt = `You are a planning assistant that extracts structured intent from natural language commands. 
Current date: ${now.toLocaleDateString('en-CA')}
Current time: ${now.toLocaleTimeString('en-GB', { timeZone: timezone })}
Timezone: ${timezone}

Extract a single JSON object matching this schema exactly. Do not explain or add commentary.

Examples:
"I have exam on economics next Friday" → {"kind":"addExam", "title":"Economics Exam", "date":"2025-10-10"}
"Meeting Thursday at 9:00 pm" → {"kind":"addMeeting", "title":"Meeting", "date":"2025-10-09", "time":"21:00"}
"Appointment with dentist tomorrow at 3pm" → {"kind":"addMeeting", "title":"Dentist Appointment", "date":"2025-10-06", "time":"15:00"}
"I have to meet mohammed tonight" → {"kind":"addMeeting", "title":"Meet Mohammed", "date":"2025-10-05", "time":"20:00"}
"Meeting with team at 2pm" → {"kind":"addMeeting", "title":"Meeting with team", "date":"2025-10-05", "time":"14:00"}
"I have 3 homeworks next week" → {"kind":"addHomeworks", "count":3, "dueRange":"next-week"}
"I'm tired today" → {"kind":"setMood", "mood":"tired"}
"I have work early tomorrow" → {"kind":"setEarlyWork", "earlyWorkTomorrow":true}
"Add coffee breaks and TV time" → {"kind":"addBreaks"}
"Add TV time" → {"kind":"addLeisureTV"}
"Study for math test" → {"kind":"genericTask", "title":"Study for math test", "priority":"normal"}

Valid kinds: addExam, addMeeting, addHomeworks, addBreaks, addLeisureTV, setMood, setEarlyWork, genericTask
Valid moods: tired, stressed, motivated, focused, relaxed, none
Valid priorities: high, normal, low
Dates in YYYY-MM-DD format, times in HH:mm format (24-hour).`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
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
