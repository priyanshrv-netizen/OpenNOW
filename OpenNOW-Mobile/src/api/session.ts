/**
 * OpenNOW Mobile - Session Management API
 * Handles CloudMatch session creation, polling, and management
 * Adapted from opennow-stable/src/main/gfn/cloudmatch.ts
 */

import {
  SessionCreateRequest,
  SessionPollRequest,
  SessionStopRequest,
  SessionInfo,
  ActiveSessionInfo,
  SessionAdReportRequest,
  SessionClaimRequest,
  StreamSettings,
  ColorQuality,
  IceServer,
} from '../types/gfn';
import { getAuthService } from './auth';

const GFN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173';
const GFN_CLIENT_VERSION = '2.0.80.173';

interface CloudMatchRequest {
  sessionRequestData: {
    appId: string;
    internalTitle: string | null;
    availableSupportedControllers: number[];
    networkTestSessionId: string | null;
    parentSessionId: string | null;
    clientIdentification: string;
    deviceHashId: string;
    clientVersion: string;
    sdkVersion: string;
    streamerVersion: number;
    clientPlatformName: string;
    clientRequestMonitorSettings: Array<{
      widthInPixels: number;
      heightInPixels: number;
      framesPerSecond: number;
      sdrHdrMode: number;
      displayData: {
        desiredContentMaxLuminance: number;
        desiredContentMinLuminance: number;
        desiredContentMaxFrameAverageLuminance: number;
      };
      dpi: number;
    }>;
    useOps: boolean;
    audioMode: number;
    metaData: Array<{ key: string; value: string }>;
    sdrHdrMode: number;
    clientDisplayHdrCapabilities: {
      version: number;
      hdrEdrSupportedFlagsInUint32: number;
      staticMetadataDescriptorId: number;
    } | null;
    surroundAudioInfo: number;
    remoteControllersBitmap: number;
    clientTimezoneOffset: number;
    enhancedStreamMode: number;
    appLaunchMode: number;
    secureRTSPSupported: boolean;
    partnerCustomData: string;
    accountLinked: boolean;
    enablePersistingInGameSettings: boolean;
    userAge: number;
    requestedStreamingFeatures: {
      reflex: boolean;
      bitDepth: number;
      cloudGsync: boolean;
      enabledL4S: boolean;
      mouseMovementFlags: number;
      trueHdr: boolean;
      supportedHidDevices: number;
      profile: number;
      fallbackToLogicalResolution: boolean;
      hidDevices: string | null;
      chromaFormat: number;
      prefilterMode: number;
      prefilterSharpness: number;
      prefilterNoiseReduction: number;
      hudStreamingMode: number;
      sdrColorSpace: number;
      hdrColorSpace: number;
    };
  };
}

interface CloudMatchResponse {
  requestStatus: {
    statusCode: number;
    statusDescription?: string;
    unifiedErrorCode?: number;
  };
  session: {
    sessionId: string;
    status: number;
    queuePosition?: number;
    seatSetupInfo?: {
      seatSetupStep?: number;
      queuePosition?: number;
      seatSetupEta?: number;
    };
    sessionAdsRequired?: boolean;
    isAdsRequired?: boolean;
    sessionAds?: Array<{
      adId?: string;
      adState?: number;
      adUrl?: string;
      mediaUrl?: string;
      videoUrl?: string;
      url?: string;
      adMediaFiles?: Array<{
        mediaFileUrl?: string;
        encodingProfile?: string;
      }>;
      clickThroughUrl?: string;
      adLengthInSeconds?: number;
      durationMs?: number;
      durationInMs?: number;
      title?: string;
      description?: string;
    }>;
    opportunity?: {
      state?: string;
      queuePaused?: boolean;
      gracePeriodSeconds?: number;
      message?: string;
      title?: string;
      description?: string;
    };
    progressState?: number;
    eta?: number;
    sessionProgress?: {
      queuePosition?: number;
      progressState?: number;
      eta?: number;
      isAdsRequired?: boolean;
    };
    progressInfo?: {
      queuePosition?: number;
      progressState?: number;
      eta?: number;
      isAdsRequired?: boolean;
    };
    errorCode?: number;
    gpuType?: string;
    connectionInfo?: Array<{
      ip?: string;
      port: number;
      usage: number;
      protocol?: number;
      resourcePath?: string;
    }>;
    sessionControlInfo?: {
      ip?: string;
    };
    iceServerConfiguration?: {
      iceServers?: Array<{
        urls: string[] | string;
        username?: string;
        credential?: string;
      }>;
    };
    sessionRequestData?: {
      clientRequestMonitorSettings?: Array<{
        widthInPixels?: number;
        heightInPixels?: number;
        framesPerSecond?: number;
      }>;
      requestedStreamingFeatures?: {
        bitDepth?: number;
        chromaFormat?: number;
        enabledL4S?: boolean;
      };
    };
    finalizedStreamingFeatures?: {
      bitDepth?: number;
      chromaFormat?: number;
      enabledL4S?: boolean;
    };
    monitorSettings?: Array<{
      widthInPixels?: number;
      heightInPixels?: number;
      framesPerSecond?: number;
    }>;
  };
}

