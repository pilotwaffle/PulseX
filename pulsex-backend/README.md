# PulseX Daily Briefing Backend

A production-ready Node.js/Express TypeScript backend for the PulseX Daily Briefing App - delivering personalized daily news and insights powered by AI.

## 🚀 Features

- **User Authentication & Authorization** - JWT-based auth with refresh tokens
- **AI-Powered Content Generation** - OpenAI/Anthropic LLM integration for personalized briefings
- **Real-time Data Sources** - News API, Crypto data, and Stock market integration
- **Push Notifications** - APNs integration for iOS notifications
- **Personalization Engine** - Feedback-driven content recommendations
- **High Performance** - Redis caching, rate limiting, <100ms response times
- **Scalable Architecture** - PostgreSQL, Redis, Docker deployment
- **Comprehensive API** - RESTful endpoints with OpenAPI documentation
- **Analytics & Insights** - User behavior tracking and engagement metrics

## 📋 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/profile` - Get user profile
- `PUT /api/v1/auth/profile` - Update user profile

### Daily Briefings
- `POST /api/v1/briefings/generate` - Generate daily briefing
- `GET /api/v1/briefings/today` - Get today's briefing
- `GET /api/v1/briefings/history` - Get briefing history
- `GET /api/v1/briefings/analytics` - Get briefing analytics
- `POST /api/v1/briefings/{id}/read` - Mark briefing as read

### Feedback System
- `POST /api/v1/feedback` - Submit feedback (like/dislike)
- `GET /api/v1/feedback/analytics` - Get feedback analytics
- `GET /api/v1/feedback/history` - Get feedback history

### Saved Cards
- `POST /api/v1/saved-cards` - Save a card
- `GET /api/v1/saved-cards` - Get saved cards
- `GET /api/v1/saved-cards/search` - Search saved cards
- `DELETE /api/v1/saved-cards/{id}` - Delete saved card

### Notifications
- `POST /api/v1/notifications/device-token` - Register device token
- `POST /api/v1/notifications/test` - Send test notification
- `GET /api/v1/notifications/settings` - Get notification settings
- `PUT /api/v1/notifications/settings` - Update notification settings

### User Preferences
- `GET /api/v1/preferences` - Get user preferences
- `PUT /api/v1/preferences` - Update user preferences
- `GET /api/v1/preferences/topics` - Get available topics
- `GET /api/v1/preferences/timezones` - Get available timezones

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Authentication**: JWT (access + refresh tokens)
- **Push Notifications**: APNs (iOS)
- **External APIs**: OpenAI, Anthropic, NewsAPI, CoinGecko
- **Infrastructure**: Docker, Docker Compose
- **Monitoring**: Winston logging, Prometheus, Grafana

## 📦 Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (for containerized deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pulsex-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   # Create database and run migrations
   createdb pullex_briefing
   psql -d pullex_briefing -f src/database/schema.sql
   ```

5. **Start Redis**
   ```bash
   redis-server redis/redis.conf
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

7. **Access API documentation**
   - Open http://localhost:3000/api-docs for Swagger documentation

### Docker Deployment

1. **Environment setup**
   ```bash
   cp .env.docker .env
   # Edit .env with your production configuration
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```

3. **View logs**
   ```bash
   docker-compose logs -f pullex-backend
   ```

4. **Stop services**
   ```bash
   docker-compose down
   ```

## ⚙️ Configuration

### Environment Variables

#### Core Configuration
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `JWT_SECRET` - JWT access token secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret

#### Database
- `DATABASE_URL` - PostgreSQL connection string
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database credentials

#### Redis
- `REDIS_URL` - Redis connection string
- `REDIS_HOST`, `REDIS_PORT` - Redis connection details

#### External APIs
- `OPENAI_API_KEY` - OpenAI API key for content generation
- `ANTHROPIC_API_KEY` - Anthropic API key for content generation
- `NEWS_API_KEY` - News API key for news data
- `COINGECKO_API_KEY` - CoinGecko API key for crypto data

