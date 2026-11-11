/******************************************************************************

Leaks that are known, but not yet fixed.

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

// The (`appearance`) states that already look the same in some hosts as in the reference
// host, as `host placement theme state` (with `*` matching anything)

const UNAFFECTED_APPEARANCES = [
    'plain document * diagram',
    'plain document dark tooltip',
    'plain shadow light diagram',
    'element-plus document * diagram',
    'element-plus document * tooltip',
    'element-plus shadow light diagram',
    'element-plus shadow light tooltip',
    'tailwind-primevue shadow light diagram'
]

function unaffectedAppearance({ host, placement, theme, state }: LeakContext): boolean {
    return UNAFFECTED_APPEARANCES.some(pattern => pattern.split(' ').every((part, index) =>
        part === '*' || part === [host, placement, theme, state][index]))
}

export interface KnownLeak {
    /** What leaks */
    reason: string
    /** The checks the leak shows up in: snapshot checks (component → parent), or `appearance` (parent → component) */
    checks: LeakCheck[]
    /** Where the leak shows up (everywhere if omitted) */
    when?: (context: LeakContext) => boolean
}

export const KNOWN_LEAKS: KnownLeak[] = [
    {
        reason: 'global CSS restyles host elements: tippy.js (`.tippy-box`), svgContent.css (`.error`, and `:host` rules in a shadow root), PrimeVue base styles (`box-sizing`)',
        checks: ['element styles']
    },
    {
        reason: 'variables are defined on `:root`/`:host`: `--editor-*`, Tailwind theme and `--tw-*`, PrimeVue `--p-*`, and svgContent.css `--active`, etc. in a shadow root',
        checks: ['custom properties']
    },
    {
        reason: 'inline `--editor-*` variables are set on <html> (src/CellDL/editor/index.ts)',
        checks: ['html attributes']
    },
    {
        reason: 'the `celldl-dark-mode` class is set on <html> (src/utils/vueCommon.ts)',
        checks: ['html attributes'],
        when: ({ theme }) => theme === 'dark'
    },
    {
        reason: 'the component\'s PrimeVue writes its styles into the document\'s head',
        checks: ['head styles']
    },
    {
        reason: 'vue-tippy, and PrimeVue if the host has none, are installed into the host\'s Vue app (WrappedEditor.vue)',
        checks: ['host app']
    },
    {
        reason: 'the component relies on its host for Tailwind\'s preflight, PrimeVue\'s theme, and its font and text colour, and the host\'s CSS restyles its elements',
        checks: ['appearance'],
        when: (context) => context.host !== 'tailwind-primevue' && !unaffectedAppearance(context)
    },
    {
        reason: 'in a shadow root, the component doesn\'t inherit the host document\'s text colour, and its dark theme (the `celldl-dark-mode` class on <html>) doesn\'t apply',
        checks: ['appearance'],
        when: (context) => context.host === 'tailwind-primevue' && context.placement === 'shadow'
                        && !unaffectedAppearance(context)
    }
]

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
