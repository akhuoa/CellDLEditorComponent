/******************************************************************************

Component → parent: the component's styles must not affect its host.

For each host, placement, and theme, a snapshot of the host's own elements (and of
the document, and of the host's Vue app) is taken before and after the component is
mounted. Each part of the two snapshots (see `SNAPSHOT_CHECKS`) must be the same.

Leaks that are known, but not yet fixed, are listed in `known-leaks.ts`: their
tests are expected to fail. Once a leak is fixed, its test passes, and so fails as
an expected failure, until the leak is removed from `known-leaks.ts`.

******************************************************************************/

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { server } from 'vitest/browser'

import { getHost, HOSTS } from './hosts'
import { knownLeak } from './known-leaks'
import {
    type MountedComponent,
    mountInHost,
    PLACEMENTS,
    SNAPSHOT_CHECKS,
    type Snapshot,
    type SnapshotCheck,
    snapshotDifferences,
    snapshotPart,
    THEMES
} from './helpers'

//==============================================================================

describe.each(HOSTS.map(host => host.name))('host: %s', (hostName) => {
    describe.each(PLACEMENTS)('placement: %s', (placement) => {
        describe.each(THEMES)('theme: %s', (theme) => {
            let mounted: MountedComponent
            let after: Snapshot

            beforeAll(async () => {
                mounted = await mountInHost(hostName, { theme, placement })
                await mounted.openDiagram()
                after = mounted.probe()
            })

            afterAll(() => mounted?.unmount())

            for (const check of Object.keys(SNAPSHOT_CHECKS) as SnapshotCheck[]) {
                if (check === 'head styles' && getHost(hostName).usesPrimeVue) {
                    // The component uses the host's PrimeVue here, so PrimeVue's styles in
                    // the document's head are the host's as much as the component's
                    test.skip(`${check} (the component uses the host's PrimeVue)`)
                    continue
                }
                const leak = knownLeak(check, { host: hostName, placement, theme, browser: server.browser })
                const runTest = leak ? test.fails : test
                runTest(leak ? `${check} (known leak: ${leak})` : check, () => {
                    const differences = snapshotDifferences(snapshotPart(mounted.before, check),
                                                            snapshotPart(after, check))
                    expect(differences, `${SNAPSHOT_CHECKS[check]}:\n    ${differences.join('\n    ')}\n`).toEqual([])
                })
            }
        })
    })
})

//==============================================================================
//==============================================================================
