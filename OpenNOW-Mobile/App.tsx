/**
 * OpenNOW Mobile - Main App
 * GeForce NOW Android Client
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  AppState,
  Alert,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { getAuthService, getSettingsService } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { StreamScreen } from './src/screens/StreamScreen';
import { GameInfo, AuthSession } from './src/types/gfn';

type AppScreen = 'loading' | 'login' | 'home' | 'stream';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('loading');
  const [activeGame, setActiveGame] = useState<GameInfo | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authService = getAuthService();
  const settingsService = getSettingsService();

  useEffect(() => {
    initializeApp();

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        // App went to background - could pause streaming here
        console.log('[App] Backgrounded');
      } else if (nextAppState === 'active') {
        // App came to foreground
        console.log('[App] Active');
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize services
      await settingsService.initialize();
      await authService.initialize();

      // Check if user is already authenticated
      if (authService.isAuthenticated()) {
        const currentSession = authService.getSession();
        setSession(currentSession);
        setCurrentScreen('home');
      } else {
        setCurrentScreen('login');
      }
    } catch (error) {
      console.error('[App] Initialization error:', error);
      setError('Failed to initialize app');
      setCurrentScreen('login');
    }
  };

  const handleLoginSuccess = () => {
    const currentSession = authService.getSession();
    setSession(currentSession);
    setCurrentScreen('home');
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      setSession(null);
      setCurrentScreen('login');
    } catch (error) {
      console.error('[App] Logout error:', error);
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
  };

  const handleLaunchGame = (game: GameInfo) => {
    setActiveGame(game);
    setCurrentScreen('stream');
  };

  const handleExitStream = () => {
    setActiveGame(null);
    setCurrentScreen('home');
  };

  // Show loading
  if (currentScreen === 'loading') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
        <ActivityIndicator size="large" color="#76B900" />
      </View>
    );
  }

  // Show login screen
  if (currentScreen === 'login') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  // Show streaming screen
  if (currentScreen === 'stream' && activeGame) {
    return (
      <>
        <StatusBar hidden />
        <StreamScreen game={activeGame} onExit={handleExitStream} />
      </>
    );
  }

  // Show home screen
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />
      <HomeScreen onLogout={handleLogout} onLaunchGame={handleLaunchGame} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
