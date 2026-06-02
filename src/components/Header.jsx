import { useApp } from '../state/AppContext.jsx';

export default function Header({ onOpenSettings, onOpenEOD }) {
  const { sync, realtime, config, currentUser, signOut } = useApp();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });

  const syncLabel = sync.online
    ? (sync.queued ? `Online · ${sync.queued} queued` : 'Online')
    : `Offline · ${sync.queued} queued`;
  const syncDot = sync.online ? (sync.queued ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-red-400';
  const rtConfigured = !!config.sync_url;

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-paolas-panel border-b border-paolas-border print:hidden">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-paolas-accent flex items-center justify-center text-lg font-bold">P</div>
        <div>
          <h1 className="text-lg md:text-xl font-semibold leading-none">Paolas POS</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">{dateStr} · {timeStr}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-paolas-border text-xs">
          <span className={`w-2 h-2 rounded-full ${syncDot}`} />
          <span>{syncLabel}</span>
        </div>
        {rtConfigured && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-paolas-border text-xs" title={realtime.url}>
            <span className={`w-2 h-2 rounded-full ${realtime.connected ? 'bg-sky-400' : 'bg-gray-500'}`} />
            <span>{realtime.connected ? 'LAN sync' : 'LAN sync…'}</span>
          </div>
        )}
        <button
          onClick={onOpenEOD}
          className="hidden md:block min-h-tap px-3 py-2 rounded-lg bg-paolas-border text-sm hover:bg-paolas-border/70"
        >
          End of day
        </button>
        <button
          onClick={onOpenSettings}
          className="min-h-tap px-3 py-2 rounded-lg bg-paolas-border text-sm hover:bg-paolas-border/70"
        >
          ⚙
        </button>
        {currentUser && (
          <button
            onClick={signOut}
            className="min-h-tap px-3 py-2 rounded-lg bg-paolas-border text-sm hover:bg-paolas-border/70 flex items-center gap-2"
            title="Sign out"
          >
            <span className="font-medium">{currentUser.name}</span>
            <span className="text-[10px] uppercase tracking-wide opacity-70">{currentUser.role}</span>
          </button>
        )}
      </div>
    </header>
  );
}
