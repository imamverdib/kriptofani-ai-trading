import { runAnalysis } from './trading-service';
export async function runTradingEngine(targetUserId?:number) { return runAnalysis('spot',targetUserId); }
