import SwiftUI

// MARK: - Primary Button
struct PrimaryButton: View {
    let title: String
    let action: () -> Void
    let isLoading: Bool
    let isDisabled: Bool
    let style: ButtonStyle
    let size: ButtonSize
    let icon: String?

    init(
        title: String,
        action: @escaping () -> Void,
        isLoading: Bool = false,
        isDisabled: Bool = false,
        style: ButtonStyle = .primary,
        size: ButtonSize = .medium,
        icon: String? = nil
    ) {
        self.title = title
        self.action = action
        self.isLoading = isLoading
        self.isDisabled = isDisabled
        self.style = style
        self.size = size
        self.icon = icon
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: DesignTokens.Spacing.iconTextSpacing) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: textColor))
                        .scaleEffect(0.8)
                } else if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: iconSize, weight: .semibold))
                }

                Text(title)
                    .font(font)
                    .lineLimit(1)
            }
            .foregroundColor(textColor)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(backgroundColor)
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(borderColor, lineWidth: borderWidth)
            )
        }
        .disabled(isDisabled || isLoading)
        .opacity(isDisabled || isLoading ? 0.6 : 1)
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Computed Properties
    private var font: Font {
        switch size {
        case .small:
            return .pulsexCalloutSemibold
        case .medium:
            return .pulsexBodySemibold
        case .large:
            return .pulsexCalloutSemibold
        }
    }

    private var height: CGFloat {
        switch size {
        case .small:
            return DesignTokens.TouchTargets.touchTargetSmall
        case .medium:
            return DesignTokens.TouchTargets.touchTargetMinimum
        case .large:
            return DesignTokens.TouchTargets.touchTargetLarge
        }
    }

    private var cornerRadius: CGFloat {
        switch size {
        case .small:
            return DesignTokens.BorderRadius.radiusSmall
        case .medium, .large:
            return DesignTokens.BorderRadius.radiusMedium
        }
    }

    private var iconSize: CGFloat {
        switch size {
        case .small:
            return DesignTokens.IconSizes.iconSmall
        case .medium:
            return DesignTokens.IconSizes.iconMedium
        case .large:
            return DesignTokens.IconSizes.iconLarge
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .primary:
            return isDisabled ? ThemeManager.shared.textTertiary : ThemeManager.shared.primary
        case .secondary:
            return Color.clear
        case .outline:
            return Color.clear
        }
    }

    private var textColor: Color {
        switch style {
        case .primary:
            return ThemeManager.shared.onPrimary
        case .secondary:
            return ThemeManager.shared.primary
        case .outline:
            return ThemeManager.shared.primary
        }
    }

    private var borderColor: Color {
        switch style {
        case .primary:
            return Color.clear
        case .secondary:
            return Color.clear
        case .outline:
            return ThemeManager.shared.border
        }
    }

    private var borderWidth: CGFloat {
        switch style {
        case .primary, .secondary:
            return 0
        case .outline:
            return 1
        }
    }

    // MARK: - Enums
    enum ButtonStyle {
        case primary
        case secondary
        case outline
    }

    enum ButtonSize {
        case small
        case medium
        case large
    }
}

// MARK: - Feedback Button
struct FeedbackButton: View {
    let emoji: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(emoji)
                .font(.system(size: 28))
                .frame(width: 56, height: 56)
                .background(
                    Circle()
                        .fill(isSelected ? ThemeManager.shared.primary : ThemeManager.shared.surface)
                        .overlay(
                            Circle()
                                .stroke(
                                    isSelected ? ThemeManager.shared.primary : ThemeManager.shared.border,
                                    lineWidth: isSelected ? 0 : 1
                                )
                        )
                )
                .scaleEffect(isSelected ? 1.1 : 1.0)
                .animation(DesignTokens.Animations.spring, value: isSelected)
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("Feedback reaction: \(emoji)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - Floating Action Button
struct FloatingActionButton: View {
    let icon: String
    let action: () -> Void
    let isVisible: Bool

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: DesignTokens.IconSizes.iconMedium, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 56, height: 56)
                .background(
                    Circle()
                        .fill(ThemeManager.shared.primary)
                        .shadow(color: ThemeManager.shared.shadow, radius: 8, x: 0, y: 4)
                )
        }
        .buttonStyle(PlainButtonStyle())
        .offset(y: isVisible ? 0 : 100)
        .opacity(isVisible ? 1 : 0)
        .animation(DesignTokens.Animations.easeOut, value: isVisible)
    }
}

