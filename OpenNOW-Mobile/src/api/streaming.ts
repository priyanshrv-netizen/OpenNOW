/**
 * OpenNOW Mobile - WebRTC Streaming Client
 * Handles video/audio streaming with GeForce NOW servers
 * React Native WebRTC implementation
 */

import {
  SessionInfo,
  StreamSettings,
  VideoCodec,
  ColorQuality,
  MobileStreamDiagnostics,
  StreamLagReason,
  IceCandidatePayload,
  MicrophoneMode,
} from '../types/gfn';
import { getSignalingService } from './signaling';

// react-native-webrtc types - will be imported dynamically
let RTCView: any;
let mediaDevices: any;
let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let MediaStream: any;

try {
  const webrtc = require('react-native-webrtc');
  RTCView = webrtc.RTCView;
  mediaDevices = webrtc.mediaDevices;
  RTCPeerConnection = webrtc.RTCPeerConnection;
  RTCIceCandidate = webrtc.RTCIceCandidate;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  MediaStream = webrtc.MediaStream;
} catch {
  console.warn('[Streaming] react-native-webrtc not available, using web fallback');
  RTCView = null;
  mediaDevices = null;
  RTCPeerConnection = global.RTCPeerConnection || null;
  RTCIceCandidate = global.RTCIceCandidate || null;
  RTCSessionDescription = global.RTCSessionDescription || null;
  MediaStream = global.MediaStream || null;
}

interface StreamOptions {
  onLog?: (message: string) => void;
  onStats?: (stats: MobileStreamDiagnostics) => void;
  onConnectionStateChange?: (state: string) => void;
  onTimeWarning?: (code: 1 | 2 | 3, secondsLeft?: number) => void;
  microphoneMode?: MicrophoneMode;
}

export class StreamingService {
  private pc: RTCPeerConnection | null = null;
  private videoStream: MediaStream;
  private audioStream: MediaStream;
  private session: SessionInfo | null = null;
  private settings: StreamSettings | null = null;
  private options: StreamOptions = {};
  private signalingService = getSignalingService();
  private signalingUnsubscribe: (() => void) | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private micTrack: any | null = null;
  private micEnabled = false;
  private queuedCandidates: RTCIceCandidateInit[] = [];
  private connectionAttempts = 0;
  private decoderRecoveryAttempts = 0;
  private lastStats: MobileStreamDiagnostics | null = null;

  constructor() {
    // Initialize empty streams
    this.videoStream = new MediaStream();
    this.audioStream = new MediaStream();
  }

  async initialize(session: SessionInfo, settings: StreamSettings, options: StreamOptions = {}): Promise<void> {
    this.session = session;
    this.settings = settings;
    this.options = options;
    this.connectionAttempts = 0;
    this.decoderRecoveryAttempts = 0;

    this.log('Initializing streaming client');
    this.log(`Session: ${session.sessionId}, Server: ${session.serverIp}`);
    this.log(`Settings: ${settings.resolution} @ ${settings.fps}fps, ${settings.codec}`);

    // Setup signaling event listener
    this.signalingUnsubscribe = this.signalingService.onEvent((event) => {
      this.handleSignalingEvent(event);
    });

    // Connect to signaling
    await this.signalingService.connect({
      sessionId: session.sessionId,
      signalingServer: session.signalingServer,
      signalingUrl: session.signalingUrl,
    });

    this.log('Signaling connected, waiting for offer...');
  }

  private log(message: string): void {
    console.log(`[Streaming] ${message}`);
    this.options.onLog?.(message);
  }

