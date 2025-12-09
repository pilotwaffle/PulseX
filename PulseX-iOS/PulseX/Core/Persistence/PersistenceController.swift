import CoreData
import Foundation

class PersistenceController {
    static let shared = PersistenceController()

    static var preview: PersistenceController = {
        let result = PersistenceController(inMemory: true)
        let viewContext = result.container.viewContext

        // Add sample data for previews
        let sampleBriefing = Briefing(context: viewContext)
        sampleBriefing.id = UUID()
        sampleBriefing.headline = "Sample Briefing Headline"
        sampleBriefing.content = "This is a sample briefing content for preview purposes."
        sampleBriefing.category = "Technology"
        sampleBriefing.source = "Tech News"
        sampleBriefing.timestamp = Date()
        sampleBriefing.readTime = 45

        try? viewContext.save()
        return result
    }()

    let container: NSPersistentContainer

    init(inMemory: Bool = false) {
        container = NSPersistentContainer(name: "PulseX")

        if inMemory {
            container.persistentStoreDescriptions.first!.url = URL(fileURLWithPath: "/dev/null")
        }

        container.loadPersistentStores(completionHandler: { (storeDescription, error) in
            if let error = error as NSError? {
                // Replace this implementation with code to handle the error appropriately.
                fatalError("Unresolved error \(error), \(error.userInfo)")
            }
        })

        // Configure automatic data merging and background processing
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        // Set up background context for data processing
        let backgroundContext = container.newBackgroundContext()
        backgroundContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }

    func save() {
        let context = container.viewContext

        if context.hasChanges {
            do {
                try context.save()
            } catch {
                let nsError = error as NSError
                fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
            }
        }
    }

    func saveBackground() {
        let backgroundContext = container.newBackgroundContext()
        backgroundContext.perform {
            if backgroundContext.hasChanges {
                do {
                    try backgroundContext.save()
                } catch {
                    print("Background save failed: \(error)")
                }
            }
        }
    }

    func deleteAllData() {
        let entities = ["Briefing", "User", "Feedback", "SavedCard"]

        for entityName in entities {
            let fetchRequest = NSFetchRequest<NSFetchRequestResult>(entityName: entityName)
            let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)

            do {
                try container.viewContext.execute(deleteRequest)
                try container.viewContext.save()
            } catch {
                print("Failed to delete \(entityName): \(error)")
            }
        }
    }
}

// MARK: - Core Data Extensions
extension PersistenceController {
    func fetchBriefings(predicate: NSPredicate? = nil, sortDescriptors: [NSSortDescriptor] = []) -> [Briefing] {
        let request: NSFetchRequest<Briefing> = Briefing.fetchRequest()
        request.predicate = predicate
        request.sortDescriptors = sortDescriptors.isEmpty ? [
            NSSortDescriptor(keyPath: \Briefing.timestamp, ascending: false)
        ] : sortDescriptors

        do {
            return try container.viewContext.fetch(request)
        } catch {
            print("Error fetching briefings: \(error)")
            return []
        }
    }

    func fetchSavedCards() -> [SavedCard] {
        let request: NSFetchRequest<SavedCard> = SavedCard.fetchRequest()
        request.sortDescriptors = [
            NSSortDescriptor(keyPath: \SavedCard.savedAt, ascending: false)
        ]

        do {
            return try container.viewContext.fetch(request)
        } catch {
            print("Error fetching saved cards: \(error)")
            return []
        }
    }
}