# NextisKit (Swift Package)

SwiftUI kit for Nextis iOS. Provides models, API client, and views to connect to the existing API server.

## Installation (Xcode SPM)
1. File > Add Packages…
2. Enter local path or git URL to this repo folder: `ios/NextisKit`
3. Add the library `NextisKit` to your app target.

## Configure
```swift
import NextisKit

@main
struct AppMain: App {
	@State private var client: APIClient
	init() {
		let baseURL = URL(string: "https://YOUR-BACKEND-HOST")! // e.g. Railway URL
		client = APIClient(config: NextisConfig(baseURL: baseURL))
	}
	var body: some Scene {
		WindowGroup {
			RootView(client: client)
		}
	}
}
```

## Provided types
- Enums: `ItemType`, `Priority`, `Mood`, `NotificationKind`
- Models: `Item`, `TasksResponse`, `CalendarResponse`, `NextActions`, `DayState`, `AppNotification`, `LearningPreferences*`, `UserProfile`, `WorkoutPreferences`, `WeeklySummary`, `PlanExplanation`
- Errors: `APIError`

## APIClient (core methods)
- `getTasks() -> TasksResponse`
- `toggleTask(id:done:) -> Item`
- `updateTask(id:startISO:) -> Item`
- `getCalendar(weekStartISO:) -> CalendarResponse`
- `getNext() -> NextActions`
- `explain(itemId:) -> PlanExplanation`
- `updateMood(_:) -> DayStateWrapper`

All endpoints append `timezone = TimeZone.current.identifier` automatically.

## Views
- `TodayTasksView` — grouped Today/This Week/Later, toggling completion, “Why here?”
- `PlanExplainerSheet` — shows explanation, alternatives, and move action

Example usage:
```swift
struct RootView: View {
	let client: APIClient
	@State private var selected: Item?
	@State private var showExplainer = false
	var body: some View {
		TodayTasksView(client: client, onExplain: { item in
			selected = item; showExplainer = true
		}, onCompleted: { _ in })
		.sheet(isPresented: $showExplainer) {
			if let item = selected { PlanExplainerSheet(item: item, client: client) }
		}
	}
}
```

## Notes
- Use ISO8601 for all date fields.
- Handle API errors by decoding `{ error?: string, message?: string }` into `APIError`.
- Extend `APIClient` with other endpoints as needed (notifications, learning, health, gym, gmail, weekly summary).
