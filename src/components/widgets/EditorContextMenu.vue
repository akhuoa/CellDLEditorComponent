<template lang="pug">
    ContextMenu(
        ref="menu" :model="items"
        :appendTo="overlayContainer ?? 'body'"
    )
</template>


<script setup lang="ts">
import * as vue from 'vue'
import { useThemeCssVariables } from '#root/utils/themeCssVariables'

useThemeCssVariables('contextmenu')

//==============================================================================

import { CONTEXT_MENU } from '#editor/editor'
import { EDITOR_EVENTS_KEY } from '#root/utils/editor-types'
import { OVERLAY_CONTAINER_KEY } from '#root/utils/overlays'

export type ContextMenuProps = {
    state: Set<CONTEXT_MENU>,
    event?: Event
}

//==============================================================================

const props = defineProps<{
    contextMenuProps: ContextMenuProps
}>()

// Events go to the editor this component is part of
const editorEvents = vue.inject(EDITOR_EVENTS_KEY, document)

// Show the menu within the editor's DOM, not in `document.body`
const overlayContainer = vue.inject(OVERLAY_CONTAINER_KEY, vue.ref(null))

const menu = vue.ref()

vue.watch(
    () => props.contextMenuProps,
    () => {
        if (props.contextMenuProps.event) {
            menu.value.show(props.contextMenuProps.event)
            props.contextMenuProps.event = undefined
        }
    }
)

function contextMenuEvent(id: string) {
    editorEvents.dispatchEvent(
        new CustomEvent('context-menu-click', {
            detail: { id }
        })
    )
    menu.value.hide()
}

//==============================================================================

const items = vue.computed(() => {
  return [
    {
        command: () => contextMenuEvent(CONTEXT_MENU.DELETE),
        disabled: !props.contextMenuProps?.state.has(CONTEXT_MENU.DELETE),
        label: 'Delete'
    },
    { separator: true },
    {
        command: () => contextMenuEvent(CONTEXT_MENU.GROUP_OBJECTS),
        disabled: !props.contextMenuProps?.state.has(CONTEXT_MENU.GROUP_OBJECTS),
        label: 'Group'
    },
    {
        command: () => contextMenuEvent(CONTEXT_MENU.EDIT_GROUP),
        disabled: !props.contextMenuProps?.state.has(CONTEXT_MENU.EDIT_GROUP),
        label: 'Edit group'
    },
    {
        command: () => contextMenuEvent(CONTEXT_MENU.UNGROUP_OBJECTS),
        disabled: !props.contextMenuProps?.state.has(CONTEXT_MENU.UNGROUP_OBJECTS),
        label: 'Ungroup'
    },
    { separator: true },
    {
        command: () => contextMenuEvent(CONTEXT_MENU.INFO),
        disabled: true,
        label: 'Info'
    }
  ]}
)

//==============================================================================
</script>
