import XCTest
import Combine
@testable import PulseX

final class PulseXTests: XCTestCase {
    var cancellables: Set<AnyCancellable> = []
    var persistenceController: PersistenceController!

    override func setUpWithError() throws {
        persistenceController = PersistenceController(inMemory: true)
    }

    override func tearDownWithError() throws {
        cancellables.removeAll()
        persistenceController = nil
    }

    // MARK: - APIClient Tests
    func testAPIClientFetchBriefings() throws {
        let expectation = XCTestExpectation(description: "Fetch briefings")
        let mockAPIService = MockAPIService()

        mockAPIService.fetchBriefings()
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Expected success but got error: \(error)")
                    }
                },
                receiveValue: { briefings in
                    XCTAssertFalse(briefings.isEmpty, "Briefings should not be empty")
                    expectation.fulfill()
                }
            )
            .store(in: &cancellables)

        wait(for: [expectation], timeout: 5.0)
    }

    func testAPIClientSubmitFeedback() throws {
        let expectation = XCTestExpectation(description: "Submit feedback")
        let mockAPIService = MockAPIService()
        let feedback = FeedbackDTO(
            briefingId: UUID(),
            type: "positive",
            emojiReaction: "👍",
            textFeedback: "Great briefing!"
        )

        mockAPIService.submitFeedback(feedback)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Expected success but got error: \(error)")
                    }
                },
                receiveValue: {
                    expectation.fulfill()
                }
            )
            .store(in: &cancellables)

        wait(for: [expectation], timeout: 5.0)
    }

    // MARK: - PulseFeedViewModel Tests
    func testPulseFeedViewModelLoadBriefings() {
        let viewModel = PulseFeedViewModel(
            apiService: MockAPIService(),
            persistenceController: persistenceController
        )

        expectation(description: "Load briefings") { expectation in
            viewModel.$briefings
                .dropFirst() // Skip initial empty value
                .sink { briefings in
                    if !briefings.isEmpty {
                        expectation.fulfill()
                    }
                }
                .store(in: &self.cancellables)
        }

        viewModel.loadBriefings()
        waitForExpectations(timeout: 5.0)
    }

    func testPulseFeedViewModelFilterBriefings() {
        let viewModel = createViewModelWithSampleData()

        // Test category filtering
        viewModel.filterBriefings(by: "Technology")
        XCTAssertEqual(viewModel.filteredBriefings.count, 1)
        XCTAssertEqual(viewModel.filteredBriefings.first?.category, "Technology")

        // Test "All" filter
        viewModel.filterBriefings(by: nil)
        XCTAssertEqual(viewModel.filteredBriefings.count, 2)
    }

    func testPulseFeedViewModelMarkAsRead() {
        let viewModel = createViewModelWithSampleData()
        let briefing = viewModel.briefings.first!

        XCTAssertFalse(briefing.isRead, "Briefing should initially be unread")

        viewModel.markAsRead(briefing)
        XCTAssertTrue(briefing.isRead, "Briefing should be marked as read")
    }

    func testPulseFeedViewModelToggleSave() {
        let viewModel = createViewModelWithSampleData()
        let briefing = viewModel.briefings.first!

        XCTAssertFalse(briefing.isSaved, "Briefing should initially be unsaved")

        viewModel.toggleSave(briefing)
        XCTAssertTrue(briefing.isSaved, "Briefing should be saved")

        viewModel.toggleSave(briefing)
        XCTAssertFalse(briefing.isSaved, "Briefing should be unsaved")
    }

    // MARK: - SavedViewModel Tests
    func testSavedViewModelLoadSavedCards() {
        let viewModel = SavedViewModel(persistenceController: persistenceController)
        let context = persistenceController.container.viewContext

        // Create sample saved card
        let savedCard = SavedCard(context: context)
        savedCard.id = UUID()
        savedCard.briefingId = UUID()
        savedCard.headline = "Test Briefing"
        savedCard.category = "Technology"
        savedCard.savedAt = Date()
        persistenceController.save()

        expectation(description: "Load saved cards") { expectation in
            viewModel.$savedCards
                .dropFirst()
                .sink { savedCards in
                    if !savedCards.isEmpty {
                        expectation.fulfill()
                    }
                }
                .store(in: &self.cancellables)
        }

        viewModel.loadSavedCards()
        waitForExpectations(timeout: 5.0)
    }

    func testSavedViewModelSearchBriefings() {
        let viewModel = createSavedViewModelWithSampleData()

        // Test search with matching term
        viewModel.searchBriefings(with: "AI")
        XCTAssertEqual(viewModel.filteredSavedCards.count, 1)

        // Test search with non-matching term
        viewModel.searchBriefings(with: "Nonexistent")
        XCTAssertEqual(viewModel.filteredSavedCards.count, 0)

        // Test empty search
        viewModel.searchBriefings(with: "")
        XCTAssertEqual(viewModel.filteredSavedCards.count, 2)
    }

    func testSavedViewModelSortCards() {
        let viewModel = createSavedViewModelWithSampleData()

        // Test sort by newest
        viewModel.sortBy = .newest
        viewModel.applyFilters(category: nil)
        let newestFirst = viewModel.filteredSavedCards.enumerated().allSatisfy { index, card in
            index == 0 || card.savedAt >= viewModel.filteredSavedCards[index - 1].savedAt
        }
        XCTAssertTrue(newestFirst, "Cards should be sorted by newest first")

        // Test sort by alphabetical
        viewModel.sortBy = .alphabetical
        viewModel.applyFilters(category: nil)
        let alphabetical = viewModel.filteredSavedCards.enumerated().allSatisfy { index, card in
            index == 0 || card.headline >= viewModel.filteredSavedCards[index - 1].headline
        }
        XCTAssertTrue(alphabetical, "Cards should be sorted alphabetically")
    }

    // MARK: - ProfileViewModel Tests
    func testProfileViewModelUpdateProfile() {
        let viewModel = ProfileViewModel(
            persistenceController: persistenceController,
            apiService: MockAPIService()
        )

        expectation(description: "Update profile") { expectation in
            viewModel.$user
                .dropFirst()
                .sink { user in
                    if user.name == "Updated Name" && user.email == "updated@email.com" {
                        expectation.fulfill()
                    }
                }
                .store(in: &self.cancellables)
        }

        viewModel.updateProfile(name: "Updated Name", email: "updated@email.com")
        waitForExpectations(timeout: 5.0)
    }

    func testProfileViewModelUpdateReadingPreferences() {
        let viewModel = ProfileViewModel(
            persistenceController: persistenceController,
            apiService: MockAPIService()
        )

        // Update preferences
        viewModel.readingPreferences.fontSize = .large
        viewModel.readingPreferences.theme = .dark
        viewModel.readingPreferences.autoPlayVideos = true

        expectation(description: "Update reading preferences") { expectation in
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                expectation.fulfill()
            }
        }

        viewModel.updateReadingPreferences()
        waitForExpectations(timeout: 5.0)

        XCTAssertEqual(viewModel.readingPreferences.fontSize, .large)
        XCTAssertEqual(viewModel.readingPreferences.theme, .dark)
        XCTAssertTrue(viewModel.readingPreferences.autoPlayVideos)
    }

    func testProfileViewModelExportUserData() {
        let viewModel = ProfileViewModel(
            persistenceController: persistenceController,
            apiService: MockAPIService()
        )

        let exportData = viewModel.exportUserData()

        XCTAssertNotNil(exportData.toJSON(), "Export data should be convertible to JSON")
        XCTAssertEqual(exportData.user.name, "Alex Johnson")
        XCTAssertGreaterThan(exportData.exportDate.timeIntervalSinceNow, -1) // Should be recent
    }

    // MARK: - ThemeManager Tests
    func testThemeManagerSetTheme() {
        let themeManager = ThemeManager.shared

        themeManager.setTheme(.dark)
        XCTAssertEqual(themeManager.currentTheme, .dark)
        XCTAssertTrue(themeManager.isDarkMode)

        themeManager.setTheme(.light)
        XCTAssertEqual(themeManager.currentTheme, .light)
        XCTAssertFalse(themeManager.isDarkMode)

        themeManager.setTheme(.system)
        XCTAssertEqual(themeManager.currentTheme, .system)
    }

    // MARK: - UserDefaults Tests
    func testUserDefaultsPropertyWrapper() {
        let defaults = UserDefaults.standard

        // Test boolean value
        defaults.set(true, forKey: "testBool")
        let testBool: Bool = defaults.object(forKey: "testBool") as? Bool ?? false
        XCTAssertTrue(testBool)

        // Test string value
        defaults.set("test", forKey: "testString")
        let testString: String = defaults.object(forKey: "testString") as? String ?? ""
        XCTAssertEqual(testString, "test")

        // Test array value
        defaults.set(["item1", "item2"], forKey: "testArray")
        let testArray: [String] = defaults.object(forKey: "testArray") as? [String] ?? []
        XCTAssertEqual(testArray.count, 2)
    }

    func testUserDefaultsReadingStreak() {
        let defaults = UserDefaults.standard
        defaults.resetReadingStreak()

        XCTAssertEqual(defaults.readingStreak, 0)
        XCTAssertNil(defaults.lastBriefingDate)

        defaults.updateReadingStreak()
        XCTAssertEqual(defaults.readingStreak, 1)
        XCTAssertNotNil(defaults.lastBriefingDate)

        // Test consecutive days
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date())!
        defaults.lastBriefingDate = tomorrow
        defaults.updateReadingStreak()
        XCTAssertEqual(defaults.readingStreak, 2)
    }

    // MARK: - Helper Methods
    private func createViewModelWithSampleData() -> PulseFeedViewModel {
        let viewModel = PulseFeedViewModel(
            apiService: MockAPIService(),
            persistenceController: persistenceController
        )
        let context = persistenceController.container.viewContext

        // Create sample briefings
        let briefing1 = createSampleBriefing(
            headline: "AI Breakthrough",
            category: "Technology",
            context: context
        )

        let briefing2 = createSampleBriefing(
            headline: "Market Update",
            category: "Business",
            context: context
        )

        viewModel.briefings = [briefing1, briefing2]
        viewModel.filteredBriefings = viewModel.briefings

        return viewModel
    }

    private func createSavedViewModelWithSampleData() -> SavedViewModel {
        let viewModel = SavedViewModel(persistenceController: persistenceController)
        let context = persistenceController.container.viewContext

        // Create sample saved cards
        let savedCard1 = createSampleSavedCard(
            headline: "AI Revolution",
            category: "Technology",
            context: context
        )

        let savedCard2 = createSampleSavedCard(
            headline: "Business News",
            category: "Business",
            context: context
        )

        viewModel.savedCards = [savedCard1, savedCard2]
        viewModel.filteredSavedCards = viewModel.savedCards

        return viewModel
    }

    private func createSampleBriefing(headline: String, category: String, context: NSManagedObjectContext) -> Briefing {
        let briefing = Briefing(context: context)
        briefing.id = UUID()
        briefing.headline = headline
        briefing.content = "Sample content for \(headline)"
        briefing.category = category
        briefing.source = "Test Source"
        briefing.readTime = 45
        briefing.isRead = false
        briefing.isSaved = false
        briefing.timestamp = Date()
        return briefing
    }

    private func createSampleSavedCard(headline: String, category: String, context: NSManagedObjectContext) -> SavedCard {
        let savedCard = SavedCard(context: context)
        savedCard.id = UUID()
        savedCard.briefingId = UUID()
        savedCard.headline = headline
        savedCard.category = category
        savedCard.source = "Test Source"
        savedCard.savedAt = Date()
        return savedCard
    }
}

// MARK: - Mock Services
class MockAPIService: APIServiceProtocol {
    func fetchBriefings() -> AnyPublisher<[BriefingDTO], APIError> {
        let sampleBriefings = [
            BriefingDTO(
                id: UUID(),
                headline: "AI Breakthrough: New Model Achieves Human-Level Understanding",
                content: "Scientists have announced a major breakthrough in artificial intelligence...",
                category: "Technology",
                source: "Tech News Daily",
                imageUrl: nil,
                readTime: 45,
                priority: 1,
                tags: ["AI", "Technology", "Science"],
                timestamp: Date(),
                isRead: false,
                isSaved: false
            ),
            BriefingDTO(
                id: UUID(),
                headline: "Global Markets Rally on Economic Optimism",
                content: "Stock markets around the world posted significant gains...",
                category: "Business",
                source: "Financial Times",
                imageUrl: nil,
                readTime: 30,
                priority: 2,
                tags: ["Markets", "Economy", "Finance"],
                timestamp: Date(),
                isRead: false,
                isSaved: false
            )
        ]

        return Just(sampleBriefings)
            .setFailureType(to: APIError.self)
            .eraseToAnyPublisher()
    }

    func submitFeedback(_ feedback: FeedbackDTO) -> AnyPublisher<Void, APIError> {
        return Just(())
            .setFailureType(to: APIError.self)
            .delay(for: .seconds(0.5), scheduler: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    func saveCard(_ card: SavedCardDTO) -> AnyPublisher<Void, APIError> {
        return Just(())
            .setFailureType(to: APIError.self)
            .delay(for: .seconds(0.3), scheduler: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    func updateUserPreferences(_ preferences: UserPreferencesDTO) -> AnyPublisher<UserDTO, APIError> {
        let updatedUser = UserDTO(
            id: UUID(),
            name: "Alex Johnson",
            email: "alex.johnson@example.com",
            profileImage: nil,
            preferredCategories: preferences.preferredCategories,
            isOnboarded: true
        )

        return Just(updatedUser)
            .setFailureType(to: APIError.self)
            .delay(for: .seconds(0.5), scheduler: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
}