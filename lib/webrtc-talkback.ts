// Audio-only WebRTC peer for producer ↔ vocalist talkback. Signaling
// rides on the existing /api/sessions/stream SSE channel (events of
// type "signal"). One-to-one only — for mesh we'd allocate a peer per
// remote user instead of a singleton.

import { authedFetch } from "./authed-fetch";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type SignalMessage = {
  id: string;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  signalType: "offer" | "answer" | "ice" | "bye";
  payload: unknown;
};

export type TalkbackHandle = {
  remoteUserId: string;
  close: () => void;
  isCaller: boolean;
};

async function postSignal(args: {
  token: string | null;
  sessionId: string;
  toUserId: string;
  signalType: SignalMessage["signalType"];
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

async function getLocalAudio(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

function attachRemoteAudio(stream: MediaStream): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById("easeverse-remote-audio") as HTMLAudioElement | null;
  const el = existing || document.createElement("audio");
  el.id = "easeverse-remote-audio";
  el.autoplay = true;
  el.srcObject = stream;
  el.style.display = "none";
  if (!existing) document.body.appendChild(el);
  return el;
}

export async function startTalkbackAsCaller(args: {
  sessionId: string;
  remoteUserId: string;
  getToken: () => Promise<string | null>;
}): Promise<TalkbackHandle> {
  const token = await args.getToken();
  const stream = await getLocalAudio();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.ontrack = (e) => attachRemoteAudio(e.streams[0]);
  pc.onicecandidate = async (e) => {
    if (!e.candidate) return;
    const t = await args.getToken();
    void postSignal({
      token: t,
      sessionId: args.sessionId,
      toUserId: args.remoteUserId,
      signalType: "ice",
      payload: e.candidate.toJSON(),
    });
  };

  const offer = await pc.createOffer({ offerToReceiveAudio: true });
  await pc.setLocalDescription(offer);
  await postSignal({
    token,
    sessionId: args.sessionId,
    toUserId: args.remoteUserId,
    signalType: "offer",
    payload: offer,
  });

  return makeHandle({ pc, stream, remoteUserId: args.remoteUserId, sessionId: args.sessionId, getToken: args.getToken, isCaller: true });
}

export async function handleIncomingSignal(args: {
  signal: SignalMessage;
  sessionId: string;
  getToken: () => Promise<string | null>;
  existing: TalkbackHandle | null;
  setHandle: (handle: TalkbackHandle | null) => void;
  refStore: { pc: RTCPeerConnection | null; stream: MediaStream | null };
}): Promise<void> {
  const { signal, sessionId, getToken, refStore } = args;
  if (signal.signalType === "bye") {
    args.existing?.close();
    args.setHandle(null);
    refStore.pc?.close();
    refStore.pc = null;
    return;
  }

  if (signal.signalType === "offer") {
    // Incoming call — auto-accept.
    refStore.pc?.close();
    const stream = await getLocalAudio();
    refStore.stream = stream;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    refStore.pc = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => attachRemoteAudio(e.streams[0]);
    pc.onicecandidate = async (e) => {
      if (!e.candidate) return;
      const t = await getToken();
      void postSignal({
        token: t,
        sessionId,
        toUserId: signal.fromUserId,
        signalType: "ice",
        payload: e.candidate.toJSON(),
      });
    };
    await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const t = await getToken();
    await postSignal({
      token: t,
      sessionId,
      toUserId: signal.fromUserId,
      signalType: "answer",
      payload: answer,
    });
    args.setHandle(makeHandle({
      pc,
      stream,
      remoteUserId: signal.fromUserId,
      sessionId,
      getToken,
      isCaller: false,
    }));
    return;
  }

  if (signal.signalType === "answer" && refStore.pc) {
    await refStore.pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
    return;
  }

  if (signal.signalType === "ice" && refStore.pc) {
    try {
      await refStore.pc.addIceCandidate(signal.payload as RTCIceCandidateInit);
    } catch {
      /* ignore */
    }
  }
}

function makeHandle(args: {
  pc: RTCPeerConnection;
  stream: MediaStream;
  remoteUserId: string;
  sessionId: string;
  getToken: () => Promise<string | null>;
  isCaller: boolean;
}): TalkbackHandle {
  return {
    remoteUserId: args.remoteUserId,
    isCaller: args.isCaller,
    close: () => {
      try {
        args.pc.close();
      } catch {
        /* ignore */
      }
      args.stream.getTracks().forEach((t) => t.stop());
      void (async () => {
        const t = await args.getToken();
        await postSignal({
          token: t,
          sessionId: args.sessionId,
          toUserId: args.remoteUserId,
          signalType: "bye",
          payload: null,
        });
      })();
      const el = typeof document !== "undefined" ? document.getElementById("easeverse-remote-audio") : null;
      if (el && el instanceof HTMLAudioElement) {
        el.srcObject = null;
      }
    },
  };
}
