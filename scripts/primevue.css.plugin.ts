import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from 'vite'

import { toShadowCss } from './shadow.css.plugin.ts'

//==============================================================================

// A Vite plugin that provides PrimeVue's CSS for the editor as a virtual module.
//
// PrimeVue normally writes its CSS (its theme's variables and its components' styles)
// into the document's head at run time. That CSS would leak into the host, and
// wouldn't apply in the editor's shadow root. So PrimeVue is told not to write
// anything (see src/editorElement.ts), and its CSS is generated here, at build time,
// with the APIs PrimeVue uses for server-side rendering. The editor then puts it into
// its shadow root.
//
// The CSS is generated for the PrimeVue components the editor uses, and for the
// components and directives they use themselves, found by following their imports.
// A newly used PrimeVue component must be added to PRIMEVUE_COMPONENTS (there is a
// warning in development mode, see src/editorElement.ts).
//
// This is the same approach as OpenCOR's (its scripts/primevue.css.plugin.ts).

const PRIMEVUE_COMPONENTS = [
    'accordion',
    'accordioncontent',
    'accordionheader',
    'accordionpanel',
    'button',
    'card',
    'checkbox',
    'contextmenu',
    'divider',
    'floatlabel',
    'inputtext',
    'message',
    'radiobutton',
    'scrollpanel',
    'select',
    'slider',
    'toolbar'
]

// PrimeVue defines its theme's variables on `:root` (which becomes the editor's shadow
// host), and their dark values on the element that matches its dark mode selector.
// That must be the same element, since a variable that references other variables
// (e.g. `--p-contextmenu-background: var(--p-content-background)`) is resolved where it
// is defined. So dark mode is an attribute of the shadow host (see WrappedEditor.vue).

export const THEME_ATTRIBUTE = 'data-celldl-theme'

const PRIMEVUE_DARK_MODE_SELECTOR = `:host([${THEME_ATTRIBUTE}="dark"]){[CSS]}`

const VIRTUAL_MODULE_ID = 'virtual:celldl-editor-primevue-css'
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`
const IMPORT_REGEX = /from\s*['"]((?:primevue|@primevue\/(?:core|icons))\/[\w/-]+)['"]/g
const STYLE_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/g

interface PrimeVueStyle {
    getStyleSheet: () => string
    getThemeStyleSheet: () => string
    getCommonThemeStyleSheet: () => string
}

function styleSheetCss(styleSheet: string): string {
    return [...styleSheet.matchAll(STYLE_REGEX)].map((match) => match[1]).join('\n')
}

//==============================================================================

// PrimeVue's modules are resolved with Node, from this repository, since Vite (in
// development mode) resolves dependencies to their pre-bundled versions

const nodeRequire = createRequire(path.resolve(import.meta.dirname, '../package.json'))

// The PrimeVue style modules that are needed, found by following the imports of the
// PrimeVue components that the editor uses

function primeVueStyleSpecifiers(): string[] {
    const visited = new Set<string>()
    const styleSpecifiers = new Set<string>(['@primevue/core/basecomponent/style'])

    const visit = (specifier: string) => {
        if (visited.has(specifier)) {
            return
        }
        visited.add(specifier)
        const code = fs.readFileSync(nodeRequire.resolve(specifier), 'utf-8')
        for (const match of code.matchAll(IMPORT_REGEX)) {
            const importSpecifier = match[1] as string
            if (importSpecifier.endsWith('/style')) {
                styleSpecifiers.add(importSpecifier)
            } else {
                visit(importSpecifier)
            }
        }
    }
    for (const component of PRIMEVUE_COMPONENTS) {
        visit(`primevue/${component}`)
    }
    return ['@primevue/core/base/style', ...[...styleSpecifiers].sort()]
}

async function importModule<T>(specifier: string): Promise<T> {
    return ((await import(pathToFileURL(nodeRequire.resolve(specifier)).href)) as { default: T }).default
}

async function primeVueCss(styleSpecifiers: string[]): Promise<string> {
    // Set up PrimeVue with the editor's theme, so that its style modules can generate
    // their CSS. (The Vue app is never mounted.)

    const vue = nodeRequire('vue') as typeof import('vue')
    const primeVueConfig = await importModule<import('vue').Plugin>('primevue/config')
    const primeVueAuraTheme = await importModule<object>('@primeuix/themes/aura')

    vue.createApp({}).use(primeVueConfig, {
        theme: {
            preset: primeVueAuraTheme,
            options: {
                darkModeSelector: PRIMEVUE_DARK_MODE_SELECTOR
            }
        }
    })

    // The common CSS (the theme's variables and global styles) comes first, then the
    // CSS of each style module

    const baseStyle = await importModule<PrimeVueStyle>('@primevue/core/base/style')
    const css = [styleSheetCss(baseStyle.getCommonThemeStyleSheet())]
    for (const styleSpecifier of styleSpecifiers) {
        const style = await importModule<PrimeVueStyle>(styleSpecifier)
        css.push(styleSheetCss(style.getStyleSheet()), styleSheetCss(style.getThemeStyleSheet()))
    }
    return toShadowCss(css.filter((cssPart) => cssPart).join('\n'))
}

//==============================================================================

export function primeVueCssPlugin(): Plugin {
    const styleSpecifiers = primeVueStyleSpecifiers()
    let virtualModule: Promise<string> | undefined

    return {
        name: 'celldl-editor-primevue-css',
        config() {
            // So that (in development mode) Vite doesn't find these, and reload the
            // page, only once the editor is first shown
            return {
                optimizeDeps: {
                    include: styleSpecifiers
                }
            }
        },
        resolveId(id) {
            return id === VIRTUAL_MODULE_ID ? RESOLVED_VIRTUAL_MODULE_ID : null
        },
        load(id) {
            if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
                return null
            }
            // The module exports the CSS, and the PrimeVue style modules it was
            // generated from, so that PrimeVue can be told not to write their CSS into
            // the document's head (see src/editorElement.ts)

            virtualModule ??= (async () => {
                return [
                    ...styleSpecifiers.map((styleSpecifier, index) => `import style${index} from '${styleSpecifier}'`),
                    `export const css = ${JSON.stringify(await primeVueCss(styleSpecifiers))}`,
                    `export const styles = [${styleSpecifiers.map((_, index) => `style${index}`).join(', ')}]`
                ].join('\n')
            })()
            return virtualModule
        }
    }
}

//==============================================================================
