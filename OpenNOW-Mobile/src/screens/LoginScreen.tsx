/**
 * OpenNOW Mobile - Login Screen
 * OAuth authentication with GeForce NOW
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { getAuthService } from '../api/index';
import { LoginProvider } from '../types/index';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<LoginProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const authService = getAuthService();

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      await authService.initialize();
      const availableProviders = authService.getProviders();
      setProviders(availableProviders);
      
      // Check if already authenticated
      if (authService.isAuthenticated()) {
        onLoginSuccess();
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleLogin = async (providerIdpId?: string) => {
    setLoading(true);
    
    try {
      await authService.login({ providerIdpId });
      onLoginSuccess();
    } catch (error) {
      console.error('Login failed:', error);
      Alert.alert(
        'Login Failed',
        error instanceof Error ? error.message : 'Authentication failed. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const getProviderIcon = (code: string): string => {
    const icons: Record<string, string> = {
      NVIDIA: '🎮',
      STEAM: '🎲',
      EPIC: '⛰️',
      GOOGLE: '🔍',
    };
    return icons[code] || '🔐';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>🎮</Text>
          <Text style={styles.title}>OpenNOW</Text>
          <Text style={styles.subtitle}>GeForce NOW for Android</Text>
        </View>

        {/* Login Options */}
        <View style={styles.loginContainer}>
          {loadingProviders ? (
            <ActivityIndicator size="large" color="#76B900" />
          ) : (
            <>
              <Text style={styles.sectionTitle}>Sign in with</Text>
              
              {providers.map((provider) => (
                <TouchableOpacity
                  key={provider.idpId}
                  style={styles.providerButton}
                  onPress={() => handleLogin(provider.idpId)}
                  disabled={loading}
                >
                  <Text style={styles.providerIcon}>
                    {getProviderIcon(provider.code)}
                  </Text>
                  <Text style={styles.providerName}>
                    {provider.displayName}
                  </Text>
                </TouchableOpacity>
              ))}
              
              {/* Default NVIDIA login */}
              {providers.length === 0 && (
                <TouchableOpacity
                  style={[styles.providerButton, styles.primaryButton]}
                  onPress={() => handleLogin()}
                  disabled={loading}
                >
                  <Text style={styles.providerIcon}>🎮</Text>
                  <Text style={[styles.providerName, styles.primaryText]}>
                    NVIDIA Account
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
          
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#76B900" />
              <Text style={styles.loadingText}>Connecting to GeForce NOW...</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Not affiliated with NVIDIA. GeForce NOW is a trademark of NVIDIA Corporation.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  logoIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    marginTop: 8,
  },
  loginContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  primaryButton: {
    backgroundColor: '#76B900',
    borderColor: '#76B900',
  },
  providerIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  providerName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  primaryText: {
    color: '#000000',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 13, 13, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 14,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 18,
  },
});
