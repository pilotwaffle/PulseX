import Foundation
import CoreData
import Combine
import SwiftUI

class PulseFeedViewModel: ObservableObject {
    @Published var briefings: [Briefing] = []
    @Published var filteredBriefings: [Briefing] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: Error?
    @Published var hasMoreData = true

    private let apiService: APIServiceProtocol
    private let persistenceController: PersistenceController
    private var cancellables = Set<AnyCancellable>()
    private let itemsPerPage = 20
    private var currentPage = 0

    // Quick filter categories
    let quickFilters = ["All", "Technology", "Business", "Health", "Science"]

    init(
        apiService: APIServiceProtocol = APIClient.shared,
        persistenceController: PersistenceController = .shared
    ) {
        self.apiService = apiService
        self.persistenceController = persistenceController
        loadBriefingsFromCache()
        setupNetworkMonitoring()
    }

    // MARK: - Public Methods
    func loadBriefings() {
        guard !isLoading else { return }

        // First load from cache for instant UI
        loadBriefingsFromCache()

        // Then fetch fresh data
        refreshBriefings()
    }

    func refreshBriefings() {
        guard !isLoading else { return }

        isLoading = true
        error = nil
        currentPage = 0

        apiService.fetchBriefings()
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = error
                    }
                },
                receiveValue: { [weak self] briefingDTOs in
                    self?.handleNewBriefings(briefingDTOs)
                }
            )
            .store(in: &cancellables)
    }

    func refreshBriefingsAsync() async {
        await withCheckedContinuation { continuation in
            refreshBriefings()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                continuation.resume()
            }
        }
    }

    func loadMoreBriefings() {
        guard !isLoadingMore && hasMoreData else { return }

        isLoadingMore = true
        currentPage += 1

        // Implement pagination logic here
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.isLoadingMore = false
            // For now, simulate no more data
            self?.hasMoreData = self?.briefings.count ?? 0 < 50
        }
    }

    func filterBriefings(by category: String?) {
        if let category = category, category != "All" {
            filteredBriefings = briefings.filter { $0.category.lowercased() == category.lowercased() }
        } else {
            filteredBriefings = briefings
        }
    }

    func markAsRead(_ briefing: Briefing) {
        guard !briefing.isRead else { return }

        briefing.isRead = true
        persistenceController.save()

        // Track reading analytics
        AnalyticsManager.shared.trackEvent(.briefingRead, properties: [
            "briefing_id": briefing.id?.uuidString ?? "unknown",
            "category": briefing.category,
            "read_time": briefing.readTime
        ])
    }

    func toggleSave(_ briefing: Briefing) {
        briefing.isSaved.toggle()
        persistenceController.save()

        if briefing.isSaved {
            saveBriefingToSavedCards(briefing)
            AnalyticsManager.shared.trackEvent(.briefingSaved, properties: [
                "briefing_id": briefing.id?.uuidString ?? "unknown",
                "category": briefing.category
            ])
        } else {
            removeBriefingFromSavedCards(briefing)
        }
    }

    func shareBriefing(_ briefing: Briefing) {
        // Create share content
        let shareText = "\(briefing.headline)\n\n\(briefing.content)\n\nSource: \(briefing.source ?? "PulseX")"

        // Share via system share sheet (to be implemented)
        print("Sharing briefing: \(briefing.headline)")

        AnalyticsManager.shared.trackEvent(.briefingShared, properties: [
            "briefing_id": briefing.id?.uuidString ?? "unknown",
            "category": briefing.category
        ])
    }

    func submitFeedback(for briefing: Briefing, type: String) {
        let feedbackDTO = FeedbackDTO(
            briefingId: briefing.id ?? UUID(),
            type: type
        )

        apiService.submitFeedback(feedbackDTO)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        print("Failed to submit feedback: \(error)")
                    }
                },
                receiveValue: { [weak self] _ in
                    // Update local feedback
                    let feedback = feedbackDTO.toCoreDataEntity(in: self?.persistenceController.container.viewContext ?? CoreDataStack.shared.context)
                    briefing.feedback = feedback
                    self?.persistenceController.save()

                    AnalyticsManager.shared.trackEvent(.feedbackSubmitted, properties: [
                        "briefing_id": briefing.id?.uuidString ?? "unknown",
                        "feedback_type": type
                    ])
                }
            )
            .store(in: &cancellables)
    }

    // MARK: - Private Methods
    private func loadBriefingsFromCache() {
        let cachedBriefings = persistenceController.fetchBriefings(
            predicate: NSPredicate(format: "timestamp >= %@", Date().addingTimeInterval(-24 * 60 * 60) as NSDate),
            sortDescriptors: [
                NSSortDescriptor(keyPath: \Briefing.priority, ascending: false),
                NSSortDescriptor(keyPath: \Briefing.timestamp, ascending: false)
            ]
        )

        DispatchQueue.main.async { [weak self] in
            self?.briefings = Array(cachedBriefings.prefix(itemsPerPage))
            self?.filteredBriefings = self?.briefings ?? []
        }
    }

    private func handleNewBriefings(_ briefingDTOs: [BriefingDTO]) {
        let context = persistenceController.container.viewContext

        // Clear old briefings (older than 30 days)
        let thirtyDaysAgo = Date().addingTimeInterval(-30 * 24 * 60 * 60)
        let oldBriefings = persistenceController.fetchBriefings(
            predicate: NSPredicate(format: "timestamp < %@", thirtyDaysAgo as NSDate)
        )

        for oldBriefing in oldBriefings {
            context.delete(oldBriefing)
        }

        // Save new briefings
        for briefingDTO in briefingDTOs {
            let briefing = briefingDTO.toCoreDataEntity(in: context)

            // Check if briefing already exists
            let existingBriefings = persistenceController.fetchBriefings(
                predicate: NSPredicate(format: "id == %@", briefing.id! as CVarArg)
            )

            if existingBriefings.isEmpty {
                // New briefing, add it
            } else {
                // Update existing briefing
                let existingBriefing = existingBriefings.first!
                existingBriefing.headline = briefing.headline
                existingBriefing.content = briefing.content
                existingBriefing.priority = briefing.priority
                existingBriefing.timestamp = briefing.timestamp
                context.delete(briefing)
            }
        }

        persistenceController.save()

        // Reload from cache to get fresh data
        loadBriefingsFromCache()

        // Check if we have new briefings for notification
        let newBriefingCount = briefingDTOs.count - oldBriefings.count
        if newBriefingCount > 0 {
            NotificationManager.shared.scheduleNewBriefingsNotification(count: newBriefingCount)
        }
    }

    private func saveBriefingToSavedCards(_ briefing: Briefing) {
        let context = persistenceController.container.viewContext
        let savedCard = SavedCard(context: context)
        savedCard.id = UUID()
        savedCard.briefingId = briefing.id
        savedCard.headline = briefing.headline
        savedCard.category = briefing.category
        savedCard.source = briefing.source
        savedCard.imageUrl = briefing.imageUrl
        savedCard.savedAt = Date()

        persistenceController.save()
    }

    private func removeBriefingFromSavedCards(_ briefing: Briefing) {
        guard let briefingId = briefing.id else { return }

        let context = persistenceController.container.viewContext
        let savedCards = persistenceController.fetchSavedCards()
            .filter { $0.briefingId == briefingId }

        for savedCard in savedCards {
            context.delete(savedCard)
        }

        persistenceController.save()
    }

    private func setupNetworkMonitoring() {
        if let apiClient = apiService as? APIClient {
            apiClient.isConnected
                .sink { [weak self] isConnected in
                    if isConnected {
                        // Refresh data when connection is restored
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            self?.refreshBriefings()
                        }
                    }
                }
                .store(in: &cancellables)
        }
    }

    // MARK: - Computed Properties
    var unreadCount: Int {
        briefings.filter { !$0.isRead }.count
    }

    var savedCount: Int {
        briefings.filter { $0.isSaved }.count
    }

    var averageReadTime: TimeInterval {
        guard !briefings.isEmpty else { return 0 }
        let totalTime = briefings.reduce(0) { $0 + $1.readTime }
        return TimeInterval(totalTime) / Double(briefings.count)
    }
}

