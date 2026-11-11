/******************************************************************************

Functionality: style isolation must not change what the component does.

These tests use the component as a user would, in the reference host (in its
document, and inside a host's shadow root, like OpenCOR), in both themes.

******************************************************************************/

import { afterEach, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { isMacOs } from '#root/utils/common'

import { REFERENCE_HOST } from './hosts'
import { locatorFor, type MountedComponent, mountInHost, PLACEMENTS, settle, THEMES } from './helpers'
import {
    clickCanvas,
    moveMouseAway,
    moveMouseOverCanvas,
    objectPosition,
    openContextMenu,
    openPanel,
    selectObject,
    showToolTip,
    toolButton,
    waitFor
} from './interactions'

//==============================================================================

const OBJECT_ID = 'ID-00000001'

const COMPONENT_SELECTOR = '.celldl-Component'

function componentCount(mounted: MountedComponent): number {
    const diagramHost = mounted.element.querySelector('.celldl-diagram-host')
    return diagramHost?.shadowRoot?.querySelectorAll(COMPONENT_SELECTOR).length ?? 0
}

async function pressUndoRedo(redo: boolean) {
    const modifier = isMacOs() ? 'Meta' : 'Control'
    await userEvent.keyboard(redo ? `{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`
                                  : `{${modifier}>}z{/${modifier}}`)
    await settle()
}

//==============================================================================

let mounted: MountedComponent|undefined

afterEach(() => {
    mounted?.unmount()
    mounted = undefined
})

describe.each(PLACEMENTS)('placement: %s', (placement) => {
    describe.each(THEMES)('theme: %s', (theme) => {
        const mount = async () => {
            mounted = await mountInHost(REFERENCE_HOST, { theme, placement })
            await mounted.openDiagram()
            return mounted
        }

        test('status bar shows the cursor position', async () => {
            const mounted = await mount()
            const status = mounted.query('.status-pos')
            await moveMouseOverCanvas(mounted, { x: 100, y: 100 })
            await waitFor(() => /\(-?[\d.]+, -?[\d.]+\)/.test(status.textContent ?? ''), 'the cursor position')
            const first = status.textContent
            await moveMouseOverCanvas(mounted, { x: 200, y: 150 })
            await waitFor(() => status.textContent !== first, 'the cursor position to change')
        })

        test('status bar shows the object under the cursor', async () => {
            const mounted = await mount()
            await moveMouseOverCanvas(mounted, objectPosition(mounted, OBJECT_ID))
            await waitFor(() => mounted.query('.status-pos').textContent?.includes(OBJECT_ID),
                          'the object id in the status bar')
        })

        test('toolbar tooltip shows and hides', async () => {
            const mounted = await mount()
            const button = toolButton(mounted, 1)
            const tooltip = await showToolTip(mounted)
            expect(tooltip.textContent).toBe(button.getAttribute('aria-label'))
            await moveMouseAway()
            await waitFor(() => tooltip.getAttribute('data-state') !== 'visible' || !tooltip.isConnected,
                          'the tooltip to hide')
        })

        test('context menu deletes the selected object', async () => {
            const mounted = await mount()
            const count = componentCount(mounted)
            await selectObject(mounted, OBJECT_ID)
            const menu = await openContextMenu(mounted, objectPosition(mounted, OBJECT_ID))
            const deleteItem = [...menu.querySelectorAll<HTMLElement>('.p-contextmenu-item-content')]
                .find(item => item.textContent?.trim() === 'Delete')
            expect(deleteItem).toBeDefined()
            // biome-ignore lint/style/noNonNullAssertion: checked above
            await userEvent.click(locatorFor(deleteItem!))
            await waitFor(() => componentCount(mounted) === count - 1, 'the object to be deleted')
            expect(mounted.queryDiagram(`[id="${OBJECT_ID}"]`)).toBeNull()
        })

        test('Backspace deletes the selected object, and undo/redo work', async () => {
            const mounted = await mount()
            const count = componentCount(mounted)
            await selectObject(mounted, OBJECT_ID)
            await userEvent.keyboard('{Backspace}')
            await waitFor(() => componentCount(mounted) === count - 1, 'the object to be deleted')
            await pressUndoRedo(false)
            await waitFor(() => componentCount(mounted) === count, 'the deletion to be undone')
            expect(mounted.queryDiagram(`[id="${OBJECT_ID}"]`)).not.toBeNull()
            await pressUndoRedo(true)
            await waitFor(() => componentCount(mounted) === count - 1, 'the deletion to be redone')
        })

        test('a component is added from the toolbar', async () => {
            const mounted = await mount()
            const count = componentCount(mounted)
            await userEvent.click(locatorFor(toolButton(mounted, 1)))
            await clickCanvas(mounted, { x: 150, y: 150 })
            await waitFor(() => componentCount(mounted) === count + 1, 'the component to be added')
        })

        test('a component is dragged from the toolbar', async () => {
            const mounted = await mount()
            const count = componentCount(mounted)
            await userEvent.dragAndDrop(locatorFor(toolButton(mounted, 2)),
                                        locatorFor(mounted.query('.svg-container')),
                                        { targetPosition: { x: 200, y: 450 } })
            await waitFor(() => componentCount(mounted) === count + 1, 'the component to be dropped')
            // The editor still responds to the mouse after a drop
            await clickCanvas(mounted, { x: 20, y: 20 })
            await selectObject(mounted, OBJECT_ID)
        })

        test('the style panel changes the selected object', async () => {
            const mounted = await mount()
            await selectObject(mounted, OBJECT_ID)
            const panel = await openPanel(mounted, 'style')
            const object = mounted.queryDiagram(`[id="${OBJECT_ID}"]`)
            const before = object?.outerHTML
            const colour = panel.querySelector<HTMLInputElement>('input#startColour')
            expect(colour).not.toBeNull()
            // biome-ignore lint/style/noNonNullAssertion: checked above
            await userEvent.fill(locatorFor(colour!), '#123456')
            await waitFor(() => mounted.queryDiagram(`[id="${OBJECT_ID}"]`)?.outerHTML !== before,
                          'the object to change')
            // (The object's image is a data URI, so the colour is URI encoded)
            expect(decodeURIComponent(mounted.queryDiagram(`[id="${OBJECT_ID}"]`)?.outerHTML ?? '').toLowerCase())
                .toContain('#123456')
        })

        test('the file is closed', async () => {
            const mounted = await mount()
            expect(componentCount(mounted)).toBeGreaterThan(0)
            await mounted.sendCommand({ command: 'file', options: { action: 'close' } })
            await waitFor(() => componentCount(mounted) === 0, 'the file to be closed')
        })
    })
})

//==============================================================================
//==============================================================================
