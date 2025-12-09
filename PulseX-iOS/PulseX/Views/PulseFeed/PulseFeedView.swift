import SwiftUI
import CoreData

struct PulseFeedView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @StateObject private var viewModel = PulseFeedViewModel()
    @StateObject private var themeManager = ThemeManager.shared

    @State private var showingFilterSheet = false
    @State private var selectedCategory: String? = nil
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        NavigationView {
            ZStack {
                // Background
                ThemeManager.shared.background
                    .ignoresSafeArea()

                if viewModel.isLoading && viewModel.briefings.isEmpty {
                    loadingView
                } else if viewModel.briefings.isEmpty {
                    emptyStateView
                } else {
                    feedContent
                }

                // Floating action buttons
                VStack {
                    Spacer()

                    HStack {
                        Spacer()

                        // Filter button
                        Button(action: { showingFilterSheet = true }) {
                            Image(systemName: "line.horizontal.3.decrease.circle")
                                .font(.system(size: DesignTokens.IconSizes.iconLarge, weight: .medium))
                                .foregroundColor(.white)
                                .frame(width: 56, height: 56)
                                .background(
                                    Circle()
                                        .fill(ThemeManager.shared.secondary)
                                        .shadow(color: ThemeManager.shared.shadow, radius: 8, x: 0, y: 4)
                                )
                        }
                        .padding(.trailing, DesignTokens.Spacing.medium)
                        .padding(.bottom, DesignTokens.Spacing.large)

                        // Refresh button (only visible when scrolled up)
                        if scrollOffset > 200 {
                            Button(action: {
                                viewModel.refreshBriefings()
                            }) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: DesignTokens.IconSizes.iconLarge, weight: .medium))
                                    .foregroundColor(.white)
                                    .frame(width: 56, height: 56)
                                    .background(
                                        Circle()
                                            .fill(ThemeManager.shared.primary)
                                            .shadow(color: ThemeManager.shared.shadow, radius: 8, x: 0, y: 4)
                                    )
                            }
                            .padding(.trailing, DesignTokens.Spacing.medium)
                            .padding(.bottom, 120)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                }
            }
            .navigationTitle("Daily Pulse")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingFilterSheet = true }) {
                        Image(systemName: "line.horizontal.3.decrease.circle")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundColor(ThemeManager.shared.primary)
                    }
                }
            }
            .refreshable {
                await viewModel.refreshBriefingsAsync()
            }
            .sheet(isPresented: $showingFilterSheet) {
                FilterSheet(
                    selectedCategory: $selectedCategory,
                    onApply: { category in
                        selectedCategory = category
                        viewModel.filterBriefings(by: category)
                    }
                )
            }
            .onAppear {
                viewModel.loadBriefings()
            }
            .alert("Error", isPresented: .constant(viewModel.error != nil), actions: {
                Button("Retry") {
                    viewModel.refreshBriefings()
                }
                Button("Dismiss", role: .cancel) { }
            }, message: {
                if let error = viewModel.error {
                    Text(error.localizedDescription)
                }
            })
        }
        .pulsexTheme()
    }

    // MARK: - Loading View
    private var loadingView: some View {
        VStack(spacing: DesignTokens.Spacing.large) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: ThemeManager.shared.primary))
                .scaleEffect(1.2)

            Text("Loading your daily pulse...")
                .font(.pulsexBody)
                .foregroundColor(ThemeManager.shared.textSecondary)
        }
    }

    // MARK: - Empty State View
    private var emptyStateView: some View {
        VStack(spacing: DesignTokens.Spacing.large) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 80))
                .foregroundColor(ThemeManager.shared.textTertiary)

            VStack(spacing: DesignTokens.Spacing.medium) {
                Text("No Briefings Available")
                    .font(.pulsexHeadline)
                    .foregroundColor(ThemeManager.shared.textPrimary)

                Text("Pull down to refresh or check back later for your daily pulse.")
                    .font(.pulsexBody)
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, DesignTokens.Spacing.large)
            }

            PrimaryButton(
                title: "Refresh",
                action: {
                    viewModel.refreshBriefings()
                },
                style: .primary,
                size: .medium
            )
        }
        .padding()
    }

    // MARK: - Feed Content
    private var feedContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: DesignTokens.Spacing.cardSpacing) {
                    // Date header
                    if !viewModel.briefings.isEmpty {
                        dateHeader
                            .id("header")
                    }

                    // Briefing cards
                    ForEach(viewModel.filteredBriefings, id: \.id) { briefing in
                        BriefingCard(
                            briefing: briefing,
                            onTap: {
                                viewModel.markAsRead(briefing)
                                // Navigate to detail view (to be implemented)
                            },
                            onSave: {
                                viewModel.toggleSave(briefing)
                            },
                            onShare: {
                                viewModel.shareBriefing(briefing)
                            },
                            onFeedback: { feedbackType in
                                viewModel.submitFeedback(for: briefing, type: feedbackType)
                            }
                        )
                        .id(briefing.id)
                    }

                    // Loading indicator for pagination
                    if viewModel.isLoadingMore {
                        HStack {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: ThemeManager.shared.primary))

                            Text("Loading more...")
                                .font(.pulsexCallout)
                                .foregroundColor(ThemeManager.shared.textSecondary)
                        }
                        .padding()
                    }

                    // Load more trigger
                    if !viewModel.hasMoreData {
                        Text("You've reached the end")
                            .font(.pulsexCaption)
                            .foregroundColor(ThemeManager.shared.textTertiary)
                            .padding()
                    }
                }
                .padding(.horizontal, DesignTokens.Spacing.medium)
                .padding(.top, DesignTokens.Spacing.medium)
                .background(
                    GeometryReader { geometry in
                        Color.clear.preference(
                            key: ScrollOffsetKey.self,
                            value: geometry.frame(in: .named("scroll")).minY
                        )
                    }
                )
            }
            .coordinateSpace(name: "scroll")
            .onPreferenceChange(ScrollOffsetKey.self) { value in
                withAnimation {
                    scrollOffset = max(0, -value)
                }

                // Trigger pagination when near bottom
                if scrollOffset > 0 && !viewModel.isLoadingMore && viewModel.hasMoreData {
                    let threshold = -geometry.frame(in: .global).maxY + 500
                    if scrollOffset > threshold {
                        viewModel.loadMoreBriefings()
                    }
                }
            }
        }
    }

    // MARK: - Date Header
    private var dateHeader: some View {
        VStack(alignment: .leading, spacing: DesignTokens.Spacing.small) {
            Text("Today")
                .font(.pulsexTitle2)
                .foregroundColor(ThemeManager.shared.textPrimary)

            Text(DateFormatter.todayHeader.string(from: Date()))
                .font(.pulsexCallout)
                .foregroundColor(ThemeManager.shared.textSecondary)

            HStack {
                Text("\(viewModel.briefings.count) briefings")
                    .font(.pulsexCaption)
                    .foregroundColor(ThemeManager.shared.textTertiary)

                Spacer()

                // Quick filter chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: DesignTokens.Spacing.small) {
                        ForEach(viewModel.quickFilters, id: \.self) { category in
                            CategoryChip(
                                category: category,
                                isSelected: selectedCategory == category,
                                onTap: {
                                    selectedCategory = selectedCategory == category ? nil : category
                                    viewModel.filterBriefings(by: selectedCategory)
                                }
                            )
                        }
                    }
                    .padding(.horizontal, DesignTokens.Spacing.medium)
                }
            }
        }
        .padding(.horizontal, DesignTokens.Spacing.medium)
        .padding(.bottom, DesignTokens.Spacing.medium)
    }
}

// MARK: - Category Chip
struct CategoryChip: View {
    let category: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(category.capitalized)
                .font(.pulsexCalloutSemibold)
                .foregroundColor(isSelected ? .white : ThemeManager.shared.primary)
                .padding(.horizontal, DesignTokens.Spacing.medium)
                .padding(.vertical, DesignTokens.Spacing.small)
                .background(
                    Capsule()
                        .fill(isSelected ? ThemeManager.shared.primary : ThemeManager.shared.surface)
                        .overlay(
                            Capsule()
                                .stroke(
                                    isSelected ? ThemeManager.shared.primary : ThemeManager.shared.border,
                                    lineWidth: 1
                                )
                        )
                )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - GeometryReader for Scroll Offset
private var geometry: GeometryReader<AnyView> = GeometryReader { _ in AnyView(EmptyView()) }

// MARK: - Scroll Offset Key
struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - Date Formatter Extension
extension DateFormatter {
    static let todayHeader: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter
    }()
}

// MARK: - Preview
struct PulseFeedView_Previews: PreviewProvider {
    static var previews: some View {
        PulseFeedView()
            .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    }
}