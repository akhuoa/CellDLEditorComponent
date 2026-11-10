<template lang="pug">
    div(
        v-if="type==='panel'"
        ref="panelRef"
        :class="panelClasses"
        :style="panelStyle"
    )
        slot
    .ci.tool-button(
        ref="buttonRef"
        :id="toolId"
        :class="buttonClasses"
        :style="buttonStyle"
        v-tippy="{ content: prompt, placement: 'bottom', appendTo: overlayContainerFor }"
        :aria-label="prompt"
        :draggable="!!image"
        @click="toolButtonClick"
        @dragstart="dragStartEvent"
    )
        component(
            :is="buttonIcon"
            v-if="buttonIcon"
            :size="24"
            stroke-width="1.5"
        )
</template>

<script setup lang="ts">
import * as vue from 'vue'
import * as LucideIcons from '@lucide/vue'

import { EDITOR_EVENTS_KEY, type PropertyGroup } from '#root/utils/editor-types'
import { overlayContainerFor } from '#root/utils/overlays'

const props = defineProps<{
    toolId: string
    active?: boolean
    prompt: string
    icon?: string
    image?: string
    modal?: boolean
    type?: string
    panel?: vue.Raw<vue.Component>
}>()

// Events go to the editor this component is part of
const editorEvents = vue.inject(EDITOR_EVENTS_KEY, document)

const buttonClasses = vue.computed(() => {
    const classes = []
    if (props.icon && !props.icon.startsWith('lucide-')) {
        classes.push(props.icon)
    }
    if (props.active) {
        classes.push('active')
    }
    if (props.type === 'popover' && props.modal) {
        classes.push('modal')
    }
    if (props.image) {
        classes.push('image')
    }
    return classes.join(' ')
})

const buttonIcon = vue.computed(() => {
    if (props.icon?.startsWith('lucide-')) {
        return (LucideIcons as Record<string, unknown>)[props.icon.slice(7)]
    }
})

const buttonStyle = vue.computed(() => {
    const style = []
    if (props.image) {
        style.push(`background: url("${props.image}");`)
    }
    return style.join(' ')
})

const panelVisible = vue.ref(false)

const panelClasses = vue.computed(() => {
    return [props.type === 'panel' ? 'panel' : 'popover', { hidden: !panelVisible.value }]
})

const popoverTop = vue.ref<string>()
const popoverLeft = vue.ref<string>()

const panelTop = vue.ref<string>()
const panelHeight = vue.ref<string>()
const panelRight = vue.ref<string>()

const panelStyle = vue.computed(() => {
    if (props.type === 'popover') {
        return { top: popoverTop.value, left: popoverLeft.value }
    }
    if (props.type === 'panel') {
        return { position: 'fixed', top: panelTop.value, height: panelHeight.value, right: panelRight.value }
    }
})

const pointerPos = vue.ref<number>()
vue.provide('pointerPos', vue.readonly(pointerPos))

const panelRef = vue.ref(null)
let panelElement: HTMLElement | null = null

vue.onMounted(() => {
    if (panelRef.value) {
        panelElement = (<HTMLElement>panelRef.value).firstElementChild as HTMLElement
    }
})

//==============================================================================

// A panel fills its editor's area below the button. It's positioned with viewport-relative
// coords (`position: fixed`) so the result is independent of which ancestor happens to be
// the containing block, which means it has to be repositioned whenever its editor's
// position or size changes while it's open.

const buttonRef = vue.ref<HTMLElement | null>(null)

function positionPanel() {
    const button = buttonRef.value
    if (!button || !panelVisible.value) {
        return
    }
    const editorRect = button.closest('.editor-pane')?.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const top = buttonRect.bottom
    const height = (editorRect?.bottom ?? window.innerHeight) - top
    const right = window.innerWidth - (editorRect?.right ?? window.innerWidth)
    panelTop.value = `${top}px`
    panelHeight.value = `${height}px`
    panelRight.value = `${right}px`
}

const panelResizeObserver = new ResizeObserver(positionPanel)

function trackPanelPosition(track: boolean) {
    const editorPane = buttonRef.value?.closest('.editor-pane')
    if (track) {
        positionPanel()
        if (editorPane) {
            panelResizeObserver.observe(editorPane)
        }
        window.addEventListener('resize', positionPanel)
        window.addEventListener('scroll', positionPanel)
    } else {
        panelResizeObserver.disconnect()
        window.removeEventListener('resize', positionPanel)
        window.removeEventListener('scroll', positionPanel)
    }
}

vue.watch(panelVisible, (visible) => {
    if (props.type === 'panel') {
        trackPanelPosition(visible)
    }
})

vue.onBeforeUnmount(() => trackPanelPosition(false))

//==============================================================================

