import { Platform, useWindowDimensions } from "react-native";
import { useMemo } from "react";

// 7 tiers:
// 0: <360 (compact phones)
// 1: 360-419 (small phones)
// 2: 420-539 (large phones)
// 3: 540-719 (phablet / small tablet)
// 4: 720-959 (tablet)
// 5: 960-1279 (small desktop / laptop)
// 6: >=1280 (large desktop)
const TIER_BREAKPOINTS = [360, 420, 540, 720, 960, 1280] as const;

export type ResponsiveTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function resolveResponsiveTier(width: number): ResponsiveTier {
  if (width < TIER_BREAKPOINTS[0]) return 0;
  if (width < TIER_BREAKPOINTS[1]) return 1;
  if (width < TIER_BREAKPOINTS[2]) return 2;
  if (width < TIER_BREAKPOINTS[3]) return 3;
  if (width < TIER_BREAKPOINTS[4]) return 4;
  if (width < TIER_BREAKPOINTS[5]) return 5;
  return 6;
}

export function tierValue<T>(
  tier: ResponsiveTier,
  values: readonly [T, T, T, T, T, T, T]
): T {
  return values[tier];
}

export type ResponsiveLayout = {
  tier: ResponsiveTier;
  width: number;
  isWeb: boolean;
  highResScale: number;
  contentPadding: number;
  contentMaxWidth: number;
  cardMaxWidth: number;
  scale: number;
  iconScale: number;
  navIconSize: number;
  navBarHeight: number;
};

export function useResponsiveLayout(): ResponsiveLayout {
  const { width } = useWindowDimensions();
  const tier = resolveResponsiveTier(width);

  return useMemo(
    () => {
      const isWeb = Platform.OS === "web";
      const highResScale =
        width >= 3840 ? 1.36 : width >= 2560 ? 1.24 : width >= 1920 ? 1.12 : 1;

      const contentPaddingBase = tierValue(tier, [12, 14, 16, 20, 24, 30, 36]);
      const contentPadding = isWeb
        ? Math.round(contentPaddingBase * highResScale)
        : contentPaddingBase;

      const contentMaxWidthBase = tierValue(tier, [360, 400, 480, 640, 820, 1040, 1240]);
      const cardMaxWidthBase = tierValue(tier, [340, 380, 450, 600, 760, 960, 1120]);
      const maxByViewport = Math.max(320, Math.round(width - contentPadding * 2));

      const contentMaxWidth = Math.min(
        maxByViewport,
        Math.round(contentMaxWidthBase * (isWeb ? highResScale : 1))
      );
      const cardMaxWidth = Math.min(
        maxByViewport,
        Math.round(cardMaxWidthBase * (isWeb ? highResScale : 1))
      );

      const navIconBase = tierValue(tier, [32, 36, 40, 46, 54, 62, 70]);
      const navBarBase = tierValue(tier, [86, 92, 98, 108, 120, 136, 150]);
      const highResNavBoost = isWeb ? 1 + (highResScale - 1) * 0.8 : 1;
      const navIconSize = Math.round(navIconBase * highResNavBoost);
      const navBarHeight = Math.round(navBarBase * highResNavBoost);
      const iconScaleBase = tierValue(tier, [1.15, 1.24, 1.34, 1.5, 1.72, 1.95, 2.15]);
      const highResIconBoost = isWeb ? 1 + (highResScale - 1) * 0.8 : 1;
      const iconScale = iconScaleBase * highResIconBoost;

      return {
        tier,
        width,
        isWeb,
        highResScale,
        contentPadding,
        contentMaxWidth,
        cardMaxWidth,
        scale: tierValue(tier, [0.9, 0.95, 1, 1.06, 1.13, 1.22, 1.3]),
        iconScale,
        navIconSize,
        navBarHeight,
      };
    },
    [tier, width]
  );
}

export function scaledIconSize(
  baseSize: number,
  layout: Pick<ResponsiveLayout, "iconScale">,
  boost = 1
): number {
  return Math.max(10, Math.round(baseSize * layout.iconScale * boost));
}
