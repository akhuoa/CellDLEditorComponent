import * as vue from 'vue'

import type { Theme } from '..'

//==============================================================================

/**
 * Whether an editor uses dark mode, given its theme. With the `system` theme (the
 * default) this follows the system's colour scheme.
 *
 * Each editor has its own theme, which is set within the editor (see
 * WrappedEditor.vue), not on the document.
 *
 * @param theme The editor's theme
 */
export function useDarkMode(theme: () => Theme|undefined): vue.ComputedRef<boolean> {
    const prefersColorScheme = window.matchMedia('(prefers-color-scheme: light)')
    const systemDarkMode = vue.ref(!prefersColorScheme.matches)

    const updateSystemDarkMode = (event: MediaQueryListEvent) => {
        systemDarkMode.value = !event.matches
    }
    prefersColorScheme.addEventListener('change', updateSystemDarkMode)
    vue.onUnmounted(() => {
        prefersColorScheme.removeEventListener('change', updateSystemDarkMode)
    })

    return vue.computed(() => {
        const editorTheme = theme() ?? 'system'
        return editorTheme === 'dark' || (editorTheme === 'system' && systemDarkMode.value)
    })
}

//==============================================================================