// MARK: - Analytics Manager
class AnalyticsManager {
    static let shared = AnalyticsManager()

    private init() {}

    enum EventType: String {
        case briefingRead = "briefing_read"
        case briefingSaved = "briefing_saved"
        case briefingShared = "briefing_shared"
        case feedbackSubmitted = "feedback_submitted"
        case onboardingCompleted = "onboarding_completed"
        case appOpen = "app_open"
        case appBackground = "app_background"
    }

    func trackEvent(_ type: EventType, properties: [String: Any] = [:]) {
        var allProperties = properties
        allProperties["event_type"] = type.rawValue
        allProperties["timestamp"] = ISO8601DateFormatter().string(from: Date())

        // Send to analytics service (to be implemented)
        print("Analytics Event: \(type.rawValue) - Properties: \(allProperties)")
    }
}

// MARK: - Notification Manager
class NotificationManager {
    static let shared = NotificationManager()

    private init() {}

    func scheduleNewBriefingsNotification(count: Int) {
        let content = UNMutableNotificationContent()
        content.title = "New Briefings Available"
        content.body = "You have \(count) new briefing\(count == 1 ? "" : "s") to catch up on"
        content.sound = .default
        content.userInfo = ["type": "new_briefings", "count": count]

        // Schedule for next morning
        let calendar = Calendar.current
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date())!
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: tomorrow)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Error scheduling notification: \(error)")
            }
        }
    }

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if granted {
                print("Notification permission granted")
            } else if let error = error {
                print("Error requesting notification permission: \(error)")
            }
        }
    }
}

import UserNotifications