interface GetSessionsResponse {
  requestStatus: {
    statusCode: number;
    statusDescription?: string;
    unifiedErrorCode?: number;
  };
  sessions: Array<{
    sessionId: string;
    status: number;
    gpuType?: string;
    sessionRequestData?: {
      appId?: string;
      [key: string]: unknown;
    };
    sessionControlInfo?: {
      ip?: string;
    };
    connectionInfo?: Array<{
      ip?: string;
      port: number;
      usage: number;
      protocol?: number;
    }>;
    monitorSettings?: Array<{
      widthInPixels?: number;
      heightInPixels?: number;
      framesPerSecond?: number;
    }>;
  }>;
}

function colorQualityBitDepth(cq: ColorQuality): number {
  return cq.startsWith('10bit') ? 10 : 0;
}

function colorQualityChromaFormat(cq: ColorQuality): number {
  return cq.endsWith('444') ? 2 : 0;
}

function parseResolution(resolution: string): { width: number; height: number } {
  const parts = resolution.split('x');
  return {
    width: parseInt(parts[0], 10) || 1920,
    height: parseInt(parts[1], 10) || 1080,
  };
}

function buildCloudMatchRequest(
  appId: string,
  internalTitle: string,
  settings: StreamSettings,
  accountLinked: boolean,
  clientId: string,
  deviceId: string
): CloudMatchRequest {
  const { width, height } = parseResolution(settings.resolution);

  return {
    sessionRequestData: {
      appId,
      internalTitle,
      availableSupportedControllers: [1, 2, 3],
      networkTestSessionId: null,
      parentSessionId: null,
      clientIdentification: 'OpenNOW-Mobile',
      deviceHashId: deviceId,
      clientVersion: GFN_CLIENT_VERSION,
      sdkVersion: '99.99.99',
      streamerVersion: 2,
      clientPlatformName: 'android',
      clientRequestMonitorSettings: [
        {
          widthInPixels: width,
          heightInPixels: height,
          framesPerSecond: settings.fps,
          sdrHdrMode: 0,
          displayData: {
            desiredContentMaxLuminance: 270,
            desiredContentMinLuminance: 0,
            desiredContentMaxFrameAverageLuminance: 270,
          },
          dpi: 240,
        },
      ],
      useOps: false,
      audioMode: 0,
      metaData: [],
      sdrHdrMode: 0,
      clientDisplayHdrCapabilities: null,
      surroundAudioInfo: 0,
      remoteControllersBitmap: 0,
      clientTimezoneOffset: new Date().getTimezoneOffset() * -60,
      enhancedStreamMode: 0,
      appLaunchMode: 0,
      secureRTSPSupported: false,
      partnerCustomData: '',
      accountLinked,
      enablePersistingInGameSettings: false,
      userAge: 18,
      requestedStreamingFeatures: {
        reflex: false,
        bitDepth: colorQualityBitDepth(settings.colorQuality),
        cloudGsync: false,
        enabledL4S: settings.enableL4S,
        mouseMovementFlags: 0,
        trueHdr: false,
        supportedHidDevices: 0,
        profile: 0,
        fallbackToLogicalResolution: false,
        hidDevices: null,
        chromaFormat: colorQualityChromaFormat(settings.colorQuality),
        prefilterMode: 0,
        prefilterSharpness: 50,
        prefilterNoiseReduction: 50,
        hudStreamingMode: 0,
        sdrColorSpace: 0,
        hdrColorSpace: 0,
      },
    },
  };
}

function mapIceServers(response: CloudMatchResponse): IceServer[] {
  const raw = response.session.iceServerConfiguration?.iceServers ?? [];
  return raw
    .map((entry) => {
      const urls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
      return {
        urls,
        username: entry.username,
        credential: entry.credential,
      };
    })
    .filter((entry) => entry.urls.length > 0);
}

