'use client';
import type {SpotTradeView} from '@/lib/view-types';
import type {AppUser} from '@/lib/app-types';

import { useState, useEffect } from 'react';
import { History, Power, TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function HistoryPage() {
  const { t } = useLanguage();
  const [trades, setTrades] = useState<SpotTradeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);

  const fetchData = () => {
    Promise.all([
      fetch('/api/auth/me').then(res => res.json()),
      fetch('/api/trades').then(res => res.json())
    ]).then(([userData, tradesData]) => {
      if (userData.user) setUser(userData.user);
      if (tradesData.success) setTrades(tradesData.trades || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleBot = async () => {
    const res = await fetch('/api/auth/toggle-bot', { method: 'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!user?.is_active}) });
    const data = await res.json();
    if (data.success) {
      setUser(current=>current?{...current,is_active:data.is_active}:null);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <History size={28} className="text-gradient" />
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>{t.history.title}</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{t.history.subtitle}</p>
          </div>
        </div>

        {/* Bot Toggle Button */}
        <button 
          onClick={handleToggleBot}
          className="btn"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            background: user?.is_active ? 'var(--danger-bg)' : 'var(--success-bg)',
            color: user?.is_active ? 'var(--danger)' : 'var(--success)',
            border: `1px solid ${user?.is_active ? 'var(--danger)' : 'var(--success)'}`
          }}
        >
          <Power size={18} />
          {user?.is_active ? t.history.stopSystem : t.history.startSystem}
        </button>
      </div>

      {trades.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Activity size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--text-primary)' }}>{t.history.noTradesTitle}</h2>
          <p>{t.history.noTradesDesc}</p>
        </div>
      ) : (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.dashboard.pair}</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.dashboard.type}</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.dashboard.price}</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.dashboard.amount}</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.history.profit}</th>
                <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.dashboard.date}</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(trade => (
                <tr key={trade.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '16px', fontWeight: 600 }}>{trade.symbol}</td>
                  <td style={{ padding: '16px' }}>
                    <span style={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      background: trade.action === 'BUY' ? 'var(--success-bg)' : trade.action === 'SELL' ? 'var(--danger-bg)' : 'rgba(255,255,255,0.1)',
                      color: trade.action === 'BUY' ? 'var(--success)' : trade.action === 'SELL' ? 'var(--danger)' : 'var(--text-secondary)'
                    }}>
                      {trade.action === 'BUY' ? <TrendingUp size={14} /> : trade.action === 'SELL' ? <TrendingDown size={14} /> : <Activity size={14} />}
                      {trade.action === 'BUY' ? t.history.buy : trade.action === 'SELL' ? t.history.sell : 'HOLD'}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>${trade.price}</td>
                  <td style={{ padding: '16px' }}>{trade.amount}</td>
                  <td style={{ padding: '16px', fontWeight: 600, color: trade.profit > 0 ? 'var(--success)' : trade.profit < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {trade.action === 'SELL' ? (
                      trade.profit > 0 ? `+${trade.profit.toFixed(2)}$` : `${trade.profit.toFixed(2)}$`
                    ) : '-'}
                  </td>
                  <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} />
                    {new Date(trade.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
