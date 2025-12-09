import SwiftUI

// MARK: - Briefing Card
struct BriefingCard: View {
    let briefing: Briefing
    let onTap: () -> Void
    let onSave: () -> Void
    let onShare: () -> Void
    let onFeedback: (String) -> Void

    @State private var isPressed = false
    @State private var showFeedbackSheet = false
    @State private var showingFullContent = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header with category and read time
            headerView

            // Main content
            contentView

            // Footer with actions
            footerView
        }
        .background(ThemeManager.shared.cardBackground)
        .cornerRadius(DesignTokens.BorderRadius.radiusLarge)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.BorderRadius.radiusLarge)
                .stroke(ThemeManager.shared.border, lineWidth: 1)
        )
        .shadow(color: ThemeManager.shared.shadow, radius: 4, x: 0, y: 2)
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .animation(DesignTokens.Animations.spring, value: isPressed)
        .onTapGesture {
            onTap()
        }
        .onLongPressGesture(
            minimumDuration: 0,
            maximumDistance: .infinity,
            pressing: { pressing in
                isPressed = pressing
            },
            perform: {}
        )
        .sheet(isPresented: $showFeedbackSheet) {
            FeedbackSheet(
                briefingId: briefing.id ?? UUID(),
                onFeedback: onFeedback
            )
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Briefing: \(briefing.headline)")
        .accessibilityHint("Tap to read full briefing")
    }

    // MARK: - Header View
    private var headerView: some View {
        HStack {
            // Category badge
            CategoryBadge(category: briefing.category)

            Spacer()

            // Read time indicator
            ReadTimeIndicator(readTime: Int(briefing.readTime))
        }
        .padding(DesignTokens.Spacing.cardPadding)
    }

    // MARK: - Content View
    private var contentView: some View {
        VStack(alignment: .leading, spacing: DesignTokens.Spacing.medium) {
            // Headline
            Text(briefing.headline)
                .font(.pulsexHeadline)
                .foregroundColor(ThemeManager.shared.textPrimary)
                .lineLimit(showingFullContent ? nil : 2)
                .multilineTextAlignment(.leading)

            // Image (if available)
            if let imageUrl = briefing.imageUrl, !imageUrl.isEmpty {
                AsyncImage(url: URL(string: imageUrl)) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Rectangle()
                        .fill(ThemeManager.shared.surfaceVariant)
                        .overlay(
                            Image(systemName: "photo")
                                .foregroundColor(ThemeManager.shared.textTertiary)
                        )
                }
                .frame(height: 180)
                .clipped()
                .cornerRadius(DesignTokens.BorderRadius.radiusSmall)
            }

            // Content preview
            Text(briefing.content)
                .font(.pulsexBody)
                .foregroundColor(ThemeManager.shared.textSecondary)
                .lineLimit(showingFullContent ? nil : 3)
                .multilineTextAlignment(.leading)

            // "Read more" button if content is truncated
            if !showingFullContent && briefing.content.count > 100 {
                Button("Read more") {
                    showingFullContent = true
                }
                .font(.pulsexCalloutSemibold)
                .foregroundColor(ThemeManager.shared.primary)
                .padding(.top, DesignTokens.Spacing.small)
            }
        }
        .padding(.horizontal, DesignTokens.Spacing.cardPadding)
        .padding(.bottom, DesignTokens.Spacing.medium)
    }

    // MARK: - Footer View
    private var footerView: some View {
        HStack {
            // Source
            if let source = briefing.source {
                Text(source)
                    .font(.pulsexCaption)
                    .foregroundColor(ThemeManager.shared.textTertiary)
            }

            Spacer()

            // Action buttons
            HStack(spacing: DesignTokens.Spacing.medium) {
                // Save button
                Button(action: onSave) {
                    Image(systemName: briefing.isSaved ? "bookmark.fill" : "bookmark")
                        .font(.system(size: DesignTokens.IconSizes.iconMedium))
                        .foregroundColor(briefing.isSaved ? ThemeManager.shared.primary : ThemeManager.shared.textTertiary)
                }
                .buttonStyle(PlainButtonStyle())
                .accessibilityLabel(briefing.isSaved ? "Remove from saved" : "Save briefing")

                // Share button
                Button(action: onShare) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: DesignTokens.IconSizes.iconMedium))
                        .foregroundColor(ThemeManager.shared.textTertiary)
                }
                .buttonStyle(PlainButtonStyle())
                .accessibilityLabel("Share briefing")

                // Feedback button
                Button(action: { showFeedbackSheet = true }) {
                    Image(systemName: "hand.thumbsup")
                        .font(.system(size: DesignTokens.IconSizes.iconMedium))
                        .foregroundColor(ThemeManager.shared.textTertiary)
                }
                .buttonStyle(PlainButtonStyle())
                .accessibilityLabel("Give feedback")
            }
        }
        .padding(DesignTokens.Spacing.cardPadding)
        .padding(.top, DesignTokens.Spacing.small)
    }
}

