'use client';

import { useState, useEffect } from 'react';
import { LifeBuoy, Clock, CheckCircle, Send } from 'lucide-react';

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<{ [key: number]: string }>({});
  const [replying, setReplying] = useState<{ [key: number]: boolean }>({});

  const fetchTickets = () => {
    setLoading(true);
    fetch('/api/admin/support')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTickets(data.tickets || []);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleReply = async (ticketId: number) => {
    const reply = replyText[ticketId];
    if (!reply || !reply.trim()) return alert("Cavab mətnini daxil edin");

    setReplying(prev => ({ ...prev, [ticketId]: true }));
    try {
      const res = await fetch('/api/admin/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, reply })
      });
      const data = await res.json();
      if (data.success) {
        alert("Reply sent successfully!");
        fetchTickets();
      } else {
        alert(data.error || "Xəta baş verdi");
      }
    } catch (err) {
      alert("An error occurred");
    } finally {
      setReplying(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', gap: '12px' }}>
        <LifeBuoy size={28} className="text-gradient" />
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>Dəstək Sorğuları</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>İstifadəçilərdən gələn sorğular və problemlər.</p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Hələlik heç bir sorğu yoxdur.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tickets.map(ticket => (
            <div key={ticket.id} className="glass-panel" style={{ padding: '24px', borderLeft: ticket.status === 'pending' ? '4px solid var(--warning)' : '4px solid var(--success)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    İstifadəçi: <span style={{ color: 'var(--primary)' }}>@{ticket.username}</span>
                  </h3>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    <span>📞 {ticket.phone}</span>
                    <span>✉️ {ticket.email}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    padding: '4px 8px', 
                    borderRadius: '4px',
                    fontWeight: 600,
                    background: ticket.status === 'answered' ? 'var(--success-bg)' : 'var(--warning-bg)',
                    color: ticket.status === 'answered' ? 'var(--success)' : 'var(--warning)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginBottom: '4px'
                  }}>
                    {ticket.status === 'answered' ? <CheckCircle size={14} /> : <Clock size={14} />}
                    {ticket.status === 'answered' ? 'CAVABLANDIRILIB' : 'GÖZLƏYİR'}
                  </span>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {new Date(ticket.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <strong style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>Mesaj Mətni:</strong>
                <p style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                  {ticket.message}
                </p>
              </div>

              {ticket.status === 'pending' ? (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text" 
                    value={replyText[ticket.id] || ''}
                    onChange={(e) => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                    placeholder="İstifadəçiyə cavab yazın..."
                    className="input-field"
                    style={{ flex: 1, marginBottom: 0 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleReply(ticket.id);
                    }}
                  />
                  <button 
                    onClick={() => handleReply(ticket.id)}
                    disabled={replying[ticket.id]}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px', whiteSpace: 'nowrap' }}
                  >
                    <Send size={16} />
                    {replying[ticket.id] ? 'Göndərilir...' : 'Cavabla'}
                  </button>
                </div>
              ) : (
                <div style={{ padding: '16px', background: 'var(--success-bg)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <strong style={{ display: 'block', marginBottom: '8px', color: 'var(--success)' }}>Sizin Cavabınız:</strong>
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
