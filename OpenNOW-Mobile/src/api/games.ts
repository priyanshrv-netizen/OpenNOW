/**
 * OpenNOW Mobile - Games API
 * Handles fetching game catalog and library
 * Adapted from opennow-stable/src/main/gfn/games.ts
 */

import { GameInfo, GamesFetchRequest } from '../types/gfn';
import { getAuthService } from './auth';

const GFN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173';

// GeForce NOW public catalog endpoints
const PUBLIC_GAMES_ENDPOINT = 'https://public.games.geforcenow.com/v1/games';
const USER_LIBRARY_ENDPOINT = 'https://library.games.geforcenow.com/v1/games';
const MAIN_GAMES_ENDPOINT = 'https://games.geforcenow.com/v1/games';

interface GfnGame {
  id: string;
  title: string;
  description?: string;
  longDescription?: string;
  genres?: string[];
  imageUrl?: string;
  screenshotUrl?: string;
  playType?: string;
  membershipTierLabel?: string;
  featureLabels?: string[];
  appId?: string;
  variants?: Array<{
    id: string;
    store: string;
    supportedControls?: string[];
  }>;
}

interface GfnGamesResponse {
  games: GfnGame[];
}

function mapGfnGame(game: GfnGame): GameInfo {
  return {
    id: game.id,
    title: game.title,
    description: game.description,
    longDescription: game.longDescription,
    genres: game.genres,
    imageUrl: game.imageUrl,
    screenshotUrl: game.screenshotUrl,
    playType: game.playType,
    membershipTierLabel: game.membershipTierLabel,
    featureLabels: game.featureLabels,
    selectedVariantIndex: 0,
    variants: (game.variants || []).map((v) => ({
      id: v.id,
      store: v.store,
      supportedControls: v.supportedControls || [],
    })),
  };
}

class GamesService {
  private authService = getAuthService();

  async fetchMainGames(request?: GamesFetchRequest): Promise<GameInfo[]> {
    const token = request?.token || this.authService.getAccessToken();
    
    const headers: Record<string, string> = {
      'User-Agent': GFN_USER_AGENT,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(MAIN_GAMES_ENDPOINT, {
        headers,
      });

      if (!response.ok) {
        console.warn('[Games] Failed to fetch main games:', response.status);
        return [];
      }

      const data: GfnGamesResponse = await response.json();
      return (data.games || []).map(mapGfnGame);
    } catch (error) {
      console.error('[Games] Error fetching main games:', error);
      return [];
    }
  }

  async fetchLibraryGames(request?: GamesFetchRequest): Promise<GameInfo[]> {
    const token = request?.token || this.authService.getAccessToken();
    
    if (!token) {
      console.log('[Games] No auth token, returning empty library');
      return [];
    }

    try {
      const response = await fetch(USER_LIBRARY_ENDPOINT, {
        headers: {
          'User-Agent': GFN_USER_AGENT,
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.warn('[Games] Failed to fetch library games:', response.status);
        return [];
      }

      const data: GfnGamesResponse = await response.json();
      return (data.games || []).map(mapGfnGame);
    } catch (error) {
      console.error('[Games] Error fetching library games:', error);
      return [];
    }
  }

  async fetchPublicGames(): Promise<GameInfo[]> {
    try {
      const response = await fetch(PUBLIC_GAMES_ENDPOINT, {
        headers: {
          'User-Agent': GFN_USER_AGENT,
        },
      });

      if (!response.ok) {
        console.warn('[Games] Failed to fetch public games:', response.status);
        return [];
      }

      const data: GfnGamesResponse = await response.json();
      return (data.games || []).map(mapGfnGame);
    } catch (error) {
      console.error('[Games] Error fetching public games:', error);
      return [];
    }
  }

  async resolveLaunchAppId(appIdOrUuid: string, token?: string, streamingBaseUrl?: string): Promise<string | null> {
    const accessToken = token || this.authService.getAccessToken();
    const baseUrl = streamingBaseUrl || this.authService.getSelectedProvider().streamingServiceUrl;

    if (!accessToken) {
      return null;
    }

    try {
      // Try to resolve as UUID first
      const response = await fetch(`${baseUrl}v1/game/id?uuid=${encodeURIComponent(appIdOrUuid)}`, {
        headers: {
          'User-Agent': GFN_USER_AGENT,
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.appId) {
          return data.appId;
        }
      }

      // If resolution fails, assume it's already an appId
      return appIdOrUuid;
    } catch (error) {
      console.error('[Games] Error resolving launch app ID:', error);
      return appIdOrUuid;
    }
  }

  searchGames(games: GameInfo[], query: string): GameInfo[] {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return games;
    }

    return games.filter((game) => {
      const titleMatch = game.title.toLowerCase().includes(lowerQuery);
      const genreMatch = game.genres?.some((g) => g.toLowerCase().includes(lowerQuery));
      return titleMatch || genreMatch;
    });
  }

  filterGamesByTier(games: GameInfo[], tier: string): GameInfo[] {
    if (tier === 'all') {
      return games;
    }
    return games.filter(
      (game) => !game.membershipTierLabel || game.membershipTierLabel.toLowerCase() === tier.toLowerCase()
    );
  }
}

// Singleton instance
let gamesServiceInstance: GamesService | null = null;

export function getGamesService(): GamesService {
  if (!gamesServiceInstance) {
    gamesServiceInstance = new GamesService();
  }
  return gamesServiceInstance;
}

export { GamesService };
