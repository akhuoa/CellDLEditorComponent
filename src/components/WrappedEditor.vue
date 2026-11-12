<template lang="pug">
    .celldl-editor.flex.flex-col(:class="{ 'celldl-dark-mode': darkMode }")
        main.editor-pane.relative.flex.flex-col.grow
            EditorToolbar.editor-bar-h(
                :leftButtons="toolButtons"
                :rightButtons="panelButtons"
                @button-event="buttonEvent"
            )
            div.svg-container(ref="svgContainer")
                EditorContextMenu(
                    :contextMenuProps="contextMenuProps"
                )
                <!-- context-menu(id="context-menu")  -->
        footer.status-bar
            span.status-msg(ref="statusMsg")
            span.status-pos(ref="statusPos")
        <!-- Tooltips, the context menu, and dropdowns are shown in here (see utils/overlays.ts) -->
        div.celldl-overlay-container(ref="overlayContainer")
</template>

<script setup lang="ts">
/** biome-ignore-all lint/correctness/noUnusedVariables: Vue components and properties arte in fact used */

import * as vue from 'vue'

import { css as primeVueCss } from 'virtual:celldl-editor-primevue-css'

//==============================================================================

import editorCss from '#root/assets/style.css?inline'

import * as vueCommon from '#root/utils/vueCommon'
import { useShadowCompat } from '#root/utils/shadowCompat'
import { OVERLAY_CONTAINER_KEY, trackOverlayContainer } from '#root/utils/overlays'

import { CellDLDiagram } from '#editor/diagram'
import { CellDLEditor } from '#editor/editor'
import { DEFAULT_EDITOR_TOOL_ID, EDITOR_TOOL_IDS } from '#editor/editor'

import { EDITOR_EVENTS_KEY, type EditorToolButton, PANEL_ID } from '#root/utils/editor-types'

import { ComponentLibraryPlugin } from '#root/plugins'

import { BondgraphPlugin, PLUGIN_ID as BG_PLUGIN_ID } from '#root/plugins/bondgraph'

import { DrawingPlugin, PLUGIN_ID as DRAWING_PLUGIN_ID } from '#root/plugins/drawing'

import { CONNECTION_STYLE_DEFINITIONS } from '#editor/connections'

// WIP import { ElectricalPlugin } from '#root/plugins/electrical'
import type { PopoverEventData, ViewState } from '#root/utils/editor-types'

//import { TestCellDLEditor, testEditor } from '../../tests/editor'

import PropertiesPanel from './panels/PropertiesPanel.vue'
import StylingPanel from './panels/StylingPanel.vue'

import EditorToolbar from './toolbar/EditorToolbar.vue'
import EditorContextMenu from './widgets/EditorContextMenu.vue'
import type { ContextMenuProps } from './widgets/EditorContextMenu.vue'

//==============================================================================

export type Theme = 'light' | 'dark' | 'system';

//==============================================================================

export type EditorEditCommand = {
    command: 'edit'
    options: {
        action: string
    }
}

export type EditorExportCommand = {
    command: 'export'
    options: {
        action: string
    }
}

export type EditorFileCommand = {
    command: 'file'
    options: {
        action: string
        data?: string
        kind?: string   // export,
        name?: string
        type?: string   // For export: `cellml`, `omex`
    }
}

export type EditorSetStateCommand = {
    command: 'set-state'
    options: {
        action: string
    }
}

export type EditorViewCommand = {
    command: 'view'
    options: ViewState
}

export type CellDLEditorCommand = EditorEditCommand
                                | EditorExportCommand
                                | EditorFileCommand
                                | EditorSetStateCommand
                                | EditorViewCommand

//==============================================================================

export interface CellDLEditorProps {
    editorCommand?: CellDLEditorCommand
    theme?: Theme
}
export type EditorData = {
    data: string
    kind?: string
}

//==============================================================================
//==============================================================================

