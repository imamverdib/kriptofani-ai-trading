import {readFile,writeFile} from 'node:fs/promises';
import {replay,summarizeReturns,type RecordedSignal,type ReplayBar,type ReplayCosts} from '../src/lib/replay';
async function main(){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('Usage: npm run replay -- input.json output.json');
 const data=JSON.parse(await readFile(input,'utf8')) as {initialEquity:number;cases:{signal:RecordedSignal;bars:ReplayBar[];costs:ReplayCosts}[]};
 if(!Number.isFinite(data.initialEquity)||data.initialEquity<=0||!Array.isArray(data.cases))throw new Error('Invalid dataset');
 const cases=data.cases.map(c=>replay(c.signal,c.bars,c.costs));
 // Trade returns are reported as samples. No fictitious portfolio equity curve for overlapping cases.
 const closed=cases.filter(c=>c.closed);const sample=closed.length?summarizeReturns(closed.map(c=>c.netRealized/data.initialEquity)):null;
 await writeFile(output,JSON.stringify({cases,tradeSample:sample,portfolioDrawdown:null,warning:'Trade-sample compounding is hypothetical. A time-aligned portfolio ledger is required for portfolio drawdown. No profitability claim.'},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
