/******************************************************************************

CellDL Editor

Copyright (c) 2022 - 2026 David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

******************************************************************************/

import type * as vue from 'vue'

//==============================================================================

// Overlays (tooltips, the context menu, `Select` dropdowns) are appended to a container
// within the editor's own DOM, rather than to `document.body`. This keeps them in the
// same root as the editor (which may be a shadow root), so that the editor's styles apply
// to them and they move with the editor if it is moved to another container.

export const EDITOR_ROOT_CLASS = 'celldl-editor'

export const OVERLAY_CONTAINER_CLASS = 'celldl-overlay-container'

export const OVERLAY_CONTAINER_KEY: vue.InjectionKey<Readonly<vue.Ref<HTMLElement|null>>> = Symbol('overlay-container')

//==============================================================================

/**
 * Find the overlay container of the editor that contains an element.
 *
 * This is resolved each time an overlay is shown (e.g. by Tippy's `appendTo`), so it
 * keeps working after the editor has been moved.
 *
 * @param element An element within an editor
 * @returns The editor's overlay container, or `document.body` if there isn't one
 */
export function overlayContainerFor(element: Element): HTMLElement {
    const editorRoot = element.closest(`.${EDITOR_ROOT_CLASS}`)
    return editorRoot?.querySelector<HTMLElement>(`:scope > .${OVERLAY_CONTAINER_CLASS}`) ?? document.body
}

//==============================================================================

/**
 * Keep an overlay container aligned with the document's origin.
 *
 * The container is `position: fixed` at the viewport's origin (so that it isn't clipped
 * by any ancestor with `overflow: hidden`), while PrimeVue positions overlays using
 * document coordinates (i.e. including the window's scroll offset). Offsetting the
 * container by the negated scroll offset converts these back to viewport coordinates.
 * (Tippy positions relative to the container itself, so is unaffected.)
 *
 * @param container The overlay container
 * @returns A function to stop tracking the window's scroll offset
 */
export function trackOverlayContainer(container: HTMLElement): () => void {
    const updateOffset = () => {
        container.style.top = `${-window.scrollY}px`
        container.style.left = `${-window.scrollX}px`
    }
    updateOffset()
    window.addEventListener('scroll', updateOffset, { passive: true })
    return () => window.removeEventListener('scroll', updateOffset)
}

//==============================================================================
//==============================================================================
