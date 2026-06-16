import React, { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { OnboardingChecklist, type ChecklistStep } from "./OnboardingChecklist";
import { CLERK_CONFIGURED } from "@/lib/use-app-user";
import { listProjects, type ProjectListItem, type ProjectRole } from "@/lib/projects-client";
import { fetchTakes } from "@/lib/takes-client";

const DISMISS_KEY = "@easeverse_studio_onboarding_dismissed_v1";

type Snapshot = {
  loaded: boolean;
  role: "producer" | "vocalist" | "band" | "observer" | "unknown";
  hasProject: boolean;
  hasInvitedMember: boolean;
  hasTake: boolean;
};

export function StudioOnboardingChecklist() {
  if (!CLERK_CONFIGURED) return null;
  return <Inner />;
}

function Inner() {
  const { useAuth } = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [snap, setSnap] = useState<Snapshot>({
    loaded: false,
    role: "unknown",
    hasProject: false,
    hasInvitedMember: false,
    hasTake: false,
  });
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    void AsyncStorage.getItem(DISMISS_KEY).then((v) => setDismissed(v === "1"));
  }, []);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setSnap((s) => ({ ...s, loaded: true }));
      return;
    }
    try {
      const token = await getToken();
      const [projects, takes] = await Promise.all([
        listProjects(token).catch(() => [] as ProjectListItem[]),
        fetchTakes(token).catch(() => []),
      ]);
      const role: Snapshot["role"] = projects.some((p) => p.role === "producer")
        ? "producer"
        : projects.some((p) => p.role === "vocalist")
          ? "vocalist"
          : projects.some((p) => p.role === "band_member" || p.role === "mix_engineer")
            ? "band"
            : projects.some((p) => p.role === "observer")
              ? "observer"
              : "unknown";
      const hasInvited = projects.some((p) => p.memberCount > 1);
      setSnap({
        loaded: true,
        role,
        hasProject: projects.length > 0,
        hasInvitedMember: hasInvited,
        hasTake: takes.length > 0,
      });
    } catch {
      setSnap((s) => ({ ...s, loaded: true }));
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  if (!snap.loaded || !isSignedIn || dismissed) return null;

  // Pick producer flow by default — most people who sign up first are producers.
  const isVocalistFlow = snap.role === "vocalist" || snap.role === "band" || snap.role === "observer";

  const steps: ChecklistStep[] = isVocalistFlow
    ? buildVocalistSteps(snap)
    : buildProducerSteps(snap);

  const allDone = steps.every((s) => s.done);
  if (allDone) {
    void AsyncStorage.setItem(DISMISS_KEY, "1");
    return null;
  }

  const onDismiss = async () => {
    setDismissed(true);
    await AsyncStorage.setItem(DISMISS_KEY, "1");
  };

  return (
    <OnboardingChecklist
      steps={steps}
      onDismiss={onDismiss}
      title={isVocalistFlow ? "Welcome to the vocal session" : "Set up your studio session"}
      subtitleFormatter={(d, t) => `${d}/${t} steps completed${isVocalistFlow ? " · you'll be invited by the producer" : ""}`}
    />
  );
}

function buildProducerSteps(snap: Snapshot): ChecklistStep[] {
  return [
    {
      id: "download-companion",
      label: "Download the Companion app for Pro Tools",
      done: false, // we can't detect this reliably; producer marks done by clicking
      onPress: () => router.push("/companion"),
    },
    {
      id: "create-project",
      label: snap.hasProject ? "Create a project" : "Create your first project",
      done: snap.hasProject,
      onPress: () => router.push("/projects"),
    },
    {
      id: "invite-band",
      label: "Invite vocalist + band members",
      done: snap.hasInvitedMember,
      onPress: () => router.push("/projects"),
    },
    {
      id: "first-take",
      label: "Upload your first take (or let Pro Tools send automatically)",
      done: snap.hasTake,
      onPress: () => router.push("/(tabs)"),
    },
  ];
}

function buildVocalistSteps(snap: Snapshot): ChecklistStep[] {
  return [
    {
      id: "open-booth",
      label: "Ask the producer for your Booth URL (or open from invite)",
      done: false,
    },
    {
      id: "mic-permission",
      label: "Allow microphone access",
      done: false,
      onPress: () => router.push("/(tabs)"),
    },
    {
      id: "first-take",
      label: snap.hasTake ? "Record your first take" : "Wait for the producer to start",
      done: snap.hasTake,
    },
  ];
}
