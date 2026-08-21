'use client';

import { useState, useEffect } from 'react';
import { History, TrendingUp, TrendingDown, Clock, Zap, ChevronDown, ChevronUp, Target } from 'lucide-react';

export default function FuturesHistoryPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTrade, setExpandedTrade] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/futures/trades')
      .then(res => res.json())
      .then(data => {
        if (data.success) setTrades(data.trades || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <Zap size={28} style={{ color: '#f59e0b' }} />
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>Futures Tarixçəsi</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Bütün futures əməliyyatları və hissəli satış detallari</p>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Target size={48} style={{ margin: '0 auto 16px', opacity: 0.3, display: 'block' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Hələlik futures əməliyyat yoxdur</h2>
          <p>Bot ilk futures pozisiyasını açdıqdan sonra tarixçəniz burada görünəcək.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {trades.map(trade => {
            const isLong = trade.side === 'LONG';
            const isExpanded = expandedTrade === trade.id;
            const pnlColor = trade.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)';

            return (
              <div key={trade.id} className="glass-panel" style={{
                padding: '20px', overflow: 'hidden',
                borderLeft: `3px solid ${isLong ? 'var(--success)' : 'var(--danger)'}`,
              }}>
                {/* Main Row */}
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedTrade(isExpanded ? null : trade.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700,
                      background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: isLong ? 'var(--success)' : 'var(--danger)',
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      {isLong ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {trade.side}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{trade.symbol}</span>
                    <span style={{
                      background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                      padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600
                    }}>
                      {trade.leverage}x
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                      background: trade.status === 'OPEN' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                      color: trade.status === 'OPEN' ? '#f59e0b' : 'var(--text-muted)',
                    }}>
                      {trade.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PnL</div>
                      <div style={{ fontWeight: 700, color: pnlColor }}>
                        {trade.totalPnl >= 0 ? '+' : ''}${trade.totalPnl?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      <Clock size={14} />
                      {new Date(trade.createdAt).toLocaleDateString()}
                    </div>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="animate-fade-in" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                    {/* Price Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Giriş Qiyməti</div>
                        <div style={{ fontWeight: 600 }}>${trade.entryPrice}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stop Loss</div>
                        <div style={{ fontWeight: 600, color: 'var(--danger)' }}>${trade.stopLoss}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TP1 (1:2)</div>
                        <div style={{ fontWeight: 600, color: trade.tp1Filled ? 'var(--success)' : 'var(--text-muted)' }}>
                          ${trade.tp1} {trade.tp1Filled ? '✅' : ''}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TP2 (1:3)</div>
                        <div style={{ fontWeight: 600, color: trade.tp2Filled ? 'var(--success)' : 'var(--text-muted)' }}>
                          ${trade.tp2} {trade.tp2Filled ? '✅' : ''}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TP3 (1:4)</div>
                        <div style={{ fontWeight: 600, color: trade.tp3Filled ? 'var(--success)' : 'var(--text-muted)' }}>
                          ${trade.tp3} {trade.tp3Filled ? '✅' : ''}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Miqdar</div>
                        <div style={{ fontWeight: 600 }}>{trade.quantity}</div>
                      </div>
                    </div>

                    {/* Trend & Reason */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Trend İstiqaməti</div>
                        <div style={{ fontWeight: 600, color: trade.trendDirection === 'BULLISH' ? 'var(--success)' : trade.trendDirection === 'BEARISH' ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {trade.trendDirection || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bağlanma Tarixi</div>
                        <div style={{ fontWeight: 600 }}>{trade.closedAt ? new Date(trade.closedAt).toLocaleString() : 'Hələ açıqdır'}</div>
                      </div>
                    </div>

                    {/* Entry Reason */}
                    {trade.entryReason && (
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>AI Giriş Səbəbi</div>
                        <div style={{ fontSize: '0.85rem' }}>{trade.entryReason}</div>
                      </div>
                    )}

                    {/* Partial Fills */}
                    {trade.partialFills && trade.partialFills.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Hissəli Satışlar</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>TP Səviyyəsi</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Miqdar</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Qiymət</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>PnL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trade.partialFills.map((fill: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <td style={{ padding: '8px' }}>TP{fill.tp_level}</td>
                                <td style={{ padding: '8px' }}>{fill.quantity}</td>
                                <td style={{ padding: '8px' }}>${fill.exit_price}</td>
                                <td style={{ padding: '8px', color: fill.pnl >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                  {fill.pnl >= 0 ? '+' : ''}${fill.pnl?.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
