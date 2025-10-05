import SwiftUI

public struct PlanExplainerSheet: View {
	public let item: Item
	private let client: APIClient
	@Environment(\.dismiss) private var dismiss
	@State private var explanation: PlanExplanation?
	@State private var isLoading = false
	@State private var apiError: String?
	public var onMoved: ((Item) -> Void)?

	public init(item: Item, client: APIClient, onMoved: ((Item) -> Void)? = nil) {
		self.item = item
		self.client = client
		self.onMoved = onMoved
	}

	public var body: some View {
		NavigationStack {
			ScrollView {
				if let e = explanation {
					VStack(alignment: .leading, spacing: 16) {
						HStack { Text(e.scheduledSlot).font(.headline); Spacer(); ScoreBadge(score: e.score) }
						VStack(alignment: .leading, spacing: 8) {
							Text("Why this time works").font(.subheadline.weight(.semibold))
							ForEach(e.why, id: \.self) { Text("• \($0)").font(.callout) }
						}
						if !e.alternatives.isEmpty {
							Text("Alternative Time Slots").font(.subheadline.weight(.semibold))
							VStack(spacing: 8) {
								ForEach(Array(e.alternatives.enumerated()), id: \.offset) { _, alt in
									HStack {
										VStack(alignment: .leading) {
											Text(alt.slot).font(.callout.weight(.medium))
											Text(alt.reason).font(.caption).foregroundStyle(.secondary)
										}
										Spacer()
										ScoreBadge(score: alt.score)
										Button("Move here") { Task { await move(to: alt.slot) } }
									}
									.padding(12).background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 10))
								}
							}
						}
					}
				} else if isLoading {
					ProgressView()
				} else if let apiError {
					Text(apiError).foregroundStyle(.red)
				}
			}
			.navigationTitle("Why here?")
			.toolbar { ToolbarItem(placement: .primaryAction) { Button("Close") { dismiss() } } }
			.task { await load() }
		}
	}

	private func move(to slot: String) async {
		// Parse slot like "Tue 18:00" to next occurrence date
		let parts = slot.split(separator: " ")
		guard parts.count == 2 else { return }
		let dayStr = String(parts[0])
		let timeStr = String(parts[1])
		let formatter = DateFormatter()
		formatter.locale = Locale(identifier: "en_US_POSIX")
		formatter.dateFormat = "EEE HH:mm"
		let now = Date()
		var comp = Calendar.current.dateComponents([.year,.month,.day,.weekday,.hour,.minute], from: now)
		let weekdays = ["Sun":1,"Mon":2,"Tue":3,"Wed":4,"Thu":5,"Fri":6,"Sat":7]
		guard let targetWeekday = weekdays[dayStr] else { return }
		let hm = timeStr.split(separator: ":").compactMap { Int($0) }
		guard hm.count == 2 else { return }
		let curWeekday = Calendar.current.component(.weekday, from: now)
		var delta = targetWeekday - curWeekday
		if delta < 0 { delta += 7 }
		if let newDate = Calendar.current.date(byAdding: .day, value: delta, to: now) {
			var comps = Calendar.current.dateComponents([.year,.month,.day], from: newDate)
			comps.hour = hm[0]; comps.minute = hm[1]; comps.second = 0
			if let final = Calendar.current.date(from: comps) {
				let iso = ISO8601DateFormatter().string(from: final)
				await submitMove(iso)
			}
		}
	}

	private func submitMove(_ iso: String) async {
		isLoading = true
		do {
			let updated = try await client.updateTask(id: item.id, startISO: iso)
			onMoved?(updated)
			dismiss()
		} catch {
			apiError = (error as? APIError)?.message ?? (error as? APIError)?.error ?? error.localizedDescription
		}
		isLoading = false
	}

	private func load() async {
		isLoading = true
		do { self.explanation = try await client.explain(itemId: item.id) } catch { apiError = (error as? APIError)?.message ?? (error as? APIError)?.error ?? error.localizedDescription }
		isLoading = false
	}
}

private struct ScoreBadge: View { let score: Double; var body: some View { Text(label(for: score)).font(.caption).padding(.horizontal, 8).padding(.vertical, 4).background(color(for: score).opacity(0.15)).foregroundStyle(color(for: score)).clipShape(Capsule()) }
	private func label(for s: Double) -> String { s >= 0.7 ? "Excellent \(Int(s*100))%" : s >= 0.5 ? "Good \(Int(s*100))%" : "Fair \(Int(s*100))%" }
	private func color(for s: Double) -> Color { s >= 0.7 ? .green : s >= 0.5 ? .orange : .red }
}

struct PlanExplainerSheet_Previews: PreviewProvider { static var previews: some View { PlanExplainerSheet(item: Item(id: "1", userId: "u", type: .task, title: "Sample", notes: nil, start: nil, end: nil, durationMinutes: 30, deadline: nil, fixed: false, priority: .normal, subtasks: [], reminders: [], tags: [], done: false, createdAt: "", updatedAt: ""), client: APIClient(config: .init(baseURL: URL(string: "https://example.com")!))) } }
