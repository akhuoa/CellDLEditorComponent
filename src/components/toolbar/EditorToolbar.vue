<template lang="pug">
    Toolbar.horizontal
        template(#start)
            .toolbar-group(v-for="(group, groupIndex) in leftGroups" :key="groupIndex")
                .tool-separator(v-if="groupIndex > 0")
                ToolButton(
                    v-for="button in group"
                    :key="button.toolId"
                    :toolId="button.toolId"
                    :active="button?.active"
                    :prompt="button.prompt"
                    :icon="button.icon"
                    :image="button.image"
                    :modal="!!button?.panel"
                    type="popover"
                    :panel="button.panel"
                    @button-event="leftButtonEvent"
                )
                    component(
                        :is="button.panel"
                        :title="button.prompt"
                        :toolId="button.toolId"
                    )
        template(#end)
            ToolButton(
                v-for="button in rightButtons"
                :key="button.toolId"
                :toolId="button.toolId"
                :active="button?.active"
                :prompt="button.prompt"
                :icon="button.icon"
                :image="button.image"
                :modal="!!button?.panel"
                type="panel"
                :panel="button.panel"
                @button-event="rightButtonEvent"
            )
                component(
                    :is="button.panel"
                    :title="button.prompt"
                    :toolId="button.toolId"
                    @panel-event="panelEvent"
                    @style-event="styleEvent"
                )
</template>

<script setup lang="ts">
import * as vue from 'vue'

import { useThemeCssVariables } from '#root/utils/themeCssVariables'

useThemeCssVariables('toolbar')

//==============================================================================

import { EDITOR_EVENTS_KEY, type EditorToolButton, type PopoverEventData } from '#root/utils/editor-types'
import type { Styling } from '#root/utils/styling'

import ToolButton from './ToolButton.vue'

//==============================================================================

const props = defineProps<{
    leftButtons: EditorToolButton[]
    rightButtons: EditorToolButton[]
}>()

// Events go to the editor this component is part of
const editorEvents = vue.inject(EDITOR_EVENTS_KEY, document)

const emit = defineEmits<{
    'button-event': [
        toolId: string,
        active: boolean,
    ]
}>()

const leftGroups = vue.computed(() => {
    const groups: EditorToolButton[][] = []
    let current: EditorToolButton[] = []
    for (const btn of props.leftButtons) {
        if (btn.separator) {
            if (current.length) groups.push(current)
            current = []
        } else {
            current.push(btn)
        }
    }
    if (current.length) groups.push(current)
    return groups
})

function leftButtonEvent(toolId: string, active: boolean, panel: vue.Raw<vue.Component> | null) {
    for (const button of props.leftButtons) {
        if (active && toolId === button.toolId) {
            button.active = true
        } else {
            button.active = false
        }
    }
    emit('button-event', toolId, active)
}

function rightButtonEvent(toolId: string, active: boolean, panel: vue.Raw<vue.Component> | null) {
    for (const button of props.rightButtons) {
        if (active && toolId === button.toolId) {
            button.active = true
        } else {
            button.active = false
        }
    }
    emit('button-event', toolId, active)
}

function panelEvent(toolId: string, itemId: string, oldValue: string, newValue: string) {
    editorEvents.dispatchEvent(
        new CustomEvent('panel-event', {
            detail: {
                type: 'value',
                source: toolId,
                itemId: itemId,
                value: {
                    oldValue,
                    newValue
                }
            }
        })
    )
}

function styleEvent(toolId: string, styling: Styling) {
    editorEvents.dispatchEvent(
        new CustomEvent('style-event', {
            detail: {
                type: 'value',
                source: toolId,
                styling: styling
            }
        })
    )
}

//==============================================================================

</script>

<style>
.editor-pane .p-toolbar.horizontal {
    flex-direction: row !important;
    height: 38px !important;
    padding: 0 !important;
    flex-wrap: nowrap !important;
    border-radius: 0 !important;
    width: 100% !important;
}

.editor-pane .p-toolbar.horizontal > .p-toolbar-start,
.editor-pane .p-toolbar.horizontal > .p-toolbar-end {
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    padding: 0 !important;
    gap: 0 !important;
}
</style>

<style scoped>
.toolbar-group {
    display: flex;
    flex-direction: row;
    flex-shrink: 0;
}

.tool-separator {
    width: 10px;
    background-color: #888;
    border-color: var(--editor-border-color);
    border-width: 1px 0;
}
</style>
