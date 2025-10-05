import SwiftUI

@main
struct NextisApp: App {
	private let client: APIClient = {
		let key = "API_BASE_URL"
		let base = (Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? "https://YOUR-BACKEND"
		let url = URL(string: base) ?? URL(string: "https://YOUR-BACKEND")!
		return APIClient(config: NextisConfig(baseURL: url))
	}()
	var body: some Scene {
		WindowGroup {
			WeekMindRoot(client: client)
		}
	}
}
