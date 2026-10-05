'use client';
import {checkedFetch} from '@/lib/client-request';
import type { SpotTradeView, AssetView } from '@/lib/view-types';
import { errorMessage } from '@/lib/errors';

import { useState, useEffect } from 'react';
import { TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, ActivitySquare, Coins, RefreshCw, Timer, Zap } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const AVAILABLE_COINS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'LINKUSDT', 'MATICUSDT'
];

export default function Dashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<{
    balance: number;
    openPositions: number;
    totalProfit: number;
    todaysProfit: number;
    totalPortfolio?: number | null;
    spotBalance?: number;
    futuresBalance?: number;
  }>({
    balance: 0,
    openPositions: 0,
    totalProfit: 0,
    todaysProfit: 0,
    totalPortfolio: null,
  });
  
  const [recentTrades, setRecentTrades] = useState<SpotTradeView[]>([]);
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [auditWarnings, setAuditWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [isBotActive, setIsBotActive] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);

  const [maxRiskPct, setMaxRiskPct] = useState(2);
  const [riskPerTradePct, setRiskPerTradePct] = useState(0.25);
  const [lossRiskSaving, setLossRiskSaving] = useState(false);
  const [riskLoading, setRiskLoading] = useState(false);

  const [minConfidence, setMinConfidence] = useState(75);
  const [confidenceLoading, setConfidenceLoading] = useState(false);

  const [targetCoins, setTargetCoins] = useState<string[]>(['AUTO']);
  const [coinsLoading, setCoinsLoading] = useState(false);
  const [customCoinInput, setCustomCoinInput] = useState('');
  const [nextRunTimer, setNextRunTimer] = useState<string>('');
  
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [forceRunLoading, setForceRunLoading] = useState(false);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date();
      const nextHour = new Date();
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);
      const diff = nextHour.getTime() - now.getTime();
      
      const minutes = Math.floor(diff / 1000 / 60);
      const seconds = Math.floor((diff / 1000) % 60);
      
      setNextRunTimer(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };
    
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = () => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats(data.stats);
          setAuditWarnings(data.warnings || []);
          setRecentTrades(data.recentTrades);
          if (data.assets) setAssets(data.assets);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch dashboard data', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    // Fetch initial user state
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setIsBotActive(data.user.is_spot_active === true);
          if (data.user.last_force_run) {
            const timeSinceLastRun = Date.now() - data.user.last_force_run;
            const cooldownMs = 15 * 60 * 1000;
            if (timeSinceLastRun < cooldownMs) {
              setCooldownRemaining(Math.floor((cooldownMs - timeSinceLastRun) / 1000));
            }
          }
        }
      });
      
    fetchDashboardData();

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.config) {
          if (data.config.is_spot_active !== undefined) {
            setIsBotActive(data.config.is_spot_active === 1);
          }
          setMaxRiskPct(data.config.max_risk_pct ?? 2);
          setRiskPerTradePct(data.config.risk_per_trade_pct ?? 0.25);
          setMinConfidence(data.config.min_confidence ?? 75);
          if (data.config.target_coins) {
            setTargetCoins(data.config.target_coins.split(','));
          }
        }
      });
  }, []);

  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setTimeout(() => setCooldownRemaining(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownRemaining]);

  const handleForceRun = async () => {
    if (cooldownRemaining > 0) return;
    setForceRunLoading(true);
    try {
      const res = await fetch('/api/force-run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.remainingMs) setCooldownRemaining(Math.floor(data.remainingMs / 1000));
        alert(data.error || 'Xəta baş verdi');
      } else {
        setCooldownRemaining(15 * 60);
        alert('Ticarət əməliyyatı uğurla başladıldı! Bot hazırda bazarı analiz edir. Nəticə Telegram-a göndəriləcək.');
      }
    } catch {
      alert('An error occurred');
    } finally {
      setForceRunLoading(false);
    }
  };

  const saveLossRisk = async () => {
    setLossRiskSaving(true);
    try {
      const res = await checkedFetch('/api/settings', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({riskPerTradePct})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Risk saxlanmadı');
    } catch(error) { alert(error instanceof Error ? errorMessage(error) : 'Risk saxlanmadı'); }
    finally { setLossRiskSaving(false); }
  };

  const handleToggleBot = async () => {
    setToggleLoading(true);
    try {
      const res = await fetch('/api/auth/toggle-bot', { method: 'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:!isBotActive}) });
      const data = await res.json();
      if (res.ok) {
        setIsBotActive(data.is_spot_active === 1);
      }
    } catch (error) {
      console.error('Failed to toggle bot', error);
    } finally {
      setToggleLoading(false);
    }
  };

  const handleUpdateRisk = async (newRisk: number) => {
    setMaxRiskPct(newRisk);
    setRiskLoading(true);
    try {
      await checkedFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxRiskPct: newRisk })
      });
    } catch (error) {
      alert(errorMessage(error));window.location.reload();
    } finally {
      setRiskLoading(false);
    }
  };

  const handleUpdateConfidence = async (newConf: number) => {
    setMinConfidence(newConf);
    setConfidenceLoading(true);
    try {
      await checkedFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minConfidence: newConf })
      });
    } catch (error) {
      alert(errorMessage(error));window.location.reload();
    } finally {
      setConfidenceLoading(false);
    }
  };

  const handleUpdateCoins = async (newCoins: string[]) => {
    setCoinsLoading(true);
    try {
      await checkedFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCoins: newCoins.join(',') })
      });
    } catch (error) {
      console.error('Failed to update coins', error);
    } finally {
      setCoinsLoading(false);
    }
  };

  const toggleCoin = (coin: string) => {
    let newCoins = [...targetCoins];
    
    if (coin === 'AUTO') {
      newCoins = ['AUTO'];
    } else {
      newCoins = newCoins.filter(c => c !== 'AUTO');
      if (newCoins.includes(coin)) {
        newCoins = newCoins.filter(c => c !== coin);
      } else {
        newCoins.push(coin);
      }
      if (newCoins.length === 0) newCoins = ['AUTO'];
    }
    
    setTargetCoins(newCoins);
    handleUpdateCoins(newCoins);
  };

  return (
    <div className="animate-fade-in">
      {auditWarnings.map(w => <p key={w} role="status" style={{color:"#fbbf24",padding:"12px",border:"1px solid #854d0e",borderRadius:"8px"}}>{w}</p>)}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">{t.dashboard.title}</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>{t.dashboard.subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '6px 16px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-light)' }}>
          {/* Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             {isBotActive ? (
                <>
                  <div className="pulse-dot" style={{ width: 8, height: 8, background: 'var(--success)', borderRadius: '50%' }}></div>
                  <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>{t.dashboard.live}</span>
                </>
             ) : (
                <>
                  <div style={{ width: 8, height: 8, background: 'var(--danger)', borderRadius: '2px' }}></div>
                  <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.9rem' }}>{t.dashboard.pause}</span>
                </>
             )}
          </div>
          
          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }}></div>

          {/* Countdown Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }} title="Növbəti analizə qalan vaxt">
            <Timer size={14} />
            {nextRunTimer || '--:--'}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }}></div>

          {/* Force Run Button */}
          <button
            onClick={handleForceRun}
            disabled={forceRunLoading || cooldownRemaining > 0}
            style={{
              background: 'transparent',
              border: 'none',
              color: cooldownRemaining > 0 ? 'var(--text-muted)' : 'var(--accent-primary)',
              cursor: (forceRunLoading || cooldownRemaining > 0) ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title={t.dashboard.checkNow}
          >
            <Zap size={14} className={forceRunLoading ? 'pulse-dot' : ''} />
            {forceRunLoading ? t.dashboard.working : (cooldownRemaining > 0 ? `${Math.floor(cooldownRemaining / 60)}:${(cooldownRemaining % 60).toString().padStart(2, '0')}` : t.dashboard.checkNow)}
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'var(--border-light)' }}></div>

          {/* Action Button */}
          <button
            onClick={handleToggleBot}
            disabled={toggleLoading}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.85rem',
              opacity: toggleLoading ? 0.5 : 1,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {toggleLoading ? t.dashboard.working : (isBotActive ? t.dashboard.turnOff : t.dashboard.turnOn)}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Spot Balansı
              <button 
                onClick={fetchDashboardData} 
                disabled={loading} 
                style={{ 
                  background: 'rgba(255,255,255,0.1)', 
                  border: 'none', 
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer', 
                  padding: '4px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  color: 'var(--text-primary)',
                  opacity: loading ? 0.5 : 1,
                  transition: 'opacity 0.2s'
                }}
                title="Balansı Yenilə"
              >
                <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
            <Wallet size={20} className="text-gradient" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {loading ? '...' : `$${stats.balance !== undefined && stats.balance !== null ? (stats.balance > 0 && stats.balance < 0.01 ? stats.balance.toFixed(4) : stats.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '—'}`}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px', fontWeight: 500 }}>
            Ümumi Portfel: {stats.totalPortfolio !== undefined && stats.totalPortfolio !== null ? `$${stats.totalPortfolio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>{t.dashboard.openPositions}</div>
            <TrendingUp size={20} className="text-gradient" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {loading ? '...' : stats.openPositions}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Ümumi Mənfəət / Zərər</div>
            {stats.totalProfit >= 0 ? <ArrowUpRight size={20} className="text-success" /> : <ArrowDownRight size={20} className="text-danger" />}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {loading ? '...' : `${stats.totalProfit >= 0 ? '+' : ''}$${stats.totalProfit.toLocaleString()}`}
          </div>
          
          <div style={{ borderTop: '1px solid var(--border-light)', margin: '8px 0' }}></div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>Bu gün</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: stats.todaysProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {loading ? '...' : `${stats.todaysProfit >= 0 ? '+' : ''}$${stats.todaysProfit.toLocaleString()}`}
            </div>
          </div>
        </div>
      </div>

      {/* Assets & Open Positions Panel */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', marginTop: 0 }}>Açıq Mövqelər və Spot Portfeli</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>Binance spot hesabınızdakı aktivlərin siyahısı və onların USDT qarşılığı.</p>
        
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Loading...</div>
        ) : assets.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Heç bir aktiv tapılmadı.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Aktiv (Koin)</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Miqdar</th>
                  <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Dəyəri (USDT)</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{asset.asset}</td>
                    <td style={{ padding: '12px 16px' }}>{asset.amount.toFixed(6).replace(/\.?0+$/, '')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {asset.valueUsd!==null && asset.valueUsd > 0 ? `$${asset.valueUsd.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Risk Control Panel */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '8px', margin: 0 }}>{t.dashboard.riskTitle}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              {t.dashboard.riskDesc} (<strong>{maxRiskPct}%</strong>)
            </p>
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input 
              type="range" 
              min="0"
              max="20"
              value={maxRiskPct} 
              onChange={(e) => setMaxRiskPct(Number(e.target.value))}
              onMouseUp={(e) => handleUpdateRisk(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleUpdateRisk(Number((e.target as HTMLInputElement).value))}
              style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <div style={{ width: '50px', textAlign: 'right', fontWeight: 'bold', color: riskLoading ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              {maxRiskPct}%
            </div>
          </div>
        </div>

        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <label htmlFor="loss-risk">Stop və icra xərclərinə görə əməliyyat riski (%): </label>
          <input id="loss-risk" type="number" min="0" max="2" step="0.05" value={riskPerTradePct} onChange={e=>setRiskPerTradePct(Number(e.target.value))} />
          <button type="button" className="btn btn-outline" disabled={lossRiskSaving} onClick={saveLossRisk}>{lossRiskSaving ? 'Saxlanır...' : 'Riski saxla'}</button>
          <small>0 yeni girişləri dayandırır. Gap zamanı faktiki zərər bu həddi keçə bilər.</small>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '0' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '8px', margin: 0 }}>{t.dashboard.confTitle}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              {t.dashboard.confDesc} (<strong>{minConfidence}%</strong>)
            </p>
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input 
              type="range" 
              min="50" 
              max="100" 
              value={minConfidence} 
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              onMouseUp={(e) => handleUpdateConfidence(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleUpdateConfidence(Number((e.target as HTMLInputElement).value))}
              style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <div style={{ width: '50px', textAlign: 'right', fontWeight: 'bold', color: confidenceLoading ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              {minConfidence}%
            </div>
          </div>
        </div>
      </div>

      {/* Target Coins Panel */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Coins size={20} className="text-primary" />
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t.dashboard.coinsTitle}</h2>
          {coinsLoading && <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.settings.saving}</span>}
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.85rem' }}>
          {t.dashboard.coinsDesc}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            type="button"
            onClick={() => toggleCoin('AUTO')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: targetCoins.includes('AUTO') ? 'var(--primary)' : 'var(--border-light)',
              background: targetCoins.includes('AUTO') ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: targetCoins.includes('AUTO') ? 'var(--primary)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: targetCoins.includes('AUTO') ? 600 : 400,
              transition: 'all 0.2s',
              width: '100%',
              marginBottom: '10px'
            }}
          >
            {t.dashboard.autoSelect}
          </button>
          
          <div style={{ display: 'flex', width: '100%', gap: '8px', marginBottom: '10px' }}>
            <input 
              type="text" 
              value={customCoinInput}
              onChange={(e) => setCustomCoinInput(e.target.value.toUpperCase())}
              placeholder="Yeni koin adı yazın (məs: PEPEUSDT)"
              className="input-field"
              style={{ flex: 1, marginBottom: 0, padding: '10px 16px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!customCoinInput.trim()) return;
                  let c = customCoinInput.trim();
                  if (!c.endsWith('USDT')) c += 'USDT';
                  
                  let newCoins = [...targetCoins];
                  newCoins = newCoins.filter(x => x !== 'AUTO');
                  if (!newCoins.includes(c)) {
                     newCoins.push(c);
                     setTargetCoins(newCoins);
                     handleUpdateCoins(newCoins);
                  }
                  setCustomCoinInput('');
                }
              }}
            />
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={() => {
                if (!customCoinInput.trim()) return;
                let c = customCoinInput.trim();
                if (!c.endsWith('USDT')) c += 'USDT';
                
                let newCoins = [...targetCoins];
                newCoins = newCoins.filter(x => x !== 'AUTO');
                if (!newCoins.includes(c)) {
                   newCoins.push(c);
                   setTargetCoins(newCoins);
                   handleUpdateCoins(newCoins);
                }
                setCustomCoinInput('');
              }}
              style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
            >
              {t.dashboard.addCoin}
            </button>
          </div>

          {Array.from(new Set([...AVAILABLE_COINS, ...targetCoins.filter(c => c !== 'AUTO')])).map(coin => (
            <button
              key={coin}
              type="button"
              onClick={() => toggleCoin(coin)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: targetCoins.includes(coin) ? 'var(--success)' : 'var(--border-light)',
                background: targetCoins.includes(coin) ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                color: targetCoins.includes(coin) ? 'var(--success)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: targetCoins.includes(coin) ? 600 : 400,
                transition: 'all 0.2s',
                flexGrow: 1,
                textAlign: 'center',
                fontSize: '0.9rem'
              }}
            >
              {coin}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Trades Table */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>{t.dashboard.recentTrades}</h2>
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t.dashboard.pair}</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t.dashboard.type}</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t.dashboard.price}</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t.dashboard.amount}</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t.dashboard.date}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td>
              </tr>
            ) : recentTrades.map((trade) => (
              <tr key={trade.id} style={{ borderTop: `1px solid var(--border-light)` }}>
                <td style={{ padding: '16px 24px', fontWeight: 600 }}>{trade.symbol}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    padding: '4px 10px', 
                    borderRadius: 'var(--radius-sm)', 
                    fontSize: '0.8rem', 
                    fontWeight: 600,
                    background: trade.action === 'BUY' ? 'var(--success-bg)' : trade.action === 'SELL' ? 'var(--danger-bg)' : 'rgba(255,255,255,0.1)',
                    color: trade.action === 'BUY' ? 'var(--success)' : trade.action === 'SELL' ? 'var(--danger)' : 'var(--text-secondary)'
                  }}>
                    {trade.action === 'BUY' ? <ArrowDownRight size={14} /> : trade.action === 'SELL' ? <ArrowUpRight size={14} /> : <ActivitySquare size={14} />}
                    {trade.action}
                  </span>
                </td>
                <td style={{ padding: '16px 24px' }}>${trade.price}</td>
                <td style={{ padding: '16px 24px' }}>{trade.amount}</td>
                <td style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{trade.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
