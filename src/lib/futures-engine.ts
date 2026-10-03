import { runAnalysis, monitorAll } from './trading-service';
export async function runFuturesAnalysis(targetUserId?:number) { return runAnalysis('futures',targetUserId); }
export async function monitorFuturesPositions() { return monitorAll(); }
