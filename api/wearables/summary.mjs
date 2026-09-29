import { makeSummaryHandler } from '../_lib/wearablesHandlers.mjs';

// See _lib/wearablesHandlers.mjs: the wearables user is the one linked to the
// verified caller, never one named in the request.
export default makeSummaryHandler();
