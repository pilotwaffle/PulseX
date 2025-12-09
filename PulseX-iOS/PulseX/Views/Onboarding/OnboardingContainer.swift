import SwiftUI

struct OnboardingContainer: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = OnboardingViewModel()
    @State private var currentPage = 0

    var body: some View {
        ZStack {
            // Gradient background
            LinearGradient(
                gradient: Gradient(colors: [
                    ThemeManager.shared.background,
                    ThemeManager.shared.surface
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Progress indicator
                OnboardingProgressView(
                    currentPage: currentPage,
                    totalPages: viewModel.totalPages
                )
                .padding(.top, DesignTokens.Spacing.large)

                // Content
                TabView(selection: $currentPage) {
                    ForEach(0..<viewModel.totalPages, id: \.self) { index in
                        OnboardingPageView(
                            page: viewModel.pages[index],
                            isLastPage: index == viewModel.totalPages - 1,
                            onNext: {
                                withAnimation(DesignTokens.Animations.easeInOut) {
                                    if currentPage < viewModel.totalPages - 1 {
                                        currentPage += 1
                                    } else {
                                        completeOnboarding()
                                    }
                                }
                            },
                            onSkip: {
                                completeOnboarding()
                            }
                        )
                        .tag(index)
                    }
                }
                .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
                .animation(DesignTokens.Animations.easeInOut, value: currentPage)

                Spacer()
            }
        }
        .pulsexTheme()
        .navigationBarHidden(true)
        .statusBarHidden()
    }

    private func completeOnboarding() {
        viewModel.completeOnboarding()
        appState.completeOnboarding()
    }
}

// MARK: - Onboarding Progress View
struct OnboardingProgressView: View {
    let currentPage: Int
    let totalPages: Int

    var body: some View {
        HStack(spacing: DesignTokens.Spacing.xSmall) {
            ForEach(0..<totalPages, id: \.self) { index in
                Circle()
                    .fill(index <= currentPage ? ThemeManager.shared.primary : ThemeManager.shared.border)
                    .frame(width: 8, height: 8)
                    .animation(DesignTokens.Animations.easeInOut, value: currentPage)
            }
        }
    }
}

// MARK: - Onboarding Page View
struct OnboardingPageView: View {
    let page: OnboardingPage
    let isLastPage: Bool
    let onNext: () -> Void
    let onSkip: () -> Void

    @State private var isAnimating = false

    var body: some View {
        VStack(spacing: DesignTokens.Spacing.large) {
            Spacer()

            // Illustration
            pageIllustration
                .scaleEffect(isAnimating ? 1.0 : 0.8)
                .opacity(isAnimating ? 1.0 : 0.0)
                .animation(DesignTokens.Animations.springBouncy.delay(0.1), value: isAnimating)

            // Content
            VStack(spacing: DesignTokens.Spacing.medium) {
                Text(page.title)
                    .font(.pulsexTitle2)
                    .foregroundColor(ThemeManager.shared.textPrimary)
                    .multilineTextAlignment(.center)
                    .opacity(isAnimating ? 1.0 : 0.0)
                    .animation(DesignTokens.Animations.easeInOut.delay(0.2), value: isAnimating)

                Text(page.subtitle)
                    .font(.pulsexBody)
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .opacity(isAnimating ? 1.0 : 0.0)
                    .animation(DesignTokens.Animations.easeInOut.delay(0.3), value: isAnimating)
            }

            // Interactive content for specific pages
            if page.type == .categories {
                CategorySelectionView(selectedCategories: .constant([]))
                    .opacity(isAnimating ? 1.0 : 0.0)
                    .animation(DesignTokens.Animations.easeInOut.delay(0.4), value: isAnimating)
            } else if page.type == .notifications {
                NotificationPermissionView()
                    .opacity(isAnimating ? 1.0 : 0.0)
                    .animation(DesignTokens.Animations.easeInOut.delay(0.4), value: isAnimating)
            }

            Spacer()

            // Action buttons
            VStack(spacing: DesignTokens.Spacing.medium) {
                PrimaryButton(
                    title: isLastPage ? "Get Started" : "Continue",
                    action: onNext,
                    style: .primary,
                    size: .large,
                    icon: isLastPage ? "checkmark.circle.fill" : "arrow.right.circle.fill"
                )
                .opacity(isAnimating ? 1.0 : 0.0)
                .animation(DesignTokens.Animations.easeInOut.delay(0.5), value: isAnimating)

                if !isLastPage {
                    Button("Skip", action: onSkip)
                        .font(.pulsexCallout)
                        .foregroundColor(ThemeManager.shared.textTertiary)
                        .opacity(isAnimating ? 1.0 : 0.0)
                        .animation(DesignTokens.Animations.easeInOut.delay(0.6), value: isAnimating)
                }
            }
            .padding(.horizontal, DesignTokens.Spacing.large)
        }
        .padding(.horizontal, DesignTokens.Spacing.large)
        .onAppear {
            isAnimating = true
        }
    }

    // MARK: - Page Illustration
    @ViewBuilder
    private var pageIllustration: some View {
        switch page.type {
        case .welcome:
            WelcomeIllustration()
        case .categories:
            CategoriesIllustration()
        case .notifications:
            NotificationsIllustration()
        case .personalization:
            PersonalizationIllustration()
        }
    }
}

// MARK: - Illustrations
struct WelcomeIllustration: View {
    var body: some View {
        ZStack {
            // Background circle
            Circle()
                .fill(
                    LinearGradient(
                        gradient: Gradient(colors: [
                            ThemeManager.shared.primary.opacity(0.1),
                            ThemeManager.shared.secondary.opacity(0.1)
                        ]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 200)

            // Heart icon
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 80))
                .foregroundColor(ThemeManager.shared.primary)

            // Pulse rings
            ForEach(0..<3) { index in
                Circle()
                    .stroke(ThemeManager.shared.primary.opacity(0.3), lineWidth: 2)
                    .frame(width: 150 + CGFloat(index * 30), height: 150 + CGFloat(index * 30))
                    .scaleEffect(1.0 + CGFloat(index) * 0.1)
                    .opacity(1.0 - Double(index) * 0.3)
            }
            .animation(DesignTokens.Animations.easeOut.repeatForever(autoreverses: true), value: true)
        }
    }
}

struct CategoriesIllustration: View {
    var body: some View {
        VStack(spacing: DesignTokens.Spacing.medium) {
            HStack(spacing: DesignTokens.Spacing.small) {
                CategoryBubble(icon: "cpu", color: ThemeManager.shared.primary, size: .medium)
                CategoryBubble(icon: "briefcase.fill", color: ThemeManager.shared.secondary, size: .small)
                CategoryBubble(icon: "heart.fill", color: DesignTokens.Colors.success, size: .medium)
            }

            HStack(spacing: DesignTokens.Spacing.small) {
                CategoryBubble(icon: "lightbulb.fill", color: DesignTokens.Colors.brandOrange, size: .small)
                CategoryBubble(icon: "building.columns.fill", color: DesignTokens.Colors.mediumBlue, size: .large)
            }
        }
    }
}

struct NotificationsIllustration: View {
    var body: some View {
        ZStack {
            // Phone mockup
            RoundedRectangle(cornerRadius: 24)
                .fill(ThemeManager.shared.surface)
                .frame(width: 120, height: 240)
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(ThemeManager.shared.border, lineWidth: 2)
                )

            // Notification icons
            VStack(spacing: DesignTokens.Spacing.medium) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 20))
                    .foregroundColor(ThemeManager.shared.primary)

                Image(systemName: "app.badge")
                    .font(.system(size: 16))
                    .foregroundColor(ThemeManager.shared.secondary)

                Image(systemName: "star.fill")
                    .font(.system(size: 18))
                    .foregroundColor(DesignTokens.Colors.brandOrange)
            }
            .offset(x: 40, y: -20)
        }
    }
}

