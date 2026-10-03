'use client';

import { useRouter } from 'next/navigation';
import { Shield, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '800px', width: '100%', padding: '40px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <button onClick={() => router.back()} className="btn" style={{ background: 'rgba(255,255,255,0.1)', padding: '10px' }}>
            <ArrowLeft size={20} />
          </button>
          <Shield size={32} className="text-primary" />
          <h1 style={{ margin: 0, fontSize: '2rem' }}>Terms of Service</h1>
        </div>

        <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8', fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p>
            Please review the following terms, conditions, and risk disclosures carefully prior to using KriptoFani:
          </p>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>1. Financial & Market Risk Disclosure</h2>
            <p>
              Cryptocurrency trading involves substantial risk of loss and is not suitable for every investor. While our AI models evaluate historical patterns, mathematical technical indicators, and real-time market sentiment, past performance is no guarantee of future returns. Users assume full responsibility for all trading outcomes, slippage, and portfolio volatility.
            </p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>2. Non-Custodial Architecture & API Security</h2>
            <p>
              KriptoFani operates on a non-custodial framework. We never hold, store, or have direct custody of your digital assets. All trades execute directly in your own Binance account via encrypted API communication. When generating API credentials, you must enable <strong>ONLY &quot;Spot & Margin Trading&quot;</strong> (and Futures where applicable). <strong>NEVER enable &quot;Withdrawals&quot;</strong>. API secrets are encrypted using industry-standard AES-256 encryption.
            </p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>3. Service Availability & Algorithmic Execution</h2>
            <p>
              Algorithmic systems rely on external network connections, exchange rate limits, and third-party AI endpoints. KriptoFani does not guarantee uninterrupted uptime during exchange maintenance windows or network congestion. Users retain manual oversight and may pause bot operations at any time.
            </p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', marginBottom: '12px' }}>4. Intellectual Property & Attribution</h2>
            <p>
              KriptoFani is open-source software architected by Imamverdi Behbudlu and distributed under the MIT License.
            </p>
          </section>

        </div>

        <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          By creating an account and connecting your API credentials, you acknowledge and agree to these terms.
        </div>
      </div>
    </div>
  );
}
