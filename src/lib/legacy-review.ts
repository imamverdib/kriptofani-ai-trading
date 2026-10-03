export interface FlatReview {legacyCount:number;futuresVerified:boolean;exchangePositionCount:number;managedCount:number;unresolvedCount:number;regularOrderCount:number;algoOrderCount:number;spotOrderCount:number}
/** Archival must never assert a flat account merely because credentials were missing. */
export function assertLegacyArchivable(s:FlatReview){
 const counts=[s.legacyCount,s.exchangePositionCount,s.managedCount,s.unresolvedCount,s.regularOrderCount,s.algoOrderCount,s.spotOrderCount];
 if(counts.some(n=>!Number.isInteger(n)||n<0))throw new Error('Incomplete account review');
 if(s.legacyCount&&!s.futuresVerified)throw new Error('Verify futures account before archiving legacy exposure');
 if(counts.slice(1).some(n=>n!==0))throw new Error('Account must be confirmed flat without pending orders or intents');
}
