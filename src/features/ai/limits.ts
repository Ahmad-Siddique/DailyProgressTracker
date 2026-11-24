type Bucket = { count: number; resetAt: number };

const previewBuckets = new Map<string, Bucket>();
const chatBuckets = new Map<string, Bucket>();
const inFlight = new Set<string>();

const PREVIEW_LIMIT = 60;
const CHAT_LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;

function touch(bucket: Map<string, Bucket>, ownerId: string, limit: number): boolean {
  const now = Date.now();
  const hit = bucket.get(ownerId);
  if (!hit || now >= hit.resetAt) {
    bucket.set(ownerId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (hit.count >= limit) return false;
  hit.count += 1;
  return true;
}

export function allowPreview(ownerId: string): boolean {
  return touch(previewBuckets, ownerId, PREVIEW_LIMIT);
}

export function allowChat(ownerId: string): boolean {
  return touch(chatBuckets, ownerId, CHAT_LIMIT);
}

export function tryAcquireChat(ownerId: string): boolean {
  if (inFlight.has(ownerId)) return false;
  inFlight.add(ownerId);
  return true;
}

export function releaseChat(ownerId: string): void {
  inFlight.delete(ownerId);
}

export function resetAiLimitsForTests(): void {
  previewBuckets.clear();
  chatBuckets.clear();
  inFlight.clear();
}