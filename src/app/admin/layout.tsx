'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldAlert, Users, LayoutDashboard, CreditCard, LogOut, ArrowLeft, LifeBuoy, Scroll } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          if (data.user.role !== 'admin') {
            router.push('/dashboard');
          } else {
            setUser(data.user);
          }
        } else {
          router.push('/login');
        }
        setLoading(false);
      });
  }, [router]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  if (!user || user.role !== 'admin') return null;

  const navItems = [
    { name: 'Admin Panel', href: '/admin', icon: LayoutDashboard },
    { name: 'Dəstək', href: '/admin/support', icon: LifeBuoy },
    { name: 'Sistem Logları', href: '/admin/logs', icon: Scroll },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Sidebar */}
      <aside className="glass-panel" style={{ width: '260px', borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px', gap: '10px' }}>
          <ShieldAlert size={28} className="text-danger" />
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>Admin ZONASI</h2>
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
                  background: isActive ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  color: isActive ? 'var(--danger)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={20} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Link 
            href="/dashboard"
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '12px', fontSize: '0.9rem', display: 'flex', justifyContent: 'center', gap: '8px' }}
          >
            <ArrowLeft size={16} />
            KriptoFani-a qayıt
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
