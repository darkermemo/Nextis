import SwiftUI

struct NavigationRoot: View {
    let client: APIClient
    @State private var selected: Tab = .chat
    
    enum Tab: Hashable { case chat, tasks, calendar, learning, insights }
    
    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
            // Content area
            Group {
                switch selected {
                case .chat:
                    NavigationStack { ChatViewFull(client: client) }
                case .tasks:
                    NavigationStack { TasksTSXView(client: client) }
                case .calendar:
                    NavigationStack { CalendarListTSXView(client: client) }
                case .learning:
                    NavigationStack { LearningTSXView() }
                case .insights:
                    NavigationStack { InsightsTSXView() }
                }
            }
                // Custom bottom tab bar
                BottomTabBar(selected: $selected)
            }
            .padding(.bottom, 70)

            // Quick Add floating button (bottom-left)
            HStack {
                QuickAddFAB(action: { /* open template sheet later */ })
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .background(Color(.systemBackground).ignoresSafeArea())
    }
}

#pragma mark - Custom Bottom Tab Bar

struct BottomTabBar: View {
    @Binding var selected: NavigationRoot.Tab
    var body: some View {
        HStack(spacing: 0) {
            tab(.chat, label: "Chat", system: "message")
            tab(.tasks, label: "Tasks", system: "checklist")
            tab(.calendar, label: "Calendar", system: "calendar")
            tab(.learning, label: "Learning", system: "brain.head.profile")
            tab(.insights, label: "Insights", system: "chart.bar")
        }
        .padding(.horizontal, 8).padding(.top, 6).padding(.bottom, 12)
        .background(.ultraThinMaterial)
        .overlay(Divider(), alignment: .top)
    }
    private func tab(_ t: NavigationRoot.Tab, label: String, system: String) -> some View {
        Button(action: { selected = t }) {
            VStack(spacing: 2) {
                Image(systemName: system)
                    .font(.system(size: 16, weight: .semibold))
                    .symbolVariant(selected == t ? .fill : .none)
                Text(label)
                    .font(.system(size: 11, weight: .medium))
            }
            .foregroundStyle(selected == t ? .blue : .secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

#Preview {
    NavigationRoot(client: APIClient(config: NextisConfig(baseURL: URL(string: "https://example.com")!)))
}


