import Foundation

public struct NextisConfig {
	public var baseURL: URL
	public var timezoneProvider: () -> String

	public init(baseURL: URL, timezoneProvider: @escaping () -> String = { TimeZone.current.identifier }) {
		self.baseURL = baseURL
		self.timezoneProvider = timezoneProvider
	}
}
