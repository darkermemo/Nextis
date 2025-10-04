export interface NextAction {
  id: string;
  title: string;
  type: "task" | "event" | "breakTime" | "leisure" | "quiz";
  priority: "high" | "normal" | "low";
  durationMinutes: number | null;
  deadline: string | null;
  start: string | null;
}

export interface NextActions {
  items: NextAction[];
}

export interface Task {
  id: string;
  userId: string;
  type: "task" | "event" | "breakTime" | "leisure" | "quiz";
  title: string;
  notes?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
  deadline?: string;
  fixed: boolean;
  priority: "high" | "normal" | "low";
  subtasks: Array<{id: string, title: string, done: boolean}>;
  reminders: string[];
  tags: string[];
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TasksResponse {
  today: Task[];
  thisWeek: Task[];
  later: Task[];
  all: Task[];
}

export interface CalendarResponse {
  items: Task[];
  weekStart: string;
  weekEnd: string;
}

export interface ChatResponse {
  intent: any;
  items: Task[];
  changes: string[];
  message: string;
}

export interface DayState {
  id: string;
  userId: string;
  date: string;
  mood: "tired" | "stressed" | "motivated" | "focused" | "relaxed" | "none";
  hasEarlyWorkTomorrow: boolean;
  createdAt: string;
  updatedAt: string;
}
