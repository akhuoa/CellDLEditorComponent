/******************************************************************************

Leaks that are known, but not yet fixed (if any).

The tests for these leaks are expected to fail (`test.fails`). When a leak is
fixed its test passes, which is reported as a failure, so that the leak is then
removed from this list.

******************************************************************************/

import type { HostName, Placement, SnapshotCheck, Theme } from './helpers'

//==============================================================================

export type LeakCheck = SnapshotCheck | 'appearance'

export interface LeakContext {
    host: HostName
    placement: Placement
    theme: Theme
    browser: string
    /** For `appearance` checks, the state of the component that is compared */
    state?: string
}

export interface KnownLeak {
    /** What leaks */
    reason: string
    /** The checks the leak shows up in: snapshot checks (component → parent), or `appearance` (parent → component) */
    checks: LeakCheck[]
    /** Where the leak shows up (everywhere if omitted) */
    when?: (context: LeakContext) => boolean
}

// There are none at present: the component renders in its own shadow root, with its
// own Vue app (see src/editorElement.ts).

export const KNOWN_LEAKS: KnownLeak[] = []

//==============================================================================

/**
 * The reason for a known leak in a check and context, if there is one.
 */
export function knownLeak(check: LeakCheck, context: LeakContext): string|undefined {
    const reasons = KNOWN_LEAKS.filter(leak => leak.checks.includes(check) && (leak.when?.(context) ?? true))
                               .map(leak => leak.reason)
    return reasons.length ? reasons.join('; ') : undefined
}

//==============================================================================
//==============================================================================
