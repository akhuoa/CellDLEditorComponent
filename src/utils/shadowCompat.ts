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

// The editor renders in its own shadow root (see editorElement.ts). To a listener
// outside a shadow root, an event from within it has the shadow host as its target.
// PrimeVue's overlays (the context menu, a dropdown) listen on the document and use
// `event.target` to tell whether a click was inside them, and close if it wasn't. So
// for listeners outside the editor's shadow root, `event.target` is made to be the
// element the event came from within the shadow root.
//
// This is the same approach as OpenCOR's (its src/common/shadowCompat.ts), which may
// also be active when the editor is used in OpenCOR.
//
// Global symbols are used, so that several copies of the editor share one registry.

const SHADOW_HOSTS = Symbol.for('celldl-editor.shadowHosts')
const EVENT_TARGETS_KEPT = Symbol.for('celldl-editor.eventTargetsKept')

const editorGlobal = globalThis as unknown as Record<symbol, WeakSet<Element>|boolean|undefined>

editorGlobal[SHADOW_HOSTS] ??= new WeakSet<Element>()

const shadowHosts = editorGlobal[SHADOW_HOSTS] as WeakSet<Element>

//==============================================================================

const EVENTS = [
    'auxclick',
    'click',
    'contextmenu',
    'dblclick',
    'focusin',
    'focusout',
    'keydown',
    'keyup',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'touchend',
    'touchstart'
]

const nativeTarget = Object.getOwnPropertyDescriptor(Event.prototype, 'target')?.get

// Is a node within a shadow root, possibly within a shadow root of its own (e.g. the diagram's)?

function isWithin(node: Node, shadowRoot: ShadowRoot): boolean {
    let root = node.getRootNode()
    while (root instanceof ShadowRoot) {
        if (root === shadowRoot) {
            return true
        }
        root = root.host.getRootNode()
    }
    return false
}

function keepEventTarget(event: Event) {
    if (!nativeTarget) {
        return
    }
    // The innermost editor the event came from

    const path = event.composedPath()
    for (let i = 1; i < path.length; i += 1) {
        const host = path[i]
        const shadowRoot = path[i - 1]
        if (host instanceof Element && shadowHosts.has(host) && shadowRoot instanceof ShadowRoot) {
            // The event's target as seen from within the editor's shadow root

            const target = path.slice(0, i - 1).find((node) => node instanceof Node && node.getRootNode() === shadowRoot)
            if (target) {
                // Note: this replaces a target set by a shadow root that the editor is in (e.g.
                //       OpenCOR's, which would give the editor's host as the target)
                Object.defineProperty(event, 'target', {
                    configurable: true,
                    get() {
                        const currentTarget = (this as Event).currentTarget
                        return currentTarget instanceof Node
                            && (currentTarget === shadowRoot || isWithin(currentTarget, shadowRoot))
                            ? nativeTarget.call(this)
                            : target
                    }
                })
            }
            return
        }
    }
}

//==============================================================================

/**
 * Make events from within an editor's shadow root keep their target for listeners
 * outside the shadow root.
 *
 * @param host The editor's shadow host
 */
export function useShadowCompat(host: Element|null) {
    if (!host) {
        return
    }
    shadowHosts.add(host)

    if (!editorGlobal[EVENT_TARGETS_KEPT]) {
        // The window is listened to in the capturing phase, i.e. before any listener on the document
        for (const event of EVENTS) {
            window.addEventListener(event, keepEventTarget, { capture: true, passive: true })
        }
        editorGlobal[EVENT_TARGETS_KEPT] = true
    }
}

//==============================================================================
//==============================================================================
