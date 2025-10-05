import SwiftUI

// MARK: - Chat View (matching web chat-view.tsx exactly)
struct ChatViewFull: View {
	let client: APIClient
	@State private var messages: [ChatMessage] = []
	@State private var input = ""
	@State private var nextActions: NextActions?
	@State private var sending = false
	@State private var earlyWork = false
	
	struct ChatMessage: Identifiable {
		let id = UUID()
		let type: MsgType
		let content: String
		let timestamp = Date()
		let changes: [String]?
		enum MsgType { case user, assistant }
	}
	
	var body: some View {
		VStack(spacing: 0) {
			// Next 3 Actions Card
			Next3ActionsCard(nextActions: nextActions, client: client)
			
			// Chat Messages Area
			ScrollView {
				LazyVStack(spacing: 16) {
					ForEach(messages) { message in
						MessageBubble(message: message)
					}
					if sending {
						HStack(spacing: 12) {
							ZStack {
								LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
								ProgressView().tint(.white)
							}
							.frame(width: 32, height: 32).clipShape(Circle())
							VStack(alignment: .leading, spacing: 4) {
								Text("Processing your request...").font(.subheadline).foregroundStyle(.secondary)
							}
							Spacer()
						}
						.padding()
					}
				}
				.padding()
			}
			
			Divider()
			
			// Chat Input Area
			VStack(spacing: 8) {
				HStack(spacing: 8) {
					Button(action: {}) {
						HStack(spacing: 4) {
							Image(systemName: "plus")
							Text("Quick Add").font(.subheadline.weight(.medium))
						}
					}
					.buttonStyle(.borderedProminent)
					.controlSize(.regular)
					
					TextField("Type a message...", text: $input)
						.textFieldStyle(.roundedBorder)
						.disabled(sending)
						.submitLabel(.send)
						.onSubmit { Task { await send() } }
					
					Button(action: { Task { await send() } }) {
						Image(systemName: "paperplane.fill")
					}
					.buttonStyle(.borderedProminent)
					.disabled(input.isEmpty || sending)
				}
				
				HStack(spacing: 8) {
					Button(action: {
						earlyWork.toggle()
						Task { _ = try? await client.toggleEarlyWork(earlyWork) }
					}) {
						HStack(spacing: 4) {
							Image(systemName: "sun.max")
							Text("Early work tomorrow \(earlyWork ? "✓" : "")")
						}
						.font(.caption)
					}
					.buttonStyle(.plain)
					.foregroundStyle(earlyWork ? .primary : .secondary)
					
					Text("•").font(.caption).foregroundStyle(.secondary)
					Text("Asia/Riyadh • \(Date().formatted(date: .abbreviated, time: .omitted))")
						.font(.caption)
						.foregroundStyle(.secondary)
				}
			}
			.padding()
		}
		.task {
			await loadNext()
			loadWelcome()
		}
	}
	
	private func loadWelcome() {
		if messages.isEmpty {
			messages.append(.init(
				type: .assistant,
				content: "👋 Hi! I'm WeekMind, your intelligent planning assistant. I can help you manage tasks, schedule events, and optimize your time.\n\nTry saying things like:\n• \"I have an exam on economics next Friday\"\n• \"Meeting Thursday at 9:00 pm\"\n• \"I have 3 homeworks next week\"\n• \"Add coffee breaks and TV time\"\n\nOr click Quick Add to use templates!",
				changes: nil
			))
		}
	}
	
	private func loadNext() async {
		nextActions = try? await client.getNext()
	}
	
	private func send() async {
		guard !input.isEmpty else { return }
		let txt = input
		input = ""
		sending = true
		
		messages.append(.init(type: .user, content: txt, changes: nil))
		
		if let resp = try? await client.sendChatMessage(txt) {
			let content = resp.changes.joined(separator: "\n")
			messages.append(.init(type: .assistant, content: content.isEmpty ? resp.message : content, changes: resp.changes))
			await loadNext()
		}
		
		sending = false
	}
}

