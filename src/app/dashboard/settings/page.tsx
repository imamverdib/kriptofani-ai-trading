'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Globe, AlertTriangle, ChevronDown, ChevronUp, Video, Lock, MessageCircle, XCircle, CheckCircle, Zap } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/lib/i18n';

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  
  const [telegramUsername, setTelegramUsername] = useState('');
  const [binanceApiKey, setBinanceApiKey] = useState('');
  const [binanceApiSecret, setBinanceApiSecret] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [langLoading, setLangLoading] = useState(false);
  const [serverIp, setServerIp] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  
  const [telegramStatus, setTelegramStatus] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Futures API state
  const [futuresApiKey, setFuturesApiKey] = useState('');
  const [futuresApiSecret, setFuturesApiSecret] = useState('');
  const [futuresLoading, setFuturesLoading] = useState(false);
  const [hasFuturesKeys, setHasFuturesKeys] = useState(false);

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  useEffect(() => {
    fetch('/api/ip')
      .then(res => res.json())
      .then(data => setServerIp(data.ip))
      .catch(() => setServerIp('N/A'));

    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setTelegramStatus(!!data.user.telegram_chat_id);
          if (data.user.telegram_username) setTelegramUsername(data.user.telegram_username);
          setHasFuturesKeys(!!data.user.futures_api_key);
        }
      })
      .catch(() => {});
  }, []);

  const handleUpdateApi = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUsername, binanceApiKey, binanceApiSecret })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Yenilənmə xətası');

      setSuccess('API Məlumatları uğurla yeniləndi!');
      setTelegramUsername('');
      setBinanceApiKey('');
      setBinanceApiSecret('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Yeni şifrələr uyğun gəlmir!');
      return;
    }

    setPassLoading(true);
    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Şifrə yenilənmədi');

      setSuccess('Şifrə uğurla yeniləndi!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPassLoading(false);
    }
  };

  const handleUpdateFuturesApi = async (e: React.FormEvent) => {
    e.preventDefault();
    setFuturesLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ futuresApiKey, futuresApiSecret })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Yenilənmə xətası');
      setSuccess('Futures API Məlumatları uğurla yeniləndi!');
      setFuturesApiKey('');
      setFuturesApiSecret('');
      setHasFuturesKeys(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFuturesLoading(false);
    }
  };

  const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value as Language;
    setLangLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: newLang })
      });
      if (res.ok) {
        setLanguage(newLang);
        setSuccess('Dil seçimi yeniləndi');
      }
    } catch (err: any) {
      setError('Dil dəyişdirilə bilmədi');
    } finally {
      setLangLoading(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    if (!confirm('Telegram bot bağlantısını kəsmək istədiyinizə əminsiniz?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/settings/telegram/disconnect', { method: 'POST' });
      if (res.ok) {
        setTelegramStatus(false);
        setTelegramUsername('');
        setSuccess('Telegram botu uğurla deaktiv edildi!');
      } else {
        setError('Xəta baş verdi');
      }
    } catch (e) {
      setError('Sistem xətası');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', gap: '12px' }}>
        <Settings size={28} className="text-gradient" />
        <h1 style={{ margin: 0, fontSize: '2rem' }}>{t.settings.title}</h1>
      </div>

      {error && (
        <div className="bg-danger-dim text-danger" style={{ padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success-dim text-success" style={{ padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem' }}>
          {success}
        </div>
      )}

      {/* Language Selection Panel */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Globe size={20} className="text-gradient" />
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{t.settings.language}</h2>
        </div>
        
        <div className="input-group">
          <select 
            className="input-field" 
            value={language} 
            onChange={handleLanguageChange}
            disabled={langLoading}
            style={{ cursor: 'pointer', appearance: 'auto' }}
          >
            <option value="az">Azərbaycan</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      {/* API Setup Panel */}
      <div className="glass-panel" style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>{t.settings.apiTitle}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
          {t.settings.apiDesc}
        </p>

        {serverIp && (
          <div className="input-group" style={{ marginBottom: '24px' }}>
            <label className="input-label">{t.settings.serverIp}</label>
            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '1rem', color: '#fff', userSelect: 'all', cursor: 'text', textAlign: 'center', letterSpacing: '1px' }}>
              {serverIp}
            </div>
          </div>
        )}

        <div className="bg-warning-dim text-warning" style={{ padding: '16px', borderRadius: '8px', marginBottom: '24px', fontSize: '0.9rem', lineHeight: '1.5', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}>
            <AlertTriangle size={18} />
            {t.settings.securityWarningTitle}
          </div>
          {t.settings.securityWarningBody}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <button 
            type="button"
            onClick={() => setShowTutorial(!showTutorial)}
            style={{ 
              width: '100%', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '16px', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-light)', 
              borderRadius: showTutorial ? '8px 8px 0 0' : '8px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
          >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Video size={20} className="text-secondary" />
              {t.settings.tutorialTitle}
            </div>
            {showTutorial ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          
          {showTutorial && (
            <div style={{ padding: '24px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)', borderTop: 'none', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }} className="animate-fade-in">
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '8px', marginBottom: '20px' }}>
                <iframe 
                  src="https://www.youtube.com/embed/9Cgvry01Lx4" 
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              </div>
              <ol style={{ paddingLeft: '20px', margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <li>{t.settings.tutStep1}</li>
                <li>{t.settings.tutStep2}</li>
                <li>{t.settings.tutStep3}</li>
                <li>{t.settings.tutStep4}</li>
                <li>{t.settings.tutStep5}</li>
                <li>{t.settings.tutStep6.replace('IP ünvanını', serverIp || 'IP ünvanını').replace('IP address above', serverIp || 'IP address above')}</li>
                <li>{t.settings.tutStep7}</li>
              </ol>
            </div>
          )}
        </div>

        <form onSubmit={handleUpdateApi}>
          <div className="input-group">
            <label className="input-label">{t.settings.tgUser}</label>
            <input 
              type="text" 
              className="input-field" 
              value={telegramUsername} 
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder="@username"
              required 
            />
          </div>
          
          <div className="input-group" style={{ marginTop: '20px' }}>
            <label className="input-label">{t.settings.apiKey}</label>
            <input 
              type="text" 
              className="input-field" 
              value={binanceApiKey} 
              onChange={(e) => setBinanceApiKey(e.target.value)}
              placeholder="API Key"
              required 
            />
          </div>

          <div className="input-group">
            <label className="input-label">{t.settings.apiSecret}</label>
            <input 
              type="password" 
              className="input-field" 
              value={binanceApiSecret} 
              onChange={(e) => setBinanceApiSecret(e.target.value)}
              placeholder="••••••••••••••••••••••"
              required 
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-secondary" 
            style={{ marginTop: '30px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
            disabled={loading}
          >
            <Save size={18} />
            {loading ? t.settings.saving : t.settings.save}
          </button>
        </form>
      </div>

      {/* Telegram Bot Panel */}
      <div className="glass-panel" style={{ padding: '32px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <MessageCircle size={20} className="text-gradient" />
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{t.settings.tgBot}</h2>
        </div>
        
        {telegramStatus ? (
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', padding: '20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle size={24} className="text-success" />
              <div>
                <strong style={{ display: 'block', color: 'var(--success)' }}>{t.settings.tgActive}</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.settings.tgActiveDesc}</span>
              </div>
            </div>
            <button 
              onClick={handleDisconnectTelegram} 
              disabled={disconnecting}
              className="btn" 
              style={{ padding: '10px 16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
            >
              {disconnecting ? t.settings.saving : t.settings.tgDisconnect}
            </button>
          </div>
        ) : (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <XCircle size={24} className="text-danger" />
              <div>
                <strong style={{ display: 'block', color: 'var(--danger)' }}>{t.settings.tgDeactive}</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t.settings.tgDeactiveDesc}</span>
              </div>
            </div>
            <a 
              href="https://t.me/kriptofaniapp_bot" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary" 
              style={{ padding: '10px 16px', textDecoration: 'none' }}
            >
              {t.settings.tgActivate}
            </a>
          </div>
        )}
      </div>

      {/* Futures API Panel */}
      <div className="glass-panel" style={{ padding: '32px', marginTop: '24px', borderLeft: '3px solid #f59e0b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Zap size={20} style={{ color: '#f59e0b' }} />
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Futures API Açarları</h2>
          {hasFuturesKeys && (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '2px 10px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontWeight: 600 }}>Quraşdırılıb ✓</span>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
          Futures ticarət botu üçün ayrıca Binance API açarları yaradın. İcazələrdə &quot;Enable Futures&quot; seçimini aktivləşdirin.
        </p>

        <div className="bg-warning-dim text-warning" style={{ padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '0.85rem', lineHeight: '1.5', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontWeight: 'bold' }}>
            <AlertTriangle size={16} />
            Futures üçün ayrı API açarı yaradın!
          </div>
          Spot API-dən fərqli olaraq, Futures API açarında &quot;Enable Futures&quot; icazəsini aktiv etməlisiniz. Eyni zamanda IP Whitelisting-i də tətbiq edin.
        </div>

        <form onSubmit={handleUpdateFuturesApi}>
          <div className="input-group">
            <label className="input-label">Futures API Key</label>
            <input
              type="text"
              className="input-field"
              value={futuresApiKey}
              onChange={(e) => setFuturesApiKey(e.target.value)}
              placeholder="Futures API Key"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Futures Secret Key</label>
            <input
              type="password"
              className="input-field"
              value={futuresApiSecret}
              onChange={(e) => setFuturesApiSecret(e.target.value)}
              placeholder="••••••••••••••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn"
            style={{ marginTop: '20px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff' }}
            disabled={futuresLoading}
          >
            <Save size={18} />
            {futuresLoading ? 'Saxlanılır...' : 'Futures API Saxla'}
          </button>
        </form>
      </div>

      {/* Password Change Panel */}
      <div className="glass-panel" style={{ padding: '32px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <Lock size={20} className="text-gradient" />
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{t.settings.passTitle}</h2>
        </div>

        <form onSubmit={handleUpdatePassword}>
          <div className="input-group">
            <label className="input-label">{t.settings.oldPass}</label>
            <input 
              type="password" 
              className="input-field" 
              value={oldPassword} 
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••"
              required 
            />
          </div>
          
          <div className="input-group" style={{ marginTop: '20px' }}>
            <label className="input-label">{t.settings.newPass}</label>
            <input 
              type="password" 
              className="input-field" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required 
            />
          </div>

          <div className="input-group" style={{ marginTop: '20px' }}>
            <label className="input-label">{t.settings.newPassConfirm}</label>
            <input 
              type="password" 
              className="input-field" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required 
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ marginTop: '30px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
            disabled={passLoading}
          >
            <Save size={18} />
            {passLoading ? t.settings.saving : t.settings.updatePass}
          </button>
        </form>
      </div>
    </div>
  );
}
