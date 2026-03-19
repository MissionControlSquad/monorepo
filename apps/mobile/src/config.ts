/**
 * App-wide configuration.
 * Set EXPO_PUBLIC_API_URL in your .env to point at your AgentCenter instance.
 * Defaults to localhost:3000 for local development.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