// MARK: - Category Badge
struct CategoryBadge: View {
    let category: String

    var body: some View {
        Text(category.capitalized)
            .font(.pulsexCaptionSemibold)
            .foregroundColor(categoryTextColor)
            .padding(.horizontal, DesignTokens.Spacing.small)
            .padding(.vertical, DesignTokens.Spacing.xSmall)
            .background(categoryBackgroundColor)
            .cornerRadius(DesignTokens.BorderRadius.radiusSmall)
    }

    private var categoryTextColor: Color {
        switch category.lowercased() {
        case "technology", "tech":
            return ThemeManager.shared.onPrimary
        case "business":
            return ThemeManager.shared.onSecondary
        case "health":
            return ThemeManager.shared.onPrimary
        case "science":
            return ThemeManager.shared.onSecondary
        case "politics":
            return ThemeManager.shared.onPrimary
        default:
            return ThemeManager.shared.textPrimary
        }
    }

    private var categoryBackgroundColor: Color {
        switch category.lowercased() {
        case "technology", "tech":
            return ThemeManager.shared.primary
        case "business":
            return ThemeManager.shared.secondary
        case "health":
            return DesignTokens.Colors.success
        case "science":
            return DesignTokens.Colors.brandOrange
        case "politics":
            return DesignTokens.Colors.mediumBlue
        default:
            return ThemeManager.shared.surface
        }
    }
}

// MARK: - Read Time Indicator
struct ReadTimeIndicator: View {
    let readTime: Int

    var body: some View {
        HStack(spacing: DesignTokens.Spacing.xSmall) {
            Image(systemName: "clock")
                .font(.system(size: DesignTokens.IconSizes.iconSmall))
                .foregroundColor(ThemeManager.shared.textTertiary)

            Text("\(readTime)s")
                .font(.pulsexCaption)
                .foregroundColor(ThemeManager.shared.textTertiary)
        }
    }
}

// MARK: - Compact Briefing Card (for saved items)
struct CompactBriefingCard: View {
    let briefing: Briefing
    let onTap: () -> Void
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: DesignTokens.Spacing.medium) {
            // Content
            VStack(alignment: .leading, spacing: DesignTokens.Spacing.xSmall) {
                Text(briefing.headline)
                    .font(.pulsexBodySemibold)
                    .foregroundColor(ThemeManager.shared.textPrimary)
                    .lineLimit(2)

                HStack {
                    CategoryBadge(category: briefing.category)
                    Spacer()
                    ReadTimeIndicator(readTime: Int(briefing.readTime))
                }
            }

            Spacer()

            // Remove button
            Button(action: onRemove) {
                Image(systemName: "trash")
                    .font(.system(size: DesignTokens.IconSizes.iconMedium))
                    .foregroundColor(DesignTokens.Colors.error)
            }
            .buttonStyle(PlainButtonStyle())
        }
        .padding(DesignTokens.Spacing.cardPadding)
        .background(ThemeManager.shared.cardBackground)
        .cornerRadius(DesignTokens.BorderRadius.radiusMedium)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.BorderRadius.radiusMedium)
                .stroke(ThemeManager.shared.border, lineWidth: 1)
        )
        .onTapGesture {
            onTap()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Saved briefing: \(briefing.headline)")
        .accessibilityHint("Tap to read, swipe to remove")
    }
}

// MARK: - Preview
struct BriefingCard_Previews: PreviewProvider {
    static var previews: some View {
        let sampleBriefing = createSampleBriefing()

        VStack(spacing: DesignTokens.Spacing.large) {
            // Full briefing card
            BriefingCard(
                briefing: sampleBriefing,
                onTap: {},
                onSave: {},
                onShare: {},
                onFeedback: { _ in }
            )

            // Compact briefing card
            CompactBriefingCard(
                briefing: sampleBriefing,
                onTap: {},
                onRemove: {}
            )
        }
        .padding()
        .background(ThemeManager.shared.background)
    }

    private static func createSampleBriefing() -> Briefing {
        let context = PersistenceController.preview.container.viewContext
        let briefing = Briefing(context: context)
        briefing.id = UUID()
        briefing.headline = "Revolutionary AI Breakthrough: New Model Achieves Human-Level Understanding"
        briefing.content = "Scientists have announced a major breakthrough in artificial intelligence with the development of a new language model that demonstrates unprecedented understanding capabilities. The model shows remarkable performance across multiple benchmarks, bringing us closer to truly intelligent systems."
        briefing.category = "Technology"
        briefing.source = "Tech News Daily"
        briefing.readTime = 45
        briefing.isRead = false
        briefing.isSaved = false
        return briefing
    }
}