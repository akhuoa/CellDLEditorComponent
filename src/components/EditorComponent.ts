//==============================================================================

import { initialise as initialiseRdf } from '@celldl/rdf'
import { defineAsyncComponent, defineComponent, h, onBeforeUnmount, shallowRef } from 'vue'

import type { EditorElement } from '#root/editorElement'

import type { CellDLEditorCommand, EditorData, Theme } from './WrappedEditor.vue'
import type WrappedEditor from './WrappedEditor.vue'

//==============================================================================

// The editor is a wrapper around a custom element, which renders the editor in a
// shadow root (see editorElement.ts). The wrapper has the editor's props and events:
//  - props are passed to the element as DOM properties, since they aren't strings; and
//  - the element emits its events as custom events, whose detail is the array of
//    emitted arguments, which are re-emitted as Vue events.

// Initialise the RDF store backend before the editor is imported

const EditorComponent = defineAsyncComponent(async () => {
    await initialiseRdf()

    const { EDITOR_ELEMENT_TAG, ensureEditorElement } = await import('#root/editorElement')

    ensureEditorElement()

    return defineComponent({
        name: 'CellDLEditor',
        props: {
            editorCommand: Object as () => CellDLEditorCommand,
            theme: String as () => Theme
        },
        emits: ['editor-data', 'editor-ready', 'file-edited', 'editor-state'],
        setup(props, { emit }) {
            const element = shallowRef<EditorElement|null>(null)

            // The element stays mounted while it is detached, so we unmount it
            onBeforeUnmount(() => element.value?.unmountEditor())

            return () => h(EDITOR_ELEMENT_TAG, {
                ref: element,
                '.editorCommand': props.editorCommand,
                '.theme': props.theme,
                'onEditor-data': (event: CustomEvent<[EditorData]>) => emit('editor-data', event.detail[0]),
                'onEditor-ready': () => emit('editor-ready'),
                'onFile-edited': () => emit('file-edited'),
                'onEditor-state': (event: CustomEvent<[{ error: string }]>) => emit('editor-state', event.detail[0])
            })
        }
    }) as unknown as typeof WrappedEditor
})

export default EditorComponent

//==============================================================================
