import SwiftUI

// MARK: - Design Scaffold (header + mood + notifications)
struct DesignScaffold<Content: View>: View {
    let client: APIClient
    let title: String
    var showMood: Bool = false
    var showNotifications: Bool = false
    @ViewBuilder var content: () -> Content
    @State private var dayState: DayState?
    var body: some View {
        VStack(spacing: 0) {
            TopHeaderView(title: title)
            if showMood && (dayState == nil || dayState?.mood == .none) {
                MoodCheckInBanner(client: client, onSet: { Task { await load() } })
            }
            if showNotifications { NotificationBannerView(client: client) }
            content()
        }
        .task { if showMood { await load() } }
    }
    private func load() async { dayState = try? await client.getDayState() }
}

private struct TopHeaderView: View {
    let title: String
    var body: some View {
        GeometryReader { geo in
            let s = max(0.9, min(1.2, geo.size.width / 390))
            HStack(spacing: 10 * s) {
            ZStack {
                    RoundedRectangle(cornerRadius: 12 * s).fill(Color.blue)
                    Text("P").font(.system(size: 13 * s, weight: .semibold)).foregroundStyle(.white)
            }
                .frame(width: 36 * s, height: 36 * s)
                Text(title).font(.system(size: 22 * s, weight: .semibold))
                Spacer()
                HStack(spacing: 10 * s) {
                    Image(systemName: "face.smiling").font(.system(size: 20 * s)).foregroundStyle(.secondary)
                    Image(systemName: "bell").font(.system(size: 20 * s)).foregroundStyle(.secondary)
                    Image(systemName: "gearshape").font(.system(size: 20 * s)).foregroundStyle(.secondary)
                    Circle().stroke(Color(.separator), lineWidth: 2).frame(width: 36 * s, height: 36 * s).overlay(Text("JD").font(.system(size: 12 * s, weight: .medium)))
                }
            }
            .padding(.horizontal, 16 * s)
            .padding(.top, 10 * s)
            .padding(.bottom, 10 * s)
            .background(.ultraThinMaterial)
            .overlay(Divider(), alignment: .bottom)
        }
    }
}

// MARK: - Root Tabs (5 tabs to match Navigation Map)
struct TabsRootView: View {
    let client: APIClient
    var body: some View {
        TabView {
            NavigationStack {
                ChatViewFull(client: client)
                    .navigationTitle("Chat")
                    .navigationBarTitleDisplayMode(.large)
            }
            .tabItem { Label("Chat", systemImage: "message.fill") }

            NavigationStack {
                TasksTSXView(client: client)
                    .navigationTitle("Tasks")
                    .navigationBarTitleDisplayMode(.large)
            }
            .tabItem { Label("Tasks", systemImage: "checklist") }

            NavigationStack {
                CalendarListTSXView(client: client)
                    .navigationTitle("Calendar")
                    .navigationBarTitleDisplayMode(.large)
            }
            .tabItem { Label("Calendar", systemImage: "calendar") }

            NavigationStack {
                LearningViewFull(client: client)
                    .navigationTitle("Learning")
                    .navigationBarTitleDisplayMode(.large)
            }
            .tabItem { Label("Learning", systemImage: "brain.head.profile") }

            NavigationStack {
                InsightsViewFull(client: client)
                    .navigationTitle("Insights")
                    .navigationBarTitleDisplayMode(.large)
            }
            .tabItem { Label("Insights", systemImage: "chart.bar.fill") }
        }
        .tint(.blue)
    }
}

// MARK: - Today
struct TodayScreen: View {
	let client: APIClient
	@State private var selected: Item?
	@State private var showExplainer = false
	@State private var dayState: DayState?
	@State private var showMood = false
	var body: some View {
		NavigationStack {
			VStack(spacing: 0) {
			if showMood || (dayState?.mood == .none || dayState == nil) {
				MoodBanner(client: client, onSet: { showMood = false; Task { await loadDayState() } })
			}
			TasksTSXView(client: client)
		}
		.navigationTitle("Today")
		}
		.task { await loadDayState() }
		.sheet(isPresented: $showExplainer) {
			if let item = selected { PlanExplainerSheet(item: item, client: client) }
		}
	}
	private func loadDayState() async { dayState = try? await client.getDayState() }
}

struct MoodBanner: View {
	let client: APIClient
	var onSet: () -> Void
	@State private var setting = false
	var body: some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 8) {
				ForEach([Mood.tired, .stressed, .motivated, .focused, .relaxed], id: \.self) { m in
					Button(action: { Task { await set(m) } }) { Text(label(m)) }.buttonStyle(.bordered)
				}
			}
			.padding(.horizontal)
		}
	}
	private func label(_ m: Mood) -> String { switch m { case .tired: return "😫 Tired"; case .stressed: return "😰 Stressed"; case .motivated: return "💪 Motivated"; case .focused: return "🎯 Focused"; case .relaxed: return "😌 Relaxed"; case .none: return "None" } }
	private func set(_ m: Mood) async { setting = true; defer { setting = false }; _ = try? await client.updateMood(m); onSet() }
}

