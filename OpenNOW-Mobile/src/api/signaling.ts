/**
 * OpenNOW Mobile - WebSocket Signaling Client
 * Handles NVST protocol communication with GeForce NOW servers
 * Adapted from opennow-stable/src/main/gfn/signaling.ts
 */

import {
  SignalingConnectRequest,
  IceCandidatePayload,
  SendAnswerRequest,
  KeyframeRequest,
  MainToRendererSignalingEvent,
} from '../types/gfn';

interface SignalingMessage {
  ackid?: number;
  ack?: number;
  hb?: number;
  peer_info?: {
    id: number;
  };
  peer_msg?: {
    from: number;
    to: number;
    msg: string;
  };
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36';

export class SignalingService {
  private ws: WebSocket | null = null;
  private peerId = 2;
  private peerName = `peer-${Math.floor(Math.random() * 10_000_000_000)}`;
  private ackCounter = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionGeneration = 0;
  private listeners = new Set<(event: MainToRendererSignalingEvent) => void>();
  private sessionId: string = '';
  private signalingServer: string = '';
  private signalingUrl: string | undefined;

  onEvent(listener: (event: MainToRendererSignalingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: MainToRendererSignalingEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[Signaling] Error in event listener:', error);
      }
    }
  }

  private nextAckId(): number {
    this.ackCounter += 1;
    return this.ackCounter;
  }

