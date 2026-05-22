// Full-mesh WebRTC audio for live sessions. Each member who flips
// "Live mic" on opens one RTCPeerConnection to every other online
// member who also has it on. Audio is mixed locally by the browser
// (one <audio> element per remote peer). Producer-↔-vocalist 1-to-1
// talkback (lib/webrtc-talkback.ts) still works as a special case.
//
// Glare prevention: the peer with the lexicographically smaller userId
// always initiates the offer.

import { authedFetch } from "./authed-fetch";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type MeshSignal = {
  id: string;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  signalType: "offer" | "answer" | "ice" | "bye";
  payload: unknown;
};

type PeerEntry = {
  pc: RTCPeerConnection;
  remoteUserId: string;
  audioEl: HTMLAudioElement | null;
};

export type MeshHandle = {
  peers: () => string[];
  ensurePeers: (remoteUserIds: string[]) => Promise<void>;
  handleSignal: (s: MeshSignal) => Promise<void>;
  stop: () => void;
};

async function postSignal(args: {
  token: string | null;
  sessionId: string;
  toUserId: string;
  signalType: MeshSignal["signalType"];
  payload: unknown;
}): Promise<void> {
  await authedFetch(`/api/sessions/signal?id=${encodeURIComponent(args.sessionId)}`, args.token, {
    method: "POST",
    body: JSON.stringify({
      toUserId: args.toUserId,
      signalType: args.signalType,
      payload: args.payload,
    }),
  });
}

function attachAudio(remoteUserId: string, stream: MediaStream): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  const id = `easeverse-mesh-${remoteUserId}`;
  let el = document.getElementById(id) as HTMLAudioElement | null;
  if (!el) {
    el = document.createElement("audio");
    el.id = id;
    el.autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);
  }
  el.srcObject = stream;
  return el;
}

function detachAudio(remoteUserId: string) {
  if (typeof document === "undefined") return;
  const id = `easeverse-mesh-${remoteUserId}`;
  const el = document.getElementById(id);
  if (el instanceof HTMLAudioElement) {
    el.srcObject = null;
    el.remove();
  }
}

export async function startMesh(args: {
  sessionId: string;
  selfUserId: string;
  getToken: () => Promise<string | null>;
}): Promise<MeshHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  const peers = new Map<string, PeerEntry>();

  function makePeer(remoteUserId: string): PeerEntry {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const entry: PeerEntry = { pc, remoteUserId, audioEl: null };
    pc.ontrack = (e) => {
      entry.audioEl = attachAudio(remoteUserId, e.streams[0]);
    };
    pc.onicecandidate = async (e) => {
      if (!e.candidate) return;
      const token = await args.getToken();
      void postSignal({
        token,
        sessionId: args.sessionId,
        toUserId: remoteUserId,
        signalType: "ice",
        payload: e.candidate.toJSON(),
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        cleanupPeer(remoteUserId);
      }
    };
    peers.set(remoteUserId, entry);
    return entry;
  }

  function cleanupPeer(remoteUserId: string) {
    const entry = peers.get(remoteUserId);
    if (!entry) return;
    try {
      entry.pc.close();
    } catch {
      /* ignore */
    }
    detachAudio(remoteUserId);
    peers.delete(remoteUserId);
  }

  async function initiateOffer(remoteUserId: string) {
    let entry = peers.get(remoteUserId);
    if (!entry) entry = makePeer(remoteUserId);
    const offer = await entry.pc.createOffer({ offerToReceiveAudio: true });
    await entry.pc.setLocalDescription(offer);
    const token = await args.getToken();
    await postSignal({
      token,
      sessionId: args.sessionId,
      toUserId: remoteUserId,
      signalType: "offer",
      payload: offer,
    });
  }

  return {
    peers: () => Array.from(peers.keys()),
    async ensurePeers(remoteUserIds: string[]) {
      // Drop peers no longer present
      for (const uid of Array.from(peers.keys())) {
        if (!remoteUserIds.includes(uid)) cleanupPeer(uid);
      }
      // Add new peers; lower userId initiates
      for (const uid of remoteUserIds) {
        if (peers.has(uid)) continue;
        if (args.selfUserId < uid) {
          await initiateOffer(uid);
        } else {
          // wait for the other side to send us an offer
          makePeer(uid);
        }
      }
    },
    async handleSignal(s: MeshSignal) {
      if (s.toUserId !== args.selfUserId) return;
      let entry = peers.get(s.fromUserId);
      if (!entry) entry = makePeer(s.fromUserId);
      if (s.signalType === "bye") {
        cleanupPeer(s.fromUserId);
        return;
      }
      if (s.signalType === "offer") {
        await entry.pc.setRemoteDescription(s.payload as RTCSessionDescriptionInit);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        const token = await args.getToken();
        await postSignal({
          token,
          sessionId: args.sessionId,
          toUserId: s.fromUserId,
          signalType: "answer",
          payload: answer,
        });
        return;
      }
      if (s.signalType === "answer") {
        if (entry.pc.signalingState === "have-local-offer") {
          await entry.pc.setRemoteDescription(s.payload as RTCSessionDescriptionInit);
        }
        return;
      }
      if (s.signalType === "ice") {
        try {
          await entry.pc.addIceCandidate(s.payload as RTCIceCandidateInit);
        } catch {
          /* ignore */
        }
      }
    },
    stop() {
      for (const uid of Array.from(peers.keys())) cleanupPeer(uid);
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