// MARK: - Calendar
struct CalendarScreen: View {
	let client: APIClient
	@State private var currentWeekISO: String = ISO8601DateFormatter().string(from: Date())
	@State private var data: CalendarResponse?
	var body: some View {
		List {
			if let items = data?.items { ForEach(items) { i in VStack(alignment: .leading) { Text(i.title).font(.subheadline.weight(.semibold)); Text((i.start ?? "") + " → " + (i.end ?? "")).font(.caption).foregroundStyle(.secondary) } } }
			else { Text("Loading…").foregroundStyle(.secondary) }
		}
		.navigationTitle("Calendar")
		.task { data = try? await client.getCalendar(weekStartISO: currentWeekISO) }
	}
}

// MARK: - Next Actions
struct NextActionsScreen: View {
	let client: APIClient
	@State private var data: NextActions?
	var body: some View {
		List {
			if let items = data?.items { ForEach(items, id: \.id) { i in VStack(alignment: .leading) { Text(i.title).font(.subheadline.weight(.semibold)); Text(i.type.rawValue.capitalized).font(.caption).foregroundStyle(.secondary) } } } else { Text("Loading…") }
		}
		.navigationTitle("Next Actions")
		.task { data = try? await client.getNext() }
	}
}

// MARK: - Notifications
struct NotificationsScreen: View {
	let client: APIClient
	@State private var resp: NotificationsResponse?
	var body: some View {
		List {
			if let ns = resp?.notifications, !ns.isEmpty {
				ForEach(ns, id: \.id) { n in
					VStack(alignment: .leading, spacing: 4) {
						Text(n.kind.rawValue).font(.subheadline.weight(.semibold))
						Text(n.payload.message ?? "").font(.caption).foregroundStyle(.secondary)
						HStack { Button("Accept") { Task { _ = try? await client.ackNotification(id: n.id, action: "accept"); await load() } }; Button("Snooze") { Task { _ = try? await client.ackNotification(id: n.id, action: "snooze"); await load() } }; Button("Dismiss") { Task { _ = try? await client.ackNotification(id: n.id, action: "dismiss"); await load() } } }
					}
				}
			} else { Text("No notifications") }
		}
		.navigationTitle("Notifications")
		.toolbar { ToolbarItem(placement: .primaryAction) { Button("Check now") { Task { _ = try? await client.checkNotifications(); await load() } } } }
		.task { await load() }
	}
	private func load() async { resp = try? await client.getNotifications() }
}

// MARK: - Learning
struct LearningScreen: View {
	let client: APIClient
	@State private var prefs: LearningPreferencesResponse?
	@State private var insights: LearningInsights?
	var body: some View {
		List {
			Section("Preferences") {
				Toggle("Prefer evening", isOn: Binding(get: { prefs?.preferences.preferEvening ?? false }, set: { val in Task { _ = try? await client.updateLearningPreferences(.init(preferEvening: val, maxContinuousFocus: prefs?.preferences.maxContinuousFocus, pinnedWindows: prefs?.preferences.pinnedWindows, bannedWindows: prefs?.preferences.bannedWindows)); await loadPrefs() } }))
				Stepper("Max focus: \(prefs?.preferences.maxContinuousFocus ?? 60) min", onIncrement: { Task { let cur = (prefs?.preferences.maxContinuousFocus ?? 60) + 5; _ = try? await client.updateLearningPreferences(.init(preferEvening: prefs?.preferences.preferEvening, maxContinuousFocus: cur, pinnedWindows: prefs?.preferences.pinnedWindows, bannedWindows: prefs?.preferences.bannedWindows)); await loadPrefs() } }, onDecrement: { Task { let cur = max(30, (prefs?.preferences.maxContinuousFocus ?? 60) - 5); _ = try? await client.updateLearningPreferences(.init(preferEvening: prefs?.preferences.preferEvening, maxContinuousFocus: cur, pinnedWindows: prefs?.preferences.pinnedWindows, bannedWindows: prefs?.preferences.bannedWindows)); await loadPrefs() } })
			}
			Section("Stats") {
				Text("Top windows: \(prefs?.stats.topWindows.count ?? 0)")
			}
			Section("Insights") {
				Text("Completion: \(Int((insights?.recentTrends.completionRate ?? 0)*100))% | Avg snoozes: \(Int(insights?.recentTrends.avgSnoozes ?? 0)) | Avg skips: \(Int(insights?.recentTrends.avgSkips ?? 0))")
			}
		}
		.navigationTitle("Learning")
		.task { await loadPrefs(); insights = try? await client.getLearningInsights() }
	}
	private func loadPrefs() async { prefs = try? await client.getLearningPreferences() }
}

