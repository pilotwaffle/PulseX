import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var viewModel = ProfileViewModel()
    @StateObject private var themeManager = ThemeManager.shared

    @State private var showingSettings = false
    @State private var showingAbout = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: DesignTokens.Spacing.large) {
                    // Profile header
                    profileHeader

                    // Stats section
                    statsSection

                    // Reading preferences
                    readingPreferencesSection

                    // Settings sections
                    settingsSections

                    // App info
                    appInfoSection
                }
                .padding()
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gearshape")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundColor(ThemeManager.shared.primary)
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
            .sheet(isPresented: $showingAbout) {
                AboutView()
            }
            .onAppear {
                viewModel.loadUserData()
            }
        }
        .pulsexTheme()
    }

    // MARK: - Profile Header
    private var profileHeader: some View {
        VStack(spacing: DesignTokens.Spacing.medium) {
            // Profile image
            AsyncImage(url: URL(string: viewModel.user.profileImage ?? "")) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } placeholder: {
                Circle()
                    .fill(ThemeManager.shared.surface)
                    .overlay(
                        Image(systemName: "person.fill")
                            .font(.system(size: 40))
                            .foregroundColor(ThemeManager.shared.textTertiary)
                    )
            }
            .frame(width: 100, height: 100)
            .clipShape(Circle())
            .overlay(
                Circle()
                    .stroke(ThemeManager.shared.border, lineWidth: 2)
            )

            // User info
            VStack(spacing: DesignTokens.Spacing.xSmall) {
                Text(viewModel.user.name ?? "PulseX User")
                    .font(.pulsexTitle)
                    .foregroundColor(ThemeManager.shared.textPrimary)

                if let email = viewModel.user.email {
                    Text(email)
                        .font(.pulsexCallout)
                        .foregroundColor(ThemeManager.shared.textSecondary)
                }

                Text("Member since \(DateFormatter.memberSince.string(from: Date()))")
                    .font(.pulsexCaption)
                    .foregroundColor(ThemeManager.shared.textTertiary)
            }

            // Edit profile button
            PrimaryButton(
                title: "Edit Profile",
                action: {},
                style: .outline,
                size: .medium,
                icon: "pencil"
            )
        }
    }

    // MARK: - Stats Section
    private var statsSection: some View {
        VStack(spacing: DesignTokens.Spacing.medium) {
            Text("Your Reading Stats")
                .font(.pulsexCalloutSemibold)
                .foregroundColor(ThemeManager.shared.textSecondary)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: DesignTokens.Spacing.medium) {
                StatCard(
                    title: "Briefings Read",
                    value: "\(viewModel.stats.briefingsRead)",
                    icon: "eye.fill",
                    color: ThemeManager.shared.primary
                )

                StatCard(
                    title: "Saved Items",
                    value: "\(viewModel.stats.savedItems)",
                    icon: "bookmark.fill",
                    color: ThemeManager.shared.secondary
                )

                StatCard(
                    title: "Reading Streak",
                    value: "\(viewModel.stats.readingStreak)",
                    icon: "flame.fill",
                    color: DesignTokens.Colors.brandOrange
                )
            }
        }
        .padding()
        .background(ThemeManager.shared.surface)
        .cornerRadius(DesignTokens.BorderRadius.radiusLarge)
    }

    // MARK: - Reading Preferences
    private var readingPreferencesSection: some View {
        VStack(alignment: .leading, spacing: DesignTokens.Spacing.medium) {
            Text("Reading Preferences")
                .font(.pulsexCalloutSemibold)
                .foregroundColor(ThemeManager.shared.textSecondary)

            VStack(spacing: 0) {
                // Font size
                SettingsRow(
                    title: "Font Size",
                    value: viewModel.readingPreferences.fontSize.displayName,
                    icon: "textformat.size",
                    action: {
                        // Show font size selector
                    }
                )

                Divider()
                    .background(ThemeManager.shared.border)

                // Theme
                SettingsRow(
                    title: "Theme",
                    value: viewModel.readingPreferences.theme.displayName,
                    icon: viewModel.readingPreferences.theme.icon,
                    action: {
                        // Show theme selector
                    }
                )

                Divider()
                    .background(ThemeManager.shared.border)

                // Auto-play videos
                SettingsToggleRow(
                    title: "Auto-play Videos",
                    isOn: $viewModel.readingPreferences.autoPlayVideos,
                    icon: "play.rectangle"
                )
            }
        }
        .padding()
        .background(ThemeManager.shared.surface)
        .cornerRadius(DesignTokens.BorderRadius.radiusLarge)
    }

    // MARK: - Settings Sections
    private var settingsSections: some View {
        VStack(spacing: DesignTokens.Spacing.medium) {
            // Notifications
            SettingsSection(
                title: "Notifications",
                items: [
                    SettingsItem(
                        title: "Daily Briefing",
                        subtitle: "Get notified when new briefings are ready",
                        icon: "bell.fill",
                        action: { /* Navigate to notification settings */ }
                    ),
                    SettingsItem(
                        title: "Breaking News",
                        subtitle: "Important updates throughout the day",
                        icon: "exclamationmark.triangle.fill",
                        action: { /* Navigate to breaking news settings */ }
                    )
                ]
            )

            // Privacy & Data
            SettingsSection(
                title: "Privacy & Data",
                items: [
                    SettingsItem(
                        title: "Privacy Policy",
                        icon: "lock.shield",
                        action: { /* Open privacy policy */ }
                    ),
                    SettingsItem(
                        title: "Data Usage",
                        icon: "chart.bar.doc.horizontal",
                        action: { /* Open data usage info */ }
                    ),
                    SettingsItem(
                        title: "Export Data",
                        icon: "square.and.arrow.up",
                        action: { /* Export user data */ }
                    )
                ]
            )
        }
    }

    // MARK: - App Info Section
    private var appInfoSection: some View {
        VStack(spacing: DesignTokens.Spacing.medium) {
            // App version
            HStack {
                Spacer()

                VStack(spacing: DesignTokens.Spacing.xSmall) {
                    Text("PulseX")
                        .font(.pulsexCalloutSemibold)
                        .foregroundColor(ThemeManager.shared.textPrimary)

                    Text("Version 1.0.0")
                        .font(.pulsexCaption)
                        .foregroundColor(ThemeManager.shared.textTertiary)
                }

                Spacer()
            }

            // Links
            HStack(spacing: DesignTokens.Spacing.large) {
                Button("About") {
                    showingAbout = true
                }
                .font(.pulsexCallout)
                .foregroundColor(ThemeManager.shared.primary)

                Button("Support") {
                    // Open support
                }
                .font(.pulsexCallout)
                .foregroundColor(ThemeManager.shared.primary)

                Button("Rate App") {
                    // Open app store
                }
                .font(.pulsexCallout)
                .foregroundColor(ThemeManager.shared.primary)
            }
        }
        .padding(.top, DesignTokens.Spacing.large)
    }
}

