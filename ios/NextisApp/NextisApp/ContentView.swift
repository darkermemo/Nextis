import SwiftUI

struct RootView: View {
	let client: APIClient
	@State private var selected: Item?
	@State private var showExplainer = false
	var body: some View {
		NavigationStack {
			TodayTasksView(client: client, onExplain: { item in
				selected = item; showExplainer = true
			}, onCompleted: { _ in })
			.navigationTitle("Nextis")
		}
		.sheet(isPresented: $showExplainer) {
			if let item = selected {
				PlanExplainerSheet(item: item, client: client)
			}
		}
	}
}

#Preview {
	RootView(client: APIClient(config: NextisConfig(baseURL: URL(string: "https://example.com")!)))
}
