/**
 * OpenNOW Mobile - Authentication API
 * Handles OAuth flow and token management for GeForce NOW
 * Adapted from opennow-stable/src/main/gfn/auth.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode as base64Decode } from 'base-64';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import {
  AuthTokens,
  AuthUser,
  AuthSession,
  LoginProvider,
  AuthLoginRequest,
  AuthSessionResult,
  AuthRefreshStatus,
  AuthRefreshOutcome,
  StreamRegion,
  SubscriptionInfo,
  EntitledResolution,
} from '../types/gfn';

// GFN Service URLs
const SERVICE_URLS_ENDPOINT = 'https://pcs.geforcenow.com/v1/serviceUrls';
const TOKEN_ENDPOINT = 'https://login.nvidia.com/token';
const CLIENT_TOKEN_ENDPOINT = 'https://login.nvidia.com/client_token';
const USERINFO_ENDPOINT = 'https://login.nvidia.com/userinfo';
const AUTH_ENDPOINT = 'https://login.nvidia.com/authorize';
const SUBSCRIPTION_ENDPOINT = 'https://subscription.gfntokens.net/v1/subscription';

// Client configuration
const CLIENT_ID = 'ZU7sPN-miLujMD95LfOQ453IB0AtjM8sMyvgJ9wCXEQ';
const SCOPES = 'openid consent email tk_client age';
const DEFAULT_IDP_ID = 'PDiAhv2kJTFeQ7WOPqiQ2tRZ7lGhR2X11dXvM4TZSxg';
const GFN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173';

// Storage keys
const STORAGE_KEY_SESSION = '@opennow:auth_session';
const STORAGE_KEY_TOKENS = '@opennow:auth_tokens';
const STORAGE_KEY_PROVIDER = '@opennow:auth_provider';

// Time windows for token refresh
const TOKEN_REFRESH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const CLIENT_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface ServiceUrlsResponse {
  requestStatus?: {
    statusCode?: number;
  };
  gfnServiceInfo?: {
    gfnServiceEndpoints?: Array<{
      idpId: string;
      loginProviderCode: string;
      loginProviderDisplayName: string;
      streamingServiceUrl: string;
      loginProviderPriority?: number;
    }>;
  };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  client_token?: string;
  expires_in?: number;
}

interface ClientTokenResponse {
  client_token: string;
  expires_in?: number;
}

interface UserinfoResponse {
  sub: string;
  nickname?: string;
  email?: string;
  picture?: string;
  extensions?: {
    membershipTier?: string;
    [key: string]: unknown;
  };
}

interface SubscriptionResponse {
  subscription: {
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
    storageAddon?: {
      type: 'PERMANENT_STORAGE';
      sizeGb?: number;
      usedGb?: number;
      regionName?: string;
      regionCode?: string;
    };
    entitledResolutions: Array<{
      width: number;
      height: number;
      fps: number;
    }>;
  };
}

function defaultProvider(): LoginProvider {
  return {
    idpId: DEFAULT_IDP_ID,
    code: 'NVIDIA',
    displayName: 'NVIDIA',
    streamingServiceUrl: 'https://prod.cloudmatchbeta.nvidiagrid.net/',
    priority: 0,
  };
}

function normalizeProvider(provider: LoginProvider): LoginProvider {
  return {
    ...provider,
    streamingServiceUrl: provider.streamingServiceUrl.endsWith('/')
      ? provider.streamingServiceUrl
      : `${provider.streamingServiceUrl}/`,
  };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
  return base64Decode(padded);
}

function parseJwtPayload<T>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = decodeBase64Url(parts[1]);
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

function toExpiresAt(expiresInSeconds: number | undefined, defaultSeconds = 86400): number {
  return Date.now() + (expiresInSeconds ?? defaultSeconds) * 1000;
}

function isExpired(expiresAt: number | undefined): boolean {
  if (!expiresAt) {
    return true;
  }
  return expiresAt <= Date.now();
}

function isNearExpiry(expiresAt: number | undefined, windowMs: number): boolean {
  if (!expiresAt) {
    return true;
  }
  return expiresAt - Date.now() < windowMs;
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const verifier = Array.from({ length: 128 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');

  const challenge = (await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  ))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { verifier, challenge };
}

function generateDeviceId(): string {
  return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

class AuthService {
  private session: AuthSession | null = null;
  private selectedProvider: LoginProvider | null = null;
  private providers: LoginProvider[] = [];

  async initialize(): Promise<void> {
    await this.loadPersistedSession();
    await this.loadProviders();
  }

  private async loadPersistedSession(): Promise<void> {
    try {
      const [sessionJson, tokensJson, providerJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_SESSION),
        AsyncStorage.getItem(STORAGE_KEY_TOKENS),
        AsyncStorage.getItem(STORAGE_KEY_PROVIDER),
      ]);

      if (providerJson) {
        this.selectedProvider = JSON.parse(providerJson);
      }

      if (tokensJson && sessionJson) {
        const tokens: AuthTokens = JSON.parse(tokensJson);
        const user: AuthUser = JSON.parse(sessionJson);

        if (this.selectedProvider) {
          this.session = {
            provider: this.selectedProvider,
            tokens,
            user,
          };
        }
      }
    } catch (error) {
      console.error('[Auth] Failed to load persisted session:', error);
    }
  }

  private async persistSession(): Promise<void> {
    if (!this.session) {
      await AsyncStorage.multiRemove([STORAGE_KEY_SESSION, STORAGE_KEY_TOKENS, STORAGE_KEY_PROVIDER]);
      return;
    }

    await AsyncStorage.multiSet([
      [STORAGE_KEY_SESSION, JSON.stringify(this.session.user)],
      [STORAGE_KEY_TOKENS, JSON.stringify(this.session.tokens)],
      [STORAGE_KEY_PROVIDER, JSON.stringify(this.session.provider)],
    ]);
  }

  private async loadProviders(): Promise<void> {
    try {
      const response = await fetch(SERVICE_URLS_ENDPOINT, {
        headers: {
          'User-Agent': GFN_USER_AGENT,
        },
      });

      if (!response.ok) {
        console.warn('[Auth] Failed to fetch providers, using default');
        this.providers = [defaultProvider()];
        return;
      }

      const data: ServiceUrlsResponse = await response.json();

      if (data.gfnServiceInfo?.gfnServiceEndpoints) {
        this.providers = data.gfnServiceInfo.gfnServiceEndpoints.map((ep) => ({
          idpId: ep.idpId,
          code: ep.loginProviderCode,
          displayName: ep.loginProviderDisplayName,
          streamingServiceUrl: ep.streamingServiceUrl,
          priority: ep.loginProviderPriority ?? 0,
        }));
      } else {
        this.providers = [defaultProvider()];
      }

      // Sort by priority
      this.providers.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      console.error('[Auth] Error loading providers:', error);
      this.providers = [defaultProvider()];
    }
  }

  async login(request: AuthLoginRequest): Promise<AuthSession> {
    const provider = request.providerIdpId
      ? this.providers.find((p) => p.idpId === request.providerIdpId) || defaultProvider()
      : defaultProvider();

    this.selectedProvider = normalizeProvider(provider);

    const { verifier, challenge } = await generatePkce();
    const state = Math.random().toString(36).substring(2, 15);

    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', 'opennow://oauth/callback');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('idp_id', provider.idpId);

    // Open browser for OAuth
    const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), 'opennow://oauth/callback');

    if (result.type !== 'success' || !result.url) {
      throw new Error('OAuth flow cancelled or failed');
    }

    // Parse callback URL
    const callbackUrl = new URL(result.url);
    const code = callbackUrl.searchParams.get('code');
    const returnedState = callbackUrl.searchParams.get('state');

    if (!code) {
      throw new Error('No authorization code received');
    }

    if (returnedState !== state) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCode(code, verifier);

    // Fetch user info
    const user = await this.fetchUserInfo(tokens.accessToken);

    // Fetch client token
    const clientToken = await this.fetchClientToken(tokens.accessToken);
    if (clientToken) {
      tokens.clientToken = clientToken.client_token;
      tokens.clientTokenExpiresAt = toExpiresAt(clientToken.expires_in);
      tokens.clientTokenLifetimeMs = (clientToken.expires_in ?? 3600) * 1000;
    }

    this.session = {
      provider: this.selectedProvider,
      tokens,
      user,
    };

    await this.persistSession();

    return this.session;
  }

  private async exchangeCode(code: string, verifier: string): Promise<AuthTokens> {
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('client_id', CLIENT_ID);
    params.set('code', code);
    params.set('redirect_uri', 'opennow://oauth/callback');
    params.set('code_verifier', verifier);

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': GFN_USER_AGENT,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const data: TokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      clientToken: data.client_token,
      expiresAt: toExpiresAt(data.expires_in),
    };
  }

  private async fetchUserInfo(accessToken: string): Promise<AuthUser> {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': GFN_USER_AGENT,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`User info fetch failed: ${errorText}`);
    }

    const data: UserinfoResponse = await response.json();

    return {
      userId: data.sub,
      displayName: data.nickname || 'User',
      email: data.email,
      avatarUrl: data.picture,
      membershipTier: data.extensions?.membershipTier || 'free',
    };
  }

  private async fetchClientToken(accessToken: string): Promise<ClientTokenResponse | null> {
    try {
      const response = await fetch(CLIENT_TOKEN_ENDPOINT, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': GFN_USER_AGENT,
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.warn('[Auth] Failed to fetch client token:', error);
      return null;
    }
  }

  async refreshTokens(force = false): Promise<boolean> {
    if (!this.session) {
      return false;
    }

    const { tokens } = this.session;

    // Check if refresh is needed
    if (!force && !isNearExpiry(tokens.expiresAt, TOKEN_REFRESH_WINDOW_MS)) {
      return true; // Token still valid
    }

    if (!tokens.refreshToken) {
      return false; // Can't refresh without refresh token
    }

    try {
      const params = new URLSearchParams();
      params.set('grant_type', 'refresh_token');
      params.set('client_id', CLIENT_ID);
      params.set('refresh_token', tokens.refreshToken);
      params.set('scope', SCOPES);

      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': GFN_USER_AGENT,
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data: TokenResponse = await response.json();

      // Update tokens
      this.session.tokens = {
        ...this.session.tokens,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || tokens.refreshToken,
        idToken: data.id_token || tokens.idToken,
        expiresAt: toExpiresAt(data.expires_in),
      };

      // Refresh client token if needed
      if (isNearExpiry(tokens.clientTokenExpiresAt, CLIENT_TOKEN_REFRESH_WINDOW_MS)) {
        const clientToken = await this.fetchClientToken(data.access_token);
        if (clientToken) {
          this.session.tokens.clientToken = clientToken.client_token;
          this.session.tokens.clientTokenExpiresAt = toExpiresAt(clientToken.expires_in);
        }
      }

      await this.persistSession();
      return true;
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      return false;
    }
  }

  async ensureValidSessionWithStatus(forceRefresh = false): Promise<AuthSessionResult> {
    if (!this.session) {
      return {
        session: null,
        refresh: {
          attempted: false,
          forced: forceRefresh,
          outcome: 'not_attempted',
          message: 'No session available',
        },
      };
    }

    const refreshStatus: AuthRefreshStatus = {
      attempted: false,
      forced: forceRefresh,
      outcome: 'not_attempted',
      message: 'Session valid, no refresh needed',
    };

    // Check if token needs refresh
    if (forceRefresh || isNearExpiry(this.session.tokens.expiresAt, TOKEN_REFRESH_WINDOW_MS)) {
      refreshStatus.attempted = true;

      const success = await this.refreshTokens(forceRefresh);

      if (success) {
        refreshStatus.outcome = 'refreshed';
        refreshStatus.message = 'Token refreshed successfully';
      } else {
        refreshStatus.outcome = 'failed';
        refreshStatus.message = 'Token refresh failed';
      }
    }

    return {
      session: this.session,
      refresh: refreshStatus,
    };
  }

  async logout(): Promise<void> {
    this.session = null;
    this.selectedProvider = null;
    await AsyncStorage.multiRemove([STORAGE_KEY_SESSION, STORAGE_KEY_TOKENS, STORAGE_KEY_PROVIDER]);
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  isAuthenticated(): boolean {
    return this.session !== null && !isExpired(this.session.tokens.expiresAt);
  }

  getProviders(): LoginProvider[] {
    return this.providers;
  }

  getSelectedProvider(): LoginProvider {
    return this.selectedProvider || defaultProvider();
  }

  getAccessToken(): string | null {
    return this.session?.tokens.accessToken || null;
  }

  async getRegions(): Promise<StreamRegion[]> {
    // Default regions for GeForce NOW
    const regions: StreamRegion[] = [
      { name: 'North West', url: 'https://nw.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'North East', url: 'https://ne.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'South East', url: 'https://se.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'South West', url: 'https://sw.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'Europe Central', url: 'https://ec.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'Europe West', url: 'https://ew.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'Asia Southeast', url: 'https://as.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'Asia Northeast', url: 'https://an.cloudmatchbeta.nvidiagrid.net/' },
      { name: 'Australia', url: 'https://au.cloudmatchbeta.nvidiagrid.net/' },
    ];

    // Ping each region to get latency
    const pingedRegions = await Promise.all(
      regions.map(async (region) => {
        try {
          const start = Date.now();
          const response = await fetch(`${region.url}v2/serverInfo`, {
            method: 'HEAD',
            headers: { 'User-Agent': GFN_USER_AGENT },
          });
          const pingMs = Date.now() - start;
          return { ...region, pingMs: response.ok ? pingMs : undefined };
        } catch {
          return { ...region, pingMs: undefined };
        }
      })
    );

    // Sort by latency
    return pingedRegions.sort((a, b) => {
      if (a.pingMs == null) return 1;
      if (b.pingMs == null) return -1;
      return (a.pingMs || 0) - (b.pingMs || 0);
    });
  }

  async fetchSubscription(userId: string): Promise<SubscriptionInfo> {
    const token = await this.getValidAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${SUBSCRIPTION_ENDPOINT}?userId=${encodeURIComponent(userId)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': GFN_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch subscription');
    }

    const data: SubscriptionResponse = await response.json();

    return {
      membershipTier: data.subscription.membershipTier,
      subscriptionType: data.subscription.subscriptionType,
      subscriptionSubType: data.subscription.subscriptionSubType,
      allottedHours: data.subscription.allottedHours,
      purchasedHours: data.subscription.purchasedHours,
      rolledOverHours: data.subscription.rolledOverHours,
      usedHours: data.subscription.usedHours,
      remainingHours: data.subscription.remainingHours,
      totalHours: data.subscription.totalHours,
      firstEntitlementStartDateTime: data.subscription.firstEntitlementStartDateTime,
      serverRegionId: data.subscription.serverRegionId,
      currentSpanStartDateTime: data.subscription.currentSpanStartDateTime,
      currentSpanEndDateTime: data.subscription.currentSpanEndDateTime,
      notifyUserWhenTimeRemainingInMinutes: data.subscription.notifyUserWhenTimeRemainingInMinutes,
      notifyUserOnSessionWhenRemainingTimeInMinutes: data.subscription.notifyUserOnSessionWhenRemainingTimeInMinutes,
      state: data.subscription.state,
      isGamePlayAllowed: data.subscription.isGamePlayAllowed,
      isUnlimited: data.subscription.isUnlimited,
      storageAddon: data.subscription.storageAddon,
      entitledResolutions: data.subscription.entitledResolutions,
    };
  }

  private async getValidAccessToken(): Promise<string | null> {
    if (!this.session) {
      return null;
    }

    // Refresh if needed
    await this.refreshTokens();

    return this.session.tokens.accessToken;
  }
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}

export { AuthService };