// Make sure popover is closed when button is deactivated
vue.watch(
    () => props.active,
    () => {
        if (!props.active) {
            panelVisible.value = false
        }
    }
)

// Preload natural image dimensions for drag-and-drop (dragstart must be synchronous)
const naturalDims = vue.ref<{ width: number; height: number } | null>(null)

vue.watchEffect(() => {
    if (props.image) {
        const img = new Image()
        img.onload = () => { naturalDims.value = { width: img.naturalWidth, height: img.naturalHeight } }
        img.src = props.image
    } else {
        naturalDims.value = null
    }
})

function dragStartEvent(e: DragEvent) {
    if (!props.image || !e.dataTransfer) return
    const dims = naturalDims.value ?? { width: 72, height: 72 }
    const target = e.currentTarget as HTMLElement
    const details = {
        id: props.toolId,
        centre: { x: dims.width / 2, y: dims.height / 2 },
        offset: { x: e.offsetX - target.scrollWidth / 2, y: e.offsetY - target.scrollHeight / 2 }
    }
    e.dataTransfer.items.add(JSON.stringify(details), 'text/plain')
    editorEvents.dispatchEvent(
        new CustomEvent('component-drag', {
            detail: { type: 'dragstart', source: props.toolId, value: props.toolId }
        })
    )
}

const emit = defineEmits<{
    'button-event': [
        toolId: string,
        active: boolean,
        panel: vue.Raw<vue.Component> | null
    ]
}>()

async function toolButtonClick(e: MouseEvent) {
    const clickedElement: HTMLElement | null = e.target as HTMLElement
    let target: HTMLElement | null = clickedElement
    while (target && !target.classList.contains('tool-button')) {
        target = target.parentElement
    }
    if (target) {
        if (props.type === 'panel') {
            target.classList.toggle('active')
            if (panelElement) {
                // Showing the panel positions it (see `trackPanelPosition()`)
                panelVisible.value = !panelVisible.value
            }
        } else {
            if (!target.classList.contains('active')) {
                target.classList.add('active')
                if (panelElement) {
                    if (!panelVisible.value) {
                        panelVisible.value = true

                        // Wait for panel to be rendered before getting its dimensions
                        await vue.nextTick()

                        const popoverWidth = panelElement?.clientWidth

                        // Get positions relative to the editor-pane (position: relative container)
                        const editorPane = target.closest('.editor-pane')
                        const editorRect = editorPane?.getBoundingClientRect()
                        const buttonRect = target.getBoundingClientRect()
                        const toolbarHeight = target.closest('.editor-bar-h')?.clientHeight ?? 38

                        // Center popover horizontally under the button
                        let left = (buttonRect.left - (editorRect?.left ?? 0)) + (target.clientWidth - popoverWidth) / 2

                        // Keep within editor bounds
                        if (left < 0) left = 0
                        if (editorRect && left + popoverWidth > editorRect.width) {
                            left = editorRect.width - popoverWidth
                        }

                        // Arrow points to center of button from top of popover
                        const buttonCenterX = (buttonRect.left - (editorRect?.left ?? 0)) + target.clientWidth / 2
                        pointerPos.value = buttonCenterX - left - 10 // 10 is half of pointer's width

                        popoverTop.value = `${toolbarHeight}px`
                        popoverLeft.value = `${left}px`
                    }
                }
            }
        }
        emit('button-event', target.id, target.classList.contains('active'), props.panel || null)
    }
}
</script>

<style scoped>
.tool-button {
    border-style: solid;
    border-color: var(--editor-border-color);
    border-width: 0 1px;
    display: grid;
    place-items: center;
}
.tool-button:hover {
    background-color: var(--editor-button-hover);
}

.tool-button.ci {
    width: 36px !important;
    height: 36px !important;
    scale: 1 !important;
    padding: 0;
    position: relative;
}

.tool-button.image {
    background-size: 80% 80% !important;
    background-position: center !important;
}
.tool-button.image:hover {
    background-color: var(--editor-button-hover) !important;
}

.tool-button.modal::before {
    display: inline-block;
    position: absolute;
    transform: scale(0.3);
    width: 10px;
    height: 10px;
    top: 22px;
    left: 22px;
}

.tool-button.modal::before {
    content: url("./icons/ModalButtonLight.svg");
}

.p-toolbar-end .tool-button {
    border-width: 0 0 0 2px;
}

.celldl-dark-mode .tool-button.modal::before {
    content: url("./icons/ModalButtonDark.svg");
}

.hidden {
    display: none;
}

.panel {
    width: 250px;
    border: 2px solid var(--editor-border-color);
    border-top-width: 1px;
    z-index: 100;
    overflow-y: auto;
    background-color: var(--p-surface-0);
}

.popover {
    position: absolute;
    z-index: 100;
}

.active {
    background-color: #66aaff !important;
}
</style>
