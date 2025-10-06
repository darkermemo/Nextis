import SwiftUI

struct WeekMindRoot: View {
	let client: APIClient
	@State private var activeTab: AppTab = .chat
	@State private var dayState: DayState?
	@State private var showMoodBanner = true
	enum AppTab: String, CaseIterable { case chat, tasks, calendar, learning, insights }
	var body: some View {
		GeometryReader { geometry in
			ZStack {
				Color(.systemBackground)
					.ignoresSafeArea()
				
				VStack(spacing: 0) {
					HeaderView()
					if showMoodBanner && (dayState == nil || dayState?.mood == Mood.none) { MoodCheckInBanner(client: client, onSet: { showMoodBanner = false; Task { await loadDayState() } }) }
					NotificationBannerView(client: client)
					TabBar(activeTab: $activeTab)
					TabContent(activeTab: activeTab, client: client)
						.frame(maxHeight: .infinity)
				}
			}
		}
		.task { await loadDayState() }
	}
	private func loadDayState() async { dayState = try? await client.getDayState() }
}

struct HeaderView: View {
	var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.blue)
                    .frame(width: 36, height: 36)
                    .overlay(Text("P").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white))
                Text("WeekMind").font(.system(size: 20, weight: .semibold))
            }
            Spacer()
            HStack(spacing: 6) {
                Button(action: {}) { Image(systemName: "face.smiling").font(.system(size: 20)).foregroundStyle(.secondary) }.buttonStyle(.plain)
                Button(action: {}) { Image(systemName: "bell").font(.system(size: 20)).foregroundStyle(.secondary) }.buttonStyle(.plain)
                Button(action: {}) { Image(systemName: "gearshape").font(.system(size: 20)).foregroundStyle(.secondary) }.buttonStyle(.plain)
                Circle().stroke(Color(.separator), lineWidth: 2).frame(width: 36, height: 36).overlay(Text("AM").font(.system(size: 12, weight: .medium)))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .bottom)
	}
}

struct TabBar: View {
	@Binding var activeTab: WeekMindRoot.AppTab
	var body: some View {
		ScrollView(.horizontal, showsIndicators: false) {
			HStack(spacing: 0) {
				ForEach(WeekMindRoot.AppTab.allCases, id: \.self) { tab in
					Button(action: { activeTab = tab }) {
						HStack(spacing: 3) {
							Image(systemName: icon(tab)).font(.system(size: 11))
							Text(tab.rawValue.capitalized).font(.system(size: 12, weight: .medium))
						}
						.padding(.horizontal, 8)
						.padding(.vertical, 6)
						.foregroundStyle(activeTab == tab ? Color.blue : Color.secondary)
						.overlay(alignment: .bottom) {
							if activeTab == tab {
								Rectangle().fill(Color.blue).frame(height: 2)
							}
						}
					}.buttonStyle(.plain)
				}
			}.padding(.horizontal, 8)
		}
		.frame(height: 30)
		.background(Color(.systemBackground))
		.overlay(Divider(), alignment: .bottom)
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
			case .tasks: TasksTSXView(client: client)
				case .calendar: CalendarListTSXView(client: client)
			case .learning: LearningTSXView()
			case .insights: InsightsTSXView()
			}
		}
	}
}

struct MoodCheckInBanner: View {
	let client: APIClient; var onSet: () -> Void
	@State private var setting = false
	var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Text("Feeling?").font(.system(size: 12)).foregroundStyle(.secondary)
                ForEach([Mood.motivated, .relaxed, .tired, .stressed, .focused], id: \.self) { m in
                    Button(action: { Task { await set(m) } }) {
                        Text(label(m)).font(.system(size: 18))
                    }
                    .padding(6)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(setting)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .bottom)
	}
	private func label(_ m: Mood) -> String { switch m { case .tired: return "😫"; case .stressed: return "😰"; case .motivated: return "💪"; case .focused: return "🎯"; case .relaxed: return "😌"; case .none: return "None" } }
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
                    Image(systemName: "bell.fill").foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Color.blue))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(n.payload.message ?? n.kind.rawValue)
                            .font(.system(size: 13, weight: .medium))
                        HStack(spacing: 8) {
                            Button("Accept") { Task { await ack(n.id, "accept") } }.font(.system(size: 11)).buttonStyle(.borderedProminent).controlSize(.mini)
                            Button("Snooze") { Task { await ack(n.id, "snooze") } }.font(.system(size: 11)).buttonStyle(.bordered).controlSize(.mini)
                            Button("Dismiss") { Task { await ack(n.id, "dismiss") } }.font(.system(size: 11)).buttonStyle(.bordered).controlSize(.mini)
                        }
                    }
                    Spacer()
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, notifications.isEmpty ? 0 : 8)
		.task { await load() }
	}
	private func load() async { if let r = try? await client.getNotifications() { notifications = r.notifications } }
	private func ack(_ id: String, _ action: String) async { _ = try? await client.ackNotification(id: id, action: action); dismissed.insert(id); await load() }
}
