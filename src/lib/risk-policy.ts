/** Equity limits are cashflow adjusted. Deposits never erase earlier drawdown. */
export function equityRisk(previous:{highWater:number;dayStart:number;day:string;flowTotal:number}|undefined,equity:number,flowTotal:number,day:string){
 if(!Number.isFinite(equity)||equity<0||!Number.isFinite(flowTotal))throw new Error('Invalid equity snapshot');
 const adjusted=equity-flowTotal;
 const highWater=Math.max(previous?.highWater??adjusted,adjusted);
 const dayStart=previous?.day===day?previous.dayStart:adjusted;
 const drawdown=highWater>0?Math.max(0,(highWater-adjusted)/highWater):0;
 const dailyLoss=dayStart>0?Math.max(0,(dayStart-adjusted)/dayStart):0;
 return {adjusted,highWater,dayStart,day,flowTotal,drawdown,dailyLoss,reason:drawdown>=0.05?'Maximum drawdown 5% reached':dailyLoss>=0.02?'Daily equity loss 2% reached':null};
}