struct Next3ActionsCard: View {
	let nextActions: NextActions?
	let client: APIClient
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "bolt.fill").foregroundStyle(.blue)
				Text("Next 3 Actions").font(.subheadline.weight(.semibold))
				Spacer()
				Text("Updated 2m ago").font(.caption2).foregroundStyle(.secondary)
			}
			
			if let items = nextActions?.items, !items.isEmpty {
				ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { idx, item in
					HStack(spacing: 12) {
						ZStack {
							Circle().fill(idx == 0 ? Color.red.opacity(0.1) : idx == 1 ? Color.orange.opacity(0.1) : Color.purple.opacity(0.1))
							Text("\(idx+1)").font(.caption.weight(.bold))
								.foregroundStyle(idx == 0 ? .red : idx == 1 ? .orange : .purple)
						}
						.frame(width: 24, height: 24)
						
						VStack(alignment: .leading, spacing: 4) {
							HStack(spacing: 6) {
								Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(1)
								Chip(text: item.priority.rawValue.capitalized, color: priorityColor(item.priority))
							}
							HStack(spacing: 8) {
								if let dur = item.durationMinutes {
									HStack(spacing: 2) {
										Image(systemName: "clock").font(.caption2)
										Text("\(dur) min").font(.caption2)
									}
									.foregroundStyle(.secondary)
								}
								if let deadline = item.deadline {
									HStack(spacing: 2) {
										Image(systemName: "calendar").font(.caption2)
										Text("Due \(formatDate(deadline))").font(.caption2)
									}
									.foregroundStyle(.secondary)
								}
							}
						}
						
						Spacer()
						
						Button(action: {}) {
							Image(systemName: "play.circle")
						}
						.buttonStyle(.plain)
						.foregroundStyle(.blue)
					}
					.padding(12)
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 10))
				}
			} else {
				Text("No pending actions. Add some tasks to get started!")
					.font(.caption)
					.foregroundStyle(.secondary)
					.frame(maxWidth: .infinity)
					.padding()
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 10))
			}
		}
		.padding(16)
		.background(
			LinearGradient(
				colors: [Color.blue.opacity(0.05), Color.purple.opacity(0.05)],
				startPoint: .topLeading,
				endPoint: .bottomTrailing
			)
		)
		.overlay(Divider(), alignment: .bottom)
	}
	
	private func priorityColor(_ p: Priority) -> Color {
		switch p {
		case .high: return .red
		case .normal: return .orange
		case .low: return .gray
		}
	}
	
	private func formatDate(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return "" }
		let formatter = DateFormatter()
		formatter.dateFormat = "MMM d"
		return formatter.string(from: date)
	}
}

struct MessageBubble: View {
	let message: ChatViewFull.ChatMessage
	
	var body: some View {
		HStack(alignment: .top, spacing: 12) {
			if message.type == .assistant {
				ZStack {
					LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
					Image(systemName: "brain.head.profile").foregroundStyle(.white)
				}
				.frame(width: 32, height: 32)
				.clipShape(Circle())
			}
			
			VStack(alignment: message.type == .user ? .trailing : .leading, spacing: 4) {
				VStack(alignment: .leading, spacing: 0) {
					Text(message.content)
						.font(.subheadline)
						.padding(12)
						.background(message.type == .user ? Color.blue : Color(.secondarySystemBackground))
						.foregroundStyle(message.type == .user ? .white : .primary)
						.clipShape(RoundedRectangle(cornerRadius: 12))
					
					if let changes = message.changes, !changes.isEmpty {
						VStack(alignment: .leading, spacing: 6) {
							Text("Changes made:").font(.caption.weight(.semibold))
							ForEach(changes, id: \.self) { change in
								HStack(spacing: 4) {
									Image(systemName: "checkmark").font(.caption2).foregroundStyle(.green)
									Text(change).font(.caption2)
								}
							}
						}
						.padding(10)
						.background(Color(.tertiarySystemBackground))
						.clipShape(RoundedRectangle(cornerRadius: 8))
					}
				}
				
				Text(message.type == .user ? "You • \(formatTime(message.timestamp))" : "WeekMind • \(formatTime(message.timestamp))")
					.font(.caption2)
					.foregroundStyle(.secondary)
			}
			.frame(maxWidth: message.type == .user ? .infinity : nil, alignment: message.type == .user ? .trailing : .leading)
			
			if message.type == .user {
				ZStack {
					LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing)
					Text("AM").font(.caption.weight(.bold)).foregroundStyle(.white)
				}
				.frame(width: 32, height: 32)
				.clipShape(Circle())
			}
		}
	}
	
	private func formatTime(_ date: Date) -> String {
		let formatter = RelativeDateTimeFormatter()
		formatter.unitsStyle = .short
		return formatter.localizedString(for: date, relativeTo: Date())
	}
}

// MARK: - Calendar View (matching web with week grid)
struct CalendarViewFull: View {
	let client: APIClient
	@State private var data: CalendarResponse?
	@State private var currentWeek = Date()
	@State private var explainItem: Item?
	
	var body: some View {
		VStack(spacing: 0) {
			// Calendar Header
			HStack {
				VStack(alignment: .leading, spacing: 2) {
					Text(currentWeek.formatted(.dateTime.month(.wide).year()))
						.font(.title2.weight(.bold))
					Text("Week of \(weekStart.formatted(.dateTime.month(.abbreviated).day())) - \(weekEnd.formatted(.dateTime.month(.abbreviated).day()))")
						.font(.caption)
						.foregroundStyle(.secondary)
				}
				Spacer()
				HStack(spacing: 8) {
					Button(action: { currentWeek = Calendar.current.date(byAdding: .weekOfYear, value: -1, to: currentWeek)! }) {
						Image(systemName: "chevron.left")
					}
					.buttonStyle(.bordered)
					
					Button("Today") {
						currentWeek = Date()
					}
					.buttonStyle(.borderedProminent)
					
					Button(action: { currentWeek = Calendar.current.date(byAdding: .weekOfYear, value: 1, to: currentWeek)! }) {
						Image(systemName: "chevron.right")
					}
					.buttonStyle(.bordered)
				}
			}
			.padding()
			
			// Calendar Grid
			ScrollView([.horizontal, .vertical]) {
				CalendarGrid(items: data?.items ?? [], onTap: { explainItem = $0 })
			}
			
			// Legend
			ScrollView(.horizontal, showsIndicators: false) {
				HStack(spacing: 16) {
					LegendItem(color: .purple, label: "Study Blocks")
					LegendItem(color: .blue, label: "Events/Meetings")
					LegendItem(color: .orange, label: "Breaks")
					LegendItem(color: .pink, label: "Leisure")
					LegendItem(color: .green, label: "Quizzes")
				}
				.padding()
			}
		}
		.task {
			data = try? await client.getCalendar(weekStartISO: ISO8601DateFormatter().string(from: weekStart))
		}
		.onChange(of: currentWeek) { _, _ in
			Task {
				data = try? await client.getCalendar(weekStartISO: ISO8601DateFormatter().string(from: weekStart))
			}
		}
		.sheet(item: $explainItem) { item in
			PlanExplainerSheet(item: item, client: client)
		}
	}
	
