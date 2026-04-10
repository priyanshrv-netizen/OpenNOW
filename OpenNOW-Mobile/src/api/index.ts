/**
 * OpenNOW Mobile - API exports
 * Main entry point for all API modules
 */

export { getAuthService, AuthService } from './auth';
export { getSessionService, SessionService } from './session';
export { getGamesService, GamesService } from './games';
export { getSignalingService, SignalingService } from './signaling';
export { getStreamingService, StreamingService } from './streaming';
export { getSettingsService, SettingsService } from './settings';

// Re-export types from types module for convenience
export type {
  GameInfo,
  AuthSession,
  LoginProvider,
  Settings,
  StreamSettings,
  SessionInfo,
  SessionAdInfo,
  MobileStreamDiagnostics,
  ColorQuality,
  VideoCodec,
  MicrophoneMode,
  AspectRatio,
  KeyboardLayout,
  GameLanguage,
} from '../types';
