'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ShieldCheck, Copy, CheckCircle2, Clock, ChevronDown, ChevronUp } from 'lucide-react';

export default function PaymentPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [txid, setTxid] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [trc20Wallet, setTrc20Wallet] = useState<string>('Loading...');

  const SUBSCRIPTION_PRICE = '10 USDT';

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
          setPaymentStatus(data.user.subscription_status);
        }
      });

    fetch('/api/system-settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.trc20_wallet_address) {
          setTrc20Wallet(data.trc20_wallet_address);
        } else {
          setTrc20Wallet('Admin cüzdanı qeyd etməyib');
        }
      });
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(trc20Wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txid.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid })
      });
      
      const data = await res.json();
      if (res.ok) {
        setPaymentStatus('active');
        alert('Təbrik edirik! Ödənişiniz avtomatik təsdiqləndi və hesabınız aktivləşdirildi!');
        router.refresh();
      } else {
        alert(data.error || 'Ödəniş tapılmadı, xətalıdır və ya fərqli ünvana göndərilib.');
      }
    } catch (err) {
      alert('Sistem xətası baş verdi.');
    } finally {
      setLoading(false);
    }
  };

  if (paymentStatus === 'active') {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', padding: '60px 0' }}>
        <CheckCircle2 size={64} className="text-success" style={{ margin: '0 auto 24px' }} />
        <h1 style={{ fontSize: '2rem', marginBottom: '16px' }}>Hesabınız Aktivdir!</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
          Təbrik edirik, abunəliyiniz davam edir. Siz limitsiz olaraq Süni Zəka ticarət botundan istifadə edə bilərsiniz.
        </p>
        <button className="btn btn-primary" onClick={() => router.push('/dashboard')} style={{ padding: '12px 32px' }}>
          Panelə Qayıt
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <Wallet size={48} className="text-primary" style={{ margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>Aylıq Abunəlik Ödənişi</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Sistemdən istifadəyə davam etmək üçün aylıq abunəlik haqqını ödəməyiniz tələb olunur.
        </p>
      </div>

      {paymentStatus === 'pending' ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <Clock size={48} className="text-warning" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: 'var(--warning)' }}>Ödənişiniz Yoxlanılır</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Göndərdiyiniz TXID hazırda admin tərəfindən yoxlanılır. Təsdiqləndikdən sonra Telegram vasitəsilə bildiriş alacaqsınız və hesabınız dərhal aktivləşdiriləcək. (Maksimum 24 saat).
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--border-light)' }}>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px' }}>Aylıq Məbləğ</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--success)' }}>{SUBSCRIPTION_PRICE}</div>
            </div>
            <ShieldCheck size={32} className="text-gradient" />
          </div>

          <div style={{ marginBottom: '32px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Ödəniş Ünvanı (USDT TRC20)</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', fontFamily: 'monospace', fontSize: '0.95rem', display: 'flex', alignItems: 'center', wordBreak: 'break-all' }}>
                {trc20Wallet}
              </div>
              <button 
                onClick={handleCopy}
                className="btn" 
                style={{ background: 'var(--border-light)', width: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {copied ? <CheckCircle2 size={24} className="text-success" /> : <Copy size={24} />}
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '12px' }}>
              Yuxarıdakı TRC20 pul kisəsinə {SUBSCRIPTION_PRICE} göndərin. Ödənişi etdikdən sonra sizə verilən Transaction ID-ni (TXID) aşağıdakı xanaya qeyd edin. Sistem ödənişi avtomatik yoxlayacaq.
            </p>

            <div style={{ marginTop: '24px' }}>
              <button 
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                style={{ 
                  width: '100%', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '16px', 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: showInstructions ? '8px 8px 0 0' : '8px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
              >
                <span>Təlimata bax (Necə ödəniş etməli?)</span>
                {showInstructions ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              
              {showInstructions && (
                <div style={{ padding: '24px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-light)', borderTop: 'none', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }} className="animate-fade-in">
                  <div className="bg-warning-dim text-warning" style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                    <strong>⚠️ DİQQƏT:</strong> Kripto birjalar (məsələn, Binance) pul göndərərkən əlavə komissiya (adətən 1 USDT) çıxırlar. Zəhmət olmasa, əmin olun ki, bizim cüzdanımıza <strong>tam olaraq 10 USDT</strong> çatacaq. Məsələn, əgər birja 1 USDT komissiya tutursa, siz 11 USDT göndərməlisiniz. Tam 10 USDT çatmazsa, sistem ödənişi qəbul etməyəcək!
                  </div>
                  <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <li>Kripto pul kisənizi (Binance, TrustWallet və s.) açın.</li>
                    <li><strong>USDT</strong> valyutasını tapın və <strong>Send/Withdraw (Göndər)</strong> seçin.</li>
                    <li>Şəbəkə (Network) olaraq MÜTLƏQ <strong>Tron (TRC20)</strong> seçin.</li>
                    <li>Yuxarıda qeyd olunan cüzdan ünvanını (<em>{trc20Wallet}</em>) kopyalayıb xanaya yapışdırın.</li>
                    <li>Məbləğ hissəsinə elə rəqəm yazın ki, yekunda qəbul edilən məbləğ tam 10 USDT olsun.</li>
                    <li>Ödənişi təsdiqləyin və bitdikdən sonra ekranda görünən <strong>TXID (Transaction Hash)</strong> kodunu kopyalayıb aşağıdakı xanaya qeyd edin.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>
                Transaction ID (TXID)
              </label>
              <input 
                type="text" 
                required
                className="input-field" 
                value={txid}
                onChange={e => setTxid(e.target.value)}
                placeholder="Məsələn: 0x123abc456def..."
                style={{ padding: '16px', fontSize: '1.1rem' }}
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
              disabled={loading || !txid.trim()}
            >
              {loading ? 'Göndərilir...' : 'Təsdiqə Göndər'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