// MARK: - Icon Button
struct IconButton: View {
    let icon: String
    let action: () -> Void
    let size: IconButtonSize
    let color: Color?

    init(
        icon: String,
        action: @escaping () -> Void,
        size: IconButtonSize = .medium,
        color: Color? = nil
    ) {
        self.icon = icon
        self.action = action
        self.size = size
        self.color = color
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: iconSize, weight: .medium))
                .foregroundColor(iconColor)
                .frame(width: touchTargetSize, height: touchTargetSize)
                .background(backgroundColor)
                .cornerRadius(cornerRadius)
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var iconSize: CGFloat {
        switch size {
        case .small:
            return DesignTokens.IconSizes.iconSmall
        case .medium:
            return DesignTokens.IconSizes.iconMedium
        case .large:
            return DesignTokens.IconSizes.iconLarge
        }
    }

    private var touchTargetSize: CGFloat {
        switch size {
        case .small, .medium:
            return DesignTokens.TouchTargets.touchTargetMinimum
        case .large:
            return DesignTokens.TouchTargets.touchTargetLarge
        }
    }

    private var cornerRadius: CGFloat {
        size == .large ? DesignTokens.BorderRadius.radiusMedium : DesignTokens.BorderRadius.radiusSmall
    }

    private var iconColor: Color {
        color ?? ThemeManager.shared.primary
    }

    private var backgroundColor: Color {
        size == .large ? ThemeManager.shared.surface : Color.clear
    }

    enum IconButtonSize {
        case small
        case medium
        case large
    }
}

// MARK: - Preview
struct PrimaryButton_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: DesignTokens.Spacing.medium) {
            // Primary Button Variants
            PrimaryButton(
                title: "Get Started",
                action: {},
                style: .primary,
                size: .medium
            )

            PrimaryButton(
                title: "Loading",
                action: {},
                isLoading: true,
                style: .primary,
                size: .medium
            )

            PrimaryButton(
                title: "Disabled",
                action: {},
                isDisabled: true,
                style: .primary,
                size: .medium
            )

            // Secondary Button
            PrimaryButton(
                title: "Learn More",
                action: {},
                style: .secondary,
                size: .medium
            )

            // Outline Button
            PrimaryButton(
                title: "Skip",
                action: {},
                style: .outline,
                size: .medium
            )

            // Small Button
            PrimaryButton(
                title: "OK",
                action: {},
                style: .primary,
                size: .small
            )

            // Large Button
            PrimaryButton(
                title: "Continue",
                action: {},
                style: .primary,
                size: .large
            )

            // Button with Icon
            PrimaryButton(
                title: "Save",
                action: {},
                style: .primary,
                size: .medium,
                icon: "bookmark.fill"
            )

            // Feedback Buttons
            HStack(spacing: DesignTokens.Spacing.medium) {
                FeedbackButton(emoji: "👍", isSelected: false, action: {})
                FeedbackButton(emoji: "❤️", isSelected: true, action: {})
                FeedbackButton(emoji: "😂", isSelected: false, action: {})
                FeedbackButton(emoji: "🤔", isSelected: false, action: {})
            }

            // Icon Buttons
            HStack(spacing: DesignTokens.Spacing.medium) {
                IconButton(icon: "bookmark", action: {}, size: .medium)
                IconButton(icon: "share", action: {}, size: .medium)
                IconButton(icon: "heart.fill", action: {}, size: .large)
            }
        }
        .padding()
        .background(ThemeManager.shared.background)
    }
}