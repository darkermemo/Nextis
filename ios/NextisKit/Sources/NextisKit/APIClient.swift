import Foundation

public final class APIClient {
	public enum HTTPMethod: String { case GET, POST, PATCH, PUT, DELETE }
	private let config: NextisConfig
	private let session: URLSession
	private let jsonDecoder: JSONDecoder
	private let jsonEncoder: JSONEncoder

	public init(config: NextisConfig, session: URLSession = .shared) {
		self.config = config
		self.session = session
		self.jsonDecoder = JSONDecoder()
		self.jsonEncoder = JSONEncoder()
	}

	private func request<T: Decodable>(_ method: HTTPMethod, _ path: String, body: Encodable? = nil, query: [String:String] = [:]) async throws -> T {
		var url = config.baseURL.appendingPathComponent(path)
		if !query.isEmpty {
			var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
			comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
			url = comps.url!
		}
		var req = URLRequest(url: url)
		req.httpMethod = method.rawValue
		req.setValue("application/json", forHTTPHeaderField: "Content-Type")
		if let body = body {
			req.httpBody = try jsonEncoder.encode(AnyEncodable(body))
		}
		let (data, resp) = try await session.data(for: req)
		guard let http = resp as? HTTPURLResponse else { throw URLError(.badServerResponse) }
		if (200..<300).contains(http.statusCode) == false {
			if let apiErr = try? jsonDecoder.decode(APIError.self, from: data) { throw apiErr }
			throw URLError(.badServerResponse)
		}
		return try jsonDecoder.decode(T.self, from: data)
	}

	// MARK: - Helpers
	private struct AnyEncodable: Encodable { let value: Encodable; init(_ v: Encodable) { value = v } ; func encode(to encoder: Encoder) throws { try value.encode(to: encoder) } }

	// MARK: - Core endpoints
	public func getTasks() async throws -> TasksResponse {
		try await request(.GET, "/api/tasks", query: ["timezone": config.timezoneProvider()])
	}

	public func toggleTask(id: String, done: Bool) async throws -> Item {
		struct Body: Encodable { let done: Bool }
		return try await request(.PATCH, "/api/tasks/\(id)", body: Body(done: done))
	}

	public func updateTask(id: String, startISO: String) async throws -> Item {
		struct Body: Encodable { let start: String }
		return try await request(.PATCH, "/api/tasks/\(id)", body: Body(start: startISO))
	}

	public func getCalendar(weekStartISO: String?) async throws -> CalendarResponse {
		var q = ["timezone": config.timezoneProvider()]
		if let w = weekStartISO { q["weekStart"] = w }
		return try await request(.GET, "/api/calendar", query: q)
	}

	public func getNext() async throws -> NextActions {
		try await request(.GET, "/api/next", query: ["timezone": config.timezoneProvider()])
	}

	public func explain(itemId: String) async throws -> PlanExplanation {
		try await request(.GET, "/api/plan/explain/\(itemId)")
	}

	public func updateMood(_ mood: Mood) async throws -> DayStateWrapper {
		struct Body: Encodable { let mood: String; let timezone: String }
		return try await request(.POST, "/api/mood", body: Body(mood: mood.rawValue, timezone: config.timezoneProvider()))
	}

	public struct DayStateWrapper: Codable { public let success: Bool; public let dayState: DayState }
}