  private getVideoConstraints(): MediaTrackConstraints {
    const { width, height } = this.parseResolution(this.settings?.resolution || '1280x720');

    return {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: this.settings?.fps || 60 },
    };
  }

  private parseResolution(resolution: string): { width: number; height: number } {
    const parts = resolution.split('x');
    return {
      width: parseInt(parts[0], 10) || 1280,
      height: parseInt(parts[1], 10) || 720,
    };
  }

  private createPeerConnection(): RTCPeerConnection {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const iceServers = this.session.iceServers.map((s) => ({
      urls: s.urls,
      username: s.username,
      credential: s.credential,
    }));

    const config: RTCConfiguration = {
      iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 0,
    };

    return new RTCPeerConnection(config);
  }

  private async handleSignalingEvent(event: {
    type: string;
    sdp?: string;
    candidate?: IceCandidatePayload;
    reason?: string;
    message?: string;
  }): Promise<void> {
    switch (event.type) {
      case 'connected':
        this.log('Signaling connected');
        break;
      case 'disconnected':
        this.log(`Signaling disconnected: ${event.reason}`);
        this.options.onConnectionStateChange?.('disconnected');
        break;
      case 'offer':
        if (event.sdp) {
          await this.handleOffer(event.sdp);
        }
        break;
      case 'remote-ice':
        if (event.candidate) {
          await this.handleRemoteIceCandidate(event.candidate);
        }
        break;
      case 'error':
        this.log(`Signaling error: ${event.message}`);
        break;
    }
  }

  private async handleOffer(sdp: string): Promise<void> {
    this.log('Received offer SDP');
    this.connectionAttempts++;

    try {
      // Create peer connection
      this.pc = this.createPeerConnection();

      // Setup event handlers
      this.setupPeerConnectionHandlers();

      // Set remote description (offer)
      await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));

      // Process any queued candidates
      for (const candidate of this.queuedCandidates) {
        try {
          await this.pc.addIceCandidate(candidate);
        } catch (error) {
          this.log(`Failed to add queued candidate: ${error}`);
        }
      }
      this.queuedCandidates = [];

      // Create answer
      const answer = await this.pc.createAnswer();
      
      if (!answer.sdp) {
        throw new Error('Failed to create SDP answer');
      }

      // Apply codec preference if not H264
      if (this.settings?.codec && this.settings.codec !== 'H264') {
        answer.sdp = this.preferCodec(answer.sdp, this.settings.codec);
      }

      // Apply color quality settings
      if (this.settings?.colorQuality) {
        answer.sdp = this.applyColorQuality(answer.sdp, this.settings.colorQuality);
      }

      // Set local description
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Send answer to signaling
      const localSdp = this.pc.localDescription?.sdp || answer.sdp;
      if (!localSdp) {
        throw new Error('Failed to get local SDP');
      }
      await this.signalingService.sendAnswer({
        sdp: localSdp,
        nvstSdp: this.buildNvstSdp(localSdp),
      });

      this.log('Sent answer SDP');

      // Inject media connection info as ICE candidate
      if (this.session?.mediaConnectionInfo) {
        await this.injectMediaConnectionCandidate();
      }

      // Start stats collection
      this.startStatsCollection();

      // Setup input channel
      this.setupInputChannel();

      // Initialize microphone if needed
      if (this.options.microphoneMode && this.options.microphoneMode !== 'disabled') {
        await this.initializeMicrophone();
      }
    } catch (error) {
      this.log(`Error handling offer: ${error}`);
      throw error;
    }
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingService.sendIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment || null,
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      this.log(`Connection state: ${state}`);
      this.options.onConnectionStateChange?.(state || 'unknown');

      if (state === 'failed') {
        this.attemptRecovery();
      }
    };

    this.pc.ontrack = (event) => {
      this.log(`Received track: ${event.track.kind}`);
      if (event.track.kind === 'video') {
        this.videoStream.addTrack(event.track);
      } else if (event.track.kind === 'audio') {
        this.audioStream.addTrack(event.track);
      }
    };

    this.pc.ondatachannel = (event) => {
      this.log('Received data channel');
      // Handle any incoming data channels
    };
  }

  private setupInputChannel(): void {
    if (!this.pc) return;

    this.inputChannel = this.pc.createDataChannel('input', {
      ordered: false,
      maxRetransmits: 0,
    });

    this.inputChannel.onopen = () => {
      this.log('Input channel opened');
    };

    this.inputChannel.onclose = () => {
      this.log('Input channel closed');
    };

    this.inputChannel.onerror = (error) => {
      this.log(`Input channel error: ${error}`);
    };
  }

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) {
        resolve();
        return;
      }

      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);

      // Timeout after 5 seconds
      setTimeout(() => {
        this.pc?.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 5000);
    });
  }

  private async handleRemoteIceCandidate(candidate: IceCandidatePayload): Promise<void> {
    const init: RTCIceCandidateInit = {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid ?? undefined,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      usernameFragment: candidate.usernameFragment ?? undefined,
    };

    if (!this.pc) {
      this.queuedCandidates.push(init);
      return;
    }

    if (!this.pc.remoteDescription) {
      this.queuedCandidates.push(init);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(init));
    } catch (error) {
      this.log(`Failed to add ICE candidate: ${error}`);
    }
  }

  private async injectMediaConnectionCandidate(): Promise<void> {
    if (!this.pc || !this.session?.mediaConnectionInfo) return;

    const mci = this.session.mediaConnectionInfo;
    const candidateStr = `candidate:1 1 udp 2130706431 ${mci.ip} ${mci.port} typ host`;

    const mids = ['0', '1', '2', '3'];
    for (const mid of mids) {
      try {
        await this.pc.addIceCandidate(
          new RTCIceCandidate({
            candidate: candidateStr,
            sdpMid: mid,
            sdpMLineIndex: parseInt(mid, 10),
          })
        );
        this.log(`Injected media connection candidate (sdpMid=${mid})`);
        break;
      } catch {
        // Try next mid
      }
    }
  }

  private preferCodec(sdp: string, codec: VideoCodec): string {
    const codecMap: Record<string, string> = {
      H264: 'H264',
      H265: 'H265',
      AV1: 'AV1',
    };

    const codecName = codecMap[codec] || 'H264';

    // This is a simplified version - full implementation would parse and reorder SDP
    return sdp;
  }

  private applyColorQuality(sdp: string, colorQuality: ColorQuality): string {
    // Apply color quality settings to SDP
    // Simplified - full implementation would modify profile-level-id and other params
    return sdp;
  }

  private buildNvstSdp(sdp: string): string {
    const { width, height } = this.parseResolution(this.settings?.resolution || '1280x720');
    const fps = this.settings?.fps || 60;
    const maxBitrateKbps = (this.settings?.maxBitrateMbps || 25) * 1000;

    return `v=0
o=- 0 0 IN IP4 0.0.0.0
s=NVST Session
c=IN IP4 0.0.0.0
t=0 0
m=video 0 RTP/AVPF 96
a=rtpmap:96 H264/90000
a=fmtp:96 profile-level-id=42e01f
a=x-nv-video:0 ${width} ${height} ${fps}
a=x-nv-bitrate:0 ${maxBitrateKbps}
a=sendrecv
m=audio 0 RTP/AVPF 97
a=rtpmap:97 opus/48000/2
a=sendrecv`;
  }

  private startStatsCollection(): void {
    if (this.statsTimer) return;

    this.statsTimer = setInterval(async () => {
      await this.collectStats();
    }, 1000);
  }

  private stopStatsCollection(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private async collectStats(): Promise<void> {
    if (!this.pc) return;

    try {
      const stats = await this.pc.getStats();
      const diagnostics = this.parseStats(stats);
      this.lastStats = diagnostics;
      this.options.onStats?.(diagnostics);
    } catch (error) {
      this.log(`Stats collection error: ${error}`);
    }
  }

  private parseStats(stats: RTCStatsReport): MobileStreamDiagnostics {
    let videoCodec = '';
    let resolution = '';
    let bitrateKbps = 0;
    let decodeFps = 0;
    let renderFps = 0;
    let packetsLost = 0;
    let packetsReceived = 0;
    let jitterMs = 0;
    let framesReceived = 0;
    let framesDecoded = 0;
    let framesDropped = 0;
    let decodeTimeMs = 0;

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
        packetsReceived = report.packetsReceived || 0;
        packetsLost = report.packetsLost || 0;
        framesReceived = report.framesReceived || 0;
        framesDecoded = report.framesDecoded || 0;
        framesDropped = report.framesDropped || 0;
        jitterMs = (report.jitter || 0) * 1000;

        if (report.codecId) {
          // WebRTC stats.get may not be available in all react-native-webrtc versions
          // Use forEach to find codec instead
          stats.forEach((candidate: any) => {
            if (candidate.id === report.codecId && candidate.mimeType) {
              videoCodec = candidate.mimeType.replace('video/', '');
            }
          });
        }

        if (report.frameWidth && report.frameHeight) {
          resolution = `${report.frameWidth}x${report.frameHeight}`;
        }

        // Calculate bitrate from bytesReceived
        if (report.bytesReceived) {
          // Approximate current bitrate
          bitrateKbps = Math.round((report.bytesReceived * 8) / 1000);
        }
      }

      if (report.type === 'codec') {
        if (report.mimeType?.includes('video')) {
          videoCodec = report.mimeType.replace('video/', '');
        }
      }
    });

    const packetLossPercent = packetsReceived > 0
      ? Math.round((packetsLost / (packetsLost + packetsReceived)) * 100)
      : 0;

    // Determine lag reason
    let lagReason: StreamLagReason = 'stable';
    if (packetLossPercent > 5) {
      lagReason = 'network';
    } else if (framesDropped > 10) {
      lagReason = 'decoder';
    }

    return {
      connectionState: this.pc?.connectionState || 'unknown',
      inputReady: this.inputChannel?.readyState === 'open',
      connectedGamepads: 0,
      resolution,
      codec: videoCodec,
      isHdr: false,
      bitrateKbps,
      decodeFps,
      renderFps,
      packetsLost,
      packetsReceived,
      packetLossPercent,
      jitterMs,
      rttMs: 0,
      framesReceived,
      framesDecoded,
      framesDropped,
      decodeTimeMs,
      renderTimeMs: 0,
      jitterBufferDelayMs: jitterMs,
      inputQueueBufferedBytes: 0,
      inputQueuePeakBufferedBytes: 0,
      inputQueueDropCount: 0,
      inputQueueMaxSchedulingDelayMs: 0,
      lagReason,
      lagReasonDetail: '',
      gpuType: this.session?.gpuType || 'unknown',
      serverRegion: this.session?.zone || 'unknown',
      decoderPressureActive: framesDropped > 5,
      decoderRecoveryAttempts: this.decoderRecoveryAttempts,
      decoderRecoveryAction: '',
      micState: this.micEnabled ? 'active' : 'inactive',
      micEnabled: this.micEnabled,
    };
  }

  private attemptRecovery(): void {
    this.decoderRecoveryAttempts++;
    this.log(`Attempting recovery #${this.decoderRecoveryAttempts}`);

    // Request keyframe
    this.signalingService.requestKeyframe({
      reason: 'decoder_recovery',
      backlogFrames: 0,
      attempt: this.decoderRecoveryAttempts,
    });
  }

  private async initializeMicrophone(): Promise<void> {
    if (!this.pc) return;

    try {
      // Request microphone permission and get stream
      const stream = await mediaDevices?.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2,
        },
      });

      if (!stream) {
        this.log('Failed to get microphone stream');
        return;
      }

      this.micStream = stream;
      this.micTrack = stream.getAudioTracks()[0];

      // Add track to peer connection
      const sender = this.pc.getSenders().find((s: RTCRtpSender) => s.track?.kind === 'audio');
      if (sender) {
        // Replace existing audio track with microphone
        // In a real implementation, we'd mix or properly handle both streams
      }

      this.micEnabled = true;
      this.log('Microphone initialized');
    } catch (error) {
      this.log(`Microphone initialization failed: ${error}`);
    }
  }

  setMicrophoneEnabled(enabled: boolean): void {
    if (this.micTrack) {
      this.micTrack.enabled = enabled;
      this.micEnabled = enabled;
    }
  }

  toggleMicrophone(): void {
    this.setMicrophoneEnabled(!this.micEnabled);
  }

  getVideoStream(): MediaStream {
    return this.videoStream;
  }

  getAudioStream(): MediaStream {
    return this.audioStream;
  }

  sendInput(data: ArrayBuffer): void {
    if (this.inputChannel?.readyState === 'open') {
      try {
        this.inputChannel.send(data);
      } catch (error) {
        this.log(`Input send error: ${error}`);
      }
    }
  }

  getLastStats(): MobileStreamDiagnostics | null {
    return this.lastStats;
  }

  dispose(): void {
    this.stopStatsCollection();

    // Stop microphone
    if (this.micStream) {
      this.micStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      this.micStream = null;
      this.micTrack = null;
    }

    // Close input channel
    if (this.inputChannel) {
      this.inputChannel.close();
      this.inputChannel = null;
    }

    // Stop all tracks
    this.videoStream.getTracks().forEach((track: MediaStreamTrack) => {
      track.stop();
      this.videoStream.removeTrack(track);
    });
    this.audioStream.getTracks().forEach((track: MediaStreamTrack) => {
      track.stop();
      this.audioStream.removeTrack(track);
    });

    // Close peer connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    // Disconnect signaling
    this.signalingUnsubscribe?.();
    this.signalingService.disconnect();

    this.session = null;
    this.settings = null;
  }
}

// Singleton instance
let streamingServiceInstance: StreamingService | null = null;

export function getStreamingService(): StreamingService {
  if (!streamingServiceInstance) {
    streamingServiceInstance = new StreamingService();
  }
  return streamingServiceInstance;
}
