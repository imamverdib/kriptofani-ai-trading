'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '800px', width: '100%', padding: '40px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <button onClick={() => router.back()} className="btn" style={{ background: 'rgba(255,255,255,0.1)', padding: '10px' }}>
            <ArrowLeft size={20} />
          </button>
          <ShieldAlert size={32} className="text-primary" />
          <h1 style={{ margin: 0, fontSize: '2rem' }}>Privacy Policy</h1>
        </div>

        <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8', fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p>
            At KriptoFani, we are committed to safeguarding user privacy and protecting trading credentials with the highest security standards.
          </p>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>1. Data Collection & Usage</h2>
            <p>
              We collect only the minimum required information to provide autonomous trading services: your username, encrypted credentials, and configured Binance API keys. Trading logs and balances are fetched solely to display your portfolio analytics and calculate position risk. We never sell, share, or monetize user data.
            </p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>2. End-to-End Key Encryption</h2>
            <p>
              Binance API secrets are encrypted at rest using military-grade AES-256 encryption. Decryption only occurs transiently in-memory during signature generation for authenticated REST requests.
            </p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>3. Secure Sessions & Cookies</h2>
            <p>
              Authentication is maintained via HTTP-only, secure JWT (JSON Web Token) cookies. No persistent third-party trackers or external advertising scripts are injected.
            </p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>4. Data Deletion & Revocation</h2>
            <p>
              Users retain full control over their account data. You may disconnect or delete your API credentials at any time directly from the settings panel. Revoking your API keys on Binance immediately halts all automated operations.
            </p>
          </section>

        </div>

        <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          If you have questions regarding our privacy practices, contact our support team.
        </div>
      </div>
    </div>
  );
}
