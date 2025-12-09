import Foundation
import CoreData
import Combine

class ProfileViewModel: ObservableObject {
    @Published var user = UserDTO(
        id: UUID(),
        name: "Alex Johnson",
        email: "alex.johnson@example.com",
        profileImage: nil,
        preferredCategories: ["Technology", "Business", "Science"],
        isOnboarded: true
    )
    @Published var stats = ReadingStats()
    @Published var readingPreferences = ReadingPreferences()
    @Published var isLoading = false
    @Published var error: Error?

    private let persistenceController: PersistenceController
    private let apiService: APIServiceProtocol
    private var cancellables = Set<AnyCancellable>()

    init(
        persistenceController: PersistenceController = .shared,
        apiService: APIServiceProtocol = APIClient.shared
    ) {
        self.persistenceController = persistenceController
        self.apiService = apiService
        loadStats()
        loadPreferences()
    }

    // MARK: - Public Methods
    func loadUserData() {
        // Load user data from Core Data or API
        isLoading = true

        // For now, use sample data
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isLoading = false
        }
    }

    func updateProfile(name: String, email: String) {
        // Update user profile
        user.name = name
        user.email = email

        // Save to API
        let updatedUser = UserDTO(
            id: user.id,
            name: name,
            email: email,
            profileImage: user.profileImage,
            preferredCategories: user.preferredCategories,
            isOnboarded: user.isOnboarded
        )

        apiService.updateUserPreferences(
            UserPreferencesDTO(
                preferredCategories: user.preferredCategories,
                notificationSettings: UserPreferencesDTO.NotificationSettingsDTO(
                    dailyReminder: true,
                    weeklyDigest: true,
                    breakingNews: false
                ),
                readingPreferences: UserPreferencesDTO.ReadingPreferencesDTO(
                    fontSize: readingPreferences.fontSize.rawValue,
                    theme: readingPreferences.theme.rawValue,
                    autoPlayVideos: readingPreferences.autoPlayVideos
                )
            )
        )
        .sink(
            receiveCompletion: { [weak self] completion in
                if case .failure(let error) = completion {
                    self?.error = error
                }
            },
            receiveValue: { _ in
                AnalyticsManager.shared.trackEvent(.profileUpdated, properties: [
                    "field": "name_email"
                ])
            }
        )
        .store(in: &cancellables)
    }

    func updateReadingPreferences() {
        let preferencesDTO = UserPreferencesDTO(
            preferredCategories: user.preferredCategories,
            notificationSettings: UserPreferencesDTO.NotificationSettingsDTO(
                dailyReminder: true,
                weeklyDigest: true,
                breakingNews: false
            ),
            readingPreferences: UserPreferencesDTO.ReadingPreferencesDTO(
                fontSize: readingPreferences.fontSize.rawValue,
                theme: readingPreferences.theme.rawValue,
                autoPlayVideos: readingPreferences.autoPlayVideos
            )
        )

        apiService.updateUserPreferences(preferencesDTO)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.error = error
                    }
                },
                receiveValue: { _ in
                    AnalyticsManager.shared.trackEvent(.readingPreferencesUpdated, properties: [
                        "font_size": preferencesDTO.readingPreferences.fontSize,
                        "theme": preferencesDTO.readingPreferences.theme,
                        "auto_play_videos": preferencesDTO.readingPreferences.autoPlayVideos
                    ])
                }
            )
            .store(in: &cancellables)
    }

    func exportUserData() -> UserDataExport {
        return UserDataExport(
            user: user,
            stats: stats,
            preferences: readingPreferences,
            savedBriefings: exportSavedBriefings(),
            exportDate: Date()
        )
    }

    func deleteAccount() {
        // Implement account deletion
        AnalyticsManager.shared.trackEvent(.accountDeleted)
    }

    func signOut() {
        // Clear user data and tokens
        AuthToken.current = ""

        AnalyticsManager.shared.trackEvent(.userSignedOut)
    }

    // MARK: - Private Methods
    private func loadStats() {
        // Calculate reading statistics from Core Data
        let context = persistenceController.container.viewContext
        let briefingsRequest: NSFetchRequest<Briefing> = Briefing.fetchRequest()
        briefingsRequest.predicate = NSPredicate(format: "isRead == YES")

        do {
            let briefings = try context.fetch(briefingsRequest)
            let savedCards = persistenceController.fetchSavedCards()

            stats = ReadingStats(
                briefingsRead: briefings.count,
                savedItems: savedCards.count,
                readingStreak: calculateReadingStreak(briefings: briefings),
                totalReadingTime: calculateTotalReadingTime(briefings: briefings),
                categoriesRead: calculateCategoriesRead(briefings: briefings)
            )
        } catch {
            print("Error loading stats: \(error)")
        }
    }

    private func loadPreferences() {
        // Load preferences from UserDefaults or API
        if let fontSizeRaw = UserDefaults.standard.string(forKey: "fontSize"),
           let fontSize = ReadingPreferences.FontSize(rawValue: fontSizeRaw) {
            readingPreferences.fontSize = fontSize
        }

        if let themeRaw = UserDefaults.standard.string(forKey: "theme"),
           let theme = ReadingPreferences.ReadingTheme(rawValue: themeRaw) {
            readingPreferences.theme = theme
        }

        readingPreferences.autoPlayVideos = UserDefaults.standard.bool(forKey: "autoPlayVideos")
    }

    private func calculateReadingStreak(briefings: [Briefing]) -> Int {
        guard !briefings.isEmpty else { return 0 }

        let calendar = Calendar.current
        let sortedDates = briefings.compactMap { $0.timestamp }.sorted(by: >)

        var streak = 0
        var currentDate = calendar.startOfDay(for: Date())

        for date in sortedDates {
            let briefingDate = calendar.startOfDay(for: date)
            let daysDifference = calendar.dateComponents([.day], from: briefingDate, to: currentDate).day ?? 0

            if daysDifference == streak {
                streak += 1
            } else if daysDifference > streak {
                break
            }
        }

        return streak
    }

    private func calculateTotalReadingTime(briefings: [Briefing]) -> TimeInterval {
        return briefings.reduce(0) { $0 + TimeInterval($1.readTime) }
    }

    private func calculateCategoriesRead(briefings: [Briefing]) -> [String: Int] {
        var categories: [String: Int] = [:]

        for briefing in briefings {
            let category = briefing.category
            categories[category, default: 0] += 1
        }

        return categories
    }

    private func exportSavedBriefings() -> [String] {
        let savedCards = persistenceController.fetchSavedCards()
        return savedCards.map { card in
            """
            Headline: \(card.headline)
            Category: \(card.category ?? "Unknown")
            Source: \(card.source ?? "Unknown")
            Saved: \(DateFormatter.exportFormatter.string(from: card.savedAt))
            ---
            """
        }
    }
}

