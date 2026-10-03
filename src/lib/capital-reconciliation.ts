import type {FillRow} from './trading-rows';
import {read,transaction} from './trading-store';
export type Inventory=Record<string,number>;
interface Checkpoint {inventory:string;fill_cursor:number;income_cursor:number;flow_cursor:number}
interface IncomeRow {rowid:number;type:string;asset:string;amount:number}
/** Compare asset units, never mark-to-market equity: a deposit cannot impersonate trading profit. */
export function expectedInventory(before:Inventory,fills:FillRow[],income:IncomeRow[],flows:{amount:number}[]):Inventory{
 const result={...before};const add=(asset:string,amount:number)=>{if(!Number.isFinite(amount))throw new Error('Invalid capital ledger amount');result[asset]=(result[asset]||0)+amount};
 for(const f of fills){
  if(f.market==='spot'){const direction=f.side==='BUY'?1:-1;add(f.symbol.slice(0,-4),direction*f.quantity);add('USDT',-direction*f.quantity*f.price)}
  else add('USDT',f.realized_pnl);
  add(f.commission_asset,-f.commission);
 }
 for(const item of income)if(item.type==='FUNDING_FEE')add(item.asset,item.amount);
 for(const f of flows)add('USDT',f.amount);
 return result;
}
export function assertInventory(expected:Inventory,actual:Inventory){
 for(const asset of new Set([...Object.keys(expected),...Object.keys(actual)])){
  const a=actual[asset]||0,e=expected[asset]||0;
  if(!Number.isFinite(a)||!Number.isFinite(e)||Math.abs(a-e)>(asset==='USDT'?0.01:1e-8))throw new Error(`Unexplained ${asset} balance movement; cashflow or external execution reconciliation required`);
 }
}
export async function reconcileCapital(userId:number,inventory:Inventory){
 // The caller owns the account; do not move checkpoints on an unexplained movement.
 return transaction(async sql=>{
  const old=await sql.get<Checkpoint>('SELECT * FROM capital_checkpoints WHERE user_id=?',[userId]);
  const fills=await sql.all<FillRow & {rowid:number}>('SELECT rowid,* FROM execution_fills WHERE user_id=? AND rowid>? ORDER BY rowid',[userId,old?.fill_cursor||0]);
  const incomes=await sql.all<IncomeRow>('SELECT rowid,type,asset,amount FROM income_ledger WHERE user_id=? AND rowid>? ORDER BY rowid',[userId,old?.income_cursor||0]);
  const flows=await sql.all<{rowid:number;amount:number}>('SELECT rowid,amount FROM external_flows WHERE user_id=? AND rowid>? ORDER BY rowid',[userId,old?.flow_cursor||0]);
  if(old)assertInventory(expectedInventory(JSON.parse(old.inventory),fills,incomes,flows),inventory);
  else assertInventory(inventory,inventory);
  await sql.run('INSERT INTO capital_checkpoints VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET inventory=excluded.inventory,fill_cursor=excluded.fill_cursor,income_cursor=excluded.income_cursor,flow_cursor=excluded.flow_cursor,updated_at=excluded.updated_at',[userId,JSON.stringify(inventory),fills.at(-1)?.rowid||old?.fill_cursor||0,incomes.at(-1)?.rowid||old?.income_cursor||0,flows.at(-1)?.rowid||old?.flow_cursor||0,Date.now()]);
 });
}
export async function capitalCheckpoint(userId:number){return read(sql=>sql.get<Checkpoint>('SELECT * FROM capital_checkpoints WHERE user_id=?',[userId]))}