  private sendJson(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Signaling] Cannot send, socket not open');
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private setupHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendJson({ hb: 1 });
    }, 5000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendPeerInfo(): void {
    this.sendJson({
      ackid: this.nextAckId(),
      peer_info: {
        browser: 'Chrome',
        browserVersion: '131',
        connected: true,
        id: this.peerId,
        name: this.peerName,
        peerRole: 0,
        resolution: '1920x1080',
        version: 2,
      },
    });
  }

  private buildSignInUrl(): string {
    const fallbackHost = this.signalingServer.includes(':')
      ? this.signalingServer
      : `${this.signalingServer}:443`;
    const baseUrl = this.signalingUrl?.trim() || `wss://${fallbackHost}/nvst/`;
    const signInUrl = new URL(baseUrl);

    signInUrl.protocol = 'wss:';
    signInUrl.pathname = `${signInUrl.pathname.replace(/\/?$/, '/') || '/'}sign_in`;
    signInUrl.search = '';
    signInUrl.searchParams.set('peer_id', this.peerName);
    signInUrl.searchParams.set('version', '2');

    return signInUrl.toString();
  }

  async connect(request: SignalingConnectRequest): Promise<void> {
    // Close existing connection
    this.disconnect();

    this.sessionId = request.sessionId;
    this.signalingServer = request.signalingServer;
    this.signalingUrl = request.signalingUrl;

    const url = this.buildSignInUrl();
    const protocol = `x-nv-sessionid.${this.sessionId}`;
    const generation = ++this.connectionGeneration;

    console.log('[Signaling] Connecting to:', url);
    console.log('[Signaling] Session ID:', this.sessionId);
    console.log('[Signaling] Protocol:', protocol);

    return new Promise((resolve, reject) => {
      try {
        // Note: React Native WebSocket doesn't support custom headers directly
        // We rely on the protocol for authentication
        const ws = new WebSocket(url, protocol);
        this.ws = ws;

        const isCurrentSocket = (): boolean =>
          this.ws === ws && this.connectionGeneration === generation;

        ws.onerror = (error) => {
          if (!isCurrentSocket()) {
            return;
          }
          console.error('[Signaling] WebSocket error:', error);
          this.emit({
            type: 'error',
            message: `Signaling connect failed: ${String(error)}`,
          });
          reject(error);
        };

        ws.onopen = () => {
          if (!isCurrentSocket()) {
            return;
          }
          this.sendPeerInfo();
          this.setupHeartbeat();
          this.emit({ type: 'connected' });
          resolve();
        };

        ws.onmessage = (event) => {
          if (!isCurrentSocket()) {
            return;
          }
          this.handleMessage(event.data);
        };

        ws.onclose = (event) => {
          this.clearHeartbeat();

          if (!isCurrentSocket()) {
            return;
          }

          this.ws = null;
          this.emit({
            type: 'disconnected',
            reason: event.reason || 'socket closed',
          });
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(text: string): void {
    let parsed: SignalingMessage;
    try {
      parsed = JSON.parse(text) as SignalingMessage;
    } catch {
      this.emit({
        type: 'log',
        message: `Ignoring non-JSON signaling packet: ${text.slice(0, 120)}`,
      });
      return;
    }

    if (typeof parsed.ackid === 'number') {
      const shouldAck = parsed.peer_info?.id !== this.peerId;
      if (shouldAck) {
        this.sendJson({ ack: parsed.ackid });
      }
    }

    if (parsed.hb) {
      this.sendJson({ hb: 1 });
      return;
    }

    if (!parsed.peer_msg?.msg) {
      return;
    }

    let peerPayload: Record<string, unknown>;
    try {
      peerPayload = JSON.parse(parsed.peer_msg.msg) as Record<string, unknown>;
    } catch {
      this.emit({ type: 'log', message: 'Received non-JSON peer payload' });
      return;
    }

    if (peerPayload.type === 'offer' && typeof peerPayload.sdp === 'string') {
      console.log(`[Signaling] Received OFFER SDP (${peerPayload.sdp.length} chars)`);
      this.emit({ type: 'offer', sdp: peerPayload.sdp });
      return;
    }

    if (typeof peerPayload.candidate === 'string') {
      console.log(`[Signaling] Received remote ICE candidate: ${peerPayload.candidate}`);
      this.emit({
        type: 'remote-ice',
        candidate: {
          candidate: peerPayload.candidate as string,
          sdpMid:
            typeof peerPayload.sdpMid === 'string' || peerPayload.sdpMid === null
              ? (peerPayload.sdpMid as string | null)
              : undefined,
          sdpMLineIndex:
            typeof peerPayload.sdpMLineIndex === 'number' || peerPayload.sdpMLineIndex === null
              ? (peerPayload.sdpMLineIndex as number | null)
              : undefined,
        },
      });
      return;
    }

    console.log('[Signaling] Unhandled peer message keys:', Object.keys(peerPayload));
  }

  async sendAnswer(payload: SendAnswerRequest): Promise<void> {
    console.log(`[Signaling] Sending ANSWER SDP (${payload.sdp.length} chars)`);
    if (payload.nvstSdp) {
      console.log(`[Signaling] Sending nvstSdp (${payload.nvstSdp.length} chars)`);
    }
    const answer = {
      type: 'answer',
      sdp: payload.sdp,
      ...(payload.nvstSdp ? { nvstSdp: payload.nvstSdp } : {}),
    };

    this.sendJson({
      peer_msg: {
        from: this.peerId,
        to: 1,
        msg: JSON.stringify(answer),
      },
      ackid: this.nextAckId(),
    });
  }

  async sendIceCandidate(candidate: IceCandidatePayload): Promise<void> {
    console.log(`[Signaling] Sending local ICE candidate: ${candidate.candidate} (sdpMid=${candidate.sdpMid})`);
    this.sendJson({
      peer_msg: {
        from: this.peerId,
        to: 1,
        msg: JSON.stringify({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        }),
      },
      ackid: this.nextAckId(),
    });
  }

  async requestKeyframe(payload: KeyframeRequest): Promise<void> {
    this.sendJson({
      peer_msg: {
        from: this.peerId,
        to: 1,
        msg: JSON.stringify({
          type: 'request_keyframe',
          reason: payload.reason,
          backlogFrames: payload.backlogFrames,
          attempt: payload.attempt,
        }),
      },
      ackid: this.nextAckId(),
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.clearHeartbeat();
      
      // Generate a new connection generation to invalidate pending operations
      this.connectionGeneration++;
      
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let signalingServiceInstance: SignalingService | null = null;

export function getSignalingService(): SignalingService {
  if (!signalingServiceInstance) {
    signalingServiceInstance = new SignalingService();
  }
  return signalingServiceInstance;
}
