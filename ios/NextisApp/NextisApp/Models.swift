import Foundation

public enum ItemType: String, Codable { case task, event, breakTime, leisure, quiz }
public enum Priority: String, Codable { case high, normal, low }
public enum Mood: String, Codable { case tired, stressed, motivated, focused, relaxed, none }
public enum NotificationKind: String, Codable { case suggestStart, rescheduleMiss, sitBreak, water, bedtime }

public struct Subtask: Codable, Hashable { public let id: String; public let title: String; public let done: Bool }

public struct Item: Codable, Identifiable, Hashable {
	public let id: String
	public let userId: String
	public let type: ItemType
	public let title: String
	public let notes: String?
	public let start: String?
	public let end: String?
	public let durationMinutes: Int?
	public let deadline: String?
	public let fixed: Bool
	public let priority: Priority
	public let subtasks: [Subtask]
	public let reminders: [String]
	public let tags: [String]
	public let done: Bool
	public let createdAt: String
	public let updatedAt: String
}

public struct TasksResponse: Codable { public let today: [Item]; public let thisWeek: [Item]; public let later: [Item]; public let all: [Item] }

public struct NextAction: Codable, Identifiable, Hashable {
	public let id: String
	public let title: String
	public let type: ItemType
	public let priority: Priority
	public let durationMinutes: Int?
	public let deadline: String?
	public let start: String?
}

public struct NextActions: Codable { public let items: [NextAction] }

public struct CalendarResponse: Codable { public let items: [Item]; public let weekStart: String; public let weekEnd: String }

public struct DayState: Codable, Identifiable {
	public let id: String
	public let userId: String
	public let date: String
	public let mood: Mood
	public let hasEarlyWorkTomorrow: Bool
	public let createdAt: String
	public let updatedAt: String
}

public struct NotificationPayload: Codable {
	public let itemId: String?
	public let fromSlot: String?
	public let toSlot: String?
	public let message: String?
}

public struct AppNotification: Codable, Identifiable {
	public let id: String
	public let userId: String
	public let kind: NotificationKind
	public let payload: NotificationPayload
	public let scheduled: String
	public let sentAt: String?
	public let createdAt: String
}

public struct LearningPreferences: Codable {
	public let preferEvening: Bool?
	public let maxContinuousFocus: Int?
	public let pinnedWindows: [String]?
	public let bannedWindows: [String]?
}

public struct LearningStats: Codable { public let topWindows: [TopWindow]; public let learnedLengths: [String:Int]; public let totalEvents: Int; public let daysTracked: Int }
public struct TopWindow: Codable { public let weekday: String; public let hour: Int; public let score: Double }

public struct LearningPreferencesResponse: Codable { public let preferences: LearningPreferences; public let stats: LearningStats }

public struct LearningInsights: Codable { public let weekdayPatterns: [String: Double]; public let hourlyPatterns: [String: Double]; public let recentTrends: RecentTrends }
public struct RecentTrends: Codable { public let completionRate: Double; public let avgSnoozes: Double; public let avgSkips: Double }

public struct UserProfile: Codable, Identifiable {
	public let id: String
	public let username: String
	public let timezone: String
	public let workStartHour: Int
	public let workEndHour: Int
	public let bedtimeHour: Int
	public let allowEveningStudy: Bool
	public let defaultTVStartHour: Int
	public let autoBreaks: Bool
	public let createdAt: String
}

public struct WorkoutPreferences: Codable, Identifiable {
	public let id: String
	public let userId: String
	public let perWeek: Int
	public let defaultDurationMin: Int
	public let preferredWindows: [String]?
	public let createdAt: String
	public let updatedAt: String
}

public struct WeeklySummary: Codable, Identifiable {
	public let id: String
	public let userId: String
	public let weekStart: String
	public let tasksDone: Int
	public let tasksSkipped: Int
	public let snoozes: Int
	public let avgStartDelayMin: Int?
	public let sleepMedianH: Double?
	public let activeMin: Int?
	public let notes: String?
	public let createdAt: String
}

public struct PlanExplanation: Codable {
	public let itemId: String
	public let scheduledSlot: String
	public let score: Double
	public let why: [String]
	public let alternatives: [AlternativeSlot]
}

public struct AlternativeSlot: Codable { public let slot: String; public let score: Double; public let reason: String }

public struct ChatResponse: Codable { public let intent: [String:AnyCodable]?; public let items: [Item]; public let changes: [String]; public let message: String }

public struct AnyCodable: Codable {
	public let value: Any
	public init(_ value: Any) { self.value = value }
	public init(from decoder: Decoder) throws {
		let container = try decoder.singleValueContainer()
		if let s = try? container.decode(String.self) { value = s; return }
		if let i = try? container.decode(Int.self) { value = i; return }
		if let d = try? container.decode(Double.self) { value = d; return }
		if let b = try? container.decode(Bool.self) { value = b; return }
		if let arr = try? container.decode([AnyCodable].self) { value = arr.map { $0.value }; return }
		if let dict = try? container.decode([String:AnyCodable].self) { value = dict.mapValues { $0.value }; return }
		throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type")
	}
	public func encode(to encoder: Encoder) throws {
		var container = encoder.singleValueContainer()
		switch value {
		case let s as String: try container.encode(s)
		case let i as Int: try container.encode(i)
		case let d as Double: try container.encode(d)
		case let b as Bool: try container.encode(b)
		case let arr as [Any]: try container.encode(arr.map { AnyCodable($0) })
		case let dict as [String:Any]: try container.encode(dict.mapValues { AnyCodable($0) })
		default: throw EncodingError.invalidValue(value, .init(codingPath: container.codingPath, debugDescription: "Unsupported type"))
		}
	}
}

public struct APIError: Error, Codable { public let error: String?; public let message: String? }
