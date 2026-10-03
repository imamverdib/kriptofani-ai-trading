export interface TypeSafeDecision {
  action: 'LONG' | 'SHORT' | 'WAIT';
  confidence: number; // 0 to 100
  trendStrength: number; // 0 to 2
  isHighRisk: boolean;
  probabilities: Record<string, number>;
  latencyMs: number;
}

const TYPESAFE_API_URL = 'https://api.typesafe.ai/v1/systemone';

export function getTypeSafeApiKey(): string {
  return (process.env.TYPESAFE_API_KEY || '').trim();
}

export function isTypeSafeConfigured(): boolean {
  return getTypeSafeApiKey().length > 0;
}

export async function evaluateWithJev(marketState: string): Promise<TypeSafeDecision | null> {
  const apiKey = getTypeSafeApiKey();
  if (!apiKey) {
    return null;
  }

  const startTime = Date.now();

  const requestBody = {
    state: marketState,
    model: 'jev-latest',
    questions: {
      trade_action: {
        type: 'choice',
        instructions: 'Determine the highest probability trade direction based strictly on technical indicators, trend confluence, and market structure.',
        criteria: {
          LONG: 'Clear bullish trend, RSI oversold recovery, support retest, or strong bullish momentum',
          SHORT: 'Clear bearish trend, RSI overbought breakdown, resistance rejection, or bearish divergence',
          WAIT: 'Choppy/rangebound market, contradictory indicators, neutral RSI (40-60), or lack of confluence'
        }
      },
      trend_strength: {
        type: 'score',
        instructions: 'Evaluate the strength and momentum of the current price trend',
        criteria: [
          'Weak or ranging market without clear directional trend',
          'Moderate momentum with standard retracements',
          'Very strong, decisive trend with high volume expansion'
        ]
      },
      false_breakout_risk: {
        type: 'noul',
        instructions: 'Does this market state exhibit high risk of a false breakout, bull/bear trap, or extreme volatility wick?'
      }
    }
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(TYPESAFE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[TypeSafe Jev API Error ${res.status}]:`, errText);
      return null;
    }

    const data: any = await res.json();
    const latencyMs = Date.now() - startTime;

    const answers = data.answers || {};
    const actionAns = answers.trade_action || {};
    const trendAns = answers.trend_strength || {};
    const riskAns = answers.false_breakout_risk || {};

    const rawAction = (actionAns.choice || 'WAIT').toUpperCase();
    const action: 'LONG' | 'SHORT' | 'WAIT' =
      rawAction === 'LONG' || rawAction === 'SHORT' ? rawAction : 'WAIT';

    const confidence = Math.round((actionAns.confidence || 0) * 100);
    const trendStrength = Math.round(trendAns.score || 0);
    const isHighRisk = (riskAns.noul || 0) > 0.45;

    return {
      action,
      confidence,
      trendStrength,
      isHighRisk,
      probabilities: actionAns.probabilities || {},
      latencyMs
    };
  } catch (err: any) {
    console.error('[TypeSafe Jev Exception]:', err.message);
    return null;
  }
}
