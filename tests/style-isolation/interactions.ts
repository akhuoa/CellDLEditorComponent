/******************************************************************************

User interactions with the component, for the style isolation tests.

Interactions go through Vitest's `userEvent` (i.e. real browser input, via
Playwright), so that they behave as they do for a user.

******************************************************************************/

import { userEvent } from 'vitest/browser'
import { vi } from 'vitest'

import type { MountedComponent } from './helpers'
import { locatorFor, settle } from './helpers'

//==============================================================================

export const PANELS = {
    properties: 'properties-property-panel',
    metadata: 'metadata-property-panel',
    style: 'style-property-panel'
} as const

export type PanelName = keyof typeof PANELS

//==============================================================================

export async function waitFor(condition: () => unknown, what: string, timeout: number = 5000) {
    await vi.waitFor(() => {
        if (!condition()) {
            throw new Error(`Timed out waiting for ${what}`)
        }
    }, { timeout })
}

function isVisible(element: Element|null): boolean {
    if (!element) return false
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

//==============================================================================

/**
 * The canvas (the element that contains the diagram).
 */
function canvas(mounted: MountedComponent) {
    return locatorFor(mounted.query('.svg-container'))
}

/**
 * The position, relative to the canvas, of the centre of an object in the diagram.
 */
export function objectPosition(mounted: MountedComponent, id: string): { x: number, y: number } {
    const element = mounted.queryDiagram(`[id="${id}"]`)
    if (!element) {
        throw new Error(`Cannot find object '${id}' in the diagram`)
    }
    const objectRect = element.getBoundingClientRect()
    const canvasRect = mounted.query('.svg-container').getBoundingClientRect()
    return {
        x: Math.round(objectRect.left + objectRect.width/2 - canvasRect.left),
        y: Math.round(objectRect.top + objectRect.height/2 - canvasRect.top)
    }
}

export async function moveMouseOverCanvas(mounted: MountedComponent, position: { x: number, y: number }) {
    await userEvent.hover(canvas(mounted), { position })
}

export async function clickCanvas(mounted: MountedComponent, position: { x: number, y: number }, button: 'left'|'right' = 'left') {
    await userEvent.click(canvas(mounted), { position, button })
    await settle()
}

export async function selectObject(mounted: MountedComponent, id: string) {
    await clickCanvas(mounted, objectPosition(mounted, id))
    await waitFor(() => mounted.queryDiagram(`[id="${id}"].selected, [id="${id}"] .selected`), `object '${id}' to be selected`)
}

/**
 * Move the mouse away from the component, so that nothing is hovered.
 */
export async function moveMouseAway() {
    await userEvent.hover(locatorFor(document.body), { position: { x: 1, y: 1 } })
    await settle()
}

/**
 * Find an overlay (tooltip, menu, dropdown) shown by the component. It may be within
 * the component, within the host's shadow root, or in the document's body.
 */
function queryOverlay(mounted: MountedComponent, selector: string): HTMLElement|null {
    for (const root of [mounted.element, mounted.shadowRoot, document]) {
        const element = root?.querySelector<HTMLElement>(selector)
        if (element && isVisible(element)) {
            return element
        }
    }
    return null
}

//==============================================================================

export function toolButtons(mounted: MountedComponent): HTMLElement[] {
    return [...mounted.element.querySelectorAll<HTMLElement>('.tool-button')]
}

export function toolButton(mounted: MountedComponent, index: number): HTMLElement {
    const button = toolButtons(mounted)[index]
    if (!button) {
        throw new Error(`Cannot find toolbar button ${index}`)
    }
    return button
}

/**
 * Hover a toolbar button and wait for its tooltip.
 */
export async function showToolTip(mounted: MountedComponent, index: number = 1): Promise<HTMLElement> {
    const button = toolButton(mounted, index)
    await userEvent.hover(locatorFor(button))
    const tooltip = () => queryOverlay(mounted, '[data-tippy-root] .tippy-box[data-state="visible"]')
    await waitFor(() => isVisible(tooltip()), 'the tooltip')
    // Wait for tippy's (fade) animation to finish
    await new Promise(resolve => setTimeout(resolve, 400))
    // biome-ignore lint/style/noNonNullAssertion: checked above
    return tooltip()!
}

export async function openContextMenu(mounted: MountedComponent, position: { x: number, y: number }): Promise<HTMLElement> {
    await clickCanvas(mounted, position, 'right')
    const menu = () => queryOverlay(mounted, '.p-contextmenu')
    await waitFor(() => isVisible(menu()), 'the context menu')
    await new Promise(resolve => setTimeout(resolve, 300))
    // biome-ignore lint/style/noNonNullAssertion: checked above
    return menu()!
}

export async function openPanel(mounted: MountedComponent, panel: PanelName): Promise<HTMLElement> {
    const button = mounted.query(`.tool-button[id="${PANELS[panel]}"]`)
    await userEvent.click(locatorFor(button))
    const panelElement = () => [...mounted.element.querySelectorAll<HTMLElement>('.panel')].find(element => isVisible(element)) ?? null
    await waitFor(() => isVisible(panelElement()), `the ${panel} panel`)
    await new Promise(resolve => setTimeout(resolve, 300))
    // biome-ignore lint/style/noNonNullAssertion: checked above
    return panelElement()!
}

/**
 * Open the (first) dropdown in an open panel.
 */
export async function openDropdown(mounted: MountedComponent, panel: HTMLElement): Promise<HTMLElement> {
    const select = panel.querySelector<HTMLElement>('.p-select')
    if (!select) {
        throw new Error('Cannot find a dropdown in the panel')
    }
    await userEvent.click(locatorFor(select))
    const overlay = () => queryOverlay(mounted, '.p-select-overlay')
    await waitFor(() => isVisible(overlay()), 'the dropdown')
    await new Promise(resolve => setTimeout(resolve, 300))
    // biome-ignore lint/style/noNonNullAssertion: checked above
    return overlay()!
}

//==============================================================================
//==============================================================================