	private var weekStart: Date {
		Calendar.current.startOfWeek(for: currentWeek)
	}
	
	private var weekEnd: Date {
		Calendar.current.date(byAdding: .day, value: 6, to: weekStart) ?? weekStart
	}
}

struct CalendarGrid: View {
	let items: [Item]
	var onTap: (Item) -> Void
	
	var body: some View {
		VStack(spacing: 0) {
			// Header row with days
			HStack(spacing: 0) {
				Color.clear.frame(width: 60)
				ForEach(weekDays(), id: \.self) { day in
					VStack(spacing: 2) {
						Text(day.formatted(.dateTime.weekday(.abbreviated)))
							.font(.caption.weight(.semibold))
							.foregroundStyle(.secondary)
						Text(day.formatted(.dateTime.day()))
							.font(.title3.weight(.bold))
							.foregroundStyle(Calendar.current.isDateInToday(day) ? .blue : .primary)
					}
					.frame(width: 100)
					.padding(8)
					.background(Color(.secondarySystemBackground))
				}
			}
			
			// Time slots (8 AM - 11 PM)
			ForEach(8..<24, id: \.self) { hour in
				HStack(spacing: 0) {
					Text(String(format: "%02d:00", hour))
						.font(.caption2)
						.foregroundStyle(.secondary)
						.frame(width: 60)
						.padding(4)
					
					ForEach(weekDays(), id: \.self) { day in
						ZStack(alignment: .topLeading) {
							Color(.tertiarySystemBackground)
								.frame(width: 100, height: 60)
							
							ForEach(eventsForDayHour(day: day, hour: hour)) { item in
								Button(action: { onTap(item) }) {
									VStack(alignment: .leading, spacing: 2) {
										HStack(spacing: 2) {
											if item.type == .breakTime {
												Image(systemName: "cup.and.saucer.fill")
													.font(.system(size: 8))
											}
											Text(item.title)
												.font(.caption2.weight(.semibold))
												.lineLimit(1)
										}
										Text(timeRange(item))
											.font(.system(size: 9))
											.opacity(0.75)
									}
									.padding(4)
									.frame(maxWidth: .infinity, alignment: .leading)
									.background(typeColor(item.type).opacity(0.3))
									.clipShape(RoundedRectangle(cornerRadius: 4))
									.overlay(
										RoundedRectangle(cornerRadius: 4)
											.strokeBorder(typeColor(item.type), lineWidth: 2, alignment: .leading)
									)
								}
								.buttonStyle(.plain)
								.frame(width: 96)
							}
						}
						.border(Color(.separator), width: 0.5)
					}
				}
			}
		}
	}
	
	private func weekDays() -> [Date] {
		(0..<7).compactMap {
			Calendar.current.date(byAdding: .day, value: $0, to: Calendar.current.startOfWeek(for: Date()))
		}
	}
	
	private func eventsForDayHour(day: Date, hour: Int) -> [Item] {
		items.filter { item in
			guard let startStr = item.start,
				  let start = ISO8601DateFormatter().date(from: startStr) else { return false }
			return Calendar.current.isDate(start, inSameDayAs: day) &&
				   Calendar.current.component(.hour, from: start) == hour
		}
	}
	
	private func timeRange(_ item: Item) -> String {
		guard let startStr = item.start,
			  let endStr = item.end,
			  let start = ISO8601DateFormatter().date(from: startStr),
			  let end = ISO8601DateFormatter().date(from: endStr) else { return "" }
		let formatter = DateFormatter()
		formatter.dateFormat = "HH:mm"
		return "\(formatter.string(from: start)) - \(formatter.string(from: end))"
	}
	
	private func typeColor(_ t: ItemType) -> Color {
		switch t {
		case .task: return .purple
		case .event: return .blue
		case .breakTime: return .orange
		case .leisure: return .pink
		case .quiz: return .green
		}
	}
}

struct LegendItem: View {
	let color: Color
	let label: String
	
	var body: some View {
		HStack(spacing: 6) {
			RoundedRectangle(cornerRadius: 2)
				.fill(color)
				.frame(width: 12, height: 12)
			Text(label)
				.font(.caption2)
				.foregroundStyle(.secondary)
		}
	}
}

