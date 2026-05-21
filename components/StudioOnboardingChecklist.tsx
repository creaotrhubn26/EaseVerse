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
      title={isVocalistFlow ? "Velkommen til vokal-økten" : "Sett i gang studio-økten"}
      subtitleFormatter={(d, t) => `${d}/${t} steg fullført${isVocalistFlow ? " · du blir invitert av producer" : ""}`}
    />
  );
}

function buildProducerSteps(snap: Snapshot): ChecklistStep[] {
  return [
    {
      id: "download-companion",
      label: "Last ned Companion-appen for Pro Tools",
      done: false, // we can't detect this reliably; producer marks done by clicking
      onPress: () => router.push("/companion"),
    },
    {
      id: "create-project",
      label: snap.hasProject ? "Opprett et prosjekt" : "Opprett ditt første prosjekt",
      done: snap.hasProject,
      onPress: () => router.push("/projects"),
    },
    {
      id: "invite-band",
      label: "Inviter vokalist + band-medlemmer",
      done: snap.hasInvitedMember,
      onPress: () => router.push("/projects"),
    },
    {
      id: "first-take",
      label: "Last opp første take (eller la Pro Tools sende automatisk)",
      done: snap.hasTake,
      onPress: () => router.push("/(tabs)"),
    },
  ];
}

function buildVocalistSteps(snap: Snapshot): ChecklistStep[] {
  return [
    {
      id: "open-booth",
      label: "Be producer om din Booth-URL (eller åpne fra invitasjon)",
      done: false,
    },
    {
      id: "mic-permission",
      label: "Tillat mikrofon-tilgang",
      done: false,
      onPress: () => router.push("/(tabs)"),
    },
    {
      id: "first-take",
      label: snap.hasTake ? "Spille inn første take" : "Vent på producer for å starte",
      done: snap.hasTake,
    },
  ];
}
