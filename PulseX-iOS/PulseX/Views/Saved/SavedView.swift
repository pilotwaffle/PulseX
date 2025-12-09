import SwiftUI
import CoreData

struct SavedView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @StateObject private var viewModel = SavedViewModel()
    @StateObject private var themeManager = ThemeManager.shared

    @State private var showingFilterSheet = false
    @State private var searchText = ""
    @State private var selectedCategory: String? = nil

    var body: some View {
        NavigationView {
            ZStack {
                // Background
                ThemeManager.shared.background
                    .ignoresSafeArea()

                if viewModel.isLoading {
                    loadingView
                } else if viewModel.savedCards.isEmpty {
                    emptyStateView
                } else {
                    savedContent
                }
            }
            .navigationTitle("Saved")
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
            .searchable(text: $searchText, prompt: "Search saved briefings...")
            .onSubmit(of: .search) {
                viewModel.searchBriefings(with: searchText)
            }
            .onChange(of: searchText) { newValue in
                viewModel.searchBriefings(with: newValue)
            }
            .sheet(isPresented: $showingFilterSheet) {
                SavedFilterSheet(
                    selectedCategory: $selectedCategory,
                    sortBy: $viewModel.sortBy,
                    onApply: {
                        viewModel.applyFilters(category: selectedCategory)
                    }
                )
            }
            .onAppear {
                viewModel.loadSavedCards()
            }
        }
        .pulsexTheme()
    }

    // MARK: - Loading View
    private var loadingView: some View {
        VStack(spacing: DesignTokens.Spacing.large) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: ThemeManager.shared.primary))
                .scaleEffect(1.2)

            Text("Loading saved briefings...")
                .font(.pulsexBody)
                .foregroundColor(ThemeManager.shared.textSecondary)
        }
    }

    // MARK: - Empty State View
    private var emptyStateView: some View {
        VStack(spacing: DesignTokens.Spacing.large) {
            Image(systemName: "bookmark")
                .font(.system(size: 80))
                .foregroundColor(ThemeManager.shared.textTertiary)

            VStack(spacing: DesignTokens.Spacing.medium) {
                Text("No Saved Briefings")
                    .font(.pulsexHeadline)
                    .foregroundColor(ThemeManager.shared.textPrimary)

                Text("Briefings you save will appear here for easy access.")
                    .font(.pulsexBody)
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, DesignTokens.Spacing.large)
            }

            NavigationLink(destination: PulseFeedView()) {
                PrimaryButton(
                    title: "Explore Briefings",
                    action: {},
                    style: .outline,
                    size: .medium
                )
            }
        }
        .padding()
    }

    // MARK: - Saved Content
    private var savedContent: some View {
        VStack(spacing: 0) {
            // Search results header
            if !searchText.isEmpty || selectedCategory != nil {
                searchResultsHeader
            }

            // Saved cards list
            ScrollView {
                LazyVStack(spacing: DesignTokens.Spacing.cardSpacing) {
                    ForEach(viewModel.filteredSavedCards, id: \.id) { savedCard in
                        CompactBriefingCard(
                            briefing: savedCard.toBriefing(context: viewContext),
                            onTap: {
                                viewModel.openBriefing(savedCard)
                            },
                            onRemove: {
                                viewModel.removeSavedCard(savedCard)
                            }
                        )
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button("Remove") {
                                viewModel.removeSavedCard(savedCard)
                            }
                            .tint(DesignTokens.Colors.error)
                        }
                    }
                }
                .padding(.horizontal, DesignTokens.Spacing.medium)
                .padding(.top, DesignTokens.Spacing.medium)
            }
        }
    }

    // MARK: - Search Results Header
    private var searchResultsHeader: some View {
        HStack {
            Text(searchText.isEmpty ?
                 (selectedCategory != nil ? "\(selectedCategory?.capitalized ?? "")" : "All Categories") :
                 "Results for '\(searchText)'")
                .font(.pulsexCallout)
                .foregroundColor(ThemeManager.shared.textSecondary)

            Spacer()

            Text("\(viewModel.filteredSavedCards.count) items")
                .font(.pulsexCaption)
                .foregroundColor(ThemeManager.shared.textTertiary)
        }
        .padding(.horizontal, DesignTokens.Spacing.medium)
        .padding(.vertical, DesignTokens.Spacing.small)
        .background(ThemeManager.shared.surface)
    }
}

// MARK: - Saved Filter Sheet
struct SavedFilterSheet: View {
    @Binding var selectedCategory: String?
    @Binding var sortBy: SavedViewModel.SortOption
    @Environment(\.dismiss) private var dismiss

    let onApply: () -> Void

    private let categories = ["All", "Technology", "Business", "Health", "Science", "Politics", "Sports", "Entertainment"]

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: DesignTokens.Spacing.large) {
                // Category selection
                VStack(alignment: .leading, spacing: DesignTokens.Spacing.medium) {
                    Text("Category")
                        .font(.pulsexCalloutSemibold)
                        .foregroundColor(ThemeManager.shared.textPrimary)

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

                // Sort options
                VStack(alignment: .leading, spacing: DesignTokens.Spacing.medium) {
                    Text("Sort by")
                        .font(.pulsexCalloutSemibold)
                        .foregroundColor(ThemeManager.shared.textPrimary)

                    VStack(spacing: 0) {
                        ForEach(SavedViewModel.SortOption.allCases, id: \.self) { option in
                            Button(action: {
                                sortBy = option
                            }) {
                                HStack {
                                    Text(option.displayName)
                                        .font(.pulsexBody)
                                        .foregroundColor(ThemeManager.shared.textPrimary)

                                    Spacer()

                                    if sortBy == option {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 16, weight: .semibold))
                                            .foregroundColor(ThemeManager.shared.primary)
                                    }
                                }
                                .padding(.vertical, DesignTokens.Spacing.small)
                            }
                            .buttonStyle(PlainButtonStyle())

                            if option != SavedViewModel.SortOption.allCases.last {
                                Divider()
                                    .background(ThemeManager.shared.border)
                            }
                        }
                    }
                    .padding()
                    .background(ThemeManager.shared.surface)
                    .cornerRadius(DesignTokens.BorderRadius.radiusMedium)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Filter & Sort")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(ThemeManager.shared.primary)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Apply") {
                        onApply()
                        dismiss()
                    }
                    .foregroundColor(ThemeManager.shared.primary)
                    .fontWeight(.semibold)
                }
            }
        }
        .pulsexTheme()
    }
}

// MARK: - Preview
struct SavedView_Previews: PreviewProvider {
    static var previews: some View {
        SavedView()
            .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    }
}