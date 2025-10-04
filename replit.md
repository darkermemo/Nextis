# WeekMind - Intelligent Planning Assistant

## Overview

WeekMind is a fullstack TypeScript application that serves as an intelligent planning assistant. The system uses natural language processing via LLM integration to parse user commands and automatically manage tasks, events, study blocks, and leisure time. It features a web interface with three main views (Chat, Tasks, Calendar) and intelligently schedules activities while respecting user preferences like bedtime, work hours, and mood states.

The application is designed to help users manage their time effectively by automatically creating study preparation blocks for exams, scheduling breaks, setting reminders, generating quiz blocks for test preparation, and adjusting schedules based on mood and upcoming commitments.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript for type safety
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching
- Tailwind CSS with custom design system for styling
- shadcn/ui component library built on Radix UI primitives

**Component Structure:**
The frontend follows a feature-based organization with three main views:
1. **Chat View** - Primary interface with conversational input, displays "Next 3" actions at the top, shows chat history with user messages and AI responses
2. **Tasks View** - Lists tasks grouped by Today/This Week/Later with priority indicators and completion tracking
3. **Calendar View** - Week-based calendar showing time-blocked activities with color-coded item types

**State Management Strategy:**
- Server state managed through React Query with background refetching
- Query keys follow REST-like patterns (`["/api/tasks"]`, `["/api/calendar"]`)
- Optimistic updates disabled; relies on cache invalidation and refetching
- Local UI state managed with React hooks

**Design System:**
- CSS custom properties for theming with light/dark mode support
- Neutral color scheme as base with primary (indigo/blue) and accent (teal/green) colors
- Custom font stack: Inter for UI, JetBrains Mono for code elements
- Responsive design with mobile-first breakpoints

**Progressive Web App (PWA) & Mobile:**
- PWA manifest for home screen installation on iOS and Android
- Standalone display mode (app-like experience without browser chrome)
- App icons: 192x192 and 512x512 PNG with maskable variants
- iOS-specific meta tags for optimal home screen behavior
- Touch targets meet iOS Human Interface Guidelines (44px minimum)
- Mobile-optimized input fields (16px font to prevent zoom)
- Safe area insets for notched devices (iPhone X and later)
- Horizontal scroll calendar grid for mobile viewports
- Fully responsive from 320px+ screen widths

### Backend Architecture

**Technology Stack:**
- Node.js runtime with TypeScript
- Express.js as the HTTP server framework
- Drizzle ORM for type-safe database operations
- Neon Serverless PostgreSQL (with WebSocket support via `ws` package)
- OpenAI GPT-5 for natural language command parsing
- Day.js with timezone support for date/time manipulation

**API Design:**
RESTful endpoints following resource-based patterns:
- `POST /api/chat/parse` - Parses natural language into structured intent
- `GET /api/next` - Returns top 3 next actions
- `GET /api/tasks` - Returns tasks grouped by time period
- `GET /api/calendar` - Returns calendar items for a week
- `PATCH /api/tasks/:id` - Updates task properties
- `POST /api/mood` - Updates mood and reschedules accordingly
- `POST /api/early-work` - Adjusts schedule for early morning work

**Business Logic Layer:**
- `LLMService` - Handles OpenAI API communication and prompt engineering for intent extraction
- `PlannerEngine` - Core scheduling logic that applies parsed intents, creates study blocks, schedules breaks, generates quizzes, and respects constraints (bedtime, work hours, mood states)
- `DatabaseStorage` - Abstraction layer implementing storage interface for data persistence

**Intent Processing:**
The system recognizes multiple intent types:
- `addExam` - Creates exam event with automated study preparation blocks, quiz sessions, and reminders (D-2 and T-5h)
- `addMeeting` - Schedules meeting with reminder buffers
- `addHomeworks` - Creates multiple homework tasks distributed across timeframe
- `addBreaks` - Inserts coffee breaks during work hours
- `addLeisureTV` - Schedules TV/leisure time in evenings
- `setMood` - Adjusts schedule based on energy level (tired → shorter blocks, earlier bedtime)
- `setEarlyWork` - Modifies evening schedule and advances bedtime when early morning work is required
- `genericTask` - Creates general task with priority

**Scheduling Constraints:**
- No heavy tasks within 90 minutes of bedtime
- Work hours respected (default 9:00-18:00)
- Bedtime enforcement (default 22:00)
- Evening study can be disabled per user preference
- Mood-based duration adjustments

### Database Schema

**PostgreSQL with Drizzle ORM:**

**Users Table:**
- Stores user credentials (username, hashed password)
- Timezone preferences (default: Asia/Riyadh)
- Work schedule (start/end hours)
- Bedtime preferences
- Evening study and leisure preferences
- UUID primary key with auto-generation

**Items Table:**
- Polymorphic design supporting multiple item types (task, event, breakTime, leisure, quiz)
- Flexible scheduling with optional start/end times or duration-based
- Fixed vs. flexible time blocks
- Priority levels (high, normal, low)
- Subtasks as JSONB array
- Reminders as ISO timestamp array
- Tags for categorization
- Completion tracking
- Timestamps for audit trail

**Day States Table:**
- Daily mood tracking (tired, stressed, motivated, focused, relaxed, none)
- Early work tomorrow flag
- Date-based records (YYYY-MM-DD format)
- Used to adjust daily schedule based on current state

