# AgentCenter Mobile App

React Native mobile application for AgentCenter built with Expo, Expo Router, and NativeWind.

## Features

- **Expo Router**: File-based navigation similar to Next.js App Router
- **NativeWind**: Tailwind CSS for React Native styling
- **Secure Storage**: Token-based authentication with encrypted storage
- **GraphQL**: urql client for API communication
- **TypeScript**: Full type safety
- **Screen Structure**:
  - Authentication (Login, Register)
  - Dashboard (Overview, stats, recent tasks, agent status)
  - Tasks (List, filtering, detail view)
  - Channels (Messages, DMs)
  - Agents (Status, activity)
  - Profile (Settings, logout)

## Prerequisites

- Node.js >= 18
- npm >= 10.0.0
- Expo CLI (optional): `npm install -g expo-cli`

## Installation

```bash
# From the monorepo root
npm install

# Or from this directory
npm install
```

## Development

```bash
# Start the dev server
npm run dev

# Or with specific platform
npm run start:ios
npm run start:android
npm run start:web
```

The app will open in Expo Go on your device or simulator.

## Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the API endpoint:
   ```
   EXPO_PUBLIC_API_URL=http://localhost:3000/api/graphql
   ```

## Project Structure

```
apps/mobile/
├── app/
│   ├── _layout.tsx          # Root navigation layout
│   ├── auth/
│   │   ├── _layout.tsx      # Auth stack
│   │   ├── login.tsx        # Login screen
│   │   └── register.tsx     # Register screen
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab navigation
│   │   ├── dashboard.tsx    # Dashboard/home screen
│   │   ├── tasks.tsx        # Task list screen
│   │   ├── channels.tsx     # Channels/messages screen
│   │   ├── agents.tsx       # Agents status screen
│   │   └── profile.tsx      # User profile screen
│   └── task/
│       └── [id].tsx         # Task detail screen
├── src/
│   └── lib/
│       ├── auth.ts          # Auth utilities with SecureStore
│       └── urql.ts          # GraphQL client setup
├── app.json                 # Expo configuration
├── babel.config.js          # Babel config with NativeWind support
├── tailwind.config.js       # Tailwind configuration
└── tsconfig.json            # TypeScript configuration
```

## Key Technologies

- **Expo**: Framework for building universal React applications
- **Expo Router**: File-based routing for React Native
- **NativeWind**: Tailwind CSS for React Native
- **urql**: Lightweight GraphQL client
- **expo-secure-store**: Secure token storage
- **Zod**: Type-safe schema validation

## Integration with Shared Packages

The mobile app uses shared packages from the monorepo:
- `@agentcenter/types` - Shared TypeScript interfaces
- `@agentcenter/utils` - Shared utility functions
- `@agentcenter/config` - Shared configuration

These are available through the workspace resolution in `tsconfig.json`.

## Authentication

Authentication is handled through:
1. **Login**: Email/password → GraphQL mutation → Access token
2. **Storage**: Token stored in `expo-secure-store` (encrypted)
3. **Headers**: Authorization header injected automatically by urql client
4. **Logout**: Clear token from secure storage

## Next Steps

- [ ] Implement GraphQL queries and mutations for tasks, channels, agents
- [ ] Add real API integration (connect to web app backend)
- [ ] Implement notifications
- [ ] Add offline support
- [ ] Build native iOS and Android apps
- [ ] Implement task detail interactions
- [ ] Add push notifications
- [ ] Implement real-time messaging

## Building for Production

```bash
# Build for EAS (Expo Application Services)
npm run build

# Or locally for specific platforms
npm run ios    # Build iOS app
npm run android # Build Android app
```

## Troubleshooting

- **Modules not found**: Run `npm install` in the monorepo root
- **NativeWind styling not working**: Clear cache: `npm run dev -- --clear`
- **Port already in use**: Change the port: `npm run dev -- --port 8081`

## Contributing

Follow the monorepo guidelines:
- Use TypeScript for all code
- Follow prettier formatting (run `npm run format`)
- Commit messages: conventional commits format
- Test locally before pushing

## License

See LICENSE in the monorepo root.
