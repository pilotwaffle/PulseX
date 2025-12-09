import Foundation
import CoreData
import Combine

class SavedViewModel: ObservableObject {
    @Published var savedCards: [SavedCard] = []
    @Published var filteredSavedCards: [SavedCard] = []
    @Published var isLoading = false
    @Published var error: Error?
    @Published var sortBy: SortOption = .newest

    private let persistenceController: PersistenceController
    private var cancellables = Set<AnyCancellable>()

    init(persistenceController: PersistenceController = .shared) {
        self.persistenceController = persistenceController
    }

    // MARK: - Public Methods
    func loadSavedCards() {
        isLoading = true
        error = nil

        let cards = persistenceController.fetchSavedCards()

        DispatchQueue.main.async { [weak self] in
            self?.savedCards = cards
            self?.applyFilters(category: nil)
            self?.isLoading = false
        }
    }

    func removeSavedCard(_ savedCard: SavedCard) {
        let context = persistenceController.container.viewContext
        context.delete(savedCard)
        persistenceController.save()

        // Update local arrays
        savedCards.removeAll { $0.id == savedCard.id }
        filteredSavedCards.removeAll { $0.id == savedCard.id }

        AnalyticsManager.shared.trackEvent(.briefingUnsaved, properties: [
            "briefing_id": savedCard.briefingId?.uuidString ?? "unknown"
        ])
    }

    func openBriefing(_ savedCard: SavedCard) {
        AnalyticsManager.shared.trackEvent(.savedBriefingOpened, properties: [
            "briefing_id": savedCard.briefingId?.uuidString ?? "unknown",
            "category": savedCard.category ?? "unknown"
        ])
    }

    func searchBriefings(with query: String) {
        if query.isEmpty {
            applyFilters(category: nil)
        } else {
            filteredSavedCards = savedCards.filter { card in
                let headlineMatch = card.headline.localizedCaseInsensitiveContains(query)
                let categoryMatch = card.category?.localizedCaseInsensitiveContains(query) ?? false
                let sourceMatch = card.source?.localizedCaseInsensitiveContains(query) ?? false
                return headlineMatch || categoryMatch || sourceMatch
            }
        }
    }

    func applyFilters(category: String?) {
        var filtered = savedCards

        // Apply category filter
        if let category = category, !category.isEmpty {
            filtered = filtered.filter { $0.category?.lowercased() == category.lowercased() }
        }

        // Apply sorting
        filtered = sortCards(filtered, by: sortBy)

        DispatchQueue.main.async { [weak self] in
            self?.filteredSavedCards = filtered
        }
    }

    // MARK: - Private Methods
    private func sortCards(_ cards: [SavedCard], by sortOption: SortOption) -> [SavedCard] {
        switch sortOption {
        case .newest:
            return cards.sorted { $0.savedAt > $1.savedAt }
        case .oldest:
            return cards.sorted { $0.savedAt < $1.savedAt }
        case .alphabetical:
            return cards.sorted { $0.headline < $1.headline }
        case .category:
            return cards.sorted { ($0.category ?? "") < ($1.category ?? "") }
        }
    }

    // MARK: - Sort Options
    enum SortOption: CaseIterable {
        case newest
        case oldest
        case alphabetical
        case category

        var displayName: String {
            switch self {
            case .newest:
                return "Newest First"
            case .oldest:
                return "Oldest First"
            case .alphabetical:
                return "Alphabetical"
            case .category:
                return "By Category"
            }
        }

        var icon: String {
            switch self {
            case .newest:
                return "clock"
            case .oldest:
                return "clock.arrow.circlepath"
            case .alphabetical:
                return "textformat.abc"
            case .category:
                return "folder"
            }
        }
    }
}

// MARK: - SavedCard Extension
extension SavedCard {
    func toBriefing(context: NSManagedObjectContext) -> Briefing {
        let briefing = Briefing(context: context)
        briefing.id = briefingId
        briefing.headline = headline
        briefing.category = category
        briefing.source = source
        briefing.imageUrl = imageUrl
        return briefing
    }
}

// MARK: - Analytics Extensions
extension AnalyticsManager.EventType {
    static let briefingUnsaved = "briefing_unsaved"
    static let savedBriefingOpened = "saved_briefing_opened"
}