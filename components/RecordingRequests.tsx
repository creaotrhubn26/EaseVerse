import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/creatorhub-auth";
import { authedFetch } from "@/lib/authed-fetch";
import { uploadTake, uploadTakeFromUri } from "@/lib/takes-client";
import { useRecording } from "@/lib/useRecording";
import {
  UniversalAudioPlayer,
  type UniversalAudioPlayerHandle,
} from "./UniversalAudioPlayer";

export type RecordingRequest = {
  id: string;
  title: string;
  instruction: string;
  status: string;
  olderReference: boolean;
  reference_version_id: string;
  version_number: number;
  context: {
    startSeconds: number;
    endSeconds: number;
    referenceStartSeconds?: number;
    targetTrackName?: string;
    lyricSection?: string;
    lyricLine?: string;
    lyrics?: string;
  };
  responses: Array<{ id: string; fileName: string }>;
};
const clock = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const card = {
  padding: 14,
  borderRadius: 14,
  backgroundColor: "#171922",
  marginBottom: 12,
} as const;
const action = {
  padding: 12,
  borderRadius: 10,
  backgroundColor: "#33241d",
  marginTop: 8,
} as const;
export function RecordingRequests({
  requests,
  projectId,
  refresh,
  onPendingChange,
}: {
  requests: RecordingRequest[];
  projectId: string;
  refresh: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const auth = useAuth(),
    recorder = useRecording();
  const player = useRef<UniversalAudioPlayerHandle>(null);
  const [selected, setSelected] = useState<RecordingRequest | null>(null);
  const [files, setFiles] = useState<{
    reference: { url: string; name: string; versionId: string };
    attachments: Array<{ id: string; name: string; url: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [ack, setAck] = useState(false),
    [uri, setUri] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  useEffect(() => {
    onPendingChange(recorder.isRecording || !!uri || !!pendingFile);
  }, [recorder.isRecording, uri, pendingFile, busy, onPendingChange]);
  const load = async (request: RecordingRequest) => {
    if (recorder.isRecording || uri || pendingFile) return;
    setBusy(true);
    setError("");
    setSuccess("");
    setAck(false);
    setFiles(null);
    setSelected(request);
    try {
      const r = await authedFetch(
        "/api/recording-requests",
        await auth.getToken(),
        {
          method: "POST",
          body: JSON.stringify({ projectId, requestId: request.id }),
        }
      );
      if (!r.ok) throw new Error("Could not open the shared files. Try again.");
      setFiles(await r.json());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  const current = selected
    ? requests.find((r) => r.id === selected.id) || selected
    : null;
  const allowed =
    !!current &&
    ["open", "submitted"].includes(current.status) &&
    (!current.olderReference || ack) &&
    !!files;
  const start = async () => {
    if (!allowed || busy) return;
    setError("");
    player.current?.pause();
    if (await recorder.start())
      await player.current?.seekTo(
        current!.context.referenceStartSeconds ?? current!.context.startSeconds,
        true
      );
  };
  const stop = async () => {
    player.current?.pause();
    const r = await recorder.stop();
    if (r.uri) setUri(r.uri);
    else setError("No audio was captured. Your request is still available.");
  };
  const share = async () => {
    if (!allowed || busy || (!uri && !pendingFile)) return;
    setBusy(true);
    setError("");
    const context = {
      token: await auth.getToken(),
      projectId,
      recordingRequestId: current!.id,
      acknowledgeOlderReference: ack,
      lyricsSnapshot: current!.context.lyrics,
    };
    try {
      if (pendingFile) await uploadTake({ ...context, file: pendingFile });
      else if (Platform.OS === "web") {
        const response = await fetch(uri!);
        const blob = await response.blob();
        const type = blob.type || "audio/webm";
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("wav")
          ? "wav"
          : "webm";
        const file = new File(
          [blob],
          `${current!.title
            .replace(/[^A-Za-z0-9ÆØÅæøå ._-]/g, "_")
            .slice(0, 100)}.${extension}`,
          { type }
        );
        await uploadTake({ ...context, file });
      } else
        await uploadTakeFromUri({
          ...context,
          uri: uri!,
          filename: `${current!.title
            .replace(/[^A-Za-z0-9ÆØÅæøå ._-]/g, "_")
            .slice(0, 100)}.m4a`,
          contentType: "audio/mp4",
        });
      setUri(null);
      setPendingFile(null);
      setSuccess("Response shared privately with your producer.");
      refresh();
    } catch {
      setError(
        "Could not share this response. The recording is kept here; you can retry."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <Text
        style={{
          color: Colors.textPrimary,
          fontWeight: "700",
          fontSize: 17,
          marginBottom: 12,
        }}
      >
        Recording requests
      </Text>
      {!requests.length ? (
        <Text style={{ color: Colors.textSecondary }}>
          Your producer’s requests will appear here.
        </Text>
      ) : (
        requests.map((r) => (
          <Pressable
            key={r.id}
            disabled={recorder.isRecording || !!uri || !!pendingFile || busy}
            onPress={() => void load(r)}
            accessibilityRole="button"
            accessibilityLabel={`Open recording request: ${r.title}`}
            style={card}
          >
            <Text style={{ color: Colors.textPrimary, fontWeight: "700" }}>
              {r.title}
            </Text>
            <Text style={{ color: Colors.textSecondary, marginTop: 5 }}>
              {clock(r.context.startSeconds)}–{clock(r.context.endSeconds)} ·
              Mix V{r.version_number} · {r.status}
            </Text>
            {r.olderReference ? (
              <Text style={{ color: "#ffbd70", marginTop: 4 }}>
                A newer reference mix is available.
              </Text>
            ) : null}
          </Pressable>
        ))
      )}
      {current ? (
        <View style={card}>
          <Text style={{ color: Colors.textPrimary, fontWeight: "700" }}>
            {current.title}
          </Text>
          <Text style={{ color: Colors.textPrimary, marginVertical: 10 }}>
            {current.instruction}
          </Text>
          <Text style={{ color: Colors.textSecondary }}>
            {[
              current.context.targetTrackName,
              current.context.lyricSection,
              current.context.lyricLine,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {current.context.lyrics ? (
            <Text style={{ color: Colors.textPrimary, marginVertical: 10 }}>
              {current.context.lyrics}
            </Text>
          ) : null}
          {files ? (
            <UniversalAudioPlayer
              ref={player}
              url={files.reference.url}
              label={`Request reference · ${files.reference.name}`}
            />
          ) : null}
          {(files?.attachments || []).map((file) => (
            <Pressable
              key={file.id}
              onPress={() => void Linking.openURL(file.url)}
              accessibilityRole="link"
              style={action}
            >
              <Text style={{ color: Colors.gradientMid }}>
                Download stem: {file.name}
              </Text>
            </Pressable>
          ))}
          {current.olderReference ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ack }}
              disabled={recorder.isRecording || busy}
              onPress={() => setAck((v) => !v)}
              style={action}
            >
              <Text style={{ color: "#ffbd70" }}>
                {ack ? "✓ " : ""}I will record against this older reference mix.
              </Text>
            </Pressable>
          ) : null}
          {["open", "submitted"].includes(current.status) ||
          recorder.isRecording ||
          !!uri ||
          !!pendingFile ? (
            <>
              <Text style={{ color: Colors.textSecondary, marginTop: 10 }}>
                Use headphones. This response starts at{" "}
                {clock(current.context.startSeconds)} in the song. Recording
                latency is not automatically corrected.
              </Text>
              {!uri && !pendingFile ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={!recorder.isRecording && (!allowed || busy)}
                  onPress={() => void (recorder.isRecording ? stop() : start())}
                  style={action}
                >
                  <Text style={{ color: Colors.gradientMid }}>
                    {recorder.isRecording
                      ? `Stop recording · ${recorder.duration}s`
                      : "Record a response"}
                  </Text>
                </Pressable>
              ) : null}
              {Platform.OS === "web" && !uri && !recorder.isRecording
                ? React.createElement("input", {
                    type: "file",
                    accept: "audio/*",
                    disabled: !allowed || busy,
                    "aria-label": "Choose response audio file",
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                      setPendingFile(event.target.files?.[0] || null);
                      event.target.value = "";
                    },
                    style: { marginTop: 12, color: "#fff", maxWidth: "100%" },
                  })
                : null}
              {uri ? (
                <UniversalAudioPlayer
                  url={uri}
                  label="Your response · preview before sharing"
                />
              ) : null}
              {pendingFile ? (
                <Text style={{ color: Colors.textPrimary, marginTop: 10 }}>
                  {pendingFile.name}
                </Text>
              ) : null}
              {uri || pendingFile ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!allowed || busy}
                    onPress={() => void share()}
                    style={action}
                  >
                    <Text style={{ color: Colors.gradientMid }}>
                      Share response with producer
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setUri(null);
                      setPendingFile(null);
                    }}
                    style={action}
                  >
                    <Text style={{ color: Colors.textSecondary }}>
                      Choose another recording
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : (
            <Text style={{ color: Colors.textSecondary, marginTop: 10 }}>
              This request is {current.status}.
            </Text>
          )}
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={Colors.gradientMid} /> : null}
      {error || recorder.error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: "#ffaaaa", marginVertical: 10 }}
        >
          {error || recorder.error}
        </Text>
      ) : null}
      {success ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: "#83d8a1", marginVertical: 10 }}
        >
          {success}
        </Text>
      ) : null}
    </View>
  );
}