// The editor is rendered in a shadow root, in its own Vue app, which has its own
// PrimeVue and vue-tippy (see editorElement.ts)

const host = vue.useHost()
const shadowRoot = vue.useShadowRoot()

useShadowCompat(host)

// Put our global styles into our shadow root. (Vue puts our components' styles into
// it, before our root element.) Our own styles come first and PrimeVue's last, which
// is the order they had in a document.

function createStyleElement(css: string, name: string): HTMLStyleElement {
    const style = document.createElement('style')
    style.setAttribute('data-celldl-style', name)
    style.textContent = css
    return style
}

if (shadowRoot) {
    shadowRoot.prepend(createStyleElement(editorCss, 'editor'))
    vue.onMounted(() => {
        shadowRoot.append(createStyleElement(primeVueCss, 'primevue'))
    })
}

// Register our Bondgraph and Drawing plugins with the component library manager

const componentLibraryPlugin = new ComponentLibraryPlugin()

componentLibraryPlugin.registerPlugin(new BondgraphPlugin())
componentLibraryPlugin.registerPlugin(new DrawingPlugin())

// WIP componentLibraryPlugin.registerPlugin(new ElectricalPlugin())

//==============================================================================
//==============================================================================

const svgContainer = vue.ref(null)
const statusMsg = vue.useTemplateRef<HTMLElement>('statusMsg')
const statusPos = vue.useTemplateRef<HTMLElement>('statusPos')
const overlayContainer = vue.useTemplateRef<HTMLElement>('overlayContainer')

// Our child components show their overlays in our overlay container
vue.provide(OVERLAY_CONTAINER_KEY, overlayContainer)

let stopTrackingOverlayContainer: (() => void)|undefined

let celldlDiagram: CellDLDiagram|undefined

// Plugins need to be initialised before creating the editor

const celldlEditor: CellDLEditor = new CellDLEditor(componentLibraryPlugin)

//const celldlEditor: TestCellDLEditor = new TestCellDLEditor()

// Our child components send their events to our editor
vue.provide(EDITOR_EVENTS_KEY, celldlEditor.events)


//==============================================================================

const props = defineProps<CellDLEditorProps>()

const emit = defineEmits<{
    'editor-data': [data: EditorData],
    'editor-ready': [],
    'file-edited': [],
    'editor-state': [state: {
        error: string
    }]
}>()

// Let our host know when the diagram has been changed

celldlEditor.events.addEventListener('file-edited', () => emit('file-edited'))

//==============================================================================

// Our theme. Dark mode is a class of our root element, for our own styles, and an
// attribute of our shadow host, for PrimeVue's (see scripts/primevue.css.plugin.ts).

const darkMode = vueCommon.useDarkMode(() => props.theme)

vue.watchEffect(() => {
    host?.setAttribute('data-celldl-theme', darkMode.value ? 'dark' : 'light')
})

//==============================================================================

// Set the default component from the component library

// biome-ignore lint/style/noNonNullAssertion: some plugin has a selected template
const defaultComponent = componentLibraryPlugin.getSelectedTemplate()!

//==============================================================================

function despatchToolbarEvent(type: string, source: string, value: boolean|string) {
    celldlEditor.events.dispatchEvent(
        new CustomEvent('toolbar-event', {
            detail: {
                type,
                source,
                value
            }
        })
    )
}

//==============================================================================

// Pass 'context-menu' events from the editor to the context menu's component

const contextMenuProps = vue.ref<ContextMenuProps>({
    state: new Set()
})

celldlEditor.events.addEventListener('open-context-menu', (event: Event) => {
    contextMenuProps.value = (<CustomEvent>event).detail
})

//==============================================================================
//==============================================================================

// Build the left toolbar buttons: SelectTool + BG component templates + BG stroke styles + Drawing tools

