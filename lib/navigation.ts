import type { Href } from "expo-router";

type BackCapableRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
};

export function goBackWithFallback(
  navigation: BackCapableRouter,
  fallbackHref: Href = "/"
) {
  if (navigation.canGoBack()) {
    navigation.back();
    return;
  }

  navigation.replace(fallbackHref);
}
