import SwiftUI

struct FeedbackSheet: View {
    let briefingId: UUID
    let onFeedback: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var selectedEmoji: String? = nil
    @State private var textFeedback = ""
    @State private var isSubmitting = false

    private let emojis = ["👍", "❤️", "😂", "🤔", "😮", "😕"]
    private let feedbackTypes = ["positive", "love", "funny", "thoughtful", "surprised", "disappointed"]

    var body: some View {
        NavigationView {
            VStack(spacing: DesignTokens.Spacing.large) {
                // Header
                VStack(spacing: DesignTokens.Spacing.medium) {
                    Image(systemName: "hand.thumbsup.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(ThemeManager.shared.primary)

                    Text("How did you feel about this briefing?")
                        .font(.pulsexHeadline)
                        .foregroundColor(ThemeManager.shared.textPrimary)
                        .multilineTextAlignment(.center)

                    Text("Your feedback helps us improve your daily pulse")
                        .font(.pulsexBody)
                        .foregroundColor(ThemeManager.shared.textSecondary)
                        .multilineTextAlignment(.center)
                }

                // Emoji reactions
                VStack(spacing: DesignTokens.Spacing.medium) {
                    Text("Quick Reaction")
                        .font(.pulsexCalloutSemibold)
                        .foregroundColor(ThemeManager.shared.textSecondary)

                    HStack(spacing: DesignTokens.Spacing.medium) {
                        ForEach(Array(emojis.enumerated()), id: \.offset) { index, emoji in
                            FeedbackButton(
                                emoji: emoji,
                                isSelected: selectedEmoji == emoji,
                                action: {
                                    selectedEmoji = emoji
                                }
                            )
                        }
                    }
                }

                // Text feedback
                VStack(alignment: .leading, spacing: DesignTokens.Spacing.small) {
                    Text("Additional Feedback (Optional)")
                        .font(.pulsexCalloutSemibold)
                        .foregroundColor(ThemeManager.shared.textSecondary)

                    TextEditor(text: $textFeedback)
                        .font(.pulsexBody)
                        .foregroundColor(ThemeManager.shared.textPrimary)
                        .padding(DesignTokens.Spacing.small)
                        .background(ThemeManager.shared.surface)
                        .cornerRadius(DesignTokens.BorderRadius.radiusMedium)
                        .overlay(
                            RoundedRectangle(cornerRadius: DesignTokens.BorderRadius.radiusMedium)
                                .stroke(ThemeManager.shared.border, lineWidth: 1)
                        )
                        .frame(minHeight: 100)

                    Text("\(textFeedback.count)/500 characters")
                        .font(.pulsexCaption)
                        .foregroundColor(textFeedback.count > 500 ? DesignTokens.Colors.error : ThemeManager.shared.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }

                Spacer()

                // Action buttons
                VStack(spacing: DesignTokens.Spacing.medium) {
                    PrimaryButton(
                        title: "Submit Feedback",
                        action: submitFeedback,
                        isLoading: isSubmitting,
                        isDisabled: selectedEmoji == nil && textFeedback.isEmpty,
                        style: .primary,
                        size: .large
                    )

                    Button("Cancel") {
                        dismiss()
                    }
                    .font(.pulsexCallout)
                    .foregroundColor(ThemeManager.shared.textTertiary)
                }
            }
            .padding()
            .navigationTitle("Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(ThemeManager.shared.primary)
                }
            }
        }
        .pulsexTheme()
    }

    private func submitFeedback() {
        isSubmitting = true

        // Determine feedback type based on emoji
        var feedbackType = "neutral"
        if let selectedEmoji = selectedEmoji,
           let index = emojis.firstIndex(of: selectedEmoji) {
            feedbackType = feedbackTypes[index]
        }

        // Submit feedback
        onFeedback(feedbackType)

        // Track analytics
        AnalyticsManager.shared.trackEvent(.feedbackSubmitted, properties: [
            "feedback_type": feedbackType,
            "has_text": !textFeedback.isEmpty,
            "briefing_id": briefingId.uuidString
        ])

        // Dismiss after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isSubmitting = false
            dismiss()
        }
    }
}

// MARK: - Filter Sheet
struct FilterSheet: View {
    @Binding var selectedCategory: String?
    @Environment(\.dismiss) private var dismiss

    let onApply: (String?) -> Void

    private let categories = ["All", "Technology", "Business", "Health", "Science", "Politics", "Sports", "Entertainment"]

    var body: some View {
        NavigationView {
            VStack(spacing: DesignTokens.Spacing.large) {
                // Header
                VStack(spacing: DesignTokens.Spacing.medium) {
                    Text("Filter Briefings")
                        .font(.pulsexHeadline)
                        .foregroundColor(ThemeManager.shared.textPrimary)

                    Text("Choose categories to focus on what matters to you")
                        .font(.pulsexBody)
                        .foregroundColor(ThemeManager.shared.textSecondary)
                        .multilineTextAlignment(.center)
                }

                // Category selection
                VStack(alignment: .leading, spacing: DesignTokens.Spacing.medium) {
                    Text("Categories")
                        .font(.pulsexCalloutSemibold)
                        .foregroundColor(ThemeManager.shared.textSecondary)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 2), spacing: DesignTokens.Spacing.small) {
                        ForEach(categories, id: \.self) { category in
                            CategoryChip(
                                category: category,
                                isSelected: selectedCategory == category || (selectedCategory == nil && category == "All"),
                                onTap: {
                                    selectedCategory = (category == "All") ? nil : category
                                }
                            )
                        }
                    }
                }

                Spacer()

                // Action buttons
                VStack(spacing: DesignTokens.Spacing.medium) {
                    PrimaryButton(
                        title: "Apply Filter",
                        action: {
                            onApply(selectedCategory)
                            dismiss()
                        },
                        style: .primary,
                        size: .medium
                    )

                    Button("Clear Filter") {
                        selectedCategory = nil
                        onApply(nil)
                        dismiss()
                    }
                    .font(.pulsexCallout)
                    .foregroundColor(ThemeManager.shared.textTertiary)
                }
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(ThemeManager.shared.primary)
                }
            }
        }
        .pulsexTheme()
    }
}

// MARK: - Preview
struct FeedbackSheet_Previews: PreviewProvider {
    static var previews: some View {
        FeedbackSheet(briefingId: UUID()) { _ in }
    }
}