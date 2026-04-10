/**
 * OpenNOW Mobile - Stream Screen
 * Handles WebRTC video streaming with touch controls
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  PanResponder,
  PanResponderGestureState,
  GestureResponderEvent,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { GameInfo, SessionInfo, StreamSettings, SessionAdInfo, MobileStreamDiagnostics } from '../types/index';
import { getSessionService, getStreamingService, getSignalingService, getAuthService, getSettingsService } from '../api/index';
import { TouchInputHandler, VirtualGamepadHandler } from '../utils/inputProtocol';

// react-native-webrtc components
let RTCView: any;
try {
  const webrtc = require('react-native-webrtc');
  RTCView = webrtc.RTCView;
} catch {
  console.warn('react-native-webrtc not available');
  RTCView = View;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface StreamScreenProps {
  game: GameInfo;
  onExit: () => void;
}

export const StreamScreen: React.FC<StreamScreenProps> = ({ game, onExit }) => {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'queue' | 'ads' | 'ready' | 'streaming' | 'error'>('queue');
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [currentAd, setCurrentAd] = useState<SessionAdInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [diagnostics, setDiagnostics] = useState<MobileStreamDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [touchpadMode, setTouchpadMode] = useState(false);
  const [virtualGamepadVisible, setVirtualGamepadVisible] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);

  const touchInputRef = useRef(new TouchInputHandler());
  const virtualGamepadRef = useRef(new VirtualGamepadHandler());
  const fadeAnim = useRef(new Animated.Value(1)).current;
  
  const sessionService = getSessionService();
  const streamingService = getStreamingService();
  const signalingService = getSignalingService();
  const authService = getAuthService();
  const settingsService = getSettingsService();

  useEffect(() => {
    initializeSession();
    return () => cleanup();
  }, []);

  useEffect(() => {
    // Auto-hide controls after 3 seconds
    if (showControls) {
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [showControls]);

  const initializeSession = async () => {
    try {
      const settings = settingsService.getStreamSettings();
      const token = authService.getAccessToken();
      const provider = authService.getSelectedProvider();
      
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Create session
      const newSession = await sessionService.createSession({
        token,
        streamingBaseUrl: provider.streamingServiceUrl,
        appId: game.variants[game.selectedVariantIndex]?.id || game.id,
        internalTitle: game.title,
        zone: settingsService.get('region') || 'default',
        settings,
      });

      setSession(newSession);
      handleSessionState(newSession);
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start session');
      setSessionStatus('error');
    }
  };

  const handleSessionState = (sess: SessionInfo) => {
    switch (sess.status) {
      case 0: // Waiting
      case 1: // In queue
        setSessionStatus('queue');
        setQueuePosition(sess.queuePosition || null);
        // Poll for updates
        setTimeout(() => pollSession(sess), 2000);
        break;
      
      case 2: // Ready
      case 3: // Streaming
        if (sess.adState?.isAdsRequired && sess.adState.sessionAds.length > 0) {
          setSessionStatus('ads');
          setCurrentAd(sess.adState.sessionAds[0]);
        } else {
          startStreaming(sess);
        }
        break;
      
      default:
        setSessionStatus('error');
        setErrorMessage(`Unknown session status: ${sess.status}`);
    }
  };

  const pollSession = async (sess: SessionInfo) => {
    try {
      const token = authService.getAccessToken();
      const provider = authService.getSelectedProvider();
      
      const updated = await sessionService.pollSession({
        token: token || undefined,
        streamingBaseUrl: provider.streamingServiceUrl,
        serverIp: sess.serverIp,
        zone: sess.zone,
        sessionId: sess.sessionId,
      });

      setSession(updated);
      handleSessionState(updated);
    } catch (error) {
      console.error('Poll error:', error);
      // Retry after delay
      setTimeout(() => pollSession(sess), 5000);
    }
  };

  const startStreaming = async (sess: SessionInfo) => {
    try {
      const settings = settingsService.getStreamSettings();
      
      // Initialize WebRTC streaming
      await streamingService.initialize(sess, settings, {
        onLog: (msg) => console.log('[Stream]', msg),
        onStats: (stats) => setDiagnostics(stats),
        onConnectionStateChange: (state) => {
          console.log('[Stream] Connection state:', state);
          if (state === 'connected') {
            setSessionStatus('streaming');
          } else if (state === 'failed') {
            setErrorMessage('Connection failed');
            setSessionStatus('error');
          }
        },
        microphoneMode: settingsService.get('microphoneMode'),
      });

      setSessionStatus('ready');
    } catch (error) {
      console.error('Streaming error:', error);
      setErrorMessage('Failed to start streaming');
      setSessionStatus('error');
    }
  };

  const cleanup = () => {
    streamingService.dispose();
    
    if (session) {
      // Stop session
      const token = authService.getAccessToken();
      const provider = authService.getSelectedProvider();
      
      sessionService.stopSession({
        token: token || undefined,
        streamingBaseUrl: provider.streamingServiceUrl,
        serverIp: session.serverIp,
        zone: session.zone,
        sessionId: session.sessionId,
      }).catch((err) => console.error('Failed to stop session:', err));
    }
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    
    // Show controls on touch
    if (!showControls) {
      setShowControls(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    if (sessionStatus === 'streaming') {
      const inputData = touchInputRef.current.onTouchStart(0, locationX, locationY);
      if (inputData) {
        streamingService.sendInput(inputData);
      }
    }
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (sessionStatus !== 'streaming') return;
    
    const { locationX, locationY } = e.nativeEvent;
    const inputData = touchInputRef.current.onTouchMove(0, locationX, locationY);
    if (inputData) {
      streamingService.sendInput(inputData);
    }
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    if (sessionStatus !== 'streaming') return;
    
    const inputData = touchInputRef.current.onTouchEnd(0);
    if (inputData) {
      streamingService.sendInput(inputData);
    }
  };

  const confirmExit = () => {
    Alert.alert(
      'End Session',
      'Are you sure you want to quit this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Quit', style: 'destructive', onPress: onExit },
      ]
    );
  };

  // Pan responder for touch gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: handleTouchStart,
      onPanResponderMove: handleTouchMove,
      onPanResponderRelease: handleTouchEnd,
    })
  ).current;

  // Render based on session status
  if (sessionStatus === 'queue') {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#76B900" />
          <Text style={styles.statusTitle}>Waiting in Queue</Text>
          {queuePosition !== null && (
            <Text style={styles.statusNumber}>#{queuePosition}</Text>
          )}
          <Text style={styles.statusSubtitle}>{game.title}</Text>
        </View>
      </View>
    );
  }

  if (sessionStatus === 'ads') {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.centerContent}>
          <Text style={styles.statusTitle}>Sponsored Session</Text>
          <Text style={styles.statusSubtitle}>Please watch the ad to continue</Text>
          {currentAd && (
            <Text style={styles.adTitle}>{currentAd.title}</Text>
          )}
        </View>
      </View>
    );
  }

  if (sessionStatus === 'error') {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.centerContent}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onExit}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar hidden />
      
      {/* Video Stream */}
      <View style={styles.videoContainer}>
        {RTCView && (
          <RTCView
            style={styles.video}
            streamURL={((streamingService.getVideoStream() as any)?.toURL?.())}
            objectFit="contain"
          />
        )}
      </View>

      {/* Overlay Controls */}
      {showControls && (
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={confirmExit} style={styles.controlButton}>
              <Text style={styles.controlIcon}>✕</Text>
            </TouchableOpacity>
            
            <Text style={styles.gameTitle} numberOfLines={1}>
              {game.title}
            </Text>

            <View style={styles.topRightControls}>
              <TouchableOpacity 
                onPress={() => setShowDiagnostics(!showDiagnostics)} 
                style={styles.controlButton}
              >
                <Text style={styles.controlIcon}>📊</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Diagnostics Panel */}
          {showDiagnostics && diagnostics && (
            <View style={styles.diagnosticsPanel}>
              <Text style={styles.diagText}>Resolution: {diagnostics.resolution}</Text>
              <Text style={styles.diagText}>Codec: {diagnostics.codec}</Text>
              <Text style={styles.diagText}>FPS: {diagnostics.decodeFps}</Text>
              <Text style={styles.diagText}>Packet Loss: {diagnostics.packetLossPercent}%</Text>
              <Text style={styles.diagText}>Latency: {diagnostics.rttMs}ms</Text>
            </View>
          )}

          {/* Bottom Bar */}
          <View style={styles.bottomBar}>
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={() => setTouchpadMode(!touchpadMode)}
            >
              <Text style={[styles.controlIcon, touchpadMode && styles.activeControl]}>
                🖱️
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={() => setVirtualGamepadVisible(!virtualGamepadVisible)}
            >
              <Text style={[styles.controlIcon, virtualGamepadVisible && styles.activeControl]}>
                🎮
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.controlButton}
              onPress={() => streamingService.toggleMicrophone()}
            >
              <Text style={styles.controlIcon}>
                {microphoneEnabled ? '🎤' : '🎤❌'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Virtual Gamepad (simplified - full implementation would have more buttons) */}
      {virtualGamepadVisible && (
        <View style={styles.virtualGamepad}>
          <View style={styles.dpadContainer}>
            <TouchableOpacity 
              style={styles.dpadButton}
              onPressIn={() => streamingService.sendInput(virtualGamepadRef.current.setButton(12, true))}
              onPressOut={() => streamingService.sendInput(virtualGamepadRef.current.setButton(12, false))}
            >
              <Text style={styles.dpadText}>▲</Text>
            </TouchableOpacity>
            <View style={styles.dpadMiddle}>
              <TouchableOpacity 
                style={styles.dpadButton}
                onPressIn={() => streamingService.sendInput(virtualGamepadRef.current.setButton(14, true))}
                onPressOut={() => streamingService.sendInput(virtualGamepadRef.current.setButton(14, false))}
              >
                <Text style={styles.dpadText}>◀</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.dpadButton}
                onPressIn={() => streamingService.sendInput(virtualGamepadRef.current.setButton(15, true))}
                onPressOut={() => streamingService.sendInput(virtualGamepadRef.current.setButton(15, false))}
              >
                <Text style={styles.dpadText}>▶</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity 
              style={styles.dpadButton}
              onPressIn={() => streamingService.sendInput(virtualGamepadRef.current.setButton(13, true))}
              onPressOut={() => streamingService.sendInput(virtualGamepadRef.current.setButton(13, false))}
            >
              <Text style={styles.dpadText}>▼</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: '#76B900' }]}
              onPressIn={() => streamingService.sendInput(virtualGamepadRef.current.setButton(0, true))}
              onPressOut={() => streamingService.sendInput(virtualGamepadRef.current.setButton(0, false))}
            >
              <Text style={styles.actionText}>A</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: '#FF4444' }]}
              onPressIn={() => streamingService.sendInput(virtualGamepadRef.current.setButton(1, true))}
              onPressOut={() => streamingService.sendInput(virtualGamepadRef.current.setButton(1, false))}
            >
              <Text style={styles.actionText}>B</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  statusTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 24,
  },
  statusNumber: {
    color: '#76B900',
    fontSize: 48,
    fontWeight: 'bold',
    marginVertical: 16,
  },
  statusSubtitle: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  adTitle: {
    color: '#76B900',
    fontSize: 18,
    marginTop: 16,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#FF4444',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#76B900',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  videoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  gameTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 16,
    textAlign: 'center',
  },
  topRightControls: {
    flexDirection: 'row',
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  controlIcon: {
    fontSize: 20,
    color: '#FFF',
  },
  activeControl: {
    color: '#76B900',
  },
  diagnosticsPanel: {
    position: 'absolute',
    top: 100,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 12,
    borderRadius: 8,
  },
  diagText: {
    color: '#76B900',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
  },
  virtualGamepad: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  dpadContainer: {
    alignItems: 'center',
  },
  dpadMiddle: {
    flexDirection: 'row',
    gap: 20,
  },
  dpadButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
  },
  dpadText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  actionButtons: {
    gap: 20,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
