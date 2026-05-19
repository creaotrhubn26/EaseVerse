import { Platform } from "react-native";
import { getApiHeaders, getApiUrl } from "./query-client";

export type SectionResult = {
  type: "verse" | "pre-chorus" | "chorus" | "bridge" | "final-chorus" | "intro" | "outro";
  label: string;
  lines: string[];
};

function buildSvgFromStrokes(
  strokes: { points: { x: number; y: number }[]; color: string; width: number; tool: string }[],
  width: number,
  height: number,
  bgColor = "#ffffff",
): string {
  const paths = strokes
    .map((s) => {
      if (s.points.length === 0) return "";
      const opacity = s.tool === "highlighter" ? 0.36 : 0.92;
      let d = `M ${s.points[0].x.toFixed(2)} ${s.points[0].y.toFixed(2)}`;
      for (let i = 1; i < s.points.length; i++) {
        const p = s.points[i];
        d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      }
      return `<path d="${d}" stroke="${s.color}" stroke-width="${s.width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bgColor}"/>${paths}</svg>`;
}

async function svgToPngBase64(svg: string, width: number, height: number): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PNG rendering requires a browser environment");
  }
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/png");
        URL.revokeObjectURL(url);
        resolve(dataUrl.replace(/^data:image\/png;base64,/, ""));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export async function transcribeStrokes(
  strokes: { points: { x: number; y: number }[]; color: string; width: number; tool: string }[],
  options: { width?: number; height?: number } = {},
): Promise<string> {
  if (Platform.OS !== "web") {
    throw new Error("Handwriting OCR is web-only in this build");
  }
  const width = options.width ?? 900;
  const height = options.height ?? 1200;
  const svg = buildSvgFromStrokes(strokes, width, height);
  const imageBase64 = await svgToPngBase64(svg, width, height);
  const response = await fetch(`${getApiUrl()}/api/handwriting`, {
    method: "POST",
    headers: getApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ imageBase64, mediaType: "image/png", mode: "transcribe" }),
  });
  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status}`);
  }
  const data = (await response.json()) as { text?: string };
  return data.text ?? "";
}

export async function detectSectionsFromStrokes(
  strokes: { points: { x: number; y: number }[]; color: string; width: number; tool: string }[],
  options: { width?: number; height?: number } = {},
): Promise<SectionResult[]> {
  if (Platform.OS !== "web") {
    throw new Error("Handwriting OCR is web-only in this build");
  }
  const width = options.width ?? 900;
  const height = options.height ?? 1200;
  const svg = buildSvgFromStrokes(strokes, width, height);
  const imageBase64 = await svgToPngBase64(svg, width, height);
  const response = await fetch(`${getApiUrl()}/api/handwriting`, {
    method: "POST",
    headers: getApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ imageBase64, mediaType: "image/png", mode: "sections" }),
  });
  if (!response.ok) {
    throw new Error(`Section detection failed: ${response.status}`);
  }
  const data = (await response.json()) as { sections?: SectionResult[] };
  return data.sections ?? [];
}
