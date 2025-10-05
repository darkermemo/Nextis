import SwiftUI

struct WeekMindRoot: View {
	let client: APIClient
	@State private var activeTab: AppTab = .chat
	@State private var dayState: DayState?
	@State private var showMoodBanner = true
	enum AppTab: String, CaseIterable { case chat, tasks, calendar, learning, insights }
	var body: some View {
		VStack(spacing: 0) {
			HeaderView()
			if showMoodBanner && (dayState == nil || dayState?.mood == .none) { MoodCheckInBanner(client: client, onSet: { showMoodBanner = false; Task { await loadDayState() } }) }
			NotificationBannerView(client: client)
			TabBar(activeTab: $activeTab)
			TabContent(activeTab: activeTab, client: client)
		}
		.task { await loadDayState() }
	}
	private func loadDayState() async { dayState = try? await client.getDayState() }
}

struct HeaderView: View {
	var body: some View {
		HStack {
			HStack(spacing: 12) {
				ZStack { LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing); Image(systemName: "checklist").font(.title2).foregroundStyle(.white) }.frame(width: 40, height: 40).clipShape(RoundedRectangle(cornerRadius: 10))
				VStack(alignment: .leading, spacing: 2) { Text("WeekMind").font(.title3.weight(.bold)); Text("Intelligent Planning Assistant").font(.caption).foregroundStyle(.secondary) }
			}
			Spacer()
			HStack(spacing: 8) {
				Button(action: {}) { Image(systemName: "gearshape").foregroundStyle(.secondary) }.buttonStyle(.plain)
				ZStack { LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing); Text("AM").font(.caption.weight(.bold)).foregroundStyle(.white) }.frame(width: 36, height: 36).clipShape(Circle())
			}
		}
		.padding(.horizontal, 16).padding(.vertical, 12).background(Color(.systemBackground)).overlay(Divider(), alignment: .bottom)
	}
}

struct TabBar: View {
	@Binding var activeTab: WeekMindRoot.AppTab
	var body: some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 4) {
				ForEach(WeekMindRoot.AppTab.allCases, id: \.self) { tab in
					Button(action: { activeTab = tab }) {
						HStack(spacing: 6) { Image(systemName: icon(tab)).font(.caption); Text(tab.rawValue.capitalized).font(.subheadline.weight(.medium)) }
							.padding(.horizontal, 12).padding(.vertical, 10).foregroundStyle(activeTab == tab ? Color.blue : Color.secondary)
							.overlay(alignment: .bottom) { if activeTab == tab { Rectangle().fill(Color.blue).frame(height: 2) } }
					}.buttonStyle(.plain)
				}
			}.padding(.horizontal, 12)
		}
		.frame(height: 44).background(Color(.systemBackground)).overlay(Divider(), alignment: .bottom)
	}
	private func icon(_ tab: WeekMindRoot.AppTab) -> String {
		switch tab { case .chat: return "message"; case .tasks: return "checklist"; case .calendar: return "calendar"; case .learning: return "brain.head.profile"; case .insights: return "chart.bar" }
	}
}

struct TabContent: View {
	let activeTab: WeekMindRoot.AppTab; let client: APIClient
	var body: some View {
		Group {
			switch activeTab {
			case .chat: ChatViewFull(client: client)
			case .tasks: TodayTasksView(client: client, onExplain: { _ in }, onCompleted: { _ in })
			case .calendar: CalendarViewFull(client: client)
			case .learning: LearningViewFull(client: client)
			case .insights: InsightsViewFull(client: client)
			}
		}
	}
}

struct MoodCheckInBanner: View {
	let client: APIClient; var onSet: () -> Void
	@State private var setting = false
	var body: some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 8) {
				Image(systemName: "face.smiling").foregroundStyle(.blue)
				Text("How are you feeling today?").font(.subheadline.weight(.medium))
				ForEach([Mood.tired, .stressed, .motivated, .focused, .relaxed], id: \.self) { m in
					Button(action: { Task { await set(m) } }) { Text(label(m)).font(.caption) }.buttonStyle(.bordered).disabled(setting)
				}
			}.padding(.horizontal, 16).padding(.vertical, 12)
		}
		.background(LinearGradient(colors: [Color.blue.opacity(0.1), Color.purple.opacity(0.1)], startPoint: .leading, endPoint: .trailing)).overlay(Divider(), alignment: .bottom)
	}
	private func label(_ m: Mood) -> String { switch m { case .tired: return "😫 Tired"; case .stressed: return "😰 Stressed"; case .motivated: return "💪 Motivated"; case .focused: return "🎯 Focused"; case .relaxed: return "😌 Relaxed"; case .none: return "None" } }
	private func set(_ m: Mood) async { setting = true; defer { setting = false }; _ = try? await client.updateMood(m); onSet() }
}

struct NotificationBannerView: View {
	let client: APIClient
	@State private var notifications: [AppNotification] = []
	@State private var dismissed: Set<String> = []
	var body: some View {
		VStack(spacing: 8) {
			ForEach(notifications.filter { !dismissed.contains($0.id) }) { n in
				HStack(spacing: 12) {
					Image(systemName: "bell.fill").foregroundStyle(.blue)
					VStack(alignment: .leading, spacing: 4) {
						Text(n.payload.message ?? n.kind.rawValue).font(.caption).foregroundStyle(.primary)
						HStack(spacing: 6) {
							Button("Accept") { Task { await ack(n.id, "accept") } }.font(.caption2).buttonStyle(.borderedProminent).controlSize(.mini)
							Button("Snooze") { Task { await ack(n.id, "snooze") } }.font(.caption2).buttonStyle(.bordered).controlSize(.mini)
							Button("Dismiss") { Task { await ack(n.id, "dismiss") } }.font(.caption2).buttonStyle(.bordered).controlSize(.mini)
						}
					}
					Spacer()
				}.padding(12).background(Color.blue.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 8))
			}
		}
		.padding(.horizontal, 16).padding(.vertical, notifications.isEmpty ? 0 : 8)
		.task { await load() }
	}
	private func load() async { if let r = try? await client.getNotifications() { notifications = r.notifications } }
	private func ack(_ id: String, _ action: String) async { _ = try? await client.ackNotification(id: id, action: action); dismissed.insert(id); await load() }
}