// MARK: - Learning View (matching web with nested cards)
struct LearningViewFull: View {
	let client: APIClient
	@State private var prefs: LearningPreferencesResponse?
	@State private var insights: LearningInsights?
	@State private var user: UserProfile?
	@State private var localEvening = false
	@State private var localFocus = 60
	@State private var localBreaks = true
	
	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 16) {
				// Header
				HStack {
					ZStack {
						LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing)
						Image(systemName: "brain.head.profile").foregroundStyle(.white)
					}
					.frame(width: 40, height: 40)
					.clipShape(RoundedRectangle(cornerRadius: 10))
					
					VStack(alignment: .leading, spacing: 2) {
						Text("Learning Dashboard").font(.title3.weight(.bold))
						Text("Habit patterns and preferences").font(.caption).foregroundStyle(.secondary)
					}
					
					Spacer()
					
					HStack(spacing: 8) {
						Button(action: { Task { await updateLearning() } }) {
							HStack(spacing: 4) {
								Image(systemName: "arrow.clockwise")
								Text("Update")
							}
							.font(.caption)
						}
						.buttonStyle(.bordered)
						.controlSize(.small)
						
						Button(action: { Task { await resetLearning() } }) {
							HStack(spacing: 4) {
								Image(systemName: "arrow.counterclockwise")
								Text("Reset")
							}
							.font(.caption)
						}
						.buttonStyle(.bordered)
						.controlSize(.small)
					}
				}
				
				// Weekday Patterns & Best Windows
				HStack(spacing: 16) {
					WeekdayPatternsCard(insights: insights)
					BestWindowsCard(prefs: prefs)
				}
				
				// Learned Lengths
				LearnedLengthsCard(prefs: prefs)
				
				// Recent Trends & Total Stats
				HStack(spacing: 16) {
					RecentTrendsCard(insights: insights)
					TotalStatsCard(prefs: prefs)
				}
				
				// Preferences
				PreferencesCard(
					localEvening: $localEvening,
					localFocus: $localFocus,
					localBreaks: $localBreaks,
					client: client
				)
				
				// Health Tracker
				HealthTrackerCard(client: client)
				
				// Gym Planner
				GymPlannerCard(client: client)
				
				// Gmail Integration
				GmailCard(client: client)
			}
			.padding()
		}
		.task {
			prefs = try? await client.getLearningPreferences()
			insights = try? await client.getLearningInsights()
			user = try? await client.getUser()
			localEvening = prefs?.preferences.preferEvening ?? false
			localFocus = prefs?.preferences.maxContinuousFocus ?? 60
			localBreaks = user?.autoBreaks ?? true
		}
	}
	
	private func updateLearning() async {
		// Call update endpoint
	}
	
	private func resetLearning() async {
		// Call reset endpoint
	}
}

struct WeekdayPatternsCard: View {
	let insights: LearningInsights?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "chart.bar").foregroundStyle(.blue)
				Text("Weekday Success Patterns").font(.subheadline.weight(.semibold))
			}
			
			ForEach(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], id: \.self) { day in
				let score = insights?.weekdayPatterns[day] ?? 0
				VStack(spacing: 4) {
					HStack {
						Text(day).font(.caption).foregroundStyle(.primary)
						Spacer()
						Text("\(Int(score * 100))%").font(.caption).foregroundStyle(.secondary)
					}
					ProgressView(value: score).tint(.blue)
				}
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
}

struct BestWindowsCard: View {
	let prefs: LearningPreferencesResponse?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "clock").foregroundStyle(.blue)
				Text("Best Time Windows").font(.subheadline.weight(.semibold))
			}
			
			ForEach(Array((prefs?.stats.topWindows.prefix(5) ?? []).enumerated()), id: \.offset) { idx, window in
				HStack(spacing: 8) {
					ZStack {
						Circle().fill(idx == 0 ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
						Text("\(idx+1)").font(.caption2.weight(.bold))
							.foregroundStyle(idx == 0 ? .blue : .secondary)
					}
					.frame(width: 24, height: 24)
					
					VStack(alignment: .leading, spacing: 2) {
						Text("\(window.weekday) \(formatHour(window.hour))")
							.font(.caption.weight(.medium))
						Text("Success: \(Int(window.score * 100))%")
							.font(.caption2)
							.foregroundStyle(.secondary)
					}
					
					Spacer()
					
					ProgressView(value: window.score)
						.frame(width: 80)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
			}
			
			if prefs?.stats.topWindows.isEmpty ?? true {
				Text("No time window data yet. Complete more tasks to see patterns.")
					.font(.caption)
					.foregroundStyle(.secondary)
					.frame(maxWidth: .infinity)
					.padding()
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
	
	private func formatHour(_ hour: Int) -> String {
		let h = hour % 12
		let displayHour = h == 0 ? 12 : h
		let ampm = hour < 12 ? "AM" : "PM"
		return "\(displayHour):00 \(ampm)"
	}
}

struct LearnedLengthsCard: View {
	let prefs: LearningPreferencesResponse?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "chart.line.uptrend.xyaxis").foregroundStyle(.blue)
				Text("Learned Session Lengths").font(.subheadline.weight(.semibold))
			}
			
			LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
				ForEach(Array(prefs?.stats.learnedLengths ?? [:]).sorted(by: { $0.key < $1.key }), id: \.key) { type, duration in
					VStack(spacing: 4) {
						Text(type.capitalized)
							.font(.caption)
							.foregroundStyle(.secondary)
						Text("\(Int(duration))")
							.font(.title3.weight(.bold))
						Text("minutes")
							.font(.caption2)
							.foregroundStyle(.secondary)
					}
					.padding(12)
					.background(Color(.tertiarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 8))
				}
			}
			
			if prefs?.stats.learnedLengths.isEmpty ?? true {
				Text("No session data yet. Complete tasks to learn optimal durations.")
					.font(.caption)
					.foregroundStyle(.secondary)
					.frame(maxWidth: .infinity)
					.padding()
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
	}
}