struct PersonalizationIllustration: View {
    var body: some View {
        HStack(spacing: DesignTokens.Spacing.medium) {
            // User profile
            Circle()
                .fill(
                    LinearGradient(
                        gradient: Gradient(colors: [
                            ThemeManager.shared.primary,
                            ThemeManager.shared.secondary
                        ]),
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 60, height: 60)
                .overlay(
                    Image(systemName: "person.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.white)
                )

            // Settings gears
            VStack(spacing: 0) {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 24))
                    .foregroundColor(ThemeManager.shared.primary)

                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 20))
                    .foregroundColor(ThemeManager.shared.secondary)
                    .offset(x: 10, y: -15)
            }
        }
    }
}

// MARK: - Category Bubble
struct CategoryBubble: View {
    let icon: String
    let color: Color
    let size: BubbleSize

    enum BubbleSize {
        case small, medium, large

        var dimension: CGFloat {
            switch self {
            case .small: return 40
            case .medium: return 50
            case .large: return 60
            }
        }

        var iconSize: CGFloat {
            switch self {
            case .small: return 16
            case .medium: return 20
            case .large: return 24
            }
        }
    }

    var body: some View {
        Circle()
            .fill(color.opacity(0.1))
            .overlay(
                Image(systemName: icon)
                    .font(.system(size: size.iconSize, weight: .medium))
                    .foregroundColor(color)
            )
            .frame(width: size.dimension, height: size.dimension)
    }
}

