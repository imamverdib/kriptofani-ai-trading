'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Trash2, Search, Play, Pause, Terminal, ArrowDown } from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(500);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5); // in seconds
  const [refreshCount, setRefreshCount] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);

  const clearLogs = async () => {
    if (!confirm('Bütün sistem loglarını təmizləmək istədiyinizdən əminsiniz?')) return;
    try {
      const res = await fetch('/api/admin/logs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        alert('System logs cleared successfully.');
      } else {
        alert('Failed to clear system logs.');
      }
    } catch {
      alert('An error occurred.');
    }
  };

  // Poll for new logs
  useEffect(() => {
    const controller=new AbortController();
    fetch(`/api/admin/logs?limit=${limit}&search=${encodeURIComponent(search)}`,{signal:controller.signal}).then(r=>r.json()).then(data=>{if(data.success)setLogs(data.logs||[])}).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  }, [limit, search, refreshCount]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setRefreshCount(c => c + 1);
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const scrollToBottom = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };

  // Scroll to bottom when logs are loaded
  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal className="text-danger" size={28} />
            Sistem Logları
          </h1>
          <p className="page-subtitle">Next.js serveri və ticarət botunun (worker) real-time konsol çıxışları.</p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setRefreshCount(c => c + 1)}
            disabled={loading}
            className="btn btn-secondary"
            style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            title="Yenilə"
          >
            <RefreshCw size={16} className={loading ? 'pulse-dot' : ''} />
            Yenilə
          </button>
          
          <button 
            onClick={clearLogs}
            className="btn"
            style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            title="Logları Təmizlə"
          >
            <Trash2 size={16} />
            Logları Təmizlə
          </button>
        </div>
      </div>

      {/* Control Panel */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px', background: 'rgba(255,255,255,0.03)', padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
          <Search size={16} style={{ color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            placeholder="Loglarda axtarış..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none', padding: '6px 0' }}
          />
        </div>

        {/* Options */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Limit selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mətirlər:</span>
            <select 
              value={limit} 
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}
            >
              <option value="100">100 sətir</option>
              <option value="500">500 sətir</option>
              <option value="1000">1000 sətir</option>
              <option value="2000">2000 sətir</option>
            </select>
          </div>

          {/* Auto Refresh Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
            >
              {autoRefresh ? <Pause size={14} /> : <Play size={14} />}
              {autoRefresh ? 'Avto-yeniləməni Durdur' : 'Avto-yeniləməni Aktivləşdir'}
            </button>
            
            {autoRefresh && (
              <select 
                value={refreshInterval} 
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                <option value="2">2s</option>
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="30">30s</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Terminal logs container */}
      <div 
        className="glass-panel" 
        style={{ 
          background: '#090d16', 
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '20px', 
          position: 'relative'
        }}
      >
        {/* Terminal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }}></div>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }}></div>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }}></div>
          <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.3)', fontFamily: 'monospace', marginLeft: '12px' }}>kripto-app@vps:/app/data/app.log</span>
        </div>

        {/* Console logs output */}
        <div 
          ref={terminalRef}
          style={{ 
            height: '60vh', 
            overflowY: 'auto', 
            fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
            fontSize: '0.85rem',
            lineHeight: '1.5',
            color: '#a3e635', // lime-400
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', paddingTop: '40px' }}>
              {loading ? 'Loading logs...' : 'No log entries found.'}
            </div>
          ) : (
            logs.map((log, index) => {
              // Highlight warnings / errors / headers nicely
              let style: React.CSSProperties = {};
              if (log.includes('error') || log.includes('xətası') || log.includes('Failed') || log.includes('Error')) {
                style = { color: '#f87171' }; // red-400
              } else if (log.includes('warning') || log.includes('warn') || log.includes('⚠️')) {
                style = { color: '#fbbf24' }; // amber-400
              } else if (log.includes('🤖') || log.includes('Spot') || log.includes('Futures') || log.includes('Ready') || log.includes('Compiled')) {
                style = { color: '#38bdf8' }; // light blue-400
              }
              return (
                <div key={index} style={style}>
                  {log}
                </div>
              );
            })
          )}
        </div>

        {/* Floating Action Button: Scroll to bottom */}
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: '30px',
            right: '30px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#fff',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
          title="Ən aşağı en"
        >
          <ArrowDown size={18} />
        </button>
      </div>
    </div>
  );
}
