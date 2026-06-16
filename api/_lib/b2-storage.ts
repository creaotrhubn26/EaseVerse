// Backblaze B2 lagring via S3-kompatibelt API. Brukes for take-opplasting
// (presignert PUT fra klient — RN-trygt, ingen Web Crypto) og avspilling
// (presignert GET via proxy-endepunkt). Erstatter Vercel Blob.
import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.B2_S3_REGION || process.env.B2_REGION || "eu-central-003";
const ENDPOINT = process.env.B2_S3_ENDPOINT || `https://s3.${REGION}.backblazeb2.com`;
const KEY_ID = process.env.B2_S3_KEY_ID || process.env.B2_APPLICATION_KEY_ID || "";
const APP_KEY = process.env.B2_S3_APP_KEY || process.env.B2_APPLICATION_KEY || "";
export const B2_BUCKET = process.env.B2_S3_BUCKET || process.env.B2_BUCKET_NAME || "creatorhubn-archive-prod";

export function isB2Configured(): boolean {
  return Boolean(KEY_ID && APP_KEY && B2_BUCKET);
}

let cached: S3Client | null = null;
function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: REGION,
      endpoint: ENDPOINT,
      forcePathStyle: true, // B2 S3 krever path-style
      credentials: { accessKeyId: KEY_ID, secretAccessKey: APP_KEY },
    });
  }
  return cached;
}

// Deterministisk objekt-nøkkel for en take (rekonstruerbar fra id + filnavn).
export function takeObjectKey(takeId: string, filename: string): string {
  const safe = (filename || "take").replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
  return `easeverse/takes/${takeId}/${safe}`;
}

// Presignert PUT-URL (klienten laster opp direkte til B2).
export function presignUpload(key: string, contentType: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: B2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

// Presignert GET-URL (proxy redirecter avspilling hit).
export function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }),
    { expiresIn },
  );
}

// Server-side opplasting (for filer backend genererer selv — DAW-zip, mixdown).
export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: B2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

// Stabil offentlig base for proxy-URL-er som lagres i DB (bygd i bakgrunns-jobber
// uten request-kontekst). Overstyr med EASEVERSE_PUBLIC_URL ved behov.
export const PUBLIC_BASE = (process.env.EASEVERSE_PUBLIC_URL || "https://easeverse.vercel.app").replace(/\/+$/, "");
