import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const HOUR = /(?:^|\b)([01]?\d|2[0-3]):([0-5]\d)\b/i;
const FROM_TO = /from\s+(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})/i;
const FOR_DUR = /for\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i;
const DATE_ISO = /\b(20\d{2}-\d{2}-\d{2})\b/;
const NEXT_WEEK = /\bnext week\b/i;
const DUE_BY = /\b(due|by|before)\b/i;
const ESTIMATE = /\bestimate\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i;

export function preParse(input: string, tzid = "Asia/Riyadh") {
  const lower = input.toLowerCase();
  const res: any = { original: input };

  // Classify coarse type
  if (/wedding|party|dinner|social/.test(lower)) {
    res.kind = "addSocial";
    res.category = "social";
  } else if (/dentist|doctor|appointment/.test(lower)) {
    res.kind = "addAppointment";
    res.category = "appointment";
  } else if (/meeting|sync|call/.test(lower)) {
    res.kind = "addMeeting";
    res.category = "meeting";
  } else if (/exam|midterm|final|test/.test(lower)) {
    res.kind = "addExam";
    res.category = "other";
  } else if (/gym|workout/.test(lower)) {
    res.kind = "workoutPlan";
  } else if (/homework|assignment/.test(lower)) {
    res.kind = "addHomeworks";
  } else {
    res.kind = /study|prepare|slides/.test(lower) ? "addTask" : "addEvent";
  }

  // Explicit ranges (from X to Y)
  const range = input.match(FROM_TO);
  if (range) {
    res.startTime = range[1];
    res.endTime = range[2];
  }

  // Single time
  const t = input.match(HOUR);
  if (t && !res.startTime) {
    res.startTime = `${t[1].padStart(2, "0")}:${t[2]}`;
  }

  // Relative time phrases → convert to absolute start time (and end by duration)
  const now = dayjs().tz(tzid);
  if (!res.startTime) {
    const rel = lower.match(/in\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)/i);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const unit = rel[2][0] === 'h' ? 'hour' : 'minute';
      const relStart = now.add(n, unit as any);
      res.date = relStart.format('YYYY-MM-DD');
      res.startTime = relStart.format('HH:mm');
    }
  }

  // Duration
  const dur = input.match(FOR_DUR);
  if (dur) {
    const n = parseInt(dur[1], 10);
    const unit = dur[2][0];
    res.durationMinutes = unit === "h" ? n * 60 : n;
    if (!res.endTime && res.startTime) {
      const [hh, mm] = res.startTime.split(":").map(Number);
      const end = dayjs().tz(tzid).hour(hh).minute(mm).add(res.durationMinutes, "minute");
      res.endTime = end.format("HH:mm");
    }
  }

  // Estimate (for tasks)
  const est = input.match(ESTIMATE);
  if (est) {
    const n = parseInt(est[1], 10);
    const unit = est[2][0];
    res.estimateMinutes = unit === "h" ? n * 60 : n;
  }

  // Date
  const iso = input.match(DATE_ISO);
  if (iso) {
    res.date = iso[1];
  }

  // Phrases (tomorrow, next week, next Friday)
  if (!res.date) {
    if (/\btomorrow\b/i.test(input)) {
      res.date = dayjs().tz(tzid).add(1, "day").format("YYYY-MM-DD");
    }
    const dow = input.match(/\b(mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/i);
    if (dow) {
      const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as any;
      const target = map[dow[1].slice(0, 3).toLowerCase()];
      let d = dayjs().tz(tzid);
      while (d.day() !== target) d = d.add(1, "day");
      if (NEXT_WEEK.test(input)) d = d.add(7, "day");
      res.date = d.format("YYYY-MM-DD");
    }
  }

  // Deadlines
  if (DUE_BY.test(input)) {
    const found = input.match(DATE_ISO);
    if (found) {
      res.due = found[1];
    }
    // Also capture time if present
    const dueTime = input.match(HOUR);
    if (dueTime && res.due) {
      res.due = `${res.due}T${dueTime[1].padStart(2, "0")}:${dueTime[2]}:00`;
    }
  }

  // Priority
  if (/\bhigh priority\b/i.test(input)) res.priority = "high";
  else if (/\blow priority\b/i.test(input)) res.priority = "low";

  // Count (for homeworks/gym)
  const countMatch = input.match(/(\d+)\s*(homeworks?|assignments?|sessions?)/i);
  if (countMatch) {
    res.count = parseInt(countMatch[1], 10);
  }

  return res;
}
