import SwiftUI

struct RootView: View {
	let client: APIClient
	@State private var selected: Item?
	@State private var showExplainer = false
	var body: some View {
		NavigationStack {
			TasksTSXView(client: client)
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
