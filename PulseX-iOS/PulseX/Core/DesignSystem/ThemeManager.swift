import SwiftUI
import Combine

class ThemeManager: ObservableObject {
    static let shared = ThemeManager()

    @Published var currentTheme: Theme = .system
    @Published var isDarkMode: Bool = false

    private let userDefaults = UserDefaults.standard
    private let themeKey = "selectedTheme"

    // MARK: - Theme Options
    enum Theme: String, CaseIterable {
        case light = "light"
        case dark = "dark"
        case system = "system"

        var displayName: String {
            switch self {
            case .light:
                return "Light"
            case .dark:
                return "Dark"
            case .system:
                return "System"
            }
        }

        var icon: String {
            switch self {
            case .light:
                return "sun.max.fill"
            case .dark:
                return "moon.fill"
            case .system:
                return "circle.lefthalf.filled"
            }
        }
    }

    // MARK: - Color Schemes
    struct ColorScheme {
        let background: Color
        let surface: Color
        let surfaceVariant: Color
        let primary: Color
        let onPrimary: Color
        let secondary: Color
        let onSecondary: Color
        let textPrimary: Color
        let textSecondary: Color
        let textTertiary: Color
        let border: Color
        let shadow: Color
        let cardBackground: Color
        let overlay: Color
    }

    // MARK: - Light Theme
    static let lightScheme = ColorScheme(
        background: Color(red: 1.0, green: 1.0, blue: 1.0),
        surface: Color(red: 0.97, green: 0.97, blue: 0.98),
        surfaceVariant: Color(red: 0.93, green: 0.94, blue: 0.96),
        primary: DesignTokens.Colors.brandNavy,
        onPrimary: Color.white,
        secondary: DesignTokens.Colors.brandTeal,
        onSecondary: Color.white,
        textPrimary: DesignTokens.Colors.darkGray,
        textSecondary: DesignTokens.Colors.mediumGray,
        textTertiary: DesignTokens.Colors.textTertiary,
        border: Color(red: 0.85, green: 0.85, blue: 0.87),
        shadow: Color.black.opacity(0.1),
        cardBackground: Color.white,
        overlay: Color.black.opacity(0.4)
    )

    // MARK: - Dark Theme
    static let darkScheme = ColorScheme(
        background: DesignTokens.Colors.deepBlue,
        surface: DesignTokens.Colors.brandNavy,
        surfaceVariant: Color(red: 0.15, green: 0.22, blue: 0.41),
        primary: DesignTokens.Colors.brandTeal,
        onPrimary: DesignTokens.Colors.deepBlue,
        secondary: DesignTokens.Colors.brandOrange,
        onSecondary: Color.white,
        textPrimary: Color(red: 0.95, green: 0.95, blue: 0.97),
        textSecondary: Color(red: 0.75, green: 0.77, blue: 0.82),
        textTertiary: Color(red: 0.55, green: 0.57, blue: 0.62),
        border: Color(red: 0.25, green: 0.30, blue: 0.45),
        shadow: Color.black.opacity(0.3),
        cardBackground: Color(red: 0.12, green: 0.18, blue: 0.35),
        overlay: Color.black.opacity(0.6)
    )

    private init() {
        loadTheme()
        setupThemeObserver()
    }

    // MARK: - Theme Management
    func setTheme(_ theme: Theme) {
        currentTheme = theme
        userDefaults.set(theme.rawValue, forKey: themeKey)
        updateDarkModeState()
    }

    private func loadTheme() {
        if let savedTheme = userDefaults.string(forKey: themeKey),
           let theme = Theme(rawValue: savedTheme) {
            currentTheme = theme
        }
        updateDarkModeState()
    }

    private func setupThemeObserver() {
        NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)
            .sink { [weak self] _ in
                self?.updateDarkModeState()
            }
            .store(in: &cancellables)
    }

    private var cancellables = Set<AnyCancellable>()

    private func updateDarkModeState() {
        switch currentTheme {
        case .light:
            isDarkMode = false
        case .dark:
            isDarkMode = true
        case .system:
            isDarkMode = UITraitCollection.current.userInterfaceStyle == .dark
        }
    }

    // MARK: - Color Access
    var colorScheme: ColorScheme {
        isDarkMode ? Self.darkScheme : Self.lightScheme
    }

    // MARK: - Convenient Color Access
    var background: Color { colorScheme.background }
    var surface: Color { colorScheme.surface }
    var surfaceVariant: Color { colorScheme.surfaceVariant }
    var primary: Color { colorScheme.primary }
    var onPrimary: Color { colorScheme.onPrimary }
    var secondary: Color { colorScheme.secondary }
    var onSecondary: Color { colorScheme.onSecondary }
    var textPrimary: Color { colorScheme.textPrimary }
    var textSecondary: Color { colorScheme.textSecondary }
    var textTertiary: Color { colorScheme.textTertiary }
    var border: Color { colorScheme.border }
    var shadow: Color { colorScheme.shadow }
    var cardBackground: Color { colorScheme.cardBackground }
    var overlay: Color { colorScheme.overlay }
}

// MARK: - SwiftUI View Extensions
extension View {
    func pulsexTheme() -> some View {
        self.environment(\.colorScheme, ThemeManager.shared.isDarkMode ? .dark : .light)
    }

    func pulsexBackground() -> some View {
        self.background(ThemeManager.shared.background)
            .foregroundColor(ThemeManager.shared.textPrimary)
    }

    func pulsexCard() -> some View {
        self.background(ThemeManager.shared.cardBackground)
            .cornerRadius(DesignTokens.BorderRadius.radiusMedium)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.BorderRadius.radiusMedium)
                    .stroke(ThemeManager.shared.border, lineWidth: 1)
            )
    }

    func pulsexShadow() -> some View {
        self.shadow(color: ThemeManager.shared.shadow, radius: 4, x: 0, y: 2)
    }
}

// MARK: - UIColor Extensions for UIKit Integration
extension UIColor {
    static let pulsexBackground = UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ?
        UIColor(ThemeManager.darkScheme.background) :
        UIColor(ThemeManager.lightScheme.background)
    }

    static let pulsexSurface = UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ?
        UIColor(ThemeManager.darkScheme.surface) :
        UIColor(ThemeManager.lightScheme.surface)
    }

    static let pulsexPrimary = UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ?
        UIColor(ThemeManager.darkScheme.primary) :
        UIColor(ThemeManager.lightScheme.primary)
    }

    static let pulsexTextPrimary = UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ?
        UIColor(ThemeManager.darkScheme.textPrimary) :
        UIColor(ThemeManager.lightScheme.textPrimary)
    }
}