const toolButtons = vue.ref<EditorToolButton[]>([
    {
        toolId: EDITOR_TOOL_IDS.SelectTool,
        active: (DEFAULT_EDITOR_TOOL_ID as EDITOR_TOOL_IDS) === EDITOR_TOOL_IDS.SelectTool,
        prompt: 'Selection tool',
        icon: 'lucide-MousePointer'
    }
])

let buttonGroupId = 1

// Add bond graph tool buttons
const bgPlugin = componentLibraryPlugin.getPlugin(BG_PLUGIN_ID)
if (bgPlugin) {
    for (const buttonGroup of bgPlugin.toolButtons()) {
        toolButtons.value.push({ toolId: `separator-${buttonGroupId}`, prompt: '', separator: true })
        toolButtons.value.push(...buttonGroup)
        buttonGroupId += 1
    }
}

// Add drawing tool buttons
const drawingPlugin = componentLibraryPlugin.getPlugin(DRAWING_PLUGIN_ID)
if (drawingPlugin) {
    for (const buttonGroup of drawingPlugin.toolButtons()) {
        toolButtons.value.push({ toolId: `separator-${buttonGroupId}`, prompt: '', separator: true })
        toolButtons.value.push(...buttonGroup)
        buttonGroupId += 1
    }
}

//==============================================================================

const panelButtons = vue.ref<EditorToolButton[]>([
    {
        toolId: PANEL_ID.PROPERTIES_PANEL,
        prompt: 'Properties',
        icon: 'lucide-Settings',
        panel: vue.markRaw(PropertiesPanel)
    },
    {
        toolId: PANEL_ID.METADATA_PANEL,
        prompt: 'Metadata',
        icon: 'lucide-FileCode',
        panel: vue.markRaw(PropertiesPanel)
    },
    {
        toolId: PANEL_ID.STYLE_PANEL,
        prompt: 'Style',
        icon: 'lucide-Paintbrush',
        panel: vue.markRaw(StylingPanel)
    }
])

//==============================================================================

function resetToolBars() {
    // Set SelectTool as the only active tool button

    for (const toolButton of toolButtons.value) {
        toolButton.active = toolButton.toolId === EDITOR_TOOL_IDS.SelectTool
    }

    // Hide any open panel
    // FUTURE: reset to default panel tool
}

//==============================================================================

async function buttonEvent(toolId: PANEL_ID, active: boolean) {

    if (toolId.startsWith(`${BG_PLUGIN_ID}/`)) {
        const componentId = toolId.slice(BG_PLUGIN_ID.length + 1)

        // Check if this is a component template
        const template = bgPlugin?.componentLibrary.templates.find(t => t.id === componentId)
        if (template) {
            // Async-load the image to obtain its natural dimensions for placement
            const dims = await new Promise<{ width: number; height: number }>(resolve => {
                const img = new Image()
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
                img.src = template.imageData
            })
            celldlEditor.events.dispatchEvent(
                new CustomEvent('component-selected', {
                    detail: {
                        id: toolId,
                        centre: { x: dims.width / 2, y: dims.height / 2 },
                        offset: { x: 0, y: 0 }
                    }
                })
            )
        } else {
            // Bond graph connection style
            celldlEditor.events.dispatchEvent(
                new CustomEvent('connection-style', {
                    detail: { style: componentId }
                })
            )
        }
    } else if (toolId.startsWith(`${DRAWING_PLUGIN_ID}/`)) {
        const drawingToolId = toolId.slice(DRAWING_PLUGIN_ID.length + 1)
        celldlEditor.events.dispatchEvent(
            new CustomEvent('celldl-drawing', {
                detail: { tool: drawingToolId }
            })
        )
    } else {
        // Standard toolbar event (SelectTool, panel open/close)
        despatchToolbarEvent('state', toolId, active)
    }
}

//==============================================================================
//==============================================================================

