import type { Flag, Verdict } from './types.js';
import { isIdShaped } from './values.js';

/**
 * The high-confidence subset of a verdict: flags about an ungrounded order number, item ID,
 * booking reference or user ID, with each flag's values narrowed to the IDs.
 *
 * On real agent logs most flags are about amounts, units and dates, where a mismatch is often
 * a formatting difference. An invented ID has no formatting variants, and it's the fabrication
 * that does the most harm: the customer writes it down and the agent may act on it. Use this
 * when you want few flags you can act on, and the full verdict when you want coverage.
 */
export function idFlags(verdict: Verdict): Flag[] {
  return verdict.flags.flatMap((flag) => {
    const ids = (flag.values ?? []).filter(isIdShaped);
    return ids.length > 0 ? [{ ...flag, values: ids }] : [];
  });
}
