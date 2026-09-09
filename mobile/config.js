export const API_HOST = process.env.EXPO_PUBLIC_API_HOST || '192.168.1.5';
export const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${API_HOST}:8000`;

// The Expo startup script sets EXPO_PUBLIC_API_HOST from the active LAN adapter.