**Design Decisions:**
- UUID for primary keys to support distributed systems
- JSONB for flexible nested data (subtasks, reminders, tags) without separate tables
- Text-based enums with Zod validation for type safety
- Timestamps in ISO format for timezone-safe operations
- Cascade deletes to maintain referential integrity

### External Dependencies

**OpenAI API Integration:**
- Model: GPT-5 (latest as of the codebase)
- JSON mode enabled for structured responses
- System prompts include current date/time and timezone context
- Fallback behavior with API key validation
- Used exclusively for natural language to structured intent parsing

**Neon Serverless PostgreSQL:**
- WebSocket-based connection pooling for serverless environments
- Configured via `DATABASE_URL` environment variable
- Connection through `@neondatabase/serverless` driver
- Drizzle ORM integration for migrations and queries

**Timezone Management:**
- Day.js with UTC and timezone plugins
- Default timezone: Asia/Riyadh (configurable per user)
- All date operations timezone-aware
- Server normalizes times to user's timezone before scheduling

**Development Tools:**
- Vite plugins: runtime error overlay, Replit cartographer (dev mode), dev banner
- TSX for TypeScript execution in development
- ESBuild for production bundling
- Drizzle Kit for schema migrations (`npm run db:push`)

**UI Component Library:**
- Radix UI primitives (30+ components) for accessible, unstyled components
- Custom styling via Tailwind and CVA (class-variance-authority)
- Components include: dialogs, popovers, forms, calendars, toasts, etc.
- Full keyboard navigation and ARIA compliance

**Form Handling:**
- React Hook Form for form state management
- Hookform Resolvers with Zod for schema validation
- Drizzle-Zod for generating Zod schemas from database tables

**Session Management:**
- MVP uses mock user authentication (username: "demo")
- Production-ready structure expects JWT-based auth (fastify-jwt mentioned in requirements)
- Current implementation skips auth middleware for rapid prototyping

### Habit Learning System

**Purpose:**
WeekMind learns from user behavior to automatically optimize scheduling over time. The system tracks completion patterns, preferred work windows, and session durations to make intelligent scheduling decisions.

**Core Components:**

1. **Event Logging** (events table):
   - Append-only log of user behavior
   - Event types: item_done, item_skipped, item_snoozed, item_started, item_moved, plan_autorescheduled, bedtime_hit, health_ingested
   - Context includes: item details, durations, mood, sleep, day/hour
   - Indexed on (userId, createdAt DESC) for efficient queries

2. **Habit Learning Data** (habitLearn table):
   - Per-user learned preferences and patterns
   - windowJSON: Success scores (0-1) for each hour of each weekday
   - lengthJSON: Learned session durations by item type (30-90 min)
   - penalties: Risk penalties (nightHeavy, lowSleep)
   - preferences: User controls (preferEvening, maxContinuousFocus, pinned/banned windows)
   - Unique constraint on userId

3. **Daily Rollup** (dailyRollup table):
   - Daily aggregated metrics per user
   - Tracks: focusBlocksCompleted, snoozes, skips, avgStartDelayMin, sleepHours, waterMl, activeMinutes
   - Unique index on (userId, date) prevents duplicates

**Learning Algorithms:**

- **Window Success Scoring**: Uses EMA (Exponential Moving Average) with α=0.8
  - Formula: `newScore = 0.8 * oldScore + 0.2 * todayCompletionRate`
  - Tracks which time windows have highest completion rates
  
- **Session Length Adaptation**: Learns actual task durations
  - Formula: `newLength = 0.8 * oldLength + 0.2 * avgActual`
  - Clamped between 30-90 minutes
  
- **Snooze Risk Calculation**: Predicts likelihood of task avoidance
  - Factors: late hour (+0.4), low sleep (+0.4), tired/stressed mood (+0.3), many meetings (+0.2)
  - Used to avoid scheduling heavy tasks in risky time slots

- **Slot Scoring**: Combines signals for intelligent scheduling
  - Formula: `score = baseWindowSuccess - snoozeRisk - curfewPenalty`
  - Planner uses highest-scoring slots for new tasks

**API Endpoints:**
- `GET /api/learning/preferences` - Get user's learning preferences and stats
- `PATCH /api/learning/preferences` - Update learning preferences
- `POST /api/learning/update` - Manually trigger daily learning update
- `POST /api/learning/reset` - Reset learning to defaults
- `GET /api/learning/insights` - Get visual insights (weekday/hourly patterns, trends)
- `POST /api/tasks/:id/skip` - Skip task (logs event)
- `POST /api/tasks/:id/snooze` - Snooze task (logs event)

**Planner Integration:**
- `findBestSlot()`: Uses learned window scores to pick optimal time slots
- `getLearnedDuration()`: Applies learned session lengths to tasks
- Snooze risk filtering: Avoids scheduling heavy tasks (>45 min) in high-risk slots
- Cold start: Initializes with sensible defaults (evening bias 18:00-20:00)

**UI Features:**
- Learning tab with insights dashboard
- Weekday and hourly success pattern visualizations
- Top 5 best time windows display
- Learned session lengths by task type
- Recent trends (7-day completion rate, snoozes, skips)
- Preference controls: evening preference toggle, max focus slider
- Actions: manual update, reset to defaults