'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Video } from 'lucide-react';

export default function Setup() {
  const [binanceApiKey, setBinanceApiKey] = useState('');
  const [binanceApiSecret, setBinanceApiSecret] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [serverIp, setServerIp] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/system-settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.server_ip) {
          setServerIp(data.server_ip);
        }
      })
      .catch(() => {});
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ binanceApiKey, binanceApiSecret })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Setup validation failed. Please check your API keys.');
      }

      setStep(2);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const finishSetup = () => {
    router.push('/dashboard');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass-panel animate-fade-in" style={{ padding: '40px', width: '100%', maxWidth: '520px' }}>
        
        {step === 1 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', gap: '10px' }}>
              <Settings size={32} className="text-gradient" />
              <h1 style={{ margin: 0 }} className="text-gradient">Initial Setup</h1>
            </div>
            
            <p className="page-subtitle" style={{ textAlign: 'center', fontSize: '0.95rem' }}>
              Connect your Binance API keys for automated AI trading
            </p>
            
            {error && (
              <div className="bg-danger-dim text-danger" style={{ padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', textAlign: 'center' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSetup}>
              {serverIp && (
                <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', borderLeft: '4px solid var(--primary)', marginTop: '24px', marginBottom: '8px' }}>
                  <strong style={{ display: 'block', color: 'var(--primary)', marginBottom: '8px' }}>⚠️ Important Binance IP Whitelist</strong>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                    To enable trading on your Binance account, copy the IP address below and select <strong>"Restrict access to trusted IPs only"</strong> when configuring your Binance API:
                  </p>
                  <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '1rem', color: '#fff', userSelect: 'all', cursor: 'text', textAlign: 'center', letterSpacing: '1px' }}>
                    {serverIp}
                  </div>
                </div>
              )}

              <div className="bg-warning-dim text-warning" style={{ padding: '16px', borderRadius: '8px', marginBottom: '24px', fontSize: '0.9rem', lineHeight: '1.5', borderLeft: '4px solid var(--warning)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 'bold' }}>
                  <AlertTriangle size={18} />
                  Critical Security Notice
                </div>
                When selecting API permissions, <strong>ONLY enable "Enable Spot & Margin Trading"</strong> (and Futures if applicable). <strong>DO NOT enable "Enable Withdrawals"</strong> under any circumstances. The system cannot withdraw your funds.
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
                    Tutorial: How to create Binance API keys?
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
                      <li>Open the Binance app or website and navigate to <strong>API Management</strong> from the account menu.</li>
                      <li>Click <strong>Create API</strong> and choose System Generated.</li>
                      <li>Label your key (e.g. <code>KriptoFani</code>) and complete 2FA security verification.</li>
                      <li>Click <strong>Edit Restrictions</strong> on your newly created key.</li>
                      <li>Under API Restrictions, check <strong>ONLY "Enable Spot & Margin Trading"</strong>.</li>
                      <li>Under IP Access Restrictions, choose "Restrict access to trusted IPs only" and paste the server IP address shown above.</li>
                      <li>Copy your <strong>API Key</strong> and <strong>Secret Key</strong> into the fields below.</li>
                    </ol>
                  </div>
                )}
              </div>
              
              <div className="input-group">
                <label className="input-label">Binance API Key</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={binanceApiKey} 
                  onChange={(e) => setBinanceApiKey(e.target.value)}
                  placeholder="Paste your Binance API Key" 
                  required 
                />
              </div>

              <div className="input-group">
                <label className="input-label">Binance Secret Key</label>
                <input 
                  type="password" 
                  className="input-field" 
                  value={binanceApiSecret} 
                  onChange={(e) => setBinanceApiSecret(e.target.value)}
                  placeholder="••••••••••••••••••••••••" 
                  required 
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '30px', padding: '14px' }}
                disabled={loading}
              >
                {loading ? 'Validating Keys...' : 'Save & Continue to Dashboard'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center' }} className="animate-fade-in">
            <CheckCircle2 size={64} className="text-success" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ marginBottom: '16px' }}>Setup Complete!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', lineHeight: '1.6' }}>
              Your Binance API connection is configured securely. To receive instant trade execution signals, start the Telegram bot by sending <strong>/start</strong>.
            </p>
            
            <a href="https://t.me/kriptofani_bot" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ width: '100%', marginBottom: '16px', padding: '14px' }}>
              Launch Telegram Signal Bot
            </a>

            <button onClick={finishSetup} className="btn btn-primary" style={{ width: '100%', padding: '14px' }}>
              Go to Trading Dashboard
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
