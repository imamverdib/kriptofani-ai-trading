'use client';

import { useState, useEffect } from 'react';
import { Users, CreditCard, CheckCircle, XCircle, Clock, ShieldAlert, MessageCircle, Trash2 } from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverIp, setServerIp] = useState('');
  const [trc20Wallet, setTrc20Wallet] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  const fetchAdminData = () => {
    setLoading(true);
    fetch('/api/admin?type=dashboard')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStats(data.stats);
          setUsers(data.recentUsers || []);
          setPayments(data.recentPayments || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAdminData();
    fetch('/api/admin/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setServerIp(data.server_ip || '');
          setTrc20Wallet(data.trc20_wallet_address || '');
        }
      });
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          server_ip: serverIp,
          trc20_wallet_address: trc20Wallet
        })
      });
      if (res.ok) {
        alert('Settings saved successfully!');
      } else {
        alert('An error occurred');
      }
    } catch(e) {
      alert('System error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return alert("Mesaj daxil edin");
    if (!confirm('Bu mesajı bütün istifadəçilərə (həm panel, həm Telegram) göndərmək istədiyinizə əminsiniz?')) return;
    
    setBroadcasting(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMessage })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Message broadcasted successfully to ${data.sentCount} Telegram recipients and active users!`);
        setBroadcastMessage('');
      } else {
        alert(data.error || 'Xəta baş verdi');
      }
    } catch(e) {
      alert('System error');
    } finally {
      setBroadcasting(false);
    }
  };

  const handleAction = async (action: string, targetId?: number, paymentId?: number) => {
    if (!confirm('Əminsiniz?')) return;
    
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetId, paymentId })
      });
      if (res.ok) {
        fetchAdminData();
      } else {
        const data = await res.json();
        alert(data.error || 'Xəta baş verdi');
      }
    } catch (err) {
      alert('System error');
    }
  };

  const handleNotify = async (userId: number, username: string) => {
    const message = prompt(`@${username} üçün bildiriş mesajını yazın:`);
    if (!message || message.trim() === '') return;
    
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, message })
      });
      if (res.ok) {
        alert('Message broadcasted successfully!');
      } else {
        const data = await res.json();
        alert(data.error || 'Xəta baş verdi');
      }
    } catch (err) {
      alert('System error');
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '32px' }}>
        <h1 className="page-title">Sistem Xülasəsi</h1>
        <p className="page-subtitle">Platformadakı ümumi statistika və son fəaliyyətlər.</p>
      </div>

      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px', borderLeft: '4px solid var(--primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <ShieldAlert size={20} className="text-primary" />
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>System Settings</h2>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
            Server IP Ünvanı (Binance API üçün)
          </label>
          <input 
            type="text" 
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
            placeholder="Məsələn: 192.168.1.1"
            className="input-field"
            style={{ maxWidth: '400px' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
            Ödəniş Cüzdanı (USDT TRC20)
          </label>
          <input 
            type="text" 
            value={trc20Wallet}
            onChange={(e) => setTrc20Wallet(e.target.value)}
            placeholder="Məsələn: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
            className="input-field"
            style={{ maxWidth: '400px' }}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            İstifadəçilərin avtomatik ödəniş yoxlaması üçün bu TRC20 cüzdanı istifadə olunacaq.
          </p>
        </div>

        <button 
          onClick={handleSaveSettings} 
          disabled={savingSettings}
          className="btn btn-primary"
          style={{ padding: '10px 24px' }}
        >
          {savingSettings ? 'Saxlanılır...' : 'Yadda Saxla'}
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '24px', marginBottom: '40px', borderLeft: '4px solid var(--secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <MessageCircle size={20} className="text-secondary" />
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Kütləvi Yayın (Broadcast)</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
          The message entered below will be broadcasted simultaneously as an in-app notification and Telegram message to all registered users.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <textarea 
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder="Bütün istifadəçilərə göndəriləcək elanı bura yazın..."
            className="input-field"
            style={{ minHeight: '100px', resize: 'vertical' }}
          />
          <button 
            onClick={handleBroadcast} 
            disabled={broadcasting}
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start', padding: '12px 24px', display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <MessageCircle size={18} />
            {broadcasting ? 'Göndərilir...' : 'Bütün İstifadəçilərə Göndər'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Ümumi İstifadəçi</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.totalUsers || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid var(--success)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Aktiv Abunələr</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.activeUsers || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Gözləyən Ödənişlər</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats?.pendingPayments || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid var(--success)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>Ümumi Gəlir</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)' }}>${stats?.totalRevenue || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>MRR (Aylıq)</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#8b5cf6' }}>${stats?.mrr || 0}</div>
        </div>
        <div className="glass-panel" style={{ padding: '24px', borderLeft: '4px solid #10b981' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>ARR (İllik)</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>${stats?.arr || 0}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        {/* Recent Payments */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <CreditCard size={20} className="text-warning" />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Son Ödənişlər</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {payments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Heç bir ödəniş tapılmadı.</p>
            ) : payments.map(payment => (
              <div key={payment.id} style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>@{payment.username}</span>
                  <span style={{ color: 'var(--success)' }}>${payment.amount}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  TXID: {payment.txid}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    padding: '4px 8px', 
                    borderRadius: '4px',
                    background: payment.status === 'pending' ? 'var(--warning-bg)' : payment.status === 'approved' ? 'var(--success-bg)' : 'var(--danger-bg)',
                    color: payment.status === 'pending' ? 'var(--warning)' : payment.status === 'approved' ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {payment.status.toUpperCase()}
                  </span>
                  
                  {payment.status === 'pending' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleAction('approve_payment', undefined, payment.id)} className="btn" style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' }}>Təsdiqlə</button>
                      <button onClick={() => handleAction('reject_payment', undefined, payment.id)} className="btn" style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>Rədd et</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Users */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <Users size={20} className="text-primary" />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Son İstifadəçilər</h2>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>İstifadəçi</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Dil</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Status</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Aylıq Qazanc</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Ümumi Qazanc</th>
                <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '16px 8px', fontWeight: 600 }}>@{u.username}</td>
                  <td style={{ padding: '16px 8px', textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{u.language || 'AZ'}</td>
                  <td style={{ padding: '16px 8px' }}>
                    <span style={{ 
                      fontSize: '0.8rem', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      background: u.subscription_status === 'active' ? 'var(--success-bg)' : 'var(--danger-bg)',
                      color: u.subscription_status === 'active' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {u.subscription_status}
                    </span>
                  </td>
                  <td style={{ padding: '16px 8px', color: (u.monthly_profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {(u.monthly_profit || 0) >= 0 ? '+' : ''}${(u.monthly_profit || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '16px 8px', color: (u.lifetime_profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {(u.lifetime_profit || 0) >= 0 ? '+' : ''}${(u.lifetime_profit || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '16px 8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => handleNotify(u.id, u.username)} className="btn" style={{ padding: '6px', background: 'rgba(255,255,255,0.1)' }} title="Mesaj Göndər">
                      <MessageCircle size={16} />
                    </button>
                    {u.subscription_status === 'active' ? (
                      <button onClick={() => handleAction('freeze_user', u.id)} className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--warning)' }}>Dondur</button>
                    ) : (
                      <button onClick={() => handleAction('activate_user', u.id)} className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--success)' }}>Aktiv Et</button>
                    )}
                    <button onClick={() => { if(confirm('Are you sure you want to permanently delete this user and all associated trading data? This action cannot be undone.')) handleAction('delete_user', u.id); }} className="btn" style={{ padding: '6px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }} title="Delete User">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
