import Foundation

// MARK: - Briefing DTO
struct BriefingDTO: Codable, Identifiable {
    let id: UUID
    let headline: String
    let content: String
    let category: String
    let source: String?
    let imageUrl: String?
    let readTime: Int
    let priority: Int
    let tags: [String]
    let timestamp: Date
    let isRead: Bool
    let isSaved: Bool

    enum CodingKeys: String, CodingKey {
        case id, headline, content, category, source
        case imageUrl = "image_url"
        case readTime = "read_time"
        case priority, tags, timestamp
        case isRead = "is_read"
        case isSaved = "is_saved"
    }

    // Core Data conversion
    func toCoreDataEntity(in context: NSManagedObjectContext) -> Briefing {
        let briefing = Briefing(context: context)
        briefing.id = id
        briefing.headline = headline
        briefing.content = content
        briefing.category = category
        briefing.source = source
        briefing.imageUrl = imageUrl
        briefing.readTime = Int16(readTime)
        briefing.priority = Int16(priority)
        briefing.tags = tags
        briefing.timestamp = timestamp
        briefing.isRead = isRead
        briefing.isSaved = isSaved
        return briefing
    }
}

// MARK: - Feedback DTO
struct FeedbackDTO: Codable {
    let id: UUID
    let briefingId: UUID
    let type: String
    let emojiReaction: String?
    let textFeedback: String?
    let submittedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case briefingId = "briefing_id"
        case type
        case emojiReaction = "emoji_reaction"
        case textFeedback = "text_feedback"
        case submittedAt = "submitted_at"
    }

    init(briefingId: UUID, type: String, emojiReaction: String? = nil, textFeedback: String? = nil) {
        self.id = UUID()
        self.briefingId = briefingId
        self.type = type
        self.emojiReaction = emojiReaction
        self.textFeedback = textFeedback
        self.submittedAt = Date()
    }

    // Core Data conversion
    func toCoreDataEntity(in context: NSManagedObjectContext) -> Feedback {
        let feedback = Feedback(context: context)
        feedback.id = id
        feedback.type = type
        feedback.emojiReaction = emojiReaction
        feedback.textFeedback = textFeedback
        feedback.submittedAt = submittedAt
        return feedback
    }
}

// MARK: - Saved Card DTO
struct SavedCardDTO: Codable {
    let id: UUID
    let briefingId: UUID
    let headline: String
    let category: String?
    let source: String?
    let imageUrl: String?
    let savedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case briefingId = "briefing_id"
        case headline, category, source
        case imageUrl = "image_url"
        case savedAt = "saved_at"
    }

    init(briefingId: UUID, headline: String, category: String? = nil, source: String? = nil, imageUrl: String? = nil) {
        self.id = UUID()
        self.briefingId = briefingId
        self.headline = headline
        self.category = category
        self.source = source
        self.imageUrl = imageUrl
        self.savedAt = Date()
    }

    // Core Data conversion
    func toCoreDataEntity(in context: NSManagedObjectContext) -> SavedCard {
        let savedCard = SavedCard(context: context)
        savedCard.id = id
        savedCard.briefingId = briefingId
        savedCard.headline = headline
        savedCard.category = category
        savedCard.source = source
        savedCard.imageUrl = imageUrl
        savedCard.savedAt = savedAt
        return savedCard
    }
}

// MARK: - User DTO
struct UserDTO: Codable {
    let id: UUID
    let name: String?
    let email: String?
    let profileImage: String?
    let preferredCategories: [String]
    let isOnboarded: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, email
        case profileImage = "profile_image"
        case preferredCategories = "preferred_categories"
        case isOnboarded = "is_onboarded"
    }

    // Core Data conversion
    func toCoreDataEntity(in context: NSManagedObjectContext) -> User {
        let user = User(context: context)
        user.id = id
        user.name = name
        user.email = email
        user.profileImage = profileImage
        user.preferredCategories = preferredCategories
        user.isOnboarded = isOnboarded
        return user
    }
}

// MARK: - User Preferences DTO
struct UserPreferencesDTO: Codable {
    let preferredCategories: [String]
    let notificationSettings: NotificationSettingsDTO
    let readingPreferences: ReadingPreferencesDTO

    struct NotificationSettingsDTO: Codable {
        let dailyReminder: Bool
        let weeklyDigest: Bool
        let breakingNews: Bool

        enum CodingKeys: String, CodingKey {
            case dailyReminder = "daily_reminder"
            case weeklyDigest = "weekly_digest"
            case breakingNews = "breaking_news"
        }
    }

    struct ReadingPreferencesDTO: Codable {
        let fontSize: String
        let theme: String
        let autoPlayVideos: Bool

        enum CodingKeys: String, CodingKey {
            case fontSize = "font_size"
            case theme
            case autoPlayVideos = "auto_play_videos"
        }
    }

    enum CodingKeys: String, CodingKey {
        case preferredCategories = "preferred_categories"
        case notificationSettings = "notification_settings"
        case readingPreferences = "reading_preferences"
    }
}

// MARK: - Notification DTO
struct NotificationDTO: Codable, Identifiable {
    let id: UUID
    let title: String
    let body: String
    let category: String
    let imageUrl: String?
    let deepLink: String?
    let timestamp: Date
    let isRead: Bool

    enum CodingKeys: String, CodingKey {
        case id, title, body, category
        case imageUrl = "image_url"
        case deepLink = "deep_link"
        case timestamp
        case isRead = "is_read"
    }
}

// MARK: - API Request DTOs
struct OnboardingDTO: Codable {
    let preferredCategories: [String]
    let notificationSettings: UserPreferencesDTO.NotificationSettingsDTO
    let readingPreferences: UserPreferencesDTO.ReadingPreferencesDTO

    enum CodingKeys: String, CodingKey {
        case preferredCategories = "preferred_categories"
        case notificationSettings = "notification_settings"
        case readingPreferences = "reading_preferences"
    }
}

struct LoginDTO: Codable {
    let email: String
    let password: String
}

struct RegisterDTO: Codable {
    let name: String
    let email: String
    let password: String
}

// MARK: - Extensions for Core Data
import CoreData

extension BriefingDTO {
    init(from briefing: Briefing) {
        self.id = briefing.id ?? UUID()
        self.headline = briefing.headline
        self.content = briefing.content
        self.category = briefing.category
        self.source = briefing.source
        self.imageUrl = briefing.imageUrl
        self.readTime = Int(briefing.readTime)
        self.priority = Int(briefing.priority)
        self.tags = briefing.tags as? [String] ?? []
        self.timestamp = briefing.timestamp ?? Date()
        self.isRead = briefing.isRead
        self.isSaved = briefing.isSaved
    }
}

extension UserDTO {
    init(from user: User) {
        self.id = user.id ?? UUID()
        self.name = user.name
        self.email = user.email
        self.profileImage = user.profileImage
        self.preferredCategories = user.preferredCategories as? [String] ?? []
        self.isOnboarded = user.isOnboarded
    }
}