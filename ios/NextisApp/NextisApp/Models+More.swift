import Foundation

public struct NotificationsResponse: Codable { public let notifications: [AppNotification] }
public struct AckResponse: Codable { public let success: Bool; public let message: String? }
public struct SimpleSuccess: Codable { public let success: Bool }

public struct DailyRollupModel: Codable {
	public let date: String
	public let focusBlocksCompleted: Int
	public let snoozes: Int
	public let skips: Int
	public let sleepHours: Int?
	public let waterMl: Int?
}

public struct HydrationGoalResponse: Codable { public let waterGoalMl: Int }

public struct GmailStatus: Codable { public let connected: Bool; public let emailAddress: String?; public let lastSyncAt: String? }
public struct GmailSyncResponse: Codable { public let success: Bool; public let itemsCreated: Int; public let categories: [String:Int]? }

public struct WorkoutPrefsResponse: Codable { public let preferences: WorkoutPreferences }
public struct PlanWorkoutsResponse: Codable { public let workouts: [Item]; public let streakProtected: Bool }
public struct StreakStatus: Codable { public let streakDays: Int; public let lastWorkout: String?; public let protected: Bool }

public struct WeeklyGenerateResponse: Codable { public let success: Bool; public let summary: WeeklySummary }

public struct AutoBreaksResponse: Codable { public let autoBreaks: Bool }

public struct BreakItemBrief: Codable { public let id: String; public let title: String; public let start: String?; public let end: String?; public let notes: String? }
public struct BreaksRecomputeResponse: Codable { public let breaksAdded: Int; public let breaks: [BreakItemBrief] }
