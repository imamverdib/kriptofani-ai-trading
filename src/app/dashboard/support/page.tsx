'use client';

import { useState, useEffect } from 'react';
import { LifeBuoy, Send, CheckCircle, Clock } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function SupportPage() {
  const { t } = useLanguage();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const fetchTickets = () => {
    setLoading(true);
    fetch('/api/support')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTickets(data.tickets || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !email || !message) return alert("Bütün xanaları doldurun!");
    
    setFormLoading(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email, message })
      });
      const data = await res.json();
      if (data.success) {
        alert("Sorğunuz uğurla göndərildi!");
        setPhone('');
        setEmail('');
        setMessage('');
        fetchTickets();
      } else {
        alert(data.error || "Xəta baş verdi");
      }
    } catch (err) {
      alert("An error occurred");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', gap: '12px' }}>
        <LifeBuoy size={28} className="text-gradient" />
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>{t.support.title}</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{t.support.subtitle}</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '32px', marginBottom: '40px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t.support.phone}</label>
              <input 
                type="text" 
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+994 (__) ___-__-__" 
                className="input-field" 
                required 
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t.support.email}</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nümunə@mail.com" 
                className="input-field" 
                required 
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t.support.message}</label>
            <textarea 
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t.support.messagePlaceholder} 
              className="input-field" 
              style={{ minHeight: '120px', resize: 'vertical' }}
              required 
            />
          </div>

          <div style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {t.support.info}
            </p>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={formLoading}
            style={{ padding: '12px', display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '1rem', marginTop: '10px' }}
          >
            <Send size={20} />
            {formLoading ? t.support.sending : t.support.send}
          </button>
        </form>
      </div>

      <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>{t.support.pastQueries}</h2>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Loading...</div>
      ) : tickets.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Hələlik heç bir sorğunuz yoxdur.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tickets.map(ticket => (
            <div key={ticket.id} className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {t.support.date} {new Date(ticket.created_at).toLocaleString()}
                </span>
                <span style={{ 
                  fontSize: '0.8rem', 
                  padding: '4px 8px', 
                  borderRadius: '4px',
                  fontWeight: 600,
                  background: ticket.status === 'answered' ? 'var(--success-bg)' : 'var(--warning-bg)',
                  color: ticket.status === 'answered' ? 'var(--success)' : 'var(--warning)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {ticket.status === 'answered' ? <CheckCircle size={14} /> : <Clock size={14} />}
                  {ticket.status === 'answered' ? 'CAVABLANDIRILIB' : 'GÖZLƏYİR'}
                </span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', marginBottom: '8px' }}>
                <strong style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>{t.support.yourMessage}</strong>
                <p style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                  {ticket.message}
                </p>
              </div>

              {ticket.status === 'answered' && ticket.admin_reply && (
                <div style={{ padding: '16px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', borderLeft: '4px solid var(--success)' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: 'var(--success)' }}>{t.support.adminReply}</strong>
                  <p style={{ margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                    {ticket.admin_reply}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