// MARK: - Data Models
struct ReadingStats {
    let briefingsRead: Int
    let savedItems: Int
    let readingStreak: Int
    let totalReadingTime: TimeInterval
    let categoriesRead: [String: Int]

    init(
        briefingsRead: Int = 0,
        savedItems: Int = 0,
        readingStreak: Int = 0,
        totalReadingTime: TimeInterval = 0,
        categoriesRead: [String: Int] = [:]
    ) {
        self.briefingsRead = briefingsRead
        self.savedItems = savedItems
        self.readingStreak = readingStreak
        self.totalReadingTime = totalReadingTime
        self.categoriesRead = categoriesRead
    }

    var formattedTotalReadingTime: String {
        let minutes = Int(totalReadingTime / 60)
        let hours = minutes / 60
        let remainingMinutes = minutes % 60

        if hours > 0 {
            return "\(hours)h \(remainingMinutes)m"
        } else {
            return "\(minutes)m"
        }
    }

    var mostReadCategory: String? {
        categoriesRead.max { $0.value < $1.value }?.key
    }
}

struct UserDataExport: Codable {
    let user: UserDTO
    let stats: ReadingStats
    let preferences: ReadingPreferences
    let savedBriefings: [String]
    let exportDate: Date

    enum CodingKeys: String, CodingKey {
        case user, stats, preferences
        case savedBriefings = "saved_briefings"
        case exportDate = "export_date"
    }

    func toJSON() -> String? {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(self)
            return String(data: data, encoding: .utf8)
        } catch {
            print("Error encoding export data: \(error)")
            return nil
        }
    }
}

// MARK: - Analytics Extensions
extension AnalyticsManager.EventType {
    static let profileUpdated = "profile_updated"
    static let readingPreferencesUpdated = "reading_preferences_updated"
    static let accountDeleted = "account_deleted"
    static let userSignedOut = "user_signed_out"
}

// MARK: - Date Formatter Extensions
extension DateFormatter {
    static let exportFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()
}