struct RecentTrendsCard: View {
	let insights: LearningInsights?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Recent Trends (Last 7 Days)").font(.subheadline.weight(.semibold))
			
			VStack(spacing: 8) {
				HStack {
					Text("Completion Rate").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text("\(Int((insights?.recentTrends.completionRate ?? 0) * 100))%")
						.font(.title3.weight(.bold))
						.foregroundStyle(.blue)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
				
				HStack {
					Text("Avg Snoozes/Day").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text(String(format: "%.1f", insights?.recentTrends.avgSnoozes ?? 0))
						.font(.title3.weight(.bold))
						.foregroundStyle(.orange)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
				
				HStack {
					Text("Avg Skips/Day").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text(String(format: "%.1f", insights?.recentTrends.avgSkips ?? 0))
						.font(.title3.weight(.bold))
						.foregroundStyle(.red)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
}

struct TotalStatsCard: View {
	let prefs: LearningPreferencesResponse?
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Total Statistics").font(.subheadline.weight(.semibold))
			
			VStack(spacing: 8) {
				HStack {
					Text("Days Tracked").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text("\(prefs?.stats.daysTracked ?? 0)")
						.font(.title3.weight(.bold))
						.foregroundStyle(.purple)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
				
				HStack {
					Text("Total Events Logged").font(.caption).foregroundStyle(.secondary)
					Spacer()
					Text("\(prefs?.stats.totalEvents ?? 0)")
						.font(.title3.weight(.bold))
						.foregroundStyle(.purple)
				}
				.padding(12)
				.background(Color(.tertiarySystemBackground))
				.clipShape(RoundedRectangle(cornerRadius: 8))
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.frame(maxWidth: .infinity)
	}
}

struct PreferencesCard: View {
	@Binding var localEvening: Bool
	@Binding var localFocus: Int
	@Binding var localBreaks: Bool
	let client: APIClient
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			Text("Learning Preferences").font(.subheadline.weight(.semibold))
			
			// Prefer Evening Toggle
			HStack {
				VStack(alignment: .leading, spacing: 4) {
					Text("Prefer Evening Slots").font(.caption.weight(.medium))
					Text("Schedule tasks in the evening (6 PM - 9 PM) when possible")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
				Spacer()
				Toggle("", isOn: $localEvening)
					.labelsHidden()
					.onChange(of: localEvening) { _, val in
						Task {
							_ = try? await client.updateLearningPreferences(
								.init(preferEvening: val, maxContinuousFocus: nil, pinnedWindows: nil, bannedWindows: nil)
							)
						}
					}
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
			
			// Max Focus Slider
			VStack(alignment: .leading, spacing: 8) {
				HStack {
					Text("Max Continuous Focus Time").font(.caption.weight(.medium))
					Spacer()
					Text("\(localFocus) min").font(.caption.weight(.bold)).foregroundStyle(.blue)
				}
				Text("Maximum duration for a single focus session before suggesting a break")
					.font(.caption2)
					.foregroundStyle(.secondary)
				Slider(value: Binding(
					get: { Double(localFocus) },
					set: { localFocus = Int($0) }
				), in: 30...120, step: 15)
				.onChange(of: localFocus) { old, new in
					if old != new {
						Task {
							try? await Task.sleep(for: .seconds(0.5))
							_ = try? await client.updateLearningPreferences(
								.init(preferEvening: nil, maxContinuousFocus: new, pinnedWindows: nil, bannedWindows: nil)
							)
						}
					}
				}
				HStack {
					Text("30 min").font(.caption2).foregroundStyle(.secondary)
					Spacer()
					Text("120 min").font(.caption2).foregroundStyle(.secondary)
				}
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
			
			// Auto Breaks Toggle
			HStack {
				VStack(alignment: .leading, spacing: 4) {
					Text("Automatic Micro-Breaks").font(.caption.weight(.medium))
					Text("Automatically insert 5-10 minute breaks before heavy tasks and near bedtime")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
				Spacer()
				Toggle("", isOn: $localBreaks)
					.labelsHidden()
					.onChange(of: localBreaks) { _, val in
						Task { _ = try? await client.setAutoBreaks(val) }
					}
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
			
			// Recompute Breaks
			VStack(alignment: .leading, spacing: 8) {
				Text("Break Optimizer").font(.caption.weight(.medium))
				Text("Manually recalculate and insert optimal breaks into your schedule")
					.font(.caption2)
					.foregroundStyle(.secondary)
				Button(action: { Task { _ = try? await client.recomputeBreaks() } }) {
					HStack {
						Image(systemName: "cup.and.saucer.fill")
						Text("Recompute Breaks")
					}
					.font(.caption)
					.frame(maxWidth: .infinity)
				}
				.buttonStyle(.bordered)
				.controlSize(.small)
			}
			.padding(12)
			.background(Color(.tertiarySystemBackground))
			.clipShape(RoundedRectangle(cornerRadius: 8))
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
	}
}

struct HealthTrackerCard: View {
	let client: APIClient
	@State private var rollup: DailyRollupModel?
	@State private var user: UserProfile?
	@State private var showGoalDialog = false
	@State private var goalInput = ""
	@State private var customWater = ""
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "drop.fill").foregroundStyle(.blue)
				Text("Hydration Tracker").font(.subheadline.weight(.semibold))
			}
			
			let waterGoal = user?.waterGoalMl ?? 0
			let currentWater = rollup?.waterMl ?? 0
			let progress = waterGoal > 0 ? min(Double(currentWater) / Double(waterGoal), 1.0) : 0
			
			if waterGoal > 0 {
				VStack(spacing: 8) {
					HStack {
						Text("\(currentWater) ml").font(.caption)
						Spacer()
						Text("\(waterGoal) ml").font(.caption)
					}
					ProgressView(value: progress).tint(.blue)
					Text("\(Int(progress * 100))% of daily goal")
						.font(.caption2)
						.foregroundStyle(.secondary)
						.frame(maxWidth: .infinity)
					
					Text("Quick Log").font(.caption.weight(.medium))
					HStack(spacing: 8) {
						Button("+250ml") {
							Task {
								_ = try? await client.ingestHealth(waterMl: 250)
								rollup = try? await client.getDailyRollup()
							}
						}
						.font(.caption)
						.buttonStyle(.bordered)
						.controlSize(.small)
						
						Button("+500ml") {
							Task {
								_ = try? await client.ingestHealth(waterMl: 500)
								rollup = try? await client.getDailyRollup()
							}
						}
						.font(.caption)
						.buttonStyle(.bordered)
						.controlSize(.small)
						
						HStack(spacing: 4) {
							TextField("Custom ml", text: $customWater)
								.textFieldStyle(.roundedBorder)
								.keyboardType(.numberPad)
								.frame(width: 80)
							Button("Log") {
								if let ml = Int(customWater), ml > 0 {
									Task {
										_ = try? await client.ingestHealth(waterMl: ml)
										rollup = try? await client.getDailyRollup()
										customWater = ""
									}
								}
							}
							.font(.caption)
							.buttonStyle(.bordered)
							.controlSize(.small)
						}
					}
				}
			} else {
				Text("Set a daily water goal to start tracking your hydration.")
					.font(.caption)
					.foregroundStyle(.secondary)
			}
			
			Button(action: { showGoalDialog = true }) {
				HStack {
					Image(systemName: "target")
					Text(waterGoal > 0 ? "Update Water Goal" : "Set Water Goal")
				}
				.font(.caption)
				.frame(maxWidth: .infinity)
			}
			.buttonStyle(.bordered)
			.controlSize(.small)
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.task {
			rollup = try? await client.getDailyRollup()
			user = try? await client.getUser()
		}
		.sheet(isPresented: $showGoalDialog) {
			NavigationStack {
				Form {
					Section {
						TextField("Water Goal (ml)", text: $goalInput)
							.keyboardType(.numberPad)
						Text("Recommended: 2000-3000 ml per day")
							.font(.caption2)
							.foregroundStyle(.secondary)
					}
				}
				.navigationTitle("Set Water Goal")
				.navigationBarTitleDisplayMode(.inline)
				.toolbar {
					ToolbarItem(placement: .cancellationAction) {
						Button("Cancel") { showGoalDialog = false }
					}
					ToolbarItem(placement: .confirmationAction) {
						Button("Save") {
							if let goal = Int(goalInput), goal > 0 {
								Task {
									_ = try? await client.setWaterGoal(goal)
									user = try? await client.getUser()
									showGoalDialog = false
									goalInput = ""
								}
							}
						}
					}
				}
			}
		}
	}
}

struct GymPlannerCard: View {
	let client: APIClient
	@State private var streak: StreakStatus?
	@State private var prefs: WorkoutPreferences?
	@State private var workouts: [Item] = []
	@State private var showPrefsDialog = false
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			// Streak Status
			HStack {
				Image(systemName: "flame.fill").foregroundStyle(.orange)
				Text("Workout Streak").font(.subheadline.weight(.semibold))
			}
			
			if let s = streak, s.streakDays > 0 {
				HStack(spacing: 8) {
					Text("\(s.streakDays)").font(.title.weight(.bold))
					Text("days streak").font(.caption).foregroundStyle(.secondary)
					if s.protected {
						Text("🔥 Protected")
							.font(.caption2)
							.padding(.horizontal, 6)
							.padding(.vertical, 2)
							.background(Color.orange.opacity(0.2))
							.clipShape(Capsule())
					}
				}
				if let lastWorkout = s.lastWorkout {
					Text("Last workout: \(formatDate(lastWorkout))")
						.font(.caption2)
						.foregroundStyle(.secondary)
				}
			} else {
				Text("Start a workout streak by completing workouts this week!")
					.font(.caption)
					.foregroundStyle(.secondary)
			}
			
			Divider()
			
			// Preferences
			HStack {
				Image(systemName: "gearshape").foregroundStyle(.blue)
				Text("Workout Preferences").font(.subheadline.weight(.semibold))
				Spacer()
				Button("Edit") { showPrefsDialog = true }
					.font(.caption)
					.buttonStyle(.bordered)
					.controlSize(.small)
			}
			
			if let p = prefs {
				VStack(spacing: 6) {
					HStack {
						Text("Workouts per week:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text("\(p.perWeek)").font(.caption.weight(.medium))
					}
					HStack {
						Text("Duration:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text("\(p.defaultDurationMin) min").font(.caption.weight(.medium))
					}
				}
			}
			
			Divider()
			
			// Plan Button
			Button(action: {
				Task {
					if let result = try? await client.planWorkouts() {
						workouts = result.workouts
						streak = try? await client.getStreakStatus()
					}
				}
			}) {
				HStack {
					Image(systemName: "calendar.badge.plus")
					Text("Plan This Week")
				}
				.font(.caption)
				.frame(maxWidth: .infinity)
			}
			.buttonStyle(.borderedProminent)
			.controlSize(.small)
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.task {
			streak = try? await client.getStreakStatus()
			if let r = try? await client.getWorkoutPrefs() {
				prefs = r.preferences
			}
		}
	}
	
	private func formatDate(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return "" }
		let formatter = DateFormatter()
		formatter.dateFormat = "MMM d, yyyy"
		return formatter.string(from: date)
	}
}

struct GmailCard: View {
	let client: APIClient
	@State private var status: GmailStatus?
	@State private var syncing = false
	
	var body: some View {
		VStack(alignment: .leading, spacing: 12) {
			HStack {
				Image(systemName: "envelope.fill").foregroundStyle(.blue)
				Text("Gmail Integration").font(.subheadline.weight(.semibold))
			}
			
			HStack {
				Text("Connection Status:").font(.caption).foregroundStyle(.secondary)
				Spacer()
				HStack(spacing: 4) {
					Image(systemName: status?.connected == true ? "checkmark.circle.fill" : "xmark.circle.fill")
						.foregroundStyle(status?.connected == true ? .green : .red)
					Text(status?.connected == true ? "Connected" : "Not Connected")
						.font(.caption.weight(.medium))
						.foregroundStyle(status?.connected == true ? .green : .red)
				}
				.padding(.horizontal, 8)
				.padding(.vertical, 4)
				.background(status?.connected == true ? Color.green.opacity(0.1) : Color.red.opacity(0.1))
				.clipShape(Capsule())
			}
			
			if status?.connected == true {
				if let email = status?.emailAddress {
					HStack {
						Text("Email:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text(email).font(.caption.weight(.medium))
					}
				}
				
				if let lastSync = status?.lastSyncAt {
					HStack {
						Text("Last Sync:").font(.caption).foregroundStyle(.secondary)
						Spacer()
						Text(formatRelativeTime(lastSync)).font(.caption)
					}
				}
				
				Button(action: {
					Task {
						syncing = true
						_ = try? await client.syncGmail()
						status = try? await client.getGmailStatus()
						syncing = false
					}
				}) {
					HStack {
						Image(systemName: "arrow.clockwise")
							.rotationEffect(.degrees(syncing ? 360 : 0))
							.animation(syncing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: syncing)
						Text(syncing ? "Syncing..." : "Sync Gmail")
					}
					.font(.caption)
					.frame(maxWidth: .infinity)
				}
				.buttonStyle(.borderedProminent)
				.controlSize(.small)
				.disabled(syncing)
			} else {
				Text("Gmail is not connected. Please connect your Gmail account to enable syncing.")
					.font(.caption)
					.foregroundStyle(.secondary)
			}
		}
		.padding()
		.background(Color(.secondarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 12))
		.task {
			status = try? await client.getGmailStatus()
		}
	}
	
	private func formatRelativeTime(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return "" }
		let formatter = RelativeDateTimeFormatter()
		formatter.unitsStyle = .short
		return formatter.localizedString(for: date, relativeTo: Date())
	}
}

// MARK: - Insights View (matching web weekly-reflection.tsx)
struct InsightsViewFull: View {
	let client: APIClient
	@State private var summary: WeeklySummary?
	@State private var recent: [WeeklySummary] = []
	@State private var generating = false
	
	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 16) {
				// Current Week Summary
				if let s = summary {
					VStack(alignment: .leading, spacing: 16) {
						HStack {
							Image(systemName: "calendar").foregroundStyle(.blue)
							Text("Week of \(formatWeekStart(s.weekStart))")
								.font(.title3.weight(.bold))
							Spacer()
							Button(action: { Task { await generate() } }) {
								HStack(spacing: 4) {
									Image(systemName: generating ? "arrow.clockwise" : "sparkles")
										.rotationEffect(.degrees(generating ? 360 : 0))
										.animation(generating ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: generating)
									Text(generating ? "Generating..." : "Generate")
								}
								.font(.caption)
							}
							.buttonStyle(.bordered)
							.controlSize(.small)
							.disabled(generating)
						}
						
						// Stats Grid
						LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 12) {
							StatCard(icon: "checkmark.circle", color: .green, label: "Tasks Done", value: "\(s.tasksDone)")
							StatCard(icon: "xmark.circle", color: .red, label: "Tasks Skipped", value: "\(s.tasksSkipped)")
							StatCard(icon: "clock", color: .orange, label: "Snoozes", value: "\(s.snoozes)")
							if let delay = s.avgStartDelayMin {
								StatCard(icon: "clock.arrow.circlepath", color: .blue, label: "Avg Start Delay", value: "\(delay)m")
							}
							if let sleep = s.sleepMedianH {
								StatCard(icon: "moon", color: .indigo, label: "Median Sleep", value: String(format: "%.1fh", sleep))
							}
							if let active = s.activeMin {
								StatCard(icon: "figure.walk", color: .purple, label: "Active Time", value: "\(active / 60)h")
							}
						}
						
						// Completion Rate
						let rate = completionRate(s)
						VStack(spacing: 8) {
							HStack {
								Text("Completion Rate").font(.caption.weight(.medium))
								Spacer()
								Text("\(rate)%").font(.caption).foregroundStyle(.secondary)
							}
							ProgressView(value: Double(rate) / 100.0).tint(.blue)
						}
						
						// AI Insights
						if let notes = s.notes {
							Divider()
							VStack(alignment: .leading, spacing: 8) {
								HStack {
									Image(systemName: "sparkles").foregroundStyle(.blue)
									Text("AI Insights & Tweaks").font(.subheadline.weight(.semibold))
								}
								Text(notes)
									.font(.caption)
									.foregroundStyle(.secondary)
									.fixedSize(horizontal: false, vertical: true)
							}
						}
					}
					.padding()
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 12))
				}
				
				// Recent Weeks
				if !recent.isEmpty {
					VStack(alignment: .leading, spacing: 12) {
						Text("Recent Weeks").font(.headline)
						Text("Your productivity trends over time")
							.font(.caption)
							.foregroundStyle(.secondary)
						
						ForEach(Array(recent.enumerated()), id: \.offset) { idx, r in
							Button(action: {}) {
								HStack {
									VStack(alignment: .leading, spacing: 4) {
										Text(formatWeekStart(r.weekStart))
											.font(.subheadline.weight(.medium))
										HStack(spacing: 12) {
											Text("✓ \(r.tasksDone)").font(.caption2)
											Text("✗ \(r.tasksSkipped)").font(.caption2)
											Text("⏰ \(r.snoozes)").font(.caption2)
										}
										.foregroundStyle(.secondary)
									}
									Spacer()
									let rate = completionRate(r)
									Text("\(rate)%")
										.font(.caption.weight(.bold))
										.padding(.horizontal, 8)
										.padding(.vertical, 4)
										.background(rate >= 70 ? Color.blue.opacity(0.1) : Color.gray.opacity(0.1))
										.foregroundStyle(rate >= 70 ? .blue : .secondary)
										.clipShape(Capsule())
								}
								.padding(12)
								.background(Color(.secondarySystemBackground))
								.clipShape(RoundedRectangle(cornerRadius: 10))
							}
							.buttonStyle(.plain)
						}
					}
					.padding()
					.background(Color(.secondarySystemBackground))
					.clipShape(RoundedRectangle(cornerRadius: 12))
				}
			}
			.padding()
		}
		.task {
			summary = try? await client.getWeeklySummary(weekStartISO: nil)
			recent = (try? await client.getRecentSummaries()) ?? []
		}
	}
	
