import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertLegacyArchivable,type FlatReview} from '../src/lib/legacy-review';
const flat:FlatReview={legacyCount:1,futuresVerified:true,exchangePositionCount:0,managedCount:0,unresolvedCount:0,regularOrderCount:0,algoOrderCount:0,spotOrderCount:0};
test('legacy archival requires verified exchange truth, not missing API credentials',()=>{assert.throws(()=>assertLegacyArchivable({...flat,futuresVerified:false}));assert.doesNotThrow(()=>assertLegacyArchivable(flat))});
test('legacy archival refuses live exposure, pending orders and incomplete counts',()=>{for(const key of ['exchangePositionCount','managedCount','unresolvedCount','regularOrderCount','algoOrderCount','spotOrderCount'] as const)assert.throws(()=>assertLegacyArchivable({...flat,[key]:1}));assert.throws(()=>assertLegacyArchivable({...flat,algoOrderCount:NaN}))});
