interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  error?: string;
}

interface ConnectionStatusProps {
  state: ConnectionState;
}

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  const statusColor = state.connected
    ? 'text-green-400'
    : state.reconnecting
    ? 'text-yellow-400'
    : 'text-red-400';

  const statusText = state.connected
    ? '● Connected'
    : state.reconnecting
    ? '● Reconnecting...'
    : state.error
    ? `● ${state.error}`
    : '● Disconnected';

  return (
    <div className={`text-xs ${statusColor}`}>
      {statusText}
    </div>
  );
}