import Foundation

extension APIClient {
	public func getUser() async throws -> UserProfile {
		let url = config.baseURL.appendingPathComponent("/api/user")
		var req = URLRequest(url: url)
		req.httpMethod = "GET"
		req.setValue("application/json", forHTTPHeaderField: "Content-Type")
		let (data, resp) = try await session.data(for: req)
		guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
			throw URLError(.badServerResponse)
		}
		return try jsonDecoder.decode(UserProfile.self, from: data)
	}
}
