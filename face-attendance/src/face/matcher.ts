import { faceapi } from './models';
import type { Enrollment } from '../types';

// A flat, precomputed view of the synced enrollment set: one Float32Array
// descriptor per (user, sample). Multiple samples per user are expected
// (multi-angle enrollment) and simply give more chances to match.
export interface MatcherEntry {
  userId: number;
  descriptor: Float32Array;
}

export interface MatchResult {
  userId: number;
  distance: number;
  confidence: number; // 1 - distance, clamped to [0,1] — a rough 0..1 score for the API/UI
}

export function buildMatcher(enrollments: Enrollment[]): MatcherEntry[] {
  return enrollments
    .filter((e) => Array.isArray(e.embedding) && e.embedding.length > 0)
    .map((e) => ({ userId: e.userId, descriptor: Float32Array.from(e.embedding) }));
}

// Nearest-neighbour match by euclidean distance across every enrolled sample.
// Returns the best user if it's within threshold, else null.
export function matchDescriptor(entries: MatcherEntry[], descriptor: Float32Array, threshold: number): MatchResult | null {
  let best: MatchResult | null = null;
  for (const entry of entries) {
    if (entry.descriptor.length !== descriptor.length) continue;
    const distance = faceapi.euclideanDistance(entry.descriptor as unknown as number[], descriptor as unknown as number[]);
    if (!best || distance < best.distance) {
      best = { userId: entry.userId, distance, confidence: Math.max(0, Math.min(1, 1 - distance)) };
    }
  }
  if (best && best.distance <= threshold) return best;
  return null;
}