#### Push Notifications
- `APN_KEY_ID` - Apple Push Notification key ID
- `APN_TEAM_ID` - Apple Developer team ID
- `APN_KEY_FILE` - Path to APN authentication key file
- `APN_BUNDLE_ID` - iOS app bundle identifier

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### API Testing
The API includes comprehensive test suites. Use the Swagger documentation at `/api-docs` to test endpoints interactively.

## 📊 Monitoring & Analytics

### Health Checks
- `GET /api/v1/health` - Application health status
- Database and Redis health monitoring
- Graceful degradation on service failures

### Logging
- Structured JSON logging with Winston
- Log levels: error, warn, info, debug
- Request/response logging with correlation IDs
- Error tracking and alerting

### Metrics
- Response time tracking
- Error rate monitoring
- User engagement analytics
- Content performance metrics

## 🔒 Security

### Authentication & Authorization
- JWT-based stateless authentication
- Access token (15 min) + Refresh token (7 days)
- Token blacklisting on logout
- Rate limiting per endpoint

### Data Protection
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS protection (output sanitization)
- CORS configuration
- Helmet.js security headers

### API Security
- Rate limiting (100 req/15min general, 5 req/15min auth)
- Request size limits
- IP-based blocking on abuse
- Comprehensive error handling

## 🚀 Performance

### Optimization Features
- **Redis Caching** - Content, user sessions, API responses
- **Database Indexing** - Optimized queries for 10K+ concurrent users
- **Connection Pooling** - Efficient database resource management
- **Compression** - Gzip compression for all responses
- **CDN Ready** - Static asset optimization

### Performance Metrics
- <100ms average response time
- 99.9% uptime SLA
- 10K+ concurrent user support
- Sub-second content generation

## 📈 Scalability

### Horizontal Scaling
- Stateless application design
- Load balancer ready
- Database connection pooling
- Redis clustering support

### Database Optimization
- Partitioned table design
- Efficient indexing strategy
- Query optimization
- Connection pooling (max 20 connections)

## 🔧 Development

### Code Quality
- TypeScript for type safety
- ESLint + Prettier for code formatting
- Comprehensive error handling
- Input validation with Zod
- Repository pattern for data access

### Architecture
- **Controllers** - HTTP request handling
- **Services** - Business logic layer
- **Repositories** - Data access layer
- **Middleware** - Cross-cutting concerns
- **Utilities** - Helper functions

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check PostgreSQL status
   docker-compose logs postgres

   # Test connection
   psql -h localhost -U postgres -d pullex_briefing
   ```

2. **Redis Connection Failed**
   ```bash
   # Check Redis status
   docker-compose logs redis

   # Test connection
   redis-cli ping
   ```

3. **API Keys Not Working**
   - Verify environment variables are set
   - Check API key validity and quotas
   - Review external API documentation

4. **Push Notifications Not Sending**
   - Verify APN key file path and permissions
   - Check device token registration
   - Review APN certificate validity

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm run dev
```

## 📝 API Documentation

### Interactive Documentation
Access the interactive Swagger documentation at:
- Development: http://localhost:3000/api-docs
- Production: https://api.pullex-daily-briefing.com/api-docs

### OpenAPI Specification
The complete OpenAPI 3.0 specification is available at:
- `GET /swagger.json`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Email: api-support@pullex-daily-briefing.com
- Documentation: https://docs.pullex-daily-briefing.com
- Status Page: https://status.pullex-daily-briefing.com

## 🗺️ Roadmap

### Upcoming Features
- [ ] GraphQL API support
- [ ] Real-time WebSocket connections
- [ ] Advanced personalization algorithms
- [ ] Multi-language content generation
- [ ] Android push notifications
- [ ] Email notifications
- [ ] Content sharing features
- [ ] Advanced analytics dashboard

### Performance Improvements
- [ ] GraphQL federation
- [ ] Microservices architecture
- [ ] Advanced caching strategies
- [ ] CDN integration
- [ ] Edge computing deployment