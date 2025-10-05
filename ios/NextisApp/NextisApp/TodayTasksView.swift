import SwiftUI

public struct TodayTasksView: View {
	@State private var tasks: TasksResponse?
	@State private var isLoading = false
	@State private var apiError: String?
	private let client: APIClient
	private let onExplain: (Item) -> Void
	private let onCompleted: (Item) -> Void

	public init(client: APIClient, onExplain: @escaping (Item) -> Void, onCompleted: @escaping (Item) -> Void) {
		self.client = client
		self.onExplain = onExplain
		self.onCompleted = onCompleted
	}

	public var body: some View {
		List {
			Section(header: header("Today", count: tasks?.today.count ?? 0)) {
				group(tasks?.today)
			}
			Section(header: header("This Week", count: tasks?.thisWeek.count ?? 0)) {
				group(tasks?.thisWeek)
			}
			Section(header: header("Later", count: tasks?.later.count ?? 0)) {
				group(tasks?.later)
			}
		}
		.overlay { if isLoading { ProgressView().controlSize(.large) } }
		.refreshable { await load() }
		.task { await load() }
		.alert("Error", isPresented: .constant(apiError != nil), actions: { Button("OK", role: .cancel) { apiError = nil } }, message: { Text(apiError ?? "") })
	}

	@ViewBuilder private func group(_ items: [Item]?) -> some View {
		if let items, !items.isEmpty {
			ForEach(items) { item in
				HStack(alignment: .firstTextBaseline) {
					Button(action: { Task { await toggle(item) } }) {
						Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
							.foregroundStyle(item.done ? .green : .secondary)
					}.buttonStyle(.plain)
					VStack(alignment: .leading, spacing: 4) {
						Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(item.done ? .secondary : .primary)
						HStack(spacing: 6) {
							Chip(text: item.priority.rawValue.capitalized, color: color(for: item.priority))
							Chip(text: typeLabel(item.type), color: typeColor(item.type))
						}
					}
					Spacer()
					Button("Why here?") { onExplain(item) }
				}
			}
		} else {
			Text("No items").foregroundStyle(.secondary)
		}
	}

	private func header(_ title: String, count: Int) -> some View {
		HStack { Text(title).font(.headline); Spacer(); Text("\(count)").foregroundStyle(.secondary) }
	}

	private func color(for p: Priority) -> Color { switch p { case .high: return .red; case .normal: return .orange; case .low: return .gray } }
	private func typeLabel(_ t: ItemType) -> String { t == .breakTime ? "Break" : t.rawValue.capitalized }
	private func typeColor(_ t: ItemType) -> Color {
		switch t { case .task: return .purple; case .event: return .blue; case .breakTime: return .orange; case .leisure: return .pink; case .quiz: return .green }
	}

	private struct Chip: View { let text: String; let color: Color; var body: some View { Text(text).font(.caption).padding(.horizontal, 8).padding(.vertical, 4).background(color.opacity(0.15)).foregroundStyle(color).clipShape(Capsule()) } }

	private func toggle(_ item: Item) async {
		isLoading = true
		do {
			let updated = try await client.toggleTask(id: item.id, done: !item.done)
			if var cur = tasks {
				func map(_ arr: [Item]) -> [Item] { arr.map { $0.id == updated.id ? updated : $0 } }
				cur = TasksResponse(today: map(cur.today), thisWeek: map(cur.thisWeek), later: map(cur.later), all: map(cur.all))
				self.tasks = cur
			}
			if updated.done { onCompleted(updated) }
		} catch {
			apiError = (error as? APIError)?.message ?? (error as? APIError)?.error ?? error.localizedDescription
		}
		isLoading = false
	}

	private func load() async {
		isLoading = true
		do { self.tasks = try await client.getTasks() } catch { apiError = (error as? APIError)?.message ?? (error as? APIError)?.error ?? error.localizedDescription }
		isLoading = false
	}
}

struct TodayTasksView_Previews: PreviewProvider { static var previews: some View { TodayTasksView(client: APIClient(config: .init(baseURL: URL(string: "https://example.com")!)), onExplain: { _ in }, onCompleted: { _ in }) } }
