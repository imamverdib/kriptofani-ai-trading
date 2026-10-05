/** Exchange quantities use decimal grids, not log10 precision guesses. */
export function positive(value: unknown, name = 'value'): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${name}`);
  return n;
}
export function grid(value: number, step: number | string, mode: 'floor' | 'ceil' | 'round' = 'floor'): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid grid value');
  const s = positive(step, 'step');
  // Decimal string arithmetic retains non-power-of-ten grids such as 0.25.
  const decimals = (v: string) => { const [a,e='0'] = v.toLowerCase().split('e'); return Math.max(0,(a.split('.')[1]?.length || 0)-Number(e)); };
  const scale = Math.max(decimals(String(value)), decimals(String(step)));
  if (scale > 18) throw new Error('Unsupported precision');
  const unit = BigInt(10) ** BigInt(scale);
  const integer = (v: number) => BigInt(v.toFixed(scale).replace('.', ''));
  const vi = integer(value), si = integer(s);
  if (si <= BigInt(0)) throw new Error('Invalid step');
  let ticks = vi / si;
  const remainder = vi % si;
  if ((mode === 'ceil' && remainder > BigInt(0)) || (mode === 'round' && remainder * BigInt(2) >= si)) ticks++;
  return Number(ticks * si) / Number(unit);
}
export function grossPnl(side: string, entry: number, exit: number, quantity: number): number {
  return (side === 'LONG' || side === 'BUY' ? 1 : -1) * (exit - entry) * quantity;
}
export function validatePlan(side: string, entry: number, stop: number, targets: number[]) {
  [entry,stop,...targets].forEach(v => positive(v, 'plan price'));
  const sign = side === 'LONG' || side === 'BUY' ? 1 : -1;
  const distance = sign * (entry - stop);
  if (distance / entry < 0.003 || distance / entry > 0.025) throw new Error('Stop outside risk policy');
  let previous = entry;
  for (const t of targets) { if (sign * (t - previous) <= 0) throw new Error('Targets out of order'); previous=t; }
  if (sign * (targets[0] - entry) / distance < 2 - 1e-9) throw new Error('Net plan requires at least 2R gross');
}
export function sizePosition(p: {equity:number; available:number; entry:number; stop:number; leverage:number; riskPct:number; allocationPct:number; feeRate:number; slippage:number; step:string|number}) {
  [p.equity,p.entry,p.leverage].forEach(v=>positive(v));
  if (![p.riskPct,p.allocationPct,p.feeRate,p.slippage,p.available].every(v=>Number.isFinite(v)&&v>=0)) throw new Error('Invalid sizing policy');
  const loss = Math.abs(p.entry-p.stop) + p.entry*(2*p.feeRate+p.slippage);
  const qty = Math.min(p.equity*p.riskPct/100/loss, p.available*p.allocationPct/100*p.leverage/p.entry/(1+2*p.feeRate*p.leverage));
  return grid(qty,p.step);
}
export function utcTime(s: string | number): number {
  return typeof s === 'number' ? s : Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s.replace(' ','T')+'Z');
}
export function normalizeSymbols(value: unknown, allowAuto = true): string {
  if (typeof value !== 'string') throw new Error('Coin list must be text');
  if (allowAuto && value.trim().toUpperCase()==='AUTO') return 'AUTO';
  const symbols = [...new Set(value.toUpperCase().split(',').map(s=>s.trim()).filter(Boolean))];
  if (symbols.length>15 || symbols.some(s=>! /^[A-Z0-9]{2,20}USDT$/.test(s))) throw new Error('Invalid USDT symbol list');
  return symbols.join(',');
}
export function validateSettings(body: Record<string, unknown>) {
  const bounds: Record<string,[number,number,boolean?]>={maxRiskPct:[0,20],riskPerTradePct:[0,2],maxOpenPositions:[1,10,true],minConfidence:[0,100,true],leverage:[1,5,true],autoCoinCount:[3,15,true]};
  for (const [key,[min,max,int]] of Object.entries(bounds)) if (body[key]!==undefined) {
    const v=body[key]; if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(int&&!Number.isInteger(v))) throw new Error(`${key}: ${min}–${max}`);
  }
  if(body.targetCoins!==undefined) {body.targetCoins=normalizeSymbols(body.targetCoins);if(!body.targetCoins)throw new Error('Empty coin list');}
  if(body.blacklistCoins!==undefined)body.blacklistCoins=normalizeSymbols(body.blacklistCoins,false);
  if(body.isFuturesActive!==undefined&&typeof body.isFuturesActive!=='boolean')throw new Error('Invalid activation flag');
  if(body.isSpotActive!==undefined&&typeof body.isSpotActive!=='boolean')throw new Error('Invalid activation flag');
  if(body.language!==undefined&&!['en','az'].includes(String(body.language)))throw new Error('Invalid language');
  return body;
}