vue.watch(
    () => props.editorCommand,
    async () => {
        if (props.editorCommand?.command === 'file') {
            const command = props.editorCommand as EditorFileCommand
            const options = command.options
            if  (options.action === 'close') {
                resetToolBars()
                celldlDiagram = new CellDLDiagram('', '', celldlEditor)
                await celldlEditor.editDiagram(celldlDiagram)
            } else if (options.action === 'open') {
                resetToolBars()
                if (options.data !== undefined) {
                    try {
                        celldlDiagram = new CellDLDiagram(options?.name || '', options.data, celldlEditor)
                        await celldlEditor.editDiagram(celldlDiagram)
                    } catch(err) {
                        emit('editor-state', {
                            error: `Cannot open ${options?.name} -- invalid CellDL file?\n\n${err}`
                        })
                    }
                }
            } else if (options.action === 'data') {
                const celldl = await celldlDiagram?.serialise()
                emit('editor-data', {
                    data: celldl,
                    kind: options.kind
                } as EditorData)
            }
        } else if (props.editorCommand?.command === 'edit') {
            const command = props.editorCommand as EditorEditCommand
            const options = command.options
            if (options.action === 'clean') {
                celldlDiagram!.context.undoRedo.clean()
            }
        } else if (props.editorCommand?.command === 'set-state') {
            const command = props.editorCommand as EditorSetStateCommand
            const options = command.options
            if (options.action === 'reset-tools') {
                resetToolBars()
            }
        } else if (props.editorCommand?.command === 'view') {
            const command = props.editorCommand as EditorViewCommand
            celldlDiagram?.context.editGuides.setState(command.options)
        }
    }
)

//==============================================================================

let unmounted = false

vue.onMounted(async () => {
    if (overlayContainer.value) {
        stopTrackingOverlayContainer = trackOverlayContainer(overlayContainer.value)
    }
    if (svgContainer.value) {
        const svgContainerElement: HTMLElement = svgContainer.value
        window.setTimeout(async () => {
            if (unmounted) {
                return
            }
            if (svgContainerElement.clientWidth === 0 || svgContainerElement.clientHeight === 0) {
                console.error('zero sized container!!')
            }
            celldlEditor.mount(svgContainerElement, statusMsg.value, statusPos.value)

            // Create a new diagram in the editor's window
            celldlDiagram = new CellDLDiagram('', '', celldlEditor)
            await celldlEditor.editDiagram(celldlDiagram)

//            testEditor(celldlEditor)
            emit('editor-ready')
        })
    }
})

vue.onBeforeUnmount(() => {
    stopTrackingOverlayContainer?.()
})

vue.onUnmounted(() => {
    unmounted = true
    celldlEditor.destroy()
    celldlDiagram = undefined
})

//==============================================================================
//==============================================================================
</script>

<style scoped>
.editor-pane {
    min-height: calc(100% - 1.6em);
}
.editor-bar-h {
    height: 40px;
    width: 100%;
    overflow: visible;
    border: 2px solid var(--editor-border-color);
    background-color: var(--editor-statusbar-background);
}
.svg-container {
    margin:  0;
    border: 2px solid var(--editor-border-color);
    border-top-width: 0;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;     /* The diagram's (absolutely positioned) host fills us */
}
.hidden {
    display: none;
}
.status-bar {
    min-height: 1.6em;
    border-top: 1px solid var(--editor-border-color);
    padding-left: 16px;
    padding-right: 16px;
    background-color: var(--editor-statusbar-background);
}
.status-msg.error {
    color: red;
}
.status-msg.warn {
   color: blue;
}
.status-pos {
    float: right;
}
.celldl-overlay-container {
    position: fixed;
    top: 0;
    left: 0;
    /* The viewport's size, so that overlays (which are absolutely positioned within the
       container) have the same room to lay out as in the document's body. (With no
       width, a tooltip would shrink to its narrowest width.) */
    width: 100vw;
    height: 100vh;
    overflow: visible;
    pointer-events: none;
    z-index: 99999;
}
.celldl-overlay-container > :deep(*) {
    pointer-events: auto;
}
</style>
