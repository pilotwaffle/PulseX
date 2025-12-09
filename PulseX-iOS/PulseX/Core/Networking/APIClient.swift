import Foundation
import Combine
import Network

protocol APIServiceProtocol {
    func fetchBriefings() -> AnyPublisher<[BriefingDTO], APIError>
    func submitFeedback(_ feedback: FeedbackDTO) -> AnyPublisher<Void, APIError>
    func saveCard(_ card: SavedCardDTO) -> AnyPublisher<Void, APIError>
    func updateUserPreferences(_ preferences: UserPreferencesDTO) -> AnyPublisher<UserDTO, APIError>
}

class APIClient: APIServiceProtocol {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private let networkMonitor = NWPathMonitor()
    private let networkSubject = PassthroughSubject<Bool, Never>()

    private init() {
        self.baseURL = URL(string: "https://api.pulsex.app")!
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

        startNetworkMonitoring()
    }

    // MARK: - Network Monitoring
    private func startNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.networkSubject.send(path.status == .satisfied)
            }
        }
        let queue = DispatchQueue(label: "NetworkMonitor")
        networkMonitor.start(queue: queue)
    }

    var isConnected: AnyPublisher<Bool, Never> {
        networkSubject.eraseToAnyPublisher()
    }

    // MARK: - Generic Request Method
    private func request<T: Codable>(
        endpoint: APIEndpoint,
        method: HTTPMethod = .GET,
        body: Codable? = nil,
        headers: [String: String]? = nil
    ) -> AnyPublisher<T, APIError> {

        guard var components = URLComponents(url: baseURL.appendingPathComponent(endpoint.path), resolvingAgainstBaseURL: false) else {
            return Fail(error: APIError.invalidURL)
                .eraseToAnyPublisher()
        }

        if let parameters = endpoint.parameters {
            components.queryItems = parameters.map { key, value in
                URLQueryItem(name: key, value: "\(value)")
            }
        }

        guard let url = components.url else {
            return Fail(error: APIError.invalidURL)
                .eraseToAnyPublisher()
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(AuthToken.current)", forHTTPHeaderField: "Authorization")

        if let headers = headers {
            for (key, value) in headers {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }

        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                return Fail(error: APIError.encodingError)
                    .eraseToAnyPublisher()
            }
        }

        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: T.self, decoder: JSONDecoder())
            .mapError { error in
                if error is DecodingError {
                    return APIError.decodingError
                } else if let urlError = error as? URLError {
                    return APIError.networkError(urlError)
                } else {
                    return APIError.unknownError(error)
                }
            }
            .eraseToAnyPublisher()
    }

    // MARK: - API Methods
    func fetchBriefings() -> AnyPublisher<[BriefingDTO], APIError> {
        request(endpoint: .briefings)
            .map { (response: APIResponse<[BriefingDTO]>) in
                response.data
            }
            .eraseToAnyPublisher()
    }

    func submitFeedback(_ feedback: FeedbackDTO) -> AnyPublisher<Void, APIError> {
        request(endpoint: .feedback, method: .POST, body: feedback)
            .map { (_: APIResponse<Void>) in }
            .eraseToAnyPublisher()
    }

    func saveCard(_ card: SavedCardDTO) -> AnyPublisher<Void, APIError> {
        request(endpoint: .saveCard, method: .POST, body: card)
            .map { (_: APIResponse<Void>) in }
            .eraseToAnyPublisher()
    }

    func updateUserPreferences(_ preferences: UserPreferencesDTO) -> AnyPublisher<UserDTO, APIError> {
        request(endpoint: .updatePreferences, method: .PUT, body: preferences)
            .map { (response: APIResponse<UserDTO>) in
                response.data
            }
            .eraseToAnyPublisher()
    }
}

// MARK: - API Configuration
enum APIEndpoint {
    case briefings
    case feedback
    case saveCard
    case updatePreferences
    case userProfile
    case notifications

    var path: String {
        switch self {
        case .briefings:
            return "/api/v1/briefings"
        case .feedback:
            return "/api/v1/feedback"
        case .saveCard:
            return "/api/v1/cards/save"
        case .updatePreferences:
            return "/api/v1/user/preferences"
        case .userProfile:
            return "/api/v1/user/profile"
        case .notifications:
            return "/api/v1/notifications"
        }
    }

    var parameters: [String: Any]? {
        switch self {
        case .briefings:
            return [
                "limit": 20,
                "offset": 0,
                "categories": "technology,business,science,health,politics"
            ]
        default:
            return nil
        }
    }
}

enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
    case PATCH = "PATCH"
}

// MARK: - Error Handling
enum APIError: Error, LocalizedError {
    case invalidURL
    case networkError(URLError)
    case decodingError
    case encodingError
    case serverError(Int)
    case unauthorized
    case unknownError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .networkError(let urlError):
            return "Network error: \(urlError.localizedDescription)"
        case .decodingError:
            return "Failed to decode response"
        case .encodingError:
            return "Failed to encode request"
        case .serverError(let code):
            return "Server error: \(code)"
        case .unauthorized:
            return "Unauthorized access"
        case .unknownError(let error):
            return "Unknown error: \(error.localizedDescription)"
        }
    }
}

// MARK: - Response Models
struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T
    let message: String?
    let timestamp: Date
}

// MARK: - Authentication
struct AuthToken {
    @UserDefault("authToken", defaultValue: "")
    static var current: String
}