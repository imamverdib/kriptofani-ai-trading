'use client';
import type { Notification } from '@/lib/app-types';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function NotificationsPage() {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notifications')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNotifications(data.notifications || []);
        }
        setLoading(false);
        // Mark as read in background
        fetch('/api/notifications', { method: 'POST' });
      });
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', gap: '12px' }}>
        <Bell size={28} className="text-gradient" />
        <h1 style={{ margin: 0, fontSize: '2rem' }}>{t.notifications.title}</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {notifications.length === 0 ? (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {t.notifications.empty}
          </div>
        ) : notifications.map(notif => (
          <div key={notif.id} className="glass-panel" style={{ 
            padding: '24px', 
            borderLeft: notif.is_read ? 'none' : '4px solid var(--primary)',
            background: notif.is_read ? 'rgba(0,0,0,0.2)' : 'rgba(99, 102, 241, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{notif.title}</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {new Date(notif.created_at).toLocaleString()}
              </span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {notif.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