// MARK: - Category Selection View
struct CategorySelectionView: View {
    @Binding var selectedCategories: [String]
    private let availableCategories = ["Technology", "Business", "Health", "Science", "Politics", "Sports", "Entertainment"]

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 2), spacing: DesignTokens.Spacing.medium) {
            ForEach(availableCategories, id: \.self) { category in
                CategorySelectionCard(
                    category: category,
                    isSelected: selectedCategories.contains(category),
                    onTap: {
                        if selectedCategories.contains(category) {
                            selectedCategories.removeAll { $0 == category }
                        } else {
                            selectedCategories.append(category)
                        }
                    }
                )
            }
        }
    }
}

struct CategorySelectionCard: View {
    let category: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: DesignTokens.Spacing.xSmall) {
                Text(categoryEmoji)
                    .font(.system(size: 32))

                Text(category)
                    .font(.pulsexCalloutSemibold)
                    .foregroundColor(isSelected ? .white : ThemeManager.shared.textPrimary)
            }
            .padding(DesignTokens.Spacing.medium)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.BorderRadius.radiusMedium)
                    .fill(isSelected ? ThemeManager.shared.primary : ThemeManager.shared.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: DesignTokens.BorderRadius.radiusMedium)
                            .stroke(
                                isSelected ? ThemeManager.shared.primary : ThemeManager.shared.border,
                                lineWidth: 1
                            )
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    private var categoryEmoji: String {
        switch category.lowercased() {
        case "technology": return "💻"
        case "business": return "💼"
        case "health": return "🏥"
        case "science": return "🔬"
        case "politics": return "🏛️"
        case "sports": return "⚽"
        case "entertainment": return "🎬"
        default: return "📰"
        }
    }
}

// MARK: - Notification Permission View
struct NotificationPermissionView: View {
    @State private var notificationPermissionGranted = false

    var body: some View {
        VStack(spacing: DesignTokens.Spacing.medium) {
            Image(systemName: notificationPermissionGranted ? "bell.fill" : "bell.slash")
                .font(.system(size: 40))
                .foregroundColor(notificationPermissionGranted ? DesignTokens.Colors.success : ThemeManager.shared.textTertiary)

            Text(notificationPermissionGranted ? "Notifications Enabled" : "Enable Notifications")
                .font(.pulsexCalloutSemibold)
                .foregroundColor(notificationPermissionAllowed ? ThemeManager.shared.textPrimary : ThemeManager.shared.textSecondary)

            if !notificationPermissionGranted {
                PrimaryButton(
                    title: "Enable Notifications",
                    action: requestNotificationPermission,
                    style: .outline,
                    size: .small
                )
            }
        }
    }

    private var notificationPermissionAllowed: Bool {
        UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .authorized
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            DispatchQueue.main.async {
                notificationPermissionGranted = granted
                if granted {
                    NotificationManager.shared.requestPermission()
                }
            }
        }
    }
}

// MARK: - Preview
struct OnboardingContainer_Previews: PreviewProvider {
    static var previews: some View {
        OnboardingContainer()
            .environmentObject(AppState())
    }
}