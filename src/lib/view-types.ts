import type {tradingReport} from './reporting';
export type Report = Awaited<ReturnType<typeof tradingReport>>;
export type OpenPositionView = Report['openPositions'][number];
export type ClosedPositionView = Report['recentClosed'][number];
export interface SpotTradeView {id:string;symbol:string;action:string;amount:number;price:number;profit:number;created_at:string;date:string}
export interface AssetView {asset:string;amount:number;valueUsd:number|null}
export interface FuturesTradeView {id:string;symbol:string;side:string;entryPrice:number;quantity:number;leverage:number;status:string;totalPnl:number;stopLoss:number;tp1:number;tp2:number;tp3:number;tp1Filled:boolean;tp2Filled:boolean;tp3Filled:boolean;createdAt:string;closedAt:string|null;entryReason:string;trendDirection?:string;partialFills:{quantity:number;exit_price:number;pnl:number;tp_level:number}[]}
