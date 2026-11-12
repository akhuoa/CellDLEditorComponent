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

import primeVueConfig from 'primevue/config'
import * as vue from 'vue'
import vueTippy from 'vue-tippy'

import { styles as primeVueStyles } from 'virtual:celldl-editor-primevue-css'

import '#root/assets/iconFont'
import WrappedEditor from '#root/components/WrappedEditor.vue'

//==============================================================================

// The editor (see components/EditorComponent.ts) is a wrapper around a custom
// element, which renders the editor in a shadow root. So a host's styles don't
// affect the editor, and the editor's styles don't affect its host. A custom
// element also has its own Vue app, so the editor has its own PrimeVue (with its
// own theme) and vue-tippy, and installs nothing into the host's Vue app.
//
// This is the same approach as OpenCOR's (its src/element.ts).
//
// The element's name is an implementation detail: a host uses the `CellDLEditor`
// component, not the element.

export const EDITOR_ELEMENT_TAG = 'celldl-editor-element'

//==============================================================================

// Tell PrimeVue not to write its styles into the document's head. PrimeVue writes
// two kinds of styles: its theme's, which are disabled by using no theme (see
// `configureApp()` below), and its style modules' (e.g. its components' base styles),
// which are disabled by removing their CSS, since PrimeVue doesn't write empty
// styles. The styles are generated at build time, and are put into the editor's
// shadow root (see scripts/primevue.css.plugin.ts and WrappedEditor.vue).
//
// This only affects the copy of PrimeVue that is bundled with the editor, not a
// host's own copy.

for (const primeVueStyle of primeVueStyles) {
    primeVueStyle.css = undefined
}

// In development mode, warn if PrimeVue writes styles into the document's head: a
// PrimeVue component is used for which no styles are generated

if (import.meta.env.DEV) {
    new MutationObserver((mutations: MutationRecord[]) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLStyleElement && node.hasAttribute('data-primevue-style-id')) {
                    console.warn(`CellDL Editor: PrimeVue wrote styles (${node.getAttribute('data-primevue-style-id')}) into the document's head. If the component is the editor's, add it to PRIMEVUE_COMPONENTS in scripts/primevue.css.plugin.ts.`)
                }
            }
        }
    }).observe(document.head, { childList: true })
}

//==============================================================================

const VueEditorElement = vue.defineCustomElement(WrappedEditor, {
    shadowRoot: true,
    configureApp: (app: vue.App) => {
        app.use(primeVueConfig as unknown as vue.Plugin, {
            theme: 'none'
        })
        app.use(vueTippy)
    }
})

// A Vue custom element unmounts its component when it is removed from the document,
// and mounts a new one if it is then put back. But a host may detach the editor for a
// while (e.g. OpenCOR shows it in a view that is kept alive, with `<KeepAlive>`), and
// the editor must keep its diagram, as it did when it was a plain Vue component. So
// the editor is only unmounted when its wrapper component is (see EditorComponent.ts).

export class EditorElement extends VueEditorElement {
    override disconnectedCallback() {
        // Stay mounted (see above)
    }

    /**
     * Unmount the editor. The element can't be used afterwards.
     */
    unmountEditor() {
        super.disconnectedCallback()
    }
}

export function ensureEditorElement() {
    if (!customElements.get(EDITOR_ELEMENT_TAG)) {
        customElements.define(EDITOR_ELEMENT_TAG, EditorElement)
    }
}

//==============================================================================
//==============================================================================
