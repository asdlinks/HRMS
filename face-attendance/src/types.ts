export interface DeviceInfo {
  id: number;
  deviceName: string;
  tenantId: number;
}

// Non-secret identity persisted in localStorage purely so the registration
// screen can say "Registered as: X". The deviceKey is NEVER persisted.
export interface DeviceIdentity {
  id: number;
  deviceName: string;
  tenantId: number;
  tenantCode: string;
}

export interface KioskSession {
  accessToken: string;
  device: DeviceInfo;
}

export interface Enrollment {
  userId: number;
  embedding: number[];
  modelVersion: string;
}

export interface SyncPayload {
  syncedAt: string;
  enrollments: Enrollment[];
}

// A check-in attempt waiting in the offline queue. idempotencyKey is generated
// ONCE per detection event and reused on every retry, so replaying the queue is
// safe against the server's unique attendance constraint.
export interface QueuedCheckIn {
  idempotencyKey: string;
  userId: number;
  date: string;
  confidence?: number;
  displayName?: string;
  createdAt: number;
}

export interface CheckInResult {
  id: number;
  status: string;
  method: string;
}

export type ConnectionStatus = 'online' | 'offline' | 'syncing';
