import Foundation
import SwiftUI

// MARK: - UserDefaults Property Wrapper
@propertyWrapper
struct UserDefault<T> {
    let key: String
    let defaultValue: T

    var wrappedValue: T {
        get {
            UserDefaults.standard.object(forKey: key) as? T ?? defaultValue
        }
        set {
            UserDefaults.standard.set(newValue, forKey: key)
        }
    }

    init(_ key: String, defaultValue: T) {
        self.key = key
        self.defaultValue = defaultValue
    }
}

// MARK: - UserDefaults Extensions
extension UserDefaults {
    // MARK: - App Settings
    @UserDefault("hasCompletedOnboarding", defaultValue: false)
    static var hasCompletedOnboarding: Bool

    @UserDefault("selectedTheme", defaultValue: "system")
    static var selectedTheme: String

    @UserDefault("fontSize", defaultValue: "medium")
    static var fontSize: String

    @UserDefault("autoPlayVideos", defaultValue: false)
    static var autoPlayVideos: Bool

    // MARK: - Notification Settings
    @UserDefault("dailyReminderEnabled", defaultValue: true)
    static var dailyReminderEnabled: Bool

    @UserDefault("weeklyDigestEnabled", defaultValue: true)
    static var weeklyDigestEnabled: Bool

    @UserDefault("breakingNewsEnabled", defaultValue: false)
    static var breakingNewsEnabled: Bool

    @UserDefault("dailyReminderTime", defaultValue: "09:00")
    static var dailyReminderTime: String

    // MARK: - User Preferences
    @UserDefault("preferredCategories", defaultValue: ["Technology", "Business"])
    static var preferredCategories: [String]

    @UserDefault("lastBriefingDate", defaultValue: nil)
    static var lastBriefingDate: Date?

    @UserDefault("readingStreak", defaultValue: 0)
    static var readingStreak: Int

    @UserDefault("totalBriefingsRead", defaultValue: 0)
    static var totalBriefingsRead: Int

    // MARK: - Analytics & Performance
    @UserDefault("appOpenCount", defaultValue: 0)
    static var appOpenCount: Int

    @UserDefault("firstAppOpenDate", defaultValue: nil)
    static var firstAppOpenDate: Date?

    @UserDefault("lastAppOpenDate", defaultValue: nil)
    static var lastAppOpenDate: Date?

    // MARK: - Feature Flags
    @UserDefault("betaFeaturesEnabled", defaultValue: false)
    static var betaFeaturesEnabled: Bool

    @UserDefault("debugModeEnabled", defaultValue: false)
    static var debugModeEnabled: Bool

    // MARK: - Helper Methods
    func incrementAppOpenCount() {
        UserDefaults.appOpenCount += 1
        UserDefaults.lastAppOpenDate = Date()

        if UserDefaults.firstAppOpenDate == nil {
            UserDefaults.firstAppOpenDate = Date()
        }
    }

    func updateReadingStreak() {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let lastBriefing = UserDefaults.lastBriefingDate?.calendarStartOfDay()

        if let lastBriefing = lastBriefing {
            let daysDifference = calendar.dateComponents([.day], from: lastBriefing, to: today).day ?? 0

            if daysDifference == 1 {
                // Continue streak
                UserDefaults.readingStreak += 1
            } else if daysDifference > 1 {
                // Reset streak
                UserDefaults.readingStreak = 1
            }
            // If daysDifference == 0, already read today, don't update
        } else {
            // First briefing
            UserDefaults.readingStreak = 1
        }

        UserDefaults.lastBriefingDate = Date()
        UserDefaults.totalBriefingsRead += 1
    }

    func resetReadingStreak() {
        UserDefaults.readingStreak = 0
        UserDefaults.lastBriefingDate = nil
    }

    func getReadingStats() -> (streak: Int, totalRead: Int, lastRead: Date?) {
        return (
            streak: UserDefaults.readingStreak,
            totalRead: UserDefaults.totalBriefingsRead,
            lastRead: UserDefaults.lastBriefingDate
        )
    }

    func exportUserPreferences() -> [String: Any] {
        return [
            "hasCompletedOnboarding": UserDefaults.hasCompletedOnboarding,
            "selectedTheme": UserDefaults.selectedTheme,
            "fontSize": UserDefaults.fontSize,
            "autoPlayVideos": UserDefaults.autoPlayVideos,
            "dailyReminderEnabled": UserDefaults.dailyReminderEnabled,
            "weeklyDigestEnabled": UserDefaults.weeklyDigestEnabled,
            "breakingNewsEnabled": UserDefaults.breakingNewsEnabled,
            "dailyReminderTime": UserDefaults.dailyReminderTime,
            "preferredCategories": UserDefaults.preferredCategories,
            "betaFeaturesEnabled": UserDefaults.betaFeaturesEnabled
        ]
    }

    func importUserPreferences(_ preferences: [String: Any]) {
        preferences.forEach { key, value in
            UserDefaults.standard.set(value, forKey: key)
        }
    }

    func clearAllData() {
        let domain = Bundle.main.bundleIdentifier!
        UserDefaults.standard.removePersistentDomain(forName: domain)
    }
}

// MARK: - Date Extension
extension Date {
    func calendarStartOfDay() -> Date {
        return Calendar.current.startOfDay(for: self)
    }
}

// MARK: - AppSettings Helper
class AppSettings: ObservableObject {
    @Published var hasCompletedOnboarding: Bool {
        didSet { UserDefaults.hasCompletedOnboarding = hasCompletedOnboarding }
    }

    @Published var selectedTheme: String {
        didSet { UserDefaults.selectedTheme = selectedTheme }
    }

    @Published var fontSize: String {
        didSet { UserDefaults.fontSize = fontSize }
    }

    @Published var autoPlayVideos: Bool {
        didSet { UserDefaults.autoPlayVideos = autoPlayVideos }
    }

    @Published var preferredCategories: [String] {
        didSet { UserDefaults.preferredCategories = preferredCategories }
    }

    init() {
        self.hasCompletedOnboarding = UserDefaults.hasCompletedOnboarding
        self.selectedTheme = UserDefaults.selectedTheme
        self.fontSize = UserDefaults.fontSize
        self.autoPlayVideos = UserDefaults.autoPlayVideos
        self.preferredCategories = UserDefaults.preferredCategories
    }

    func resetToDefaults() {
        hasCompletedOnboarding = false
        selectedTheme = "system"
        fontSize = "medium"
        autoPlayVideos = false
        preferredCategories = ["Technology", "Business"]
    }
}