function mapSessionInfo(response: CloudMatchResponse, zone: string, streamingBaseUrl: string): SessionInfo {
  const session = response.session;
  const controlIp = session.sessionControlInfo?.ip || '';
  const connectionInfo = session.connectionInfo?.find((c) => c.usage === 1);

  // Extract media connection info
  const mediaConnectionInfo = connectionInfo
    ? { ip: connectionInfo.ip || controlIp, port: connectionInfo.port }
    : undefined;

  // Map ad state
  const sessionAds = session.sessionAds || [];
  const adState = {
    isAdsRequired: session.sessionAdsRequired || session.isAdsRequired || false,
    sessionAdsRequired: session.sessionAdsRequired,
    isQueuePaused: session.opportunity?.queuePaused || false,
    gracePeriodSeconds: session.opportunity?.gracePeriodSeconds,
    message: session.opportunity?.message || session.opportunity?.description,
    sessionAds: sessionAds.map((ad) => ({
      adId: ad.adId || '',
      state: ad.adState,
      adState: ad.adState,
      adUrl: ad.adUrl || ad.mediaUrl || ad.videoUrl || ad.url,
      mediaUrl: ad.mediaUrl,
      adMediaFiles: ad.adMediaFiles,
      clickThroughUrl: ad.clickThroughUrl,
      adLengthInSeconds: ad.adLengthInSeconds,
      durationMs: ad.durationMs || ad.durationInMs,
      title: ad.title,
      description: ad.description,
    })),
    ads: sessionAds.map((ad) => ({
      adId: ad.adId || '',
      state: ad.adState,
      adState: ad.adState,
      adUrl: ad.adUrl || ad.mediaUrl || ad.videoUrl || ad.url,
      mediaUrl: ad.mediaUrl,
      adMediaFiles: ad.adMediaFiles,
      clickThroughUrl: ad.clickThroughUrl,
      adLengthInSeconds: ad.adLengthInSeconds,
      durationMs: ad.durationMs || ad.durationInMs,
      title: ad.title,
      description: ad.description,
    })),
    opportunity: session.opportunity,
  };

  return {
    sessionId: session.sessionId,
    status: session.status,
    queuePosition: session.queuePosition || session.seatSetupInfo?.queuePosition || session.sessionProgress?.queuePosition || session.progressInfo?.queuePosition,
    seatSetupStep: session.seatSetupInfo?.seatSetupStep,
    adState,
    zone,
    streamingBaseUrl,
    serverIp: controlIp,
    signalingServer: controlIp,
    signalingUrl: `wss://${controlIp}:443/nvst/`,
    gpuType: session.gpuType,
    iceServers: mapIceServers(response),
    mediaConnectionInfo,
    negotiatedStreamProfile: session.finalizedStreamingFeatures
      ? {
          enableL4S: session.finalizedStreamingFeatures.enabledL4S,
        }
      : undefined,
    clientId: 'opennow-mobile-client',
    deviceId: 'opennow-mobile-device',
  };
}

class SessionService {
  private authService = getAuthService();

