import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import PinPad from './PinPad.jsx';

export default function SignIn() {
  const { users, signIn } = useApp();
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const onPin = async (pin) => {
    setError('');
    const ok = await signIn(selected.user_id, pin);
    if (!ok) setError('Wrong PIN');
  };

  return (
    <div className="h-full flex items-center justify-center bg-paolas-bg p-6">
      <div className="w-full max-w-md bg-paolas-panel border border-paolas-border rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-paolas-accent flex items-center justify-center text-xl font-bold">P</div>
          <div>
            <h1 className="text-xl font-semibold leading-none">Paolas POS</h1>
            <p className="text-xs text-gray-400 mt-1">Sign in to begin</p>
          </div>
        </div>

        {!selected ? (
          <div className="space-y-2">
            {users.map((u) => (
              <button
                key={u.user_id}
                onClick={() => setSelected(u)}
                className="w-full min-h-tap text-left px-4 py-3 rounded-xl bg-paolas-border hover:bg-paolas-border/70 flex items-center justify-between"
              >
                <span className="font-medium">{u.name}</span>
                <span className="text-xs uppercase tracking-wide opacity-70">{u.role}</span>
              </button>
            ))}
            <p className="text-xs text-gray-500 mt-4">
              Test PINs (dev): Sara <code>9999</code> · Ali <code>1111</code> · Bilal <code>2222</code>
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-gray-400">Enter PIN for</div>
                <div className="text-lg font-semibold">{selected.name}</div>
              </div>
              <button onClick={() => { setSelected(null); setError(''); }} className="text-sm text-gray-400 hover:text-white">change</button>
            </div>
            <PinPad onSubmit={onPin} error={error} />
          </div>
        )}
      </div>
    </div>
  );
}
