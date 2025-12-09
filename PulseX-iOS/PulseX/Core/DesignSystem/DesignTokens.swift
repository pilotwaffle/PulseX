import SwiftUI

// MARK: - Design Tokens
struct DesignTokens {

    // MARK: - Colors
    struct Colors {
        // Brand Colors
        static let brandNavy = Color(red: 0.09, green: 0.15, blue: 0.28) // #172447
        static let brandTeal = Color(red: 0.0, green: 0.78, blue: 0.81) // #00C7CE
        static let brandOrange = Color(red: 1.0, green: 0.45, blue: 0.0) // #FF7300
        static let brandLightTeal = Color(red: 0.78, green: 0.96, blue: 0.96) // #C7F5F5

        // Extended Palette
        static let deepBlue = Color(red: 0.05, green: 0.08, blue: 0.15) // #0C1427
        static let mediumBlue = Color(red: 0.13, green: 0.22, blue: 0.41) // #22386A
        static let lightGray = Color(red: 0.97, green: 0.97, blue: 0.98) // #F8F8FA
        static let mediumGray = Color(red: 0.51, green: 0.53, blue: 0.56) // #82878F
        static let darkGray = Color(red: 0.33, green: 0.35, blue: 0.38) // #545A64

        // Semantic Colors
        static let success = Color(red: 0.13, green: 0.69, blue: 0.29) // #21B049
        static let warning = Color(red: 1.0, green: 0.69, blue: 0.0) // #FFB000
        static let error = Color(red: 1.0, green: 0.27, blue: 0.23) // #FF453C

        // Text Colors
        static let textPrimary = Color.primary
        static let textSecondary = Color.secondary
        static let textTertiary = Color(red: 0.6, green: 0.6, blue: 0.6)

        // Background Colors
        static let backgroundPrimary = Color(UIColor.systemBackground)
        static let backgroundSecondary = Color(UIColor.secondarySystemBackground)
        static let backgroundTertiary = Color(UIColor.tertiarySystemBackground)
    }

    // MARK: - Typography
    struct Typography {
        // Font Sizes
        static let fontSizeXLarge: CGFloat = 32
        static let fontSizeLarge: CGFloat = 24
        static let fontSizeTitle: CGFloat = 20
        static let fontSizeHeadline: CGFloat = 18
        static let fontSizeBody: CGFloat = 16
        static let fontSizeCallout: CGFloat = 15
        static let fontSizeSubhead: CGFloat = 14
        static let fontSizeFootnote: CGFloat = 13
        static let fontSizeCaption: CGFloat = 12
        static let fontSizeCaption2: CGFloat = 11

        // Font Weights
        static let fontWeightBold = Font.Weight.bold
        static let fontWeightSemibold = Font.Weight.semibold
        static let fontWeightMedium = Font.Weight.medium
        static let fontWeightRegular = Font.Weight.regular
        static let fontWeightLight = Font.Weight.light

        // Line Heights
        static let lineHeightTight: CGFloat = 1.2
        static let lineHeightNormal: CGFloat = 1.4
        static let lineHeightRelaxed: CGFloat = 1.6

        // Letter Spacing
        static let letterSpacingTight: CGFloat = -0.5
        static let letterSpacingNormal: CGFloat = 0
        static let letterSpacingWide: CGFloat = 0.5
    }

    // MARK: - Spacing
    struct Spacing {
        static let spacingXSmall: CGFloat = 4
        static let spacingSmall: CGFloat = 8
        static let spacingMedium: CGFloat = 16
        static let spacingLarge: CGFloat = 24
        static let spacingXLarge: CGFloat = 32
        static let spacingXXLarge: CGFloat = 48
        static let spacingXXXLarge: CGFloat = 64

        // Component-specific spacing
        static let cardPadding: CGFloat = 16
        static let cardSpacing: CGFloat = 12
        static let sectionSpacing: CGFloat = 24
        static let iconTextSpacing: CGFloat = 8
    }

    // MARK: - Border Radius
    struct BorderRadius {
        static let radiusXSmall: CGFloat = 4
        static let radiusSmall: CGFloat = 8
        static let radiusMedium: CGFloat = 12
        static let radiusLarge: CGFloat = 16
        static let radiusXLarge: CGFloat = 20
        static let radiusXXLarge: CGFloat = 24
        static let radiusFull: CGFloat = 999
    }