  private getHeaders(token: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'User-Agent': GFN_USER_AGENT,
      'Authorization': `Bearer ${token}`,
    };
  }

  async createSession(request: SessionCreateRequest): Promise<SessionInfo> {
    const token = request.token || this.authService.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const streamingBaseUrl = request.streamingBaseUrl || this.authService.getSelectedProvider().streamingServiceUrl;
    const clientId = 'opennow-mobile-client';
    const deviceId = 'opennow-mobile-device';

    // Build CloudMatch request
    const cloudMatchRequest = buildCloudMatchRequest(
      request.appId,
      request.internalTitle,
      request.settings,
      request.accountLinked || false,
      clientId,
      deviceId
    );

    const url = `${streamingBaseUrl}v2/session?clientId=${clientId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify(cloudMatchRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Session creation failed: ${errorText}`);
    }

    const data: CloudMatchResponse = await response.json();

    if (data.requestStatus.statusCode !== 0) {
      throw new Error(`Session creation error: ${data.requestStatus.statusDescription || 'Unknown error'}`);
    }

    return mapSessionInfo(data, request.zone, streamingBaseUrl);
  }

  async pollSession(request: SessionPollRequest): Promise<SessionInfo> {
    const token = request.token || this.authService.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const streamingBaseUrl = request.streamingBaseUrl || this.authService.getSelectedProvider().streamingServiceUrl;
    const serverIp = request.serverIp || '';

    const url = `${streamingBaseUrl}v2/session/${request.sessionId}?${new URLSearchParams({
      clientId: request.clientId || 'opennow-mobile-client',
      deviceId: request.deviceId || 'opennow-mobile-device',
      clientPlatformName: 'android',
    }).toString()}`;

    const response = await fetch(url, {
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Session poll failed: ${errorText}`);
    }

    const data: CloudMatchResponse = await response.json();

    if (data.requestStatus.statusCode !== 0) {
      throw new Error(`Session poll error: ${data.requestStatus.statusDescription || 'Unknown error'}`);
    }

    return mapSessionInfo(data, request.zone, streamingBaseUrl);
  }

  async stopSession(request: SessionStopRequest): Promise<void> {
    const token = request.token || this.authService.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const streamingBaseUrl = request.streamingBaseUrl || this.authService.getSelectedProvider().streamingServiceUrl;

    const url = `${streamingBaseUrl}v2/session/${request.sessionId}?${new URLSearchParams({
      clientId: request.clientId || 'opennow-mobile-client',
      deviceId: request.deviceId || 'opennow-mobile-device',
      clientPlatformName: 'android',
    }).toString()}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(token),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Session stop failed: ${errorText}`);
    }
  }

  async reportSessionAd(request: SessionAdReportRequest): Promise<SessionInfo> {
    const token = request.token || this.authService.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const streamingBaseUrl = request.streamingBaseUrl || this.authService.getSelectedProvider().streamingServiceUrl;
    const serverIp = request.serverIp || '';

    const actionCodes: Record<string, number> = {
      start: 1,
      pause: 2,
      resume: 3,
      finish: 4,
      cancel: 5,
    };

    const url = `${streamingBaseUrl}v2/session/${request.sessionId}?${new URLSearchParams({
      clientId: request.clientId || 'opennow-mobile-client',
      deviceId: request.deviceId || 'opennow-mobile-device',
      clientPlatformName: 'android',
    }).toString()}`;

    const payload = {
      sessionModificationData: {
        adSessionData: {
          adId: request.adId,
          adAction: actionCodes[request.action] || 1,
          clientTimestamp: request.clientTimestamp || Date.now(),
          watchedTimeInMs: request.watchedTimeInMs,
          pausedTimeInMs: request.pausedTimeInMs,
          cancelReason: request.cancelReason,
          errorInfo: request.errorInfo,
        },
      },
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Session ad report failed: ${errorText}`);
    }

    const data: CloudMatchResponse = await response.json();
    return mapSessionInfo(data, request.zone, streamingBaseUrl);
  }

  async getActiveSessions(token?: string, streamingBaseUrl?: string): Promise<ActiveSessionInfo[]> {
    const accessToken = token || this.authService.getAccessToken();
    if (!accessToken) {
      return [];
    }

    const baseUrl = streamingBaseUrl || this.authService.getSelectedProvider().streamingServiceUrl;

    const url = `${baseUrl}v2/session?${new URLSearchParams({
      clientId: 'opennow-mobile-client',
      deviceId: 'opennow-mobile-device',
    }).toString()}`;

    const response = await fetch(url, {
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      return [];
    }

    const data: GetSessionsResponse = await response.json();

    return data.sessions.map((s) => ({
      sessionId: s.sessionId,
      appId: parseInt(s.sessionRequestData?.appId || '0', 10),
      gpuType: s.gpuType,
      status: s.status,
      serverIp: s.sessionControlInfo?.ip,
      resolution: s.monitorSettings?.[0]
        ? `${s.monitorSettings[0].widthInPixels}x${s.monitorSettings[0].heightInPixels}`
        : undefined,
      fps: s.monitorSettings?.[0]?.framesPerSecond,
    }));
  }

  async claimSession(request: SessionClaimRequest): Promise<SessionInfo> {
    const token = request.token || this.authService.getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const streamingBaseUrl = request.streamingBaseUrl || this.authService.getSelectedProvider().streamingServiceUrl;
    const clientId = 'opennow-mobile-client';
    const deviceId = 'opennow-mobile-device';

    const url = `${streamingBaseUrl}v2/session/${request.sessionId}?${new URLSearchParams({
      clientId,
      deviceId,
      clientPlatformName: 'android',
    }).toString()}`;

    const payload = {
      sessionModificationData: {
        state: 'RESUME',
        clientId,
      },
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Session claim failed: ${errorText}`);
    }

    const data: CloudMatchResponse = await response.json();
    return mapSessionInfo(data, 'default', streamingBaseUrl);
  }
}

// Singleton instance
let sessionServiceInstance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!sessionServiceInstance) {
    sessionServiceInstance = new SessionService();
  }
  return sessionServiceInstance;
}

export { SessionService };
