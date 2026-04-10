/**
 * OpenNOW Mobile - Shared Type Definitions
 * Ported from opennow-stable/src/shared/gfn.ts
 * GeForce NOW streaming client types for Android
 */

// Video codec types
export type VideoCodec = "H264" | "H265" | "AV1";
export type VideoAccelerationPreference = "auto" | "hardware" | "software";

// Color quality
export type ColorQuality = "8bit_420" | "8bit_444" | "10bit_420" | "10bit_444";

// Game languages
export type GameLanguage =
  | "en_US" | "en_GB" | "de_DE" | "fr_FR" | "es_ES" | "es_MX" | "it_IT"
  | "pt_PT" | "pt_BR" | "ru_RU" | "pl_PL" | "tr_TR" | "ar_SA" | "ja_JP"
  | "ko_KR" | "zh_CN" | "zh_TW" | "th_TH" | "vi_VN" | "id_ID" | "cs_CZ"
  | "el_GR" | "hu_HU" | "ro_RO" | "uk_UA" | "nl_NL" | "sv_SE" | "da_DK"
  | "fi_FI" | "no_NO";

// Keyboard layouts
export type KeyboardLayout =
  | "en-US" | "en-GB" | "tr-TR" | "de-DE" | "fr-FR" | "es-ES" | "es-MX" | "it-IT"
  | "pt-PT" | "pt-BR" | "pl-PL" | "ru-RU" | "ja-JP" | "ko-KR" | "zh-CN" | "zh-TW";

// Microphone modes
export type MicrophoneMode = "disabled" | "push-to-talk" | "voice-activity";
export type AspectRatio = "16:9" | "16:10" | "21:9" | "32:9";

// Settings interface
export interface Settings {
  resolution: string;
  aspectRatio: AspectRatio;
  fps: number;
  maxBitrateMbps: number;
  codec: VideoCodec;
  colorQuality: ColorQuality;
  region: string;
  clipboardPaste: boolean;
  mouseSensitivity: number;
  mouseAcceleration: number;
  shortcutToggleStats: string;
  shortcutTogglePointerLock: string;
  shortcutStopStream: string;
  shortcutToggleAntiAfk: string;
  shortcutToggleMicrophone: string;
  shortcutScreenshot: string;
  shortcutToggleRecording: string;
  microphoneMode: MicrophoneMode;
  microphoneDeviceId: string;
  hideStreamButtons: boolean;
  controllerMode: boolean;
  controllerUiSounds: boolean;
  controllerBackgroundAnimations: boolean;
  autoLoadControllerLibrary: boolean;
  autoFullScreen: boolean;
  favoriteGameIds: string[];
  sessionCounterEnabled: boolean;
  sessionClockShowEveryMinutes: number;
  sessionClockShowDurationSeconds: number;
  windowWidth: number;
  windowHeight: number;
  keyboardLayout: KeyboardLayout;
  gameLanguage: GameLanguage;
  enableL4S: boolean;
}

// Keyboard layout option
export interface KeyboardLayoutOption {
  value: KeyboardLayout;
  label: string;
  macValue?: string;
}

export const DEFAULT_KEYBOARD_LAYOUT: KeyboardLayout = "en-US";

