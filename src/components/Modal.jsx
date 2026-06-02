export default function Modal({ open, onClose, title, children, footer, wide, printable }) {
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-40 flex items-end md:items-center justify-center ${printable ? 'print:bg-transparent print:static print:block' : ''}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 print:hidden" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 bg-paolas-panel border border-paolas-border rounded-t-2xl md:rounded-2xl shadow-2xl w-full ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'} max-h-[92vh] flex flex-col print:max-h-none print:rounded-none print:border-0 print:shadow-none print:max-w-full`}
      >
        {title && (
          <div className="px-5 py-4 border-b border-paolas-border flex items-center justify-between print:hidden">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="min-h-tap min-w-tap rounded-lg text-gray-400 hover:text-white hover:bg-paolas-border"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto print:overflow-visible">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-paolas-border print:hidden">{footer}</div>
        )}
      </div>
    </div>
  );
}
