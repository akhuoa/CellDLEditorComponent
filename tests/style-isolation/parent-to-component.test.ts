/******************************************************************************

Parent → component: a host's styles must not affect the component.

For each host, placement, and theme, screenshots of the component, in a number of
states, must match the screenshots taken in the reference host (`REFERENCE_HOST`),
in the host's document. The reference screenshots are what the component looks
like today, in its dev app and in the CellDL Editor app.

Hosts whose styles are known to affect the component are listed in
`known-leaks.ts`: their tests are expected to fail.

******************************************************************************/

import { afterEach, describe, expect, test } from 'vitest'
import { server } from 'vitest/browser'

import { getHost, HOSTS, REFERENCE_HOST } from './hosts'
import { knownLeak } from './known-leaks'
import { locatorFor, type MountedComponent, mountInHost, PLACEMENTS, settle, THEMES } from './helpers'
import {
    moveMouseAway,
    objectPosition,
    openContextMenu,
    openDropdown,
    openPanel,
    selectObject,
    showToolTip
} from './interactions'

//==============================================================================

const OBJECT_ID = 'ID-00000001'

// The states of the component that are compared

const STATES: Record<string, (mounted: MountedComponent) => Promise<void>> = {
    'diagram': async () => {
        await moveMouseAway()
    },
    'tooltip': async (mounted) => {
        await showToolTip(mounted)
    },
    'context-menu': async (mounted) => {
        await selectObject(mounted, OBJECT_ID)
        await openContextMenu(mounted, objectPosition(mounted, OBJECT_ID))
    },
    'style-panel': async (mounted) => {
        await selectObject(mounted, OBJECT_ID)
        await openPanel(mounted, 'style')
        await moveMouseAway()
    },
    'properties-panel': async (mounted) => {
        await selectObject(mounted, OBJECT_ID)
        await openPanel(mounted, 'properties')
        await moveMouseAway()
    },
    'dropdown': async (mounted) => {
        await selectObject(mounted, OBJECT_ID)
        const panel = await openPanel(mounted, 'properties')
        await openDropdown(mounted, panel)
    }
}

//==============================================================================

// The reference host must come first, so that its screenshots are taken first

const hostNames = HOSTS.map(host => host.name)
                       .sort((a, b) => (a === REFERENCE_HOST ? -1 : b === REFERENCE_HOST ? 1 : 0))

let mounted: MountedComponent|undefined

afterEach(() => {
    mounted?.unmount()
    mounted = undefined
})

describe.each(hostNames)('host: %s', (hostName) => {
    describe.each(PLACEMENTS)('placement: %s', (placement) => {
        describe.each(THEMES)('theme: %s', (theme) => {
            for (const [state, setState] of Object.entries(STATES)) {
                const reference = hostName === REFERENCE_HOST && placement === 'document'
                const leak = reference ? undefined
                           : knownLeak('appearance', { host: hostName, placement, theme, browser: server.browser, state })
                const runTest = leak ? test.fails : test
                runTest(leak ? `${state} (known leak: ${leak})` : state, async () => {
                    mounted = await mountInHost(hostName, { theme, placement })
                    await mounted.openDiagram()
                    await setState(mounted)
                    await settle()
                    // All hosts share the reference host's screenshots
                    // (A short timeout, since a screenshot that doesn't match is retried until then)
                    await expect.element(locatorFor(mounted.container), { timeout: 3000 })
                                .toMatchScreenshot(`${state}-${theme}`)
                })
            }
        })
    })
})

// Make sure that the reference host is known
getHost(REFERENCE_HOST)

//==============================================================================
//==============================================================================