// MARK: - Stat Card
struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: DesignTokens.Spacing.small) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .medium))
                .foregroundColor(color)

            Text(value)
                .font(.pulsexTitle2)
                .foregroundColor(ThemeManager.shared.textPrimary)

            Text(title)
                .font(.pulsexCaption)
                .foregroundColor(ThemeManager.shared.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(DesignTokens.Spacing.medium)
        .background(ThemeManager.shared.background)
        .cornerRadius(DesignTokens.BorderRadius.radiusMedium)
    }
}

// MARK: - Settings Section
struct SettingsSection: View {
    let title: String
    let items: [SettingsItem]

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.Spacing.medium) {
            Text(title)
                .font(.pulsexCalloutSemibold)
                .foregroundColor(ThemeManager.shared.textSecondary)

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    SettingsRow(
                        title: item.title,
                        subtitle: item.subtitle,
                        icon: item.icon,
                        action: item.action
                    )

                    if index < items.count - 1 {
                        Divider()
                            .background(ThemeManager.shared.border)
                    }
                }
            }
        }
        .padding()
        .background(ThemeManager.shared.surface)
        .cornerRadius(DesignTokens.BorderRadius.radiusLarge)
    }
}

struct SettingsItem {
    let title: String
    let subtitle: String?
    let icon: String
    let action: () -> Void
}

// MARK: - Settings Row
struct SettingsRow: View {
    let title: String
    let value: String?
    let subtitle: String?
    let icon: String
    let action: () -> Void

    init(
        title: String,
        value: String? = nil,
        subtitle: String? = nil,
        icon: String,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.value = value
        self.subtitle = subtitle
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: DesignTokens.Spacing.medium) {
                Image(systemName: icon)
                    .font(.system(size: DesignTokens.IconSizes.iconMedium, weight: .medium))
                    .foregroundColor(ThemeManager.shared.primary)
                    .frame(width: DesignTokens.IconSizes.iconLarge)

                VStack(alignment: .leading, spacing: DesignTokens.Spacing.xSmall) {
                    Text(title)
                        .font(.pulsexBody)
                        .foregroundColor(ThemeManager.shared.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if let subtitle = subtitle {
                        Text(subtitle)
                            .font(.pulsexCaption)
                            .foregroundColor(ThemeManager.shared.textTertiary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                if let value = value {
                    Text(value)
                        .font(.pulsexCallout)
                        .foregroundColor(ThemeManager.shared.textSecondary)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: DesignTokens.IconSizes.iconSmall, weight: .medium))
                        .foregroundColor(ThemeManager.shared.textTertiary)
                }
            }
            .padding(.vertical, DesignTokens.Spacing.small)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Settings Toggle Row
struct SettingsToggleRow: View {
    let title: String
    let subtitle: String?
    let icon: String
    @Binding var isOn: Bool

    var body: some View {
        HStack(spacing: DesignTokens.Spacing.medium) {
            Image(systemName: icon)
                .font(.system(size: DesignTokens.IconSizes.iconMedium, weight: .medium))
                .foregroundColor(ThemeManager.shared.primary)
                .frame(width: DesignTokens.IconSizes.iconLarge)

            VStack(alignment: .leading, spacing: DesignTokens.Spacing.xSmall) {
                Text(title)
                    .font(.pulsexBody)
                    .foregroundColor(ThemeManager.shared.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.pulsexCaption)
                        .foregroundColor(ThemeManager.shared.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Toggle("", isOn: $isOn)
                .tint(ThemeManager.shared.primary)
        }
        .padding(.vertical, DesignTokens.Spacing.small)
    }
}

// MARK: - Date Formatter Extension
extension DateFormatter {
    static let memberSince: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter
    }()
}

// MARK: - Preview
struct ProfileView_Previews: PreviewProvider {
    static var previews: some View {
        ProfileView()
            .environmentObject(AppState())
    }
}