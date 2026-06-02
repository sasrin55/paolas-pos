import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error('Paolas POS render error:', err, info);
  }
  reset = () => {
    try { indexedDB.deleteDatabase('paolas_pos'); } catch {}
    location.reload();
  };
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{
        padding: 24, fontFamily: 'system-ui, sans-serif', color: '#fff',
        background: '#0f1115', minHeight: '100vh',
      }}>
        <h1 style={{ color: '#f87171', marginTop: 0 }}>Paolas POS crashed on render</h1>
        <pre style={{
          background: '#1a1d24', padding: 16, borderRadius: 8,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13,
        }}>
          {String(this.state.err?.stack || this.state.err)}
        </pre>
        <button
          onClick={this.reset}
          style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            background: '#d97706', color: '#fff', border: 0,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Reset local data and reload
        </button>
        <p style={{ marginTop: 16, color: '#9ca3af', fontSize: 13 }}>
          That button wipes the IndexedDB store and reloads. Safe — only the
          local cache; the Sheets backend (if configured) is untouched.
        </p>
      </div>
    );
  }
}