// MARK: - Health
struct HealthScreen: View {
	let client: APIClient
	@State private var rollup: DailyRollupModel?
	@State private var goal: Int = 2000
	var body: some View {
		Form {
			Section("Daily Rollup") {
				Text("Focus blocks: \(rollup?.focusBlocksCompleted ?? 0)")
				Text("Snoozes: \(rollup?.snoozes ?? 0)")
				Text("Skips: \(rollup?.skips ?? 0)")
				Text("Sleep: \(rollup?.sleepHours ?? 0) h | Water: \(rollup?.waterMl ?? 0) ml")
			}
			Section("Hydration Goal") {
				Stepper("Goal: \(goal) ml", value: $goal, in: 500...5000, step: 100)
				Button("Save Goal") { Task { _ = try? await client.setWaterGoal(goal); await load() } }
				HStack { Button("+250 ml") { Task { _ = try? await client.ingestHealth(waterMl: 250); await load() } }; Button("+500 ml") { Task { _ = try? await client.ingestHealth(waterMl: 500); await load() } } }
			}
		}
		.navigationTitle("Health")
		.task { await load() }
	}
	private func load() async { rollup = try? await client.getDailyRollup() }
}

// MARK: - Gym
struct GymScreen: View {
	let client: APIClient
	@State private var prefs: WorkoutPreferences?
	@State private var planned: [Item] = []
	@State private var streak: StreakStatus?
	@State private var perWeek: Int = 3
	@State private var defaultDuration: Int = 60
	var body: some View {
		Form {
			Section("Preferences") {
				Stepper("Workouts/week: \(perWeek)", value: $perWeek, in: 1...7)
				Stepper("Default duration: \(defaultDuration) min", value: $defaultDuration, in: 15...240, step: 5)
				Button("Save") { Task { _ = try? await client.setWorkoutPrefs(perWeek: perWeek, defaultDurationMin: defaultDuration, preferredWindows: nil); await reload() } }
			}
			Section("Plan Week") {
				Button("Plan now") { Task { let res = try? await client.planWorkouts(); planned = res?.workouts ?? []; streak = try? await client.getStreakStatus() } }
				Text("Streak protected: \(streak?.protected == true ? "Yes" : "No")")
			}
			Section("Planned Workouts") {
				if planned.isEmpty { Text("None yet") } else { ForEach(planned) { i in Text(i.title + " — " + (i.start ?? "")) } }
			}
		}
		.navigationTitle("Gym")
		.task { await reload() }
	}
	private func reload() async { let r = try? await client.getWorkoutPrefs(); prefs = r?.preferences; perWeek = prefs?.perWeek ?? 3; defaultDuration = prefs?.defaultDurationMin ?? 60; streak = try? await client.getStreakStatus() }
}

// MARK: - Weekly
struct WeeklyScreen: View {
	let client: APIClient
	@State private var summary: WeeklySummary?
	@State private var recent: [WeeklySummary] = []
	var body: some View {
		List {
			if let s = summary {
				Section("This Week") { Text("Done: \(s.tasksDone) | Skips: \(s.tasksSkipped) | Snoozes: \(s.snoozes)") }
			}
			Section("Recent") { ForEach(recent) { r in Text(r.weekStart + " — Done: \(r.tasksDone)") } }
		}
		.navigationTitle("Weekly")
		.task { summary = try? await client.getWeeklySummary(weekStartISO: nil); recent = (try? await client.getRecentSummaries()) ?? [] }
	}
}

// MARK: - Gmail
struct GmailScreen: View {
	let client: APIClient
	@State private var status: GmailStatus?
	var body: some View {
		VStack(spacing: 12) {
			Text("Connected: \(status?.connected == true ? "Yes" : "No")")
			if let email = status?.emailAddress { Text("Email: \(email)") }
			Button("Sync now") { Task { _ = try? await client.syncGmail(); await load() } }
			Spacer()
		}
		.padding()
		.navigationTitle("Gmail")
		.task { await load() }
	}
	private func load() async { status = try? await client.getGmailStatus() }
}

// MARK: - Settings
struct SettingsScreen: View {
	let client: APIClient
	@State private var user: UserProfile?
	@State private var autoBreaks: Bool = true
	var body: some View {
		Form {
			Section("Profile") { Text(user?.username ?? ""); Text("Timezone: \(user?.timezone ?? "")") }
			Section("Breaks") {
				Toggle("Automatic micro-breaks", isOn: Binding(get: { autoBreaks }, set: { val in Task { _ = try? await client.setAutoBreaks(val); autoBreaks = val } }))
				Button("Recompute now") { Task { _ = try? await client.recomputeBreaks(); } }
			}
		}
		.navigationTitle("Settings")
		.task { await load() }
	}
	private func load() async {
		if let u = try? await client.getUser() { user = u; autoBreaks = u.autoBreaks }
	}
}

// MARK: - Calendar stub simple list implementation above

// MARK: - Root integration convenience
struct AppRootTabs: View {
	let client: APIClient
	var body: some View { TabsRootView(client: client) }
}
