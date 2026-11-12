import path from 'node:path'
import * as postcss from 'postcss'
import type { Plugin } from 'vite'

//==============================================================================

// The editor renders in its own shadow root (see src/editorElement.ts), so its CSS
// is made suitable for a shadow root:
//  - custom properties defined on `:root` are defined on the shadow host instead,
//    since `:root` matches nothing in a shadow root;
//  - rules for the `html` element (in Tailwind's preflight) are for the editor's root
//    element instead, since it plays the role of `html` for the editor;
//  - `rem` units become `px`, since a `rem` is relative to the font size of the host
//    document's `<html>`, which a host may change (e.g. `html { font-size: 62.5% }`),
//    and that would scale the editor;
//  - Tailwind's `@property` fallbacks always apply, since `@property` rules don't
//    work in a shadow root; and
//  - `@font-face` rules are removed, since they don't work in a shadow root in all
//    browsers (the icon font is defined in the document, see src/assets/iconFont.ts).
//
// This is the same approach as OpenCOR's (its scripts/shadow.css.plugin.ts).

export const EDITOR_ROOT_SELECTOR = '.celldl-editor'

const ROOT_FONT_SIZE = 16      // A browser's default font size, i.e. the default size of `1rem`

const URL_REGEX = /url\([^)]*\)/gi
const ROOT_REGEX = /:root\b/g
const HTML_REGEX = /(^|[\s,{}>+~(])html(?=$|[\s,{.:[>+~)])/g
const REM_REGEX = /(?<![\w.\\[-])(-?(?:\d+\.?\d*|\.\d+))rem\b/g

function remToPx(css: string): string {
    return css.replace(REM_REGEX, (_match: string, value: string) => {
        return `${Number((Number.parseFloat(value) * ROOT_FONT_SIZE).toFixed(4))}px`
    })
}

// Selectors and values are converted separately, since a selector may contain
// something that looks like a `rem` value (e.g. Tailwind's `.text-\[1\.5rem\]`)

export function toShadowSelector(selector: string): string {
    return selector.replace(ROOT_REGEX, ':host').replace(HTML_REGEX, `$1${EDITOR_ROOT_SELECTOR}`)
}

// `url()` values are left alone, since a data URI could contain something that looks
// like a `rem` value

export function toShadowValue(value: string): string {
    let result = ''
    let lastIndex = 0
    for (const match of value.matchAll(URL_REGEX)) {
        result += remToPx(value.slice(lastIndex, match.index)) + match[0]
        lastIndex = match.index + match[0].length
    }
    return result + remToPx(value.slice(lastIndex))
}

export function toShadowCss(css: string): string {
    const root = postcss.parse(css)

    root.walkAtRules('font-face', (atRule) => {
        atRule.remove()
    })
    root.walkAtRules('layer', (layer) => {
        if (layer.params.trim() === 'properties') {
            layer.each((node) => {
                if (node.type === 'atrule' && node.name === 'supports' && node.nodes) {
                    node.replaceWith(...node.nodes)
                }
            })
        }
    })
    root.walkRules((rule) => {
        rule.selector = toShadowSelector(rule.selector)
    })
    root.walkDecls((decl) => {
        decl.value = toShadowValue(decl.value)
    })
    return root.toString()
}

//==============================================================================

const SRC_DIR = path.resolve(import.meta.dirname, '../src')

function inEditorDir(id: string, dir: string): boolean {
    return path.normalize(id.split('?')[0] ?? '').startsWith(path.join(SRC_DIR, dir) + path.sep)
}

/**
 * The editor's components. They are compiled as custom element components (see the
 * `customElement` option of Vue's Vite plugin), so that Vue puts their styles into the
 * editor's shadow root, not into the document's head. (This doesn't include other
 * components, e.g. those of the dev app in `app/`.)
 */
export const EDITOR_COMPONENTS = new RegExp(
    `^${(path.join(SRC_DIR, 'components') + path.sep).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.+\\.vue$`
)

const CSS_REGEX = /\.css(?:$|\?)|[?&]lang\.css(?:$|&)/
const DEPENDENCY_CSS_REGEX = /[\\/]node_modules[\\/]tippy\.js[\\/]/

/**
 * A Vite plugin that makes the editor's CSS suitable for its shadow root.
 *
 * It must not be enforced as `pre` or `post`: it has to run after Vite has processed
 * the CSS (Tailwind has generated its utilities, `@import`s have been inlined), and
 * before Vite turns the CSS into a JavaScript module.
 */
export function shadowCssPlugin(): Plugin {
    return {
        name: 'celldl-editor-shadow-css',
        transform(code, id) {
            if (!CSS_REGEX.test(id)
             || !(inEditorDir(id, 'assets') || inEditorDir(id, 'components') || DEPENDENCY_CSS_REGEX.test(id))) {
                return null
            }
            return {
                code: toShadowCss(code),
                map: null
            }
        }
    }
}

//==============================================================================

/**
 * A Vite plugin that removes the icon font's `@font-face` rule before Vite processes
 * the URLs of its font files, so that they aren't bundled. (The font is defined in the
 * document instead, see src/assets/iconFont.ts.)
 *
 * It must be placed right after Tailwind's plugin.
 */
export function stripIconFontFacePlugin(): Plugin {
    return {
        name: 'celldl-editor-strip-icon-font-face',
        enforce: 'pre',
        transform(code, id) {
            if (!inEditorDir(id, 'assets') || !(id.split('?')[0] ?? '').endsWith('.css') || !code.includes('primeicons')) {
                return null
            }
            const root = postcss.parse(code)
            let removed = false
            root.walkAtRules('font-face', (atRule) => {
                atRule.remove()
                removed = true
            })
            return removed ? { code: root.toString(), map: null } : null
        }
    }
}

//==============================================================================

/**
 * A Vite plugin (for the library build) that emits an empty `CellDLEditor.css`.
 *
 * The editor's styles are now in its shadow root, but hosts may still import
 * `@celldl/editor/style.css`, so the file is kept.
 */
export function emptyStylesheetPlugin(fileName: string): Plugin {
    return {
        name: 'celldl-editor-empty-stylesheet',
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName,
                source: '/* The CellDL Editor\'s styles are in its shadow root, so this file is no longer needed. */\n'
            })
        }
    }
}

//==============================================================================
