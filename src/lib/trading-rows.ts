import type {Market} from './trading-store';
export interface FillRow {user_id:number;market:Market;symbol:string;trade_id:string;position_id:string;order_id:string;side:string;quantity:number;price:number;commission:number;commission_asset:string;fee_usdt:number|null;realized_pnl:number;time:number}
export interface RiskRow {user_id:number;high_water:number;day_start:number;day:string;equity:number;frozen_reason:string|null;updated_at:number;flow_total:number;spot_equity?:number;futures_equity?:number}
export interface UserTradingRow {id:number;is_active:number;subscription_status:string;subscription_expires_at:string|null;binance_api_key:string;binance_api_secret:string;futures_api_key:string;futures_api_secret:string}
export interface RiskConfigRow {user_id:number;target_coins:string;blacklist_coins:string;auto_coin_count:number;max_risk_pct:number;risk_per_trade_pct:number;min_confidence:number;leverage:number;max_open_positions:number;is_spot_active?:number;is_futures_active?:number}
export interface JobRow {id:string;kind:'spot'|'futures'|'monitor';user_id:number;state:string;created_at:number}
export interface OutboxRow {id:number;user_id:number;chat_id:string|null;text:string;attempts:number}
