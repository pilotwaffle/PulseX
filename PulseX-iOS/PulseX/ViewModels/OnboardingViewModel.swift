import Foundation
import Combine

class OnboardingViewModel: ObservableObject {
    @Published var currentStep = 0
    @Published var selectedCategories: Set<String> = []
    @Published var notificationPreferences = NotificationPreferences()
    @Published var readingPreferences = ReadingPreferences()

    let pages: [OnboardingPage]
    var totalPages: Int { pages.count }

    private let apiService: APIServiceProtocol

    init(apiService: APIServiceProtocol = APIClient.shared) {
        self.apiService = apiService
        self.pages = Self.createOnboardingPages()
    }

    // MARK: - Public Methods
    func completeOnboarding() {
        saveUserPreferences()
        AnalyticsManager.shared.trackEvent(.onboardingCompleted, properties: [
            "selected_categories": Array(selectedCategories),
            "notifications_enabled": notificationPreferences.dailyReminder
        ])
    }

    func selectCategory(_ category: String) {
        if selectedCategories.contains(category) {
            selectedCategories.remove(category)
        } else {
            selectedCategories.insert(category)
        }
    }

    func updateNotificationPreferences(_ preferences: NotificationPreferences) {
        notificationPreferences = preferences
    }

    func updateReadingPreferences(_ preferences: ReadingPreferences) {
        readingPreferences = preferences
    }

    // MARK: - Private Methods
    private func saveUserPreferences() {
        let preferencesDTO = UserPreferencesDTO(
            preferredCategories: Array(selectedCategories),
            notificationSettings: UserPreferencesDTO.NotificationSettingsDTO(
                dailyReminder: notificationPreferences.dailyReminder,
                weeklyDigest: notificationPreferences.weeklyDigest,
                breakingNews: notificationPreferences.breakingNews
            ),
            readingPreferences: UserPreferencesDTO.ReadingPreferencesDTO(
                fontSize: readingPreferences.fontSize.rawValue,
                theme: readingPreferences.theme.rawValue,
                autoPlayVideos: readingPreferences.autoPlayVideos
            )
        )

        apiService.updateUserPreferences(preferencesDTO)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        print("Failed to save user preferences: \(error)")
                    }
                },
                receiveValue: { _ in
                    print("User preferences saved successfully")
                }
            )
            .store(in: &cancellables)
    }

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Static Factory Methods
    private static func createOnboardingPages() -> [OnboardingPage] {
        return [
            OnboardingPage(
                type: .welcome,
                title: "Welcome to PulseX",
                subtitle: "Your daily briefing, personalized for you. Catch up on what matters in 30-90 seconds.",
                description: "PulseX curates the most important news and insights tailored to your interests."
            ),
            OnboardingPage(
                type: .categories,
                title: "Choose Your Interests",
                subtitle: "Select topics you care about to personalize your daily pulse.",
                description: "We'll use these to curate content that matters most to you."
            ),
            OnboardingPage(
                type: .notifications,
                title: "Stay in the Loop",
                subtitle: "Get notified when new briefings are ready or important news breaks.",
                description: "Never miss important updates with smart notifications."
            ),
            OnboardingPage(
                type: .personalization,
                title: "Your Personal Hub",
                subtitle: "Save articles, track your reading progress, and refine your preferences over time.",
                description: "Your pulse gets smarter as you use it."
            )
        ]
    }
}

// MARK: - Onboarding Page Model
struct OnboardingPage {
    let type: OnboardingPageType
    let title: String
    let subtitle: String
    let description: String

    enum OnboardingPageType {
        case welcome
        case categories
        case notifications
        case personalization
    }
}

// MARK: - User Preference Models
struct NotificationPreferences {
    var dailyReminder = true
    var weeklyDigest = true
    var breakingNews = false
}

struct ReadingPreferences {
    var fontSize: FontSize = .medium
    var theme: ReadingTheme = .system
    var autoPlayVideos = false

    enum FontSize: String, CaseIterable {
        case small = "small"
        case medium = "medium"
        case large = "large"

        var displayName: String {
            switch self {
            case .small: return "Small"
            case .medium: return "Medium"
            case .large: return "Large"
            }
        }

        var scale: CGFloat {
            switch self {
            case .small: return 0.9
            case .medium: return 1.0
            case .large: return 1.1
            }
        }
    }

    enum ReadingTheme: String, CaseIterable {
        case light = "light"
        case dark = "dark"
        case system = "system"

        var displayName: String {
            switch self {
            case .light: return "Light"
            case .dark: return "Dark"
            case .system: return "System"
            }
        }

        var icon: String {
            switch self {
            case .light: return "sun.max.fill"
            case .dark: return "moon.fill"
            case .system: return "circle.lefthalf.filled"
            }
        }
    }
}

// MARK: - Onboarding Analytics Extensions
extension AnalyticsManager {
    func trackOnboardingStep(step: Int, type: OnboardingPage.OnboardingPageType) {
        trackEvent(.onboardingStep, properties: [
            "step": step + 1,
            "type": String(describing: type)
        ])
    }

    func trackCategorySelection(categories: Set<String>) {
        trackEvent(.categorySelection, properties: [
            "categories": Array(categories),
            "count": categories.count
        ])
    }

    func trackNotificationPermissionResponse(granted: Bool) {
        trackEvent(.notificationPermission, properties: [
            "granted": granted
        ])
    }

    func trackOnboardingSkipped(at step: Int) {
        trackEvent(.onboardingSkipped, properties: [
            "step": step + 1
        ])
    }
}

// MARK: - Additional Analytics Events
extension AnalyticsManager.EventType {
    static let onboardingStep = "onboarding_step"
    static let categorySelection = "category_selection"
    static let notificationPermission = "notification_permission"
    static let onboardingSkipped = "onboarding_skipped"
}