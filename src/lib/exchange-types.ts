/** Wire DTOs: decimal quantities remain strings until validated by the execution layer. */
export type Decimal = string | number;
export interface ExchangeOrder {
 status?:string; algoStatus?:string; listOrderStatus?:string;
 orderId?:Decimal; algoId?:Decimal; orderListId?:Decimal; actualOrderId?:Decimal;
 executedQty?:Decimal; quantity?:Decimal; origQty?:Decimal; triggerPrice?:Decimal;
 stopPrice?:Decimal;closePosition?:boolean|string; orders?:ExchangeOrder[]; orderReports?:ExchangeOrder[];
}
export interface ExchangeFill {id:Decimal;orderId:Decimal;qty:Decimal;price:Decimal;commission:Decimal;commissionAsset:string;side?:string;isBuyer?:boolean;realizedPnl?:Decimal;time:number}
export interface Balance {asset:string;free:Decimal;locked:Decimal}
export interface SpotAccount {uid?:Decimal;balances:Balance[]}
export interface ExchangePosition {symbol:string;positionAmt:Decimal;positionSide:string;liquidationPrice?:Decimal;marginType?:string;isolated?:boolean|string}
export interface FuturesAccount {multiAssetsMargin:boolean;totalMarginBalance:Decimal;totalWalletBalance:Decimal;availableBalance:Decimal;positions:ExchangePosition[]}
export interface SymbolFilter {filterType:string;stepSize:string;tickSize:string;minQty:Decimal;maxQty:Decimal;minNotional?:Decimal;notional?:Decimal;maxNotional?:Decimal}
export interface SymbolInfo {symbol:string;status:string;filters:SymbolFilter[]}
export interface Ticker {symbol:string;quoteVolume:Decimal;priceChangePercent:Decimal}
export interface Bracket {notionalFloor:Decimal;notionalCap:Decimal;initialLeverage:Decimal;maintMarginRatio:Decimal}
export interface Cashflow {coin:string;insertTime:number;applyTime:string;amount:Decimal;transactionFee?:Decimal;id?:Decimal;txId?:string}
export interface Income {incomeType:string;tranId:Decimal;asset:string;income:Decimal;time:number}
export interface CommissionParts {taker?:Decimal;buyer?:Decimal;seller?:Decimal}
export interface Commission {standardCommission?:CommissionParts;taxCommission?:CommissionParts;specialCommission?:CommissionParts}
