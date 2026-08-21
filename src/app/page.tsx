import Link from 'next/link';
import { Activity, Zap, ShieldCheck, TrendingUp, Cpu, BarChart3, Bot } from 'lucide-react';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={24} className="text-gradient" />
          <span style={{ fontWeight: 700, fontSize: '1.25rem' }} className="text-gradient">KriptoFani</span>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link href="/login" className="btn btn-secondary">Sign In</Link>
          <Link href="/register" className="btn btn-primary">Get Started</Link>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }} className="animate-fade-in">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '24px' }}>
          <Zap size={16} /> Autonomous Multi-Agent AI Crypto Trading Platform
        </div>
        
        <h1 style={{ fontSize: '4rem', lineHeight: '1.1', maxWidth: '850px', marginBottom: '24px' }}>
          Automate Your Trading with <span className="text-gradient">AI Precision</span>
        </h1>
        
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', maxWidth: '650px', marginBottom: '40px', lineHeight: '1.6' }}>
          Connect your Binance Spot & Futures account with KriptoFani. Harness real-time technical indicators, Google Gemini AI sentiment analysis, and risk-managed auto-execution.
        </p>
        
        <div style={{ display: 'flex', gap: '16px', marginBottom: '60px' }}>
          <Link href="/register" className="btn btn-primary" style={{ padding: '16px 36px', fontSize: '1.1rem' }}>
            Start Free Trial
          </Link>
          <Link href="/login" className="btn btn-secondary" style={{ padding: '16px 36px', fontSize: '1.1rem' }}>
            Live Dashboard
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', maxWidth: '1000px', width: '100%', textAlign: 'left' }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
            <Cpu size={24} style={{ color: 'var(--accent-primary)', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Gemini AI Market Logic</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Multi-factor confidence scoring evaluating RSI, MACD, and real-time market sentiment before placing trades.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
            <ShieldCheck size={24} style={{ color: '#10b981', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Strict Risk Safeguards</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Configure max balance risk percentage per trade, auto stop-loss boundaries, and trade cooldown timers.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
            <Bot size={24} style={{ color: '#06b6d4', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Instant Telegram Signals</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Receive instant transaction alerts, entry/exit prices, and PnL reports directly in your Telegram channel.
            </p>
          </div>
        </div>
      </main>

      <footer style={{ padding: '24px 40px', textAlign: 'center', borderTop: '1px solid var(--border-glass)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
        <p>© 2026 KriptoFani. Architected by <a href="https://behbudlu.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>Imamverdi Behbudlu</a>. All rights reserved.</p>
      </footer>
    </div>
  );
}
