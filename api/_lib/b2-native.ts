// Lettvekts Backblaze B2 via native HTTP-API (KUN fetch + node:crypto — ingen
// @aws-sdk). Brukes i tunge serverless-funksjoner (daw-export m/ archiver+ffmpeg)
// der @aws-sdk-bundelen sprenger størrelsesgrensen. Lette funksjoner bruker
// fortsatt b2-storage (S3-presign).
import crypto from "node:crypto";

const KEY_ID = process.env.B2_APPLICATION_KEY_ID || process.env.B2_S3_KEY_ID || "";
const APP_KEY = process.env.B2_APPLICATION_KEY || process.env.B2_S3_APP_KEY || "";
const BUCKET_ID = process.env.B2_BUCKET_ID || "";
const BUCKET_NAME = process.env.B2_BUCKET_NAME || process.env.B2_S3_BUCKET || "creatorhubn-archive-prod";

export function isB2NativeConfigured(): boolean {
  return Boolean(KEY_ID && APP_KEY && BUCKET_ID);
}

export const PUBLIC_BASE = (process.env.EASEVERSE_PUBLIC_URL || "https://easeverse.vercel.app").replace(/\/+$/, "");

type Auth = { apiUrl: string; downloadUrl: string; token: string };
async function authorize(): Promise<Auth> {
  const basic = Buffer.from(`${KEY_ID}:${APP_KEY}`).toString("base64");
  const r = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!r.ok) throw new Error(`b2_authorize_account ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { apiInfo: { storageApi: { apiUrl: string; downloadUrl: string } }; authorizationToken: string };
  return {
    apiUrl: j.apiInfo.storageApi.apiUrl,
    downloadUrl: j.apiInfo.storageApi.downloadUrl,
    token: j.authorizationToken,
  };
}

// Last opp et objekt (server-generert fil) til B2.
export async function nativePut(key: string, body: Buffer, contentType: string): Promise<void> {
  const auth = await authorize();
  const u = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: auth.token, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: BUCKET_ID }),
  });
  if (!u.ok) throw new Error(`b2_get_upload_url ${u.status}: ${await u.text()}`);
  const up = (await u.json()) as { uploadUrl: string; authorizationToken: string };
  const sha1 = crypto.createHash("sha1").update(body).digest("hex");
  const put = await fetch(up.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: up.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(key),
      "Content-Type": contentType,
      "X-Bz-Content-Sha1": sha1,
      "Content-Length": String(body.length),
    },
    // Buffer er en Uint8Array i runtime, men TS' BodyInit utelater begge.
    body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit,
  });
  if (!put.ok) throw new Error(`b2 upload ${put.status}: ${await put.text()}`);
}

// Tids-begrenset nedlastings-URL (B2 download authorization — ~presignert GET).
export async function nativeDownloadUrl(key: string, validSeconds = 3600): Promise<string> {
  const auth = await authorize();
  const a = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_download_authorization`, {
    method: "POST",
    headers: { Authorization: auth.token, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: BUCKET_ID, fileNamePrefix: key, validDurationInSeconds: validSeconds }),
  });
  if (!a.ok) throw new Error(`b2_get_download_authorization ${a.status}: ${await a.text()}`);
  const j = (await a.json()) as { authorizationToken: string };
  return `${auth.downloadUrl}/file/${BUCKET_NAME}/${key.split("/").map(encodeURIComponent).join("/")}?Authorization=${j.authorizationToken}`;
}