	private func completionRate(_ s: WeeklySummary) -> Int {
		let total = s.tasksDone + s.tasksSkipped
		return total > 0 ? Int(Double(s.tasksDone) / Double(total) * 100) : 0
	}
	
	private func formatWeekStart(_ iso: String) -> String {
		guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
		let formatter = DateFormatter()
		formatter.dateFormat = "MMM d, yyyy"
		return formatter.string(from: date)
	}
	
	private func generate() async {
		generating = true
		_ = try? await client.generateWeekly(weekStartISO: nil)
		summary = try? await client.getWeeklySummary(weekStartISO: nil)
		recent = (try? await client.getRecentSummaries()) ?? []
		generating = false
	}
}

struct StatCard: View {
	let icon: String
	let color: Color
	let label: String
	let value: String
	
	var body: some View {
		VStack(spacing: 8) {
			Image(systemName: icon)
				.font(.title2)
				.foregroundStyle(color)
			Text(value)
				.font(.title2.weight(.bold))
			Text(label)
				.font(.caption2)
				.foregroundStyle(.secondary)
				.multilineTextAlignment(.center)
		}
		.padding()
		.frame(maxWidth: .infinity)
		.background(Color(.tertiarySystemBackground))
		.clipShape(RoundedRectangle(cornerRadius: 10))
	}
}

// MARK: - API extension for chat
extension APIClient {
	func sendChatMessage(_ message: String) async throws -> ChatResponse {
		struct Body: Encodable { let message: String; let timezone: String }
		var url = config.baseURL.appendingPathComponent("/api/chat/parse")
		var req = URLRequest(url: url)
		req.httpMethod = "POST"
		req.setValue("application/json", forHTTPHeaderField: "Content-Type")
		req.httpBody = try JSONEncoder().encode(Body(message: message, timezone: config.timezoneProvider()))
		let (data, resp) = try await session.data(for: req)
		guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
			throw URLError(.badServerResponse)
		}
		return try jsonDecoder.decode(ChatResponse.self, from: data)
	}
}

extension Calendar {
	func startOfWeek(for date: Date) -> Date {
		let comps = dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
		return self.date(from: comps) ?? date
	}
}