    // MARK: - Shadows
    struct Shadows {
        static let shadowSmall = [
            .shadow(color: Colors.textTertiary.opacity(0.1), radius: 2, x: 0, y: 1)
        ]

        static let shadowMedium = [
            .shadow(color: Colors.textTertiary.opacity(0.15), radius: 4, x: 0, y: 2)
        ]

        static let shadowLarge = [
            .shadow(color: Colors.textTertiary.opacity(0.2), radius: 8, x: 0, y: 4)
        ]

        static let shadowCard = [
            .shadow(color: Colors.textTertiary.opacity(0.1), radius: 6, x: 0, y: 2),
            .shadow(color: Colors.textTertiary.opacity(0.05), radius: 12, x: 0, y: 4)
        ]
    }

    // MARK: - Animations
    struct Animations {
        static let durationQuick: Double = 0.15
        static let durationNormal: Double = 0.3
        static let durationSlow: Double = 0.5
        static let durationExtraSlow: Double = 0.8

        static let easeInOut = Animation.easeInOut(duration: durationNormal)
        static let easeOut = Animation.easeOut(duration: durationNormal)
        static let spring = Animation.spring(response: 0.5, dampingFraction: 0.8)
        static let springBouncy = Animation.spring(response: 0.4, dampingFraction: 0.6)
    }

    // MARK: - Icon Sizes
    struct IconSizes {
        static let iconXSmall: CGFloat = 12
        static let iconSmall: CGFloat = 16
        static let iconMedium: CGFloat = 20
        static let iconLarge: CGFloat = 24
        static let iconXLarge: CGFloat = 32
        static let iconXXLarge: CGFloat = 48
    }

    // MARK: - Touch Targets
    struct TouchTargets {
        static let touchTargetMinimum: CGFloat = 44
        static let touchTargetSmall: CGFloat = 32
        static let touchTargetLarge: CGFloat = 56
    }

    // MARK: - Z-Index Values
    struct ZIndex {
        static let background: CGFloat = 0
        static let content: CGFloat = 1
        static let overlay: CGFloat = 10
        static let modal: CGFloat = 100
        static let toast: CGFloat = 1000
    }
}

// MARK: - Color Extensions
extension Color {
    static let brandPrimary = DesignTokens.Colors.brandNavy
    static let brandAccent = DesignTokens.Colors.brandTeal
    static let brandHighlight = DesignTokens.Colors.brandOrange
    static let brandLightAccent = DesignTokens.Colors.brandLightTeal
}

// MARK: - Typography Extensions
extension Font {
    // Large Title
    static let pulsexLargeTitle = Font.system(size: DesignTokens.Typography.fontSizeXLarge, weight: .bold)

    // Title Styles
    static let pulsexTitle = Font.system(size: DesignTokens.Typography.fontSizeTitle, weight: .bold)
    static let pulsexTitle2 = Font.system(size: DesignTokens.Typography.fontSizeLarge, weight: .semibold)

    // Headline
    static let pulsexHeadline = Font.system(size: DesignTokens.Typography.fontSizeHeadline, weight: .semibold)
    static let pulsexHeadlineRegular = Font.system(size: DesignTokens.Typography.fontSizeHeadline, weight: .regular)

    // Body
    static let pulsexBody = Font.system(size: DesignTokens.Typography.fontSizeBody, weight: .regular)
    static let pulsexBodySemibold = Font.system(size: DesignTokens.Typography.fontSizeBody, weight: .semibold)

    // Callout
    static let pulsexCallout = Font.system(size: DesignTokens.Typography.fontSizeCallout, weight: .regular)
    static let pulsexCalloutSemibold = Font.system(size: DesignTokens.Typography.fontSizeCallout, weight: .semibold)

    // Caption
    static let pulsexCaption = Font.system(size: DesignTokens.Typography.fontSizeCaption, weight: .regular)
    static let pulsexCaptionSemibold = Font.system(size: DesignTokens.Typography.fontSizeCaption, weight: .semibold)
}