import XCTest
@testable import PulseX

final class PulseXUITests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"]
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Onboarding Flow Tests
    func testOnboardingFlow() throws {
        // Should see onboarding screen if not completed
        XCTAssertTrue(app.staticTexts["Welcome to PulseX"].waitForExistence(timeout: 5))

        // Navigate through onboarding pages
        navigateThroughOnboarding()

        // Should complete onboarding and see main app
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Daily Pulse"].exists)
    }

    func testSkipOnboarding() throws {
        // Skip onboarding
        app.buttons["Skip"].tap()

        // Should see main app
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
    }

    // MARK: - Pulse Feed Tests
    func testPulseFeedLoading() throws {
        completeOnboardingIfNeeded()

        // Should see pulse feed
        XCTAssertTrue(app.navigationBars["Daily Pulse"].waitForExistence(timeout: 5))

        // Wait for briefings to load
        let briefingCard = app.scrollViews.otherElements.firstMatch
        XCTAssertTrue(briefingCard.waitForExistence(timeout: 10))
    }

    func testBriefingCardInteraction() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        // Tap on first briefing card
        let firstCard = app.scrollViews.otherElements.element(boundBy: 0)
        XCTAssertTrue(firstCard.exists)
        firstCard.tap()

        // Should see briefing details or mark as read
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Briefing")).firstMatch.waitForExistence(timeout: 5))
    }

    func testSaveBriefing() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        // Find and tap save button on first briefing
        let saveButton = app.buttons["bookmark"].firstMatch
        XCTAssertTrue(saveButton.waitForExistence(timeout: 5))
        saveButton.tap()

        // Should show saved state (filled bookmark)
        XCTAssertTrue(app.buttons["bookmark.fill"].waitForExistence(timeout: 5))
    }

    func testShareBriefing() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        // Find and tap share button
        let shareButton = app.buttons["square.and.arrow.up"].firstMatch
        XCTAssertTrue(shareButton.waitForExistence(timeout: 5))
        shareButton.tap()

        // Should see share sheet (or system share dialog)
        XCTAssertTrue(app.otherElements["Share"].waitForExistence(timeout: 5) || app.sheets.firstMatch.waitForExistence(timeout: 5))
    }

    func testFeedbackSubmission() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        // Find and tap feedback button
        let feedbackButton = app.buttons["hand.thumbsup"].firstMatch
        XCTAssertTrue(feedbackButton.waitForExistence(timeout: 5))
        feedbackButton.tap()

        // Should see feedback sheet
        XCTAssertTrue(app.navigationBars["Feedback"].waitForExistence(timeout: 5))

        // Select emoji reaction
        let emojiButton = app.buttons["👍"].firstMatch
        XCTAssertTrue(emojiButton.exists)
        emojiButton.tap()

        // Submit feedback
        app.buttons["Submit Feedback"].tap()

        // Sheet should dismiss
        XCTAssertFalse(app.navigationBars["Feedback"].waitForExistence(timeout: 2))
    }

    func testCategoryFilter() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        // Tap filter button
        let filterButton = app.buttons["line.horizontal.3.decrease.circle"].firstMatch
        XCTAssertTrue(filterButton.waitForExistence(timeout: 5))
        filterButton.tap()

        // Should see filter sheet
        XCTAssertTrue(app.navigationBars["Filter & Sort"].waitForExistence(timeout: 5))

        // Select Technology category
        let categoryChip = app.buttons["Technology"].firstMatch
        XCTAssertTrue(categoryChip.exists)
        categoryChip.tap()

        // Apply filter
        app.buttons["Apply"].tap()

        // Should see filtered results
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Technology")).firstMatch.waitForExistence(timeout: 5))
    }

    func testRefreshBriefings() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        // Pull to refresh
        let scrollView = app.scrollViews.firstMatch
        XCTAssertTrue(scrollView.exists)

        scrollView.swipeDown()

        // Should see refresh indicator or updated content
        XCTAssertTrue(app.activityIndicators.firstMatch.waitForExistence(timeout: 3) || app.staticTexts["Today"].waitForExistence(timeout: 5))
    }

    // MARK: - Saved Items Tests
    func testSavedItemsView() throws {
        completeOnboardingIfNeeded()
        saveFirstBriefing()

        // Navigate to Saved tab
        app.tabBars.buttons["Saved"].tap()

        // Should see saved briefing
        XCTAssertTrue(app.navigationBars["Saved"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.scrollViews.otherElements.firstMatch.waitForExistence(timeout: 5))
    }

    func testRemoveSavedItem() throws {
        completeOnboardingIfNeeded()
        saveFirstBriefing()

        // Navigate to Saved tab
        app.tabBars.buttons["Saved"].tap()
        XCTAssertTrue(app.navigationBars["Saved"].waitForExistence(timeout: 5))

        // Swipe to delete
        let savedCard = app.scrollViews.otherElements.firstMatch
        savedCard.swipeLeft()

        // Tap delete button
        app.buttons["Remove"].tap()

        // Card should be removed
        XCTAssertFalse(savedCard.waitForExistence(timeout: 3))
    }

    func testSearchSavedItems() throws {
        completeOnboardingIfNeeded()
        saveFirstBriefing()

        // Navigate to Saved tab
        app.tabBars.buttons["Saved"].tap()
        XCTAssertTrue(app.navigationBars["Saved"].waitForExistence(timeout: 5))

        // Tap search bar
        let searchBar = app.searchFields.firstMatch
        XCTAssertTrue(searchBar.waitForExistence(timeout: 5))
        searchBar.tap()

        // Type search query
        searchBar.typeText("AI")

        // Should see search results or no results message
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Results")).firstMatch.waitForExistence(timeout: 5))
    }

    // MARK: - Profile Tests
    func testProfileView() throws {
        completeOnboardingIfNeeded()

        // Navigate to Profile tab
        app.tabBars.buttons["Profile"].tap()

        // Should see profile elements
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Your Reading Stats"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Reading Preferences"].waitForExistence(timeout: 5))
    }

    func testEditProfile() throws {
        completeOnboardingIfNeeded()

        // Navigate to Profile tab
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))

        // Tap edit profile button
        app.buttons["Edit Profile"].tap()

        // Should see edit interface (to be implemented)
        // This test will need to be updated based on the actual edit profile implementation
    }

    func testSettingsNavigation() throws {
        completeOnboardingIfNeeded()

        // Navigate to Profile tab
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))

        // Tap settings button
        app.buttons["gearshape"].tap()

        // Should see settings view
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
    }

    // MARK: - Navigation Tests
    func testTabNavigation() throws {
        completeOnboardingIfNeeded()

        // Test all tabs are accessible
        app.tabBars.buttons["Pulse"].tap()
        XCTAssertTrue(app.navigationBars["Daily Pulse"].waitForExistence(timeout: 5))

        app.tabBars.buttons["Saved"].tap()
        XCTAssertTrue(app.navigationBars["Saved"].waitForExistence(timeout: 5))

        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 5))
    }

    func testBackNavigation() throws {
        completeOnboardingIfNeeded()

        // Navigate to a detail view
        app.scrollViews.otherElements.firstMatch.tap()
        sleep(1) // Wait for navigation

        // Try to navigate back (depending on navigation implementation)
        if app.navigationBars.buttons.firstMatch.exists {
            app.navigationBars.buttons.firstMatch.tap()
            XCTAssertTrue(app.navigationBars["Daily Pulse"].waitForExistence(timeout: 5))
        }
    }

    // MARK: - Accessibility Tests
    func testAccessibilityElements() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        // Test that major elements have accessibility labels
        let briefingCard = app.scrollViews.otherElements.firstMatch
        XCTAssertTrue(briefingCard.waitForExistence(timeout: 5))

        let saveButton = app.buttons["bookmark"].firstMatch
        XCTAssertTrue(saveButton.waitForExistence(timeout: 5))

        let shareButton = app.buttons["square.and.arrow.up"].firstMatch
        XCTAssertTrue(shareButton.waitForExistence(timeout: 5))

        // Test VoiceOver support if enabled
        // This would require enabling VoiceOver in the test device
    }

    func testAccessibilityWithVoiceOver() throws {
        // This test requires VoiceOver to be enabled
        // app.accessibilityActivate()
        // Test that VoiceOver navigation works properly
    }

    // MARK: - Performance Tests
    func testAppLaunchPerformance() throws {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            app.launch()
            completeOnboardingIfNeeded()
        }
    }

    func testScrollPerformance() throws {
        completeOnboardingIfNeeded()
        waitForBriefingsToLoad()

        let scrollView = app.scrollViews.firstMatch
        XCTAssertTrue(scrollView.waitForExistence(timeout: 5))

        measure(metrics: [XCTScrollMetric()]) {
            scrollView.swipeUp()
            scrollView.swipeDown()
        }
    }

    // MARK: - Helper Methods
    private func completeOnboardingIfNeeded() {
        if app.staticTexts["Welcome to PulseX"].exists {
            navigateThroughOnboarding()
        }
    }

    private func navigateThroughOnboarding() {
        // Continue through onboarding pages
        for _ in 0..<4 {
            if app.buttons["Continue"].exists {
                app.buttons["Continue"].tap()
            } else if app.buttons["Get Started"].exists {
                app.buttons["Get Started"].tap()
                break
            }
            sleep(1)
        }
    }

    private func waitForBriefingsToLoad() {
        let briefingCard = app.scrollViews.otherElements.firstMatch
        XCTAssertTrue(briefingCard.waitForExistence(timeout: 10))
    }

    private func saveFirstBriefing() {
        waitForBriefingsToLoad()

        let saveButton = app.buttons["bookmark"].firstMatch
        if saveButton.waitForExistence(timeout: 5) {
            saveButton.tap()
            sleep(1) // Wait for save animation
        }
    }
}