export const keyboardLayoutOptions: readonly KeyboardLayoutOption[] = [
  { value: "en-US", label: "English (US)", macValue: "m-us" },
  { value: "en-GB", label: "English (UK)", macValue: "m-brit" },
  { value: "tr-TR", label: "Turkish Q", macValue: "m-tr-qty" },
  { value: "de-DE", label: "German" },
  { value: "fr-FR", label: "French" },
  { value: "es-ES", label: "Spanish" },
  { value: "es-MX", label: "Spanish (Latin America)" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-PT", label: "Portuguese (Portugal)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "pl-PL", label: "Polish" },
  { value: "ru-RU", label: "Russian" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
] as const;

// Helper functions
export function resolveGfnKeyboardLayout(layout: KeyboardLayout, platform: string): string {
  const option = keyboardLayoutOptions.find((candidate) => candidate.value === layout);
  if (platform === "darwin" && option?.macValue) {
    return option.macValue;
  }
  return option?.value ?? DEFAULT_KEYBOARD_LAYOUT;
}

export function colorQualityBitDepth(cq: ColorQuality): number {
  return cq.startsWith("10bit") ? 10 : 0;
}

export function colorQualityChromaFormat(cq: ColorQuality): number {
  return cq.endsWith("444") ? 2 : 0;
}

export function colorQualityRequiresHevc(cq: ColorQuality): boolean {
  return cq !== "8bit_420";
}

export function colorQualityIs10Bit(cq: ColorQuality): boolean {
  return cq.startsWith("10bit");
}

// Authentication types
export interface LoginProvider {
  idpId: string;
  code: string;
  displayName: string;
  streamingServiceUrl: string;
  priority: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  clientToken?: string;
  clientTokenExpiresAt?: number;
  clientTokenLifetimeMs?: number;
}

export interface AuthUser {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  membershipTier: string;
}

export interface EntitledResolution {
  width: number;
  height: number;
  fps: number;
}

export interface StorageAddon {
  type: "PERMANENT_STORAGE";
  sizeGb?: number;
  usedGb?: number;
  regionName?: string;
  regionCode?: string;
}

export interface SubscriptionInfo {
  membershipTier: string;
  subscriptionType?: string;
  subscriptionSubType?: string;
  allottedHours: number;
  purchasedHours: number;
  rolledOverHours: number;
  usedHours: number;
  remainingHours: number;
  totalHours: number;
  firstEntitlementStartDateTime?: string;
  serverRegionId?: string;
  currentSpanStartDateTime?: string;
  currentSpanEndDateTime?: string;
  notifyUserWhenTimeRemainingInMinutes?: number;
  notifyUserOnSessionWhenRemainingTimeInMinutes?: number;
  state?: string;
  isGamePlayAllowed?: boolean;
  isUnlimited: boolean;
  storageAddon?: StorageAddon;
  entitledResolutions: EntitledResolution[];
}

export interface AuthSession {
  provider: LoginProvider;
  tokens: AuthTokens;
  user: AuthUser;
}

// Request/Response types
export interface AuthLoginRequest {
  providerIdpId?: string;
}

export interface AuthSessionRequest {
  forceRefresh?: boolean;
}

export type AuthRefreshOutcome = "not_attempted" | "refreshed" | "failed" | "missing_refresh_token";

export interface AuthRefreshStatus {
  attempted: boolean;
  forced: boolean;
  outcome: AuthRefreshOutcome;
  message: string;
  error?: string;
}

export interface AuthSessionResult {
  session: AuthSession | null;
  refresh: AuthRefreshStatus;
}

// Regions
export interface RegionsFetchRequest {
  token?: string;
}

export interface StreamRegion {
  name: string;
  url: string;
  pingMs?: number;
}

export interface PingResult {
  url: string;
  pingMs: number | null;
  error?: string;
}

// Games
export interface GamesFetchRequest {
  token?: string;
  providerStreamingBaseUrl?: string;
}

export interface ResolveLaunchIdRequest {
  token?: string;
  providerStreamingBaseUrl?: string;
  appIdOrUuid: string;
}

export interface SubscriptionFetchRequest {
  token?: string;
  providerStreamingBaseUrl?: string;
  userId: string;
}

export interface GameVariant {
  id: string;
  store: string;
  supportedControls: string[];
}

export interface GameInfo {
  id: string;
  uuid?: string;
  launchAppId?: string;
  title: string;
  description?: string;
  longDescription?: string;
  featureLabels?: string[];
  genres?: string[];
  imageUrl?: string;
  screenshotUrl?: string;
  playType?: string;
  membershipTierLabel?: string;
  selectedVariantIndex: number;
  variants: GameVariant[];
}

// Streaming
export interface StreamSettings {
  resolution: string;
  fps: number;
  maxBitrateMbps: number;
  codec: VideoCodec;
  colorQuality: ColorQuality;
  keyboardLayout: KeyboardLayout;
  gameLanguage: GameLanguage;
  enableL4S: boolean;
}

export interface SessionCreateRequest {
  token?: string;
  streamingBaseUrl?: string;
  appId: string;
  internalTitle: string;
  accountLinked?: boolean;
  zone: string;
  settings: StreamSettings;
}

export interface SessionPollRequest {
  token?: string;
  streamingBaseUrl?: string;
  serverIp?: string;
  zone: string;
  sessionId: string;
  clientId?: string;
  deviceId?: string;
}

export interface SessionStopRequest {
  token?: string;
  streamingBaseUrl?: string;
  serverIp?: string;
  zone: string;
  sessionId: string;
  clientId?: string;
  deviceId?: string;
}

export type SessionAdAction = "start" | "pause" | "resume" | "finish" | "cancel";

export interface SessionAdReportRequest {
  token?: string;
  streamingBaseUrl?: string;
  serverIp?: string;
  zone: string;
  sessionId: string;
  clientId?: string;
  deviceId?: string;
  adId: string;
  action: SessionAdAction;
  clientTimestamp?: number;
  watchedTimeInMs?: number;
  pausedTimeInMs?: number;
  cancelReason?: string;
  errorInfo?: string;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface MediaConnectionInfo {
  ip: string;
  port: number;
}

export interface NegotiatedStreamProfile {
  resolution?: string;
  fps?: number;
  colorQuality?: ColorQuality;
  enableL4S?: boolean;
}

export interface SessionAdMediaFile {
  mediaFileUrl?: string;
  encodingProfile?: string;
}

export interface SessionOpportunityInfo {
  state?: string;
  queuePaused?: boolean;
  gracePeriodSeconds?: number;
  message?: string;
  title?: string;
  description?: string;
}

export interface SessionAdInfo {
  adId: string;
  state?: number;
  adState?: number;
  adUrl?: string;
  mediaUrl?: string;
  adMediaFiles?: SessionAdMediaFile[];
  clickThroughUrl?: string;
  adLengthInSeconds?: number;
  durationMs?: number;
  title?: string;
  description?: string;
}

export interface SessionAdState {
  isAdsRequired: boolean;
  sessionAdsRequired?: boolean;
  isQueuePaused?: boolean;
  gracePeriodSeconds?: number;
  message?: string;
  sessionAds: SessionAdInfo[];
  ads: SessionAdInfo[];
  opportunity?: SessionOpportunityInfo;
  serverSentEmptyAds?: boolean;
  enableL4S?: boolean;
}

export function getSessionAdItems(adState: SessionAdState | undefined): SessionAdInfo[] {
  return adState?.sessionAds ?? adState?.ads ?? [];
}

export function isSessionAdsRequired(adState: SessionAdState | undefined): boolean {
  return adState?.sessionAdsRequired ?? adState?.isAdsRequired ?? false;
}

export function getSessionAdOpportunity(adState: SessionAdState | undefined): SessionOpportunityInfo | undefined {
  return adState?.opportunity;
}

export function isSessionQueuePaused(adState: SessionAdState | undefined): boolean {
  return getSessionAdOpportunity(adState)?.queuePaused ?? adState?.isQueuePaused ?? false;
}

export function getSessionAdGracePeriodSeconds(adState: SessionAdState | undefined): number | undefined {
  return getSessionAdOpportunity(adState)?.gracePeriodSeconds ?? adState?.gracePeriodSeconds;
}

export function getSessionAdMessage(adState: SessionAdState | undefined): string | undefined {
  const opportunity = getSessionAdOpportunity(adState);
  return opportunity?.message ?? opportunity?.description ?? adState?.message;
}

export function getPreferredSessionAdMediaUrl(ad: SessionAdInfo | undefined): string | undefined {
  return ad?.adMediaFiles?.find((mediaFile) => mediaFile.mediaFileUrl)?.mediaFileUrl ?? ad?.adUrl ?? ad?.mediaUrl;
}

export function getSessionAdDurationMs(ad: SessionAdInfo | undefined): number | undefined {
  if (typeof ad?.adLengthInSeconds === "number" && Number.isFinite(ad.adLengthInSeconds) && ad.adLengthInSeconds > 0) {
    return Math.round(ad.adLengthInSeconds * 1000);
  }
  return ad?.durationMs;
}

export interface SessionInfo {
  sessionId: string;
  status: number;
  queuePosition?: number;
  seatSetupStep?: number;
  adState?: SessionAdState;
  zone: string;
  streamingBaseUrl?: string;
  serverIp: string;
  signalingServer: string;
  signalingUrl: string;
  gpuType?: string;
  iceServers: IceServer[];
  mediaConnectionInfo?: MediaConnectionInfo;
  negotiatedStreamProfile?: NegotiatedStreamProfile;
  clientId?: string;
  deviceId?: string;
}

export interface ActiveSessionInfo {
  sessionId: string;
  appId: number;
  gpuType?: string;
  status: number;
  serverIp?: string;
  signalingUrl?: string;
  resolution?: string;
  fps?: number;
}

export interface SessionClaimRequest {
  token?: string;
  streamingBaseUrl?: string;
  sessionId: string;
  serverIp: string;
  appId?: string;
  settings?: StreamSettings;
}

// Signaling
export interface SignalingConnectRequest {
  sessionId: string;
  signalingServer: string;
  signalingUrl?: string;
}

export interface IceCandidatePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface SendAnswerRequest {
  sdp: string;
  nvstSdp?: string;
}

export interface KeyframeRequest {
  reason: string;
  backlogFrames: number;
  attempt: number;
}

export type MainToRendererSignalingEvent =
  | { type: "connected" }
  | { type: "disconnected"; reason: string }
  | { type: "offer"; sdp: string }
  | { type: "remote-ice"; candidate: IceCandidatePayload }
  | { type: "error"; message: string }
  | { type: "log"; message: string };

export type SessionConflictChoice = "resume" | "new" | "cancel";

// Media
export interface ScreenshotSaveRequest {
  dataUrl: string;
  gameTitle?: string;
}

export interface ScreenshotDeleteRequest {
  id: string;
}

export interface ScreenshotSaveAsRequest {
  id: string;
}

export interface ScreenshotSaveAsResult {
  saved: boolean;
  filePath?: string;
}

export interface ScreenshotEntry {
  id: string;
  fileName: string;
  filePath: string;
  createdAtMs: number;
  sizeBytes: number;
  dataUrl: string;
}

export interface RecordingEntry {
  id: string;
  fileName: string;
  filePath: string;
  createdAtMs: number;
  sizeBytes: number;
  durationMs: number;
  gameTitle?: string;
  thumbnailDataUrl?: string;
}

export interface RecordingBeginRequest {
  mimeType: string;
}

export interface RecordingBeginResult {
  recordingId: string;
}

export interface RecordingChunkRequest {
  recordingId: string;
  chunk: ArrayBuffer;
}

export interface RecordingFinishRequest {
  recordingId: string;
  durationMs: number;
  gameTitle?: string;
  thumbnailDataUrl?: string;
}

export interface RecordingAbortRequest {
  recordingId: string;
}

export interface RecordingDeleteRequest {
  id: string;
}

export interface MediaListingEntry {
  id: string;
  fileName: string;
  filePath: string;
  createdAtMs: number;
  sizeBytes: number;
  gameTitle?: string;
  durationMs?: number;
  thumbnailDataUrl?: string;
  dataUrl?: string;
}

export interface MediaListingResult {
  screenshots: MediaListingEntry[];
  videos: MediaListingEntry[];
}

// Mobile-specific types
export interface MobileStreamDiagnostics {
  connectionState: string | "closed";
  inputReady: boolean;
  connectedGamepads: number;
  resolution: string;
  codec: string;
  isHdr: boolean;
  bitrateKbps: number;
  decodeFps: number;
  renderFps: number;
  packetsLost: number;
  packetsReceived: number;
  packetLossPercent: number;
  jitterMs: number;
  rttMs: number;
  framesReceived: number;
  framesDecoded: number;
  framesDropped: number;
  decodeTimeMs: number;
  renderTimeMs: number;
  jitterBufferDelayMs: number;
  inputQueueBufferedBytes: number;
  inputQueuePeakBufferedBytes: number;
  inputQueueDropCount: number;
  inputQueueMaxSchedulingDelayMs: number;
  lagReason: StreamLagReason;
  lagReasonDetail: string;
  gpuType: string;
  serverRegion: string;
  decoderPressureActive: boolean;
  decoderRecoveryAttempts: number;
  decoderRecoveryAction: string;
  micState: string;
  micEnabled: boolean;
}

export type StreamLagReason =
  | "unknown"
  | "stable"
  | "network"
  | "decoder"
  | "input_backpressure"
  | "render";

export interface TouchControlState {
  isTouchActive: boolean;
  virtualGamepadVisible: boolean;
  touchSensitivity: number;
}

// API Interface
export interface OpenNowApi {
  getAuthSession(input?: AuthSessionRequest): Promise<AuthSessionResult>;
  getLoginProviders(): Promise<LoginProvider[]>;
  getRegions(input?: RegionsFetchRequest): Promise<StreamRegion[]>;
  login(input: AuthLoginRequest): Promise<AuthSession>;
  logout(): Promise<void>;
  fetchSubscription(input: SubscriptionFetchRequest): Promise<SubscriptionInfo>;
  fetchMainGames(input?: GamesFetchRequest): Promise<GameInfo[]>;
  fetchLibraryGames(input?: GamesFetchRequest): Promise<GameInfo[]>;
  fetchPublicGames(): Promise<GameInfo[]>;
  resolveLaunchAppId(input: ResolveLaunchIdRequest): Promise<string | null>;
  createSession(input: SessionCreateRequest): Promise<SessionInfo>;
  pollSession(input: SessionPollRequest): Promise<SessionInfo>;
  reportSessionAd(input: SessionAdReportRequest): Promise<SessionInfo>;
  stopSession(input: SessionStopRequest): Promise<void>;
  getActiveSessions(token?: string, streamingBaseUrl?: string): Promise<ActiveSessionInfo[]>;
  claimSession(input: SessionClaimRequest): Promise<SessionInfo>;
  showSessionConflictDialog(): Promise<SessionConflictChoice>;
  connectSignaling(input: SignalingConnectRequest): Promise<void>;
  disconnectSignaling(): Promise<void>;
  sendAnswer(input: SendAnswerRequest): Promise<void>;
  sendIceCandidate(input: IceCandidatePayload): Promise<void>;
  requestKeyframe(input: KeyframeRequest): Promise<void>;
  onSignalingEvent(listener: (event: MainToRendererSignalingEvent) => void): () => void;
  quitApp(): Promise<void>;
  setFullscreen(v: boolean): Promise<void>;
  toggleFullscreen(): Promise<void>;
  getSettings(): Promise<Settings>;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>;
  resetSettings(): Promise<Settings>;
  exportLogs(format?: "text" | "json"): Promise<string>;
  pingRegions(regions: StreamRegion[]): Promise<PingResult[]>;
  saveScreenshot(input: ScreenshotSaveRequest): Promise<ScreenshotEntry>;
  listScreenshots(): Promise<ScreenshotEntry[]>;
  deleteScreenshot(input: ScreenshotDeleteRequest): Promise<void>;
  saveScreenshotAs(input: ScreenshotSaveAsRequest): Promise<ScreenshotSaveAsResult>;
  beginRecording(input: RecordingBeginRequest): Promise<RecordingBeginResult>;
  sendRecordingChunk(input: RecordingChunkRequest): Promise<void>;
  finishRecording(input: RecordingFinishRequest): Promise<RecordingEntry>;
  abortRecording(input: RecordingAbortRequest): Promise<void>;
  listRecordings(): Promise<RecordingEntry[]>;
  deleteRecording(input: RecordingDeleteRequest): Promise<void>;
  showRecordingInFolder(id: string): Promise<void>;
  listMediaByGame(input?: { gameTitle?: string }): Promise<MediaListingResult>;
  getMediaThumbnail(input: { filePath: string }): Promise<string | null>;
  showMediaInFolder(input: { filePath: string }): Promise<void>;
  deleteCache(): Promise<void>;
}

// Mobile-specific API additions
export interface MobileOpenNowApi extends OpenNowApi {
  setTouchControlsEnabled(enabled: boolean): Promise<void>;
  setVirtualGamepadVisible(visible: boolean): Promise<void>;
  hapticFeedback(type: "light" | "medium" | "heavy" | "success" | "error"): Promise<void>;
}

// Default settings (mobile-optimized)
export const DEFAULT_MOBILE_SETTINGS: Settings = {
  resolution: "1280x720",
  aspectRatio: "16:9",
  fps: 60,
  maxBitrateMbps: 25,
  codec: "H264",
  colorQuality: "8bit_420",
  region: "",
  clipboardPaste: false,
  mouseSensitivity: 1,
  mouseAcceleration: 1,
  shortcutToggleStats: "F3",
  shortcutTogglePointerLock: "F8",
  shortcutStopStream: "Ctrl+Shift+Q",
  shortcutToggleAntiAfk: "Ctrl+Shift+K",
  shortcutToggleMicrophone: "Ctrl+Shift+M",
  shortcutScreenshot: "F11",
  shortcutToggleRecording: "F12",
  microphoneMode: "disabled",
  microphoneDeviceId: "",
  hideStreamButtons: false,
  controllerMode: true, // Default to controller mode on mobile
  controllerUiSounds: true,
  controllerBackgroundAnimations: true,
  autoLoadControllerLibrary: false,
  autoFullScreen: true,
  favoriteGameIds: [],
  sessionCounterEnabled: true,
  sessionClockShowEveryMinutes: 60,
  sessionClockShowDurationSeconds: 30,
  windowWidth: 1280,
  windowHeight: 720,
  keyboardLayout: DEFAULT_KEYBOARD_LAYOUT,
  gameLanguage: "en_US",
  enableL4S: false,
};
