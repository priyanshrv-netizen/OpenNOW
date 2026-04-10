/**
 * OpenNOW Mobile - Settings Storage
 * Handles persistent settings storage for mobile
 * Adapted from opennow-stable/src/main/settings.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Settings,
  DEFAULT_MOBILE_SETTINGS,
  VideoCodec,
  ColorQuality,
  MicrophoneMode,
  AspectRatio,
  KeyboardLayout,
  GameLanguage,
} from '../types/gfn';

const SETTINGS_KEY = '@opennow:settings';

// Mobile-optimized default settings
export const MOBILE_SETTINGS: Settings = {
  ...DEFAULT_MOBILE_SETTINGS,
  // Mobile-specific defaults
  resolution: '1280x720',
  maxBitrateMbps: 20,
  fps: 60,
  codec: 'H264',
  colorQuality: '8bit_420',
  hideStreamButtons: false,
  controllerMode: true,
  controllerUiSounds: true,
  controllerBackgroundAnimations: true,
  autoFullScreen: true,
  microphoneMode: 'disabled',
  enableL4S: false,
};

class SettingsService {
  private settings: Settings = { ...MOBILE_SETTINGS };
  private loaded = false;

  async initialize(): Promise<void> {
    if (this.loaded) return;
    
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Settings>;
        this.settings = this.mergeWithDefaults(parsed);
      }
      this.loaded = true;
    } catch (error) {
      console.error('[Settings] Failed to load settings:', error);
      this.settings = { ...MOBILE_SETTINGS };
    }
  }

  private mergeWithDefaults(partial: Partial<Settings>): Settings {
    return {
      ...MOBILE_SETTINGS,
      ...partial,
      // Ensure arrays are preserved
      favoriteGameIds: partial.favoriteGameIds ?? MOBILE_SETTINGS.favoriteGameIds,
    };
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('[Settings] Failed to save settings:', error);
    }
  }

  getAll(): Settings {
    return { ...this.settings };
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.settings[key];
  }

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    this.settings[key] = value;
    await this.save();
  }

  async setMultiple(updates: Partial<Settings>): Promise<void> {
    this.settings = {
      ...this.settings,
      ...updates,
    };
    await this.save();
  }

  async reset(): Promise<Settings> {
    this.settings = { ...MOBILE_SETTINGS };
    await this.save();
    return this.getAll();
  }

  getDefaults(): Settings {
    return { ...MOBILE_SETTINGS };
  }

  // Validate and fix incompatible settings
  validate(): void {
    // H264 only supports 8bit 4:2:0
    if (this.settings.codec === 'H264' && this.settings.colorQuality !== '8bit_420') {
      console.warn('[Settings] H264 requires 8bit_420, resetting color quality');
      this.settings.colorQuality = '8bit_420';
    }
  }

  // Get stream settings for session creation
  getStreamSettings(): {
    resolution: string;
    fps: number;
    maxBitrateMbps: number;
    codec: VideoCodec;
    colorQuality: ColorQuality;
    keyboardLayout: KeyboardLayout;
    gameLanguage: GameLanguage;
    enableL4S: boolean;
  } {
    return {
      resolution: this.settings.resolution,
      fps: this.settings.fps,
      maxBitrateMbps: this.settings.maxBitrateMbps,
      codec: this.settings.codec,
      colorQuality: this.settings.colorQuality,
      keyboardLayout: this.settings.keyboardLayout,
      gameLanguage: this.settings.gameLanguage,
      enableL4S: this.settings.enableL4S,
    };
  }

  // Add/remove favorite game
  async toggleFavoriteGame(gameId: string): Promise<boolean> {
    const favorites = [...this.settings.favoriteGameIds];
    const index = favorites.indexOf(gameId);
    
    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      favorites.push(gameId);
    }
    
    await this.set('favoriteGameIds', favorites);
    return index < 0; // true if added
  }

  isFavorite(gameId: string): boolean {
    return this.settings.favoriteGameIds.includes(gameId);
  }
}

// Singleton instance
let settingsServiceInstance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!settingsServiceInstance) {
    settingsServiceInstance = new SettingsService();
  }
  return settingsServiceInstance;
}

export { SettingsService };
