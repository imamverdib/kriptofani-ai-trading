'use client';
import type { AppUser } from '@/lib/app-types';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, History, Settings, LogOut, Bell, LifeBuoy, Zap } from 'lucide-react';
import { LanguageProvider, useLanguage } from '@/context/LanguageContext';
import { Language } from '@/lib/i18n';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AppUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // We will pass user's language to LanguageProvider
  const [initialLang, setInitialLang] = useState<Language>('en');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data && data.user) {
          setUser(data.user);
          if (data.user.language) setInitialLang(data.user.language);
          if (data.user.role !== 'admin' && data.user.subscription_status !== 'active' && pathname !== '/dashboard/payment' && pathname !== '/dashboard/support') {
            router.push('/dashboard/payment');
          }
        } else if (data) {
          router.push('/login');
        }
      })
      .catch(err => {
        console.error('Auth check error:', err);
        router.push('/login');
      });
  }, [pathname, router]);

  useEffect(() => {
    if (user?.subscription_status === 'active') {
      fetch('/api/notifications')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setUnreadCount(data.unreadCount);
          }
        });
    }
  }, [user, pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  if (!user) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <LanguageProvider initialLanguage={initialLang}>
      <DashboardContent user={user} handleLogout={handleLogout} unreadCount={unreadCount}>
        {children}
      </DashboardContent>
    </LanguageProvider>
  );
}

function DashboardContent({ user, handleLogout, unreadCount, children }: {user:AppUser|null;handleLogout:()=>Promise<void>;unreadCount:number;children:React.ReactNode}) {
  const { language, t } = useLanguage();
  const pathname = usePathname();

  const navItems: {name:string;href:string;icon:typeof LayoutDashboard;accentColor?:string;badge?:number}[] = user?.subscription_status === 'active' || user?.role === 'admin' ? [
    { name: t.sidebar.panel, href: '/dashboard', icon: LayoutDashboard },
    { name: t.sidebar.history, href: '/dashboard/history', icon: History },
    { name: 'Futures Panel', href: '/dashboard/futures', icon: Zap, accentColor: '#f59e0b' },
    { name: 'Futures Tarixçəsi', href: '/dashboard/futures/history', icon: History, accentColor: '#f59e0b' },
    { name: t.sidebar.support, href: '/dashboard/support', icon: LifeBuoy },
    { name: t.sidebar.notifications, href: '/dashboard/notifications', icon: Bell, badge: unreadCount },
    { name: t.sidebar.settings, href: '/dashboard/settings', icon: Settings },
  ] : [
    { name: t.sidebar.payment, href: '/dashboard/payment', icon: Activity },
    { name: t.sidebar.support, href: '/dashboard/support', icon: LifeBuoy }
  ];

  if (user?.role === 'admin') {
    navItems.push({ name: t.sidebar.admin, href: '/admin', icon: Settings });
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="glass-panel" style={{ width: '260px', borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px', gap: '10px' }}>
          <Activity size={28} className="text-gradient" />
          <h2 style={{ margin: 0, fontSize: '1.5rem' }} className="text-gradient">KriptoFani</h2>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: isActive ? (item.accentColor ? `${item.accentColor}20` : 'rgba(99, 102, 241, 0.15)') : 'transparent',
                  color: isActive ? (item.accentColor || 'var(--accent-primary)') : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={20} />
                {item.name}
                {item.badge ? (
                  <span style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>

        {user && (
          <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{t.sidebar.loggedInAs}</div>
            <div style={{ fontWeight: 600, marginBottom: '16px' }}>@{user.username}</div>
            <button 
              onClick={handleLogout}
              className="btn btn-secondary" 
              style={{ width: '100%', padding: '8px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger-bg)' }}
            >
              <LogOut size={16} />
              {t.sidebar.logout}
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', position: 'relative' }}>
        {/* Global Language Switcher */}
        <div style={{ position: 'absolute', top: '32px', right: '40px', zIndex: 10 }}>
          <select 
            value={language} 
            onChange={async (e) => {
              const newLang = e.target.value as Language;
              try {
                const res = await fetch('/api/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ language: newLang })
                });
                if (res.ok) {
                  window.location.reload(); // Reload to apply language everywhere simply
                }
              } catch {}
            }}
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-light)', 
              color: 'var(--text-primary)', 
              padding: '6px 12px', 
              borderRadius: '8px',
              cursor: 'pointer',
              outline: 'none',
              fontSize: '0.85rem'
            }}
          >
            <option value="az">AZ</option>
            <option value="en">EN</option>
          </select>
        </div>
        
        {children}
      </main>
    </div>
  );
}
