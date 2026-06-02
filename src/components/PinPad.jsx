import { useEffect, useState } from 'react';

export default function PinPad({ length = 4, onSubmit, autoSubmit = true, error }) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (autoSubmit && pin.length === length) {
      onSubmit(pin);
      setPin('');
    }
  }, [pin, length, autoSubmit, onSubmit]);

  useEffect(() => { if (error) setPin(''); }, [error]);

  const press = (d) => setPin((p) => (p.length >= length ? p : p + d));
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <div className="select-none">
      <div className="flex justify-center gap-3 mb-5">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-paolas-accent' : 'bg-paolas-border'}`}
          />
        ))}
      </div>
      {error && <div className="text-center text-sm text-red-400 mb-2">{error}</div>}
      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="min-h-tap py-4 rounded-xl bg-paolas-border text-2xl font-semibold active:scale-95"
          >
            {d}
          </button>
        ))}
        <button
          onClick={back}
          className="min-h-tap py-4 rounded-xl bg-paolas-border text-base active:scale-95"
        >
          ←
        </button>
        <button
          onClick={() => press('0')}
          className="min-h-tap py-4 rounded-xl bg-paolas-border text-2xl font-semibold active:scale-95"
        >
          0
        </button>
        {!autoSubmit ? (
          <button
            onClick={() => { onSubmit(pin); setPin(''); }}
            className="min-h-tap py-4 rounded-xl bg-paolas-accent text-base font-semibold active:scale-95"
          >
            OK
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
