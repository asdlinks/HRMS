import type { ConnectionStatus } from '../types';

const LABEL: Record<ConnectionStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  syncing: 'Syncing',
};

// Always-visible connection pill. Also surfaces the pending offline-queue count
// so an operator can see at a glance that check-ins are backed up.
export function ConnectionIndicator({ status, pending }: { status: ConnectionStatus; pending: number }) {
  return (
    <div className={`conn-pill conn-${status}`} title={`Connection: ${LABEL[status]}`}>
      <span className="conn-dot" />
      <span>{LABEL[status]}</span>
      {pending > 0 && <span className="conn-badge">{pending} queued</span>}
    </div>
  );
}
