import Foundation

public final class APIClient {
	public enum HTTPMethod: String { case GET, POST, PATCH, PUT, DELETE }
	internal let config: NextisConfig
	internal let session: URLSession
	internal let jsonDecoder: JSONDecoder
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

// MARK: - Notifications
extension APIClient {
	public func getNotifications() async throws -> NotificationsResponse {
		try await request(.GET, "/api/notifications", query: ["timezone": config.timezoneProvider()])
	}
	public func ackNotification(id: String, action: String) async throws -> AckResponse {
		struct Body: Encodable { let notificationId: String; let action: String; let timezone: String }
		return try await request(.POST, "/api/notifications/ack", body: Body(notificationId: id, action: action, timezone: config.timezoneProvider()))
	}
	public func checkNotifications() async throws -> SimpleSuccess {
		struct Body: Encodable { let timezone: String }
		return try await request(.POST, "/api/notifications/check", body: Body(timezone: config.timezoneProvider()))
	}
}

// MARK: - Day state
extension APIClient {
	public func getDayState() async throws -> DayState {
		try await request(.GET, "/api/day-state", query: ["timezone": config.timezoneProvider()])
	}
	public func toggleEarlyWork(_ enabled: Bool) async throws -> DayStateWrapper {
		struct Body: Encodable { let earlyWork: Bool; let timezone: String }
		return try await request(.POST, "/api/early-work", body: Body(earlyWork: enabled, timezone: config.timezoneProvider()))
	}
}

// MARK: - Learning
extension APIClient {
	public func getLearningPreferences() async throws -> LearningPreferencesResponse {
		try await request(.GET, "/api/learning/preferences")
	}
	public func updateLearningPreferences(_ prefs: LearningPreferences) async throws -> LearningPreferencesResponse {
		try await request(.PATCH, "/api/learning/preferences", body: prefs)
	}
	public func getLearningInsights() async throws -> LearningInsights {
		try await request(.GET, "/api/learning/insights")
	}
}

// MARK: - Health
extension APIClient {
	public func getDailyRollup() async throws -> DailyRollupModel {
		try await request(.GET, "/api/daily-rollup", query: ["timezone": config.timezoneProvider()])
	}
	public func setWaterGoal(_ mlPerDay: Int) async throws -> HydrationGoalResponse {
		struct Body: Encodable { let mlPerDay: Int }
		return try await request(.POST, "/api/hydration/goal", body: Body(mlPerDay: mlPerDay))
	}
	public func ingestHealth(waterMl: Int? = nil, sedentaryMinutes: Int? = nil, activeMinutes: Int? = nil, sleepHours: Int? = nil) async throws -> SimpleSuccess {
		struct Body: Encodable { let waterMl: Int?; let sedentaryMinutes: Int?; let activeMinutes: Int?; let sleepHours: Int? }
		return try await request(.POST, "/api/health/ingest", body: Body(waterMl: waterMl, sedentaryMinutes: sedentaryMinutes, activeMinutes: activeMinutes, sleepHours: sleepHours))
	}
}

// MARK: - Gmail
extension APIClient {
	public func getGmailStatus() async throws -> GmailStatus { try await request(.GET, "/api/gmail/status") }
	public func syncGmail() async throws -> GmailSyncResponse { try await request(.POST, "/api/gmail/sync", body: [String:String]()) }
}

// MARK: - Gym
extension APIClient {
	public func getWorkoutPrefs() async throws -> WorkoutPrefsResponse { try await request(.GET, "/api/workout/prefs") }
	public func setWorkoutPrefs(perWeek: Int, defaultDurationMin: Int, preferredWindows: [String]?) async throws -> WorkoutPrefsResponse {
		struct Body: Encodable { let perWeek: Int; let defaultDurationMin: Int; let preferredWindows: [String]? }
		return try await request(.POST, "/api/workout/prefs", body: Body(perWeek: perWeek, defaultDurationMin: defaultDurationMin, preferredWindows: preferredWindows))
	}
	public func planWorkouts(weekStartISO: String? = nil) async throws -> PlanWorkoutsResponse {
		struct Body: Encodable { let weekStart: String?; let timezone: String }
		return try await request(.POST, "/api/workout/plan", body: Body(weekStart: weekStartISO, timezone: config.timezoneProvider()))
	}
	public func getStreakStatus() async throws -> StreakStatus { try await request(.GET, "/api/workout/streak", query: ["timezone": config.timezoneProvider()]) }
}

// MARK: - Weekly
extension APIClient {
	public func getWeeklySummary(weekStartISO: String?) async throws -> WeeklySummary {
		var q: [String:String] = ["timezone": config.timezoneProvider()]
		if let w = weekStartISO { q["weekStart"] = w }
		return try await request(.GET, "/api/weekly/summary", query: q)
	}
	public func getRecentSummaries(limit: Int = 4) async throws -> [WeeklySummary] {
		try await request(.GET, "/api/weekly/recent", query: ["limit": "\(limit)"])
	}
	public func generateWeekly(weekStartISO: String?) async throws -> WeeklyGenerateResponse {
		struct Body: Encodable { let weekStart: String?; let timezone: String }
		return try await request(.POST, "/api/weekly/generate", body: Body(weekStart: weekStartISO, timezone: config.timezoneProvider()))
	}
}

// MARK: - Breaks
extension APIClient {
	public func recomputeBreaks(nowISO: String? = nil) async throws -> BreaksRecomputeResponse {
		struct Body: Encodable { let now: String? }
		return try await request(.POST, "/api/breaks/recompute", body: Body(now: nowISO))
	}
	public func setAutoBreaks(_ enabled: Bool) async throws -> AutoBreaksResponse {
		struct Body: Encodable { let enabled: Bool }
		return try await request(.POST, "/api/breaks/auto-toggle", body: Body(enabled: enabled))
	}
}
