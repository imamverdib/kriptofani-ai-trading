'use client';
import {checkedFetch} from '@/lib/client-request';
import type { OpenPositionView, ClosedPositionView } from '@/lib/view-types';
import { errorMessage } from '@/lib/errors';

import { useState, useEffect } from 'react';
import { Zap, Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Timer, RefreshCw, Coins, Activity, Target, Shield, ChevronDown, ChevronUp, Ban, X, SlidersHorizontal } from 'lucide-react';


const AVAILABLE_COINS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'LINKUSDT', 'MATICUSDT'
];

export default function FuturesDashboard() {


  const [stats, setStats] = useState<{
    balance: number;
    openPositionCount: number;
    totalPnl: number;
    todaysPnl: number;
    totalPortfolio?: number | null;
    spotBalance?: number;
    futuresBalance?: number;
  }>({ balance: 0, openPositionCount: 0, totalPnl: 0, todaysPnl: 0, totalPortfolio: null });
  const [openPositions, setOpenPositions] = useState<OpenPositionView[]>([]);
  const [recentClosed, setRecentClosed] = useState<ClosedPositionView[]>([]);
  const [auditWarnings, setAuditWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFuturesActive, setIsFuturesActive] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  const [leverage, setLeverageState] = useState(5);
  const [leverageLoading, setLeverageLoading] = useState(false);

  const [maxRiskPct, setMaxRiskPct] = useState(2);
  const [riskPerTradePct, setRiskPerTradePct] = useState(0.25);
  const [lossRiskSaving, setLossRiskSaving] = useState(false);
  const [riskLoading, setRiskLoading] = useState(false);

  const [minConfidence, setMinConfidence] = useState(80);
  const [confidenceLoading, setConfidenceLoading] = useState(false);

  const [targetCoins, setTargetCoins] = useState<string[]>(['AUTO']);
  const [coinsLoading, setCoinsLoading] = useState(false);
  const [customCoinInput, setCustomCoinInput] = useState('');

  const [blacklistCoins, setBlacklistCoins] = useState<string[]>([]);
  const [blacklistInput, setBlacklistInput] = useState('');
  const [blacklistLoading, setBlacklistLoading] = useState(false);

  const [autoCoinCount, setAutoCoinCount] = useState(7);
  const [autoCoinCountLoading, setAutoCoinCountLoading] = useState(false);

  const [nextRunTimer, setNextRunTimer] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [forceRunLoading, setForceRunLoading] = useState(false);

  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);

  // Timer: next 15-min mark
  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date();
      const minutes = now.getMinutes();
      const nextQuarter = Math.ceil((minutes + 1) / 15) * 15;
      const next = new Date(now);
      next.setMinutes(nextQuarter, 0, 0);
      if (nextQuarter >= 60) {
        next.setHours(now.getHours() + 1);
        next.setMinutes(0, 0, 0);
      }
      const diff = next.getTime() - now.getTime();
      const m = Math.floor(diff / 1000 / 60);
      const s = Math.floor((diff / 1000) % 60);
      setNextRunTimer(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setTimeout(() => setCooldownRemaining(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownRemaining]);

  const fetchDashboardData = () => {
    fetch('/api/futures/dashboard')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats(data.stats);
          setAuditWarnings(data.warnings || []);
          setOpenPositions(data.openPositions || []);
          setRecentClosed(data.recentClosed || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();

    // Fetch futures settings
    fetch('/api/futures/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.config) {
          setLeverageState(data.config.leverage || 5);
          setMaxRiskPct(data.config.max_risk_pct ?? 2);
          setRiskPerTradePct(data.config.risk_per_trade_pct ?? 0.25);
          setMinConfidence(data.config.min_confidence ?? 80);
          setIsFuturesActive(data.config.is_futures_active === 1);
          if (data.config.target_coins) {
            setTargetCoins(data.config.target_coins.split(','));
          }
          if (data.config.blacklist_coins) {
            setBlacklistCoins(data.config.blacklist_coins.split(',').filter((c: string) => c.trim()));
          }
          if (data.config.auto_coin_count) {
            setAutoCoinCount(data.config.auto_coin_count);
          }
        }
      });

    // Check cooldown
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user?.last_futures_force_run) {
          const elapsed = Date.now() - data.user.last_futures_force_run;
          const cooldownMs = 10 * 60 * 1000;
          if (elapsed < cooldownMs) {
            setCooldownRemaining(Math.floor((cooldownMs - elapsed) / 1000));
          }
        }
      });

    // Auto refresh every 30 seconds
    const refreshInterval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  const saveLossRisk = async () => {
    setLossRiskSaving(true);
    try {
      const res = await checkedFetch('/api/futures/settings', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({riskPerTradePct})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Risk saxlanmadı');
    } catch(error) { alert(error instanceof Error ? errorMessage(error) : 'Risk saxlanmadı'); }
    finally { setLossRiskSaving(false); }
  };

  const handleToggleFutures = async () => {
    setToggleLoading(true);
    try {
      await checkedFetch('/api/futures/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFuturesActive: !isFuturesActive })
      });
      setIsFuturesActive(!isFuturesActive);
    } catch (err) {
      alert(errorMessage(err));window.location.reload();
    } finally {
      setToggleLoading(false);
    }
  };

  const handleForceRun = async () => {
    if (cooldownRemaining > 0) return;
    setForceRunLoading(true);
    try {
      const res = await fetch('/api/futures/force-run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.remainingMs) setCooldownRemaining(Math.floor(data.remainingMs / 1000));
        alert(data.error || 'Xəta baş verdi');
      } else {
        setCooldownRemaining(10 * 60);
        alert('Futures analizi növbəyə əlavə edildi. İcra nəticəsi ayrıca qeydə alınacaq.');
      }
    } catch {
      alert('An error occurred');
    } finally {
      setForceRunLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string|number|boolean) => {
    try {
      await checkedFetch('/api/futures/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
    } catch (err) {
      alert(errorMessage(err));window.location.reload();
    }
  };

  const toggleCoin = (coin: string) => {
    let newCoins = [...targetCoins];
    if (coin === 'AUTO') {
      newCoins = ['AUTO'];
    } else {
      newCoins = newCoins.filter(c => c !== 'AUTO');
      if (newCoins.includes(coin)) newCoins = newCoins.filter(c => c !== coin);
      else newCoins.push(coin);
      if (newCoins.length === 0) newCoins = ['AUTO'];
    }
    setTargetCoins(newCoins);
    setCoinsLoading(true);
    updateSetting('targetCoins', newCoins.join(',')).finally(() => setCoinsLoading(false));
  };

  return (
    <div className="animate-fade-in">
      {auditWarnings.map(w => <p key={w} role="status" style={{color:"#fbbf24",padding:"12px",border:"1px solid #854d0e",borderRadius:"8px"}}>{w}</p>)}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <Zap size={32} style={{ color: '#f59e0b' }} />
            <h1 className="page-title" style={{ margin: 0 }}>Futures Panel</h1>
          </div>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Day Trading — Avtomatlaşdırılmış futures ticarət sistemi</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '6px 16px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-light)' }}>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isFuturesActive ? (
              <>
                <div className="pulse-dot" style={{ width: 8, height: 8, background: '#f59e0b', borderRadius: '50%' }}></div>
                <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.9rem' }}>Canlı</span>
              </>
            ) : (
              <>
                <div style={{ width: 8, height: 8, background: 'var(--danger)', borderRadius: '2px' }}></div>
                <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.9rem' }}>Pauza</span>
              </>
            )}
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }}></div>

          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }} title="Növbəti analizə qalan vaxt">
            <Timer size={14} />
            {nextRunTimer || '--:--'}
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }}></div>

          {/* Force Run */}
          <button
            onClick={handleForceRun}
            disabled={forceRunLoading || cooldownRemaining > 0}
            style={{
              background: 'transparent', border: 'none',
              color: cooldownRemaining > 0 ? 'var(--text-muted)' : '#f59e0b',
              cursor: (forceRunLoading || cooldownRemaining > 0) ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Zap size={14} className={forceRunLoading ? 'pulse-dot' : ''} />
            {forceRunLoading ? 'İşləyir...' : cooldownRemaining > 0
              ? `${Math.floor(cooldownRemaining / 60)}:${(cooldownRemaining % 60).toString().padStart(2, '0')}`
              : 'İndi Yoxla'}
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }}></div>

          {/* Toggle */}
          <button
            onClick={handleToggleFutures}
            disabled={toggleLoading}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-primary)',
              cursor: 'pointer', fontWeight: 500, fontSize: '0.85rem',
              opacity: toggleLoading ? 0.5 : 1, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            {toggleLoading ? 'İşləyir...' : isFuturesActive ? 'Söndür' : 'Aktiv et'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Futures Balansı
              <button onClick={fetchDashboardData} disabled={loading} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-primary)', opacity: loading ? 0.5 : 1 }}>
                <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
            <Wallet size={20} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {loading ? '...' : `$${stats.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}`}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px', fontWeight: 500 }}>
            Ümumi Portfel: {stats.totalPortfolio !== undefined && stats.totalPortfolio !== null ? `$${stats.totalPortfolio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Açıq Pozisiyalar</div>
            <Target size={20} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {loading ? '...' : stats.openPositionCount}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Ümumi PnL</div>
            {stats.totalPnl >= 0 ? <ArrowUpRight size={20} className="text-success" /> : <ArrowDownRight size={20} className="text-danger" />}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: stats.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {loading ? '...' : `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`}
          </div>
          <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Bu gün</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: stats.todaysPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {loading ? '...' : `${stats.todaysPnl >= 0 ? '+' : ''}$${stats.todaysPnl.toFixed(2)}`}
            </div>
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Activity size={20} style={{ color: '#f59e0b' }} />
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Açıq Pozisiyalar</h2>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Loading...</div>
        ) : openPositions.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '30px' }}>
            <Shield size={48} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
            Hazırda açıq futures pozisiya yoxdur.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {openPositions.map((pos) => {
              const isLong = pos.side === 'LONG';
              const pnlColor = pos.unrealizedPnl===null ? 'var(--text-secondary)' : pos.unrealizedPnl >= 0 ? 'var(--success)' : 'var(--danger)';
              const sideColor = isLong ? '#10b981' : '#ef4444';
              const isExpanded = expandedPosition === pos.id;

              // Progress calculation
              const maxReward = Math.abs(pos.take_profit_3 - pos.entry_price);
              const currentProgress = pos.currentPrice===null||maxReward===0 ? 0 : isLong
                ? (pos.currentPrice - pos.entry_price) / maxReward
                : (pos.entry_price - pos.currentPrice) / maxReward;
              const progressPct = Math.max(-50, Math.min(100, currentProgress * 100));

              return (
                <div key={pos.id} className="glass-panel" style={{ padding: '20px', background: 'rgba(0,0,0,0.2)', border: `1px solid ${isLong ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  {/* Row 1: Main Info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', cursor: 'pointer' }}
                    onClick={() => setExpandedPosition(isExpanded ? null : pos.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700,
                        background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: sideColor, display: 'flex', alignItems: 'center', gap: '4px'
                      }}>
                        {isLong ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {pos.side}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{pos.symbol}</span>
                      <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                        {pos.leverage}x
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cari Qiymət</div>
                        <div style={{ fontWeight: 600 }}>${pos.currentPrice?.toFixed(4) || '...'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PnL</div>
                        <div style={{ fontWeight: 700, color: pnlColor, fontSize: '1.1rem' }}>
                          {pos.unrealizedPnl == null ? '—' : `${pos.unrealizedPnl===null ? 'var(--text-secondary)' : pos.unrealizedPnl >= 0 ? '+' : ''}$${pos.unrealizedPnl.toFixed(2)}`}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '6px', overflow: 'hidden', marginBottom: '8px', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: '0', top: 0, bottom: 0,
                      width: `${Math.max(0, progressPct)}%`,
                      background: progressPct >= 0 ? 'linear-gradient(90deg, #10b981, #f59e0b)' : 'var(--danger)',
                      borderRadius: '4px', transition: 'width 0.5s ease'
                    }}></div>
                  </div>

                  {/* TP Status Badges */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: isExpanded ? '16px' : 0 }}>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: pos.tp1_filled ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: pos.tp1_filled ? 'var(--success)' : 'var(--text-muted)' }}>
                      TP1 (1:2) {pos.tp1_filled ? '✅' : '⏳'}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: pos.tp2_filled ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: pos.tp2_filled ? 'var(--success)' : 'var(--text-muted)' }}>
                      TP2 (1:3) {pos.tp2_filled ? '✅' : '⏳'}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: pos.tp3_filled ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: pos.tp3_filled ? 'var(--success)' : 'var(--text-muted)' }}>
                      TP3 (1:4) {pos.tp3_filled ? '✅' : '⏳'}
                    </span>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Giriş Qiyməti</div>
                        <div style={{ fontWeight: 600 }}>${pos.entry_price}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stop Loss</div>
                        <div style={{ fontWeight: 600, color: 'var(--danger)' }}>${pos.stop_loss_price}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TP1 (50%)</div>
                        <div style={{ fontWeight: 600, color: 'var(--success)' }}>${pos.take_profit_1}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TP2 (25%)</div>
                        <div style={{ fontWeight: 600, color: 'var(--success)' }}>${pos.take_profit_2}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TP3 (25%)</div>
                        <div style={{ fontWeight: 600, color: 'var(--success)' }}>${pos.take_profit_3}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Qalan Miqdar</div>
                        <div style={{ fontWeight: 600 }}>{pos.remaining_qty}</div>
                      </div>
                      {pos.trailing_active ? (
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Trailing Stop</div>
                          <div style={{ fontWeight: 600, color: '#f59e0b' }}>${pos.trailing_stop_price?.toFixed(4)}</div>
                        </div>
                      ) : null}
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Giriş Səbəbi</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '4px' }}>{pos.entry_reason}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Risk Controls */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Leverage */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '8px' }}>Qaldıraç (Leverage)</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Hər pozisiya üçün leverage nisbəti (<strong>{leverage}x</strong>)
            </p>
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input
              type="range" min="1" max="5" value={leverage}
              onChange={e => setLeverageState(Number(e.target.value))}
              onMouseUp={e => {
                const val = Number((e.target as HTMLInputElement).value);
                setLeverageLoading(true);
                updateSetting('leverage', val).finally(() => setLeverageLoading(false));
              }}
              onTouchEnd={e => {
                const val = Number((e.target as HTMLInputElement).value);
                setLeverageLoading(true);
                updateSetting('leverage', val).finally(() => setLeverageLoading(false));
              }}
              style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
            />
            <div style={{ width: '50px', textAlign: 'right', fontWeight: 'bold', color: leverageLoading ? 'var(--text-secondary)' : '#f59e0b' }}>
              {leverage}x
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />

        {/* Risk % */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '8px' }}>Risk İdarəetməsi</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Bot hər əməliyyat üçün balansın neçə faizini istifadə etsin? (<strong>{maxRiskPct}%</strong>)
            </p>
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input
              type="range" min="0" max="20" value={maxRiskPct}
              onChange={e => setMaxRiskPct(Number(e.target.value))}
              onMouseUp={e => {
                const val = Number((e.target as HTMLInputElement).value);
                setRiskLoading(true);
                updateSetting('maxRiskPct', val).finally(() => setRiskLoading(false));
              }}
              onTouchEnd={e => {
                const val = Number((e.target as HTMLInputElement).value);
                setRiskLoading(true);
                updateSetting('maxRiskPct', val).finally(() => setRiskLoading(false));
              }}
              style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
            />
            <div style={{ width: '50px', textAlign: 'right', fontWeight: 'bold', color: riskLoading ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              {maxRiskPct}%
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: 0 }} />

        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <label htmlFor="loss-risk">Stop və icra xərclərinə görə əməliyyat riski (%): </label>
          <input id="loss-risk" type="number" min="0" max="2" step="0.05" value={riskPerTradePct} onChange={e=>setRiskPerTradePct(Number(e.target.value))} />
          <button type="button" className="btn btn-outline" disabled={lossRiskSaving} onClick={saveLossRisk}>{lossRiskSaving ? 'Saxlanır...' : 'Riski saxla'}</button>
          <small>0 yeni girişləri dayandırır. Gap zamanı faktiki zərər bu həddi keçə bilər.</small>
        </div>

        {/* Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '8px' }}>Minimum Əminlik (AI)</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              AI ən azı neçə faiz əmin olduqda işləm açsın? (<strong>{minConfidence}%</strong>)
            </p>
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input
              type="range" min="60" max="100" value={minConfidence}
              onChange={e => setMinConfidence(Number(e.target.value))}
              onMouseUp={e => {
                const val = Number((e.target as HTMLInputElement).value);
                setConfidenceLoading(true);
                updateSetting('minConfidence', val).finally(() => setConfidenceLoading(false));
              }}
              onTouchEnd={e => {
                const val = Number((e.target as HTMLInputElement).value);
                setConfidenceLoading(true);
                updateSetting('minConfidence', val).finally(() => setConfidenceLoading(false));
              }}
              style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
            />
            <div style={{ width: '50px', textAlign: 'right', fontWeight: 'bold', color: confidenceLoading ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              {minConfidence}%
            </div>
          </div>
        </div>
      </div>

      {/* Target Coins */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Coins size={20} style={{ color: '#f59e0b' }} />
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Futures Hədəf Koinlər</h2>
          {coinsLoading && <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Saxlanılır...</span>}
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.85rem' }}>
          Futures botun hansı koinlər üzərində əməliyyat aparacağını seçin.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button type="button" onClick={() => toggleCoin('AUTO')} style={{
            padding: '10px 16px', borderRadius: '8px', border: '1px solid',
            borderColor: targetCoins.includes('AUTO') ? '#f59e0b' : 'var(--border-light)',
            background: targetCoins.includes('AUTO') ? 'rgba(245,158,11,0.1)' : 'transparent',
            color: targetCoins.includes('AUTO') ? '#f59e0b' : 'var(--text-primary)',
            cursor: 'pointer', fontWeight: targetCoins.includes('AUTO') ? 600 : 400,
            transition: 'all 0.2s', width: '100%', marginBottom: '10px'
          }}>
            🤖 Siqnal Əsaslı Ağıllı Seçim ({autoCoinCount} Koin)
          </button>

          <div style={{ display: 'flex', width: '100%', gap: '8px', marginBottom: '10px', alignItems: 'stretch' }}>
            <input
              type="text" value={customCoinInput}
              onChange={e => setCustomCoinInput(e.target.value.toUpperCase())}
              placeholder="Yeni koin adı yazın (məs: PEPEUSDT)"
              className="input-field"
              style={{ flex: 1, marginBottom: 0, padding: '12px 16px', border: '1px solid var(--border-light)', borderRadius: '8px' }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!customCoinInput.trim()) return;
                  let c = customCoinInput.trim();
                  if (!c.endsWith('USDT')) c += 'USDT';
                  const newCoins = [...targetCoins].filter(x => x !== 'AUTO');
                  if (!newCoins.includes(c)) {
                    newCoins.push(c);
                    setTargetCoins(newCoins);
                    updateSetting('targetCoins', newCoins.join(','));
                  }
                  setCustomCoinInput('');
                }
              }}
            />
            <button type="button" className="btn" style={{
              padding: '0 24px', whiteSpace: 'nowrap', borderRadius: '8px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', fontWeight: 600
            }} onClick={() => {
              if (!customCoinInput.trim()) return;
              let c = customCoinInput.trim();
              if (!c.endsWith('USDT')) c += 'USDT';
              const newCoins = [...targetCoins].filter(x => x !== 'AUTO');
              if (!newCoins.includes(c)) {
                newCoins.push(c);
                setTargetCoins(newCoins);
                updateSetting('targetCoins', newCoins.join(','));
              }
              setCustomCoinInput('');
            }}>
              Əlavə et
            </button>
          </div>

          {Array.from(new Set([...AVAILABLE_COINS, ...targetCoins.filter(c => c !== 'AUTO')])).map(coin => (
            <button key={coin} type="button" onClick={() => toggleCoin(coin)} style={{
              padding: '8px 16px', borderRadius: '8px', border: '1px solid',
              borderColor: targetCoins.includes(coin) ? '#f59e0b' : 'var(--border-light)',
              background: targetCoins.includes(coin) ? 'rgba(245,158,11,0.1)' : 'transparent',
              color: targetCoins.includes(coin) ? '#f59e0b' : 'var(--text-primary)',
              cursor: 'pointer', fontWeight: targetCoins.includes(coin) ? 600 : 400,
              transition: 'all 0.2s', flexGrow: 1, textAlign: 'center', fontSize: '0.9rem'
            }}>
              {coin}
            </button>
          ))}
        </div>
      </div>

      {/* Auto Coin Count + Blacklist (only when AUTO mode) */}
      {targetCoins.includes('AUTO') && (
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <SlidersHorizontal size={20} style={{ color: '#f59e0b' }} />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Ağıllı Seçim Tənzimləmələri</h2>
          </div>

          {/* Auto Coin Count Slider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <div style={{ flex: '1 1 300px' }}>
              <h3 style={{ fontSize: '1rem', margin: 0, marginBottom: '6px' }}>Analiz Ediləcək Coin Sayı</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                Hər dövrdə neçə coin analiz edilsin? (<strong>{autoCoinCount}</strong> coin)
              </p>
            </div>
            <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <input
                type="range" min="3" max="15" value={autoCoinCount}
                onChange={e => setAutoCoinCount(Number(e.target.value))}
                onMouseUp={e => {
                  const val = Number((e.target as HTMLInputElement).value);
                  setAutoCoinCountLoading(true);
                  updateSetting('autoCoinCount', val).finally(() => setAutoCoinCountLoading(false));
                }}
                onTouchEnd={e => {
                  const val = Number((e.target as HTMLInputElement).value);
                  setAutoCoinCountLoading(true);
                  updateSetting('autoCoinCount', val).finally(() => setAutoCoinCountLoading(false));
                }}
                style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
              />
              <div style={{ width: '50px', textAlign: 'right', fontWeight: 'bold', color: autoCoinCountLoading ? 'var(--text-secondary)' : '#f59e0b' }}>
                {autoCoinCount}
              </div>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '0 0 20px 0' }} />

          {/* Blacklist */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Ban size={16} style={{ color: 'var(--danger)' }} />
              <h3 style={{ fontSize: '1rem', margin: 0 }}>İstisna Ediləcək Koinlər (Blacklist)</h3>
              {blacklistLoading && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Saxlanılır...</span>}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
              Ağıllı seçim bu koinləri heç vaxt analiz etməyəcək.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'stretch' }}>
              <input
                type="text" value={blacklistInput}
                onChange={e => setBlacklistInput(e.target.value.toUpperCase())}
                placeholder="Koin adı (məs: DOGEUSDT)"
                className="input-field"
                style={{ flex: 1, marginBottom: 0, padding: '10px 16px', border: '1px solid var(--border-light)', borderRadius: '8px' }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!blacklistInput.trim()) return;
                    let c = blacklistInput.trim();
                    if (!c.endsWith('USDT')) c += 'USDT';
                    if (!blacklistCoins.includes(c)) {
                      const newList = [...blacklistCoins, c];
                      setBlacklistCoins(newList);
                      setBlacklistLoading(true);
                      updateSetting('blacklistCoins', newList.join(',')).finally(() => setBlacklistLoading(false));
                    }
                    setBlacklistInput('');
                  }
                }}
              />
              <button type="button" style={{
                padding: '0 20px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.15)', color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
              }} onClick={() => {
                if (!blacklistInput.trim()) return;
                let c = blacklistInput.trim();
                if (!c.endsWith('USDT')) c += 'USDT';
                if (!blacklistCoins.includes(c)) {
                  const newList = [...blacklistCoins, c];
                  setBlacklistCoins(newList);
                  setBlacklistLoading(true);
                  updateSetting('blacklistCoins', newList.join(',')).finally(() => setBlacklistLoading(false));
                }
                setBlacklistInput('');
              }}>
                <Ban size={14} /> Blokla
              </button>
            </div>

            {blacklistCoins.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {blacklistCoins.map(coin => (
                  <span key={coin} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '8px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                    color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 500
                  }}>
                    {coin}
                    <button onClick={() => {
                      const newList = blacklistCoins.filter(c => c !== coin);
                      setBlacklistCoins(newList);
                      setBlacklistLoading(true);
                      updateSetting('blacklistCoins', newList.join(',')).finally(() => setBlacklistLoading(false));
                    }} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                      color: 'var(--danger)', display: 'flex', alignItems: 'center'
                    }}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 0' }}>
                Heç bir koin bloklanmayıb — bütün uyğun koinlər analiz ediləcək.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Closed Positions */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Son Bağlanan Pozisiyalar</h2>
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Cütlük</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>İstiqamət</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Leverage</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>PnL</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Tarix</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td>
              </tr>
            ) : recentClosed.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Hələlik bağlanmış pozisiya yoxdur</td>
              </tr>
            ) : recentClosed.map((pos) => (
              <tr key={pos.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                <td style={{ padding: '16px 24px', fontWeight: 600 }}>{pos.symbol}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                    background: pos.side === 'LONG' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: pos.side === 'LONG' ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {pos.side === 'LONG' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {pos.side}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', color: '#f59e0b', fontWeight: 600 }}>{pos.leverage}x</td>
                <td style={{ padding: '16px 24px', fontWeight: 700, color: pos.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {pos.totalPnl >= 0 ? '+' : ''}${pos.totalPnl?.toFixed(2) || '0.00'}
                </td>
                <td style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {pos.closedAt ? new Date(pos.closedAt).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
