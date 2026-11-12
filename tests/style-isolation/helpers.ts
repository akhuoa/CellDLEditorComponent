/******************************************************************************

Helpers for the style isolation tests.

These tests run in real browsers (Vitest Browser Mode), since only a browser
computes the CSS cascade, layers, and shadow DOM styling.

- `mountInHost()` mounts the component in a host (see `hosts/index.ts`), either in
  the host's document or, like OpenCOR, inside the host's shadow root.
- `probeHost()` takes a snapshot of the host's own elements, so that a snapshot
  taken before mounting the component can be compared with one taken after.

The same helpers are used in OpenCOR's style isolation tests.

******************************************************************************/

import * as vue from 'vue'
import { vi } from 'vitest'
import { type Locator, page } from 'vitest/browser'

import type { CellDLEditorCommand, Theme } from '#root/index'

import diagramSvg from './fixtures/test.celldl.svg?raw'
import { getHost, type Host, type HostName } from './hosts'
import { keepShadowHostEventTargets } from './hosts/shadow-host-compat'

//==============================================================================

export type { HostName, Theme }

export const THEMES: Theme[] = ['light', 'dark']

/** Where the component is placed: in the host's document, or in a host's shadow root (like OpenCOR) */
export type Placement = 'document' | 'shadow'

export const PLACEMENTS: Placement[] = ['document', 'shadow']

//==============================================================================

/** The test id of the component's root element (see `locatorFor()`) */
export const COMPONENT_TEST_ID = 'component-under-test'

/** The test id of the host's element that contains the component, of which screenshots are taken */
export const CONTAINER_TEST_ID = 'component-container'

const COMPONENT_WIDTH = 1000
const COMPONENT_HEIGHT = 680

let testIdCount = 0

/**
 * A locator for an element. A test id is used, since Playwright finds test ids within
 * shadow roots, whereas the selector that `page.elementLocator()` generates may match
 * other elements when there are shadow roots.
 */
export function locatorFor(element: Element): Locator {
    let testId = element.getAttribute('data-testid')
    if (!testId) {
        testIdCount += 1
        testId = `test-target-${testIdCount}`
        element.setAttribute('data-testid', testId)
    }
    return page.getByTestId(testId)
}

// Our own marker attributes
const HOST_STYLE_ATTR = 'data-test-host-style'
const COPIED_STYLE_ATTR = 'data-test-copied-style'
const PROBES_CLASS = 'test-host-probes'

// What the document looked like before the component (and so its styles) was loaded
const initialHeadNodes = new Set<Node>(document.head.childNodes)
const initialHtmlClass = document.documentElement.getAttribute('class')
const initialHtmlStyle = document.documentElement.getAttribute('style')

//==============================================================================

/**
 * The `<style>` and `<link>` elements that the component has added to the document's head.
 *
 * If the host uses PrimeVue then PrimeVue's styles are taken to be the host's, since
 * the component then uses the host's PrimeVue.
 */
function componentHeadStyles(host?: Host): (HTMLStyleElement|HTMLLinkElement)[] {
    return [...document.head.querySelectorAll<HTMLStyleElement|HTMLLinkElement>('style, link[rel="stylesheet"]')]
        .filter(node => !initialHeadNodes.has(node)
                     && !node.hasAttribute(HOST_STYLE_ATTR)
                     && !(host?.usesPrimeVue && node.hasAttribute('data-primevue-style-id')))
}

function enableComponentStyles(host: Host, enable: boolean) {
    for (const node of componentHeadStyles(host)) {
        node.disabled = !enable
    }
}

/**
 * Convert CSS for use in a shadow root, as OpenCOR does.
 */
function toShadowCss(css: string): string {
    return css.replaceAll(':root', ':host')
}

function setHtmlAttribute(name: string, value: string|null) {
    if (value === null) {
        document.documentElement.removeAttribute(name)
    } else {
        document.documentElement.setAttribute(name, value)
    }
}

//==============================================================================

// Host elements whose computed styles are compared before and after mounting the component.
// They are the kinds of elements that a component's CSS could unintentionally restyle.

const PROBES_HTML = `
<p class="probe-p">Host paragraph <a href="#" class="probe-a">link</a> <span class="probe-span">span</span></p>
<button class="probe-button">Host button</button>
<button class="probe-p-button p-button p-component">Host PrimeVue button</button>
<input class="probe-input" value="Host input">
<img class="probe-img" alt="" width="16" height="16" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
<svg class="probe-svg" width="16" height="16"><rect class="probe-rect" width="8" height="8"/></svg>
<div class="probe-hidden hidden">.hidden</div>
<div class="probe-active active">.active</div>
<div class="probe-selected selected">.selected</div>
<div class="probe-highlight highlight">.highlight</div>
<div class="probe-error error">.error</div>
<div class="probe-shadow shadow">.shadow</div>
<div class="probe-border border">.border</div>
<div class="probe-container container">.container</div>
<div class="probe-tippy" data-tippy-root><div class="tippy-box">tippy</div></div>
`

const PROBE_SELECTORS = [...PROBES_HTML.matchAll(/class="(probe-[\w-]+)/g)].map(match => `.${match[1]}`)
                                                                         .concat(['.tippy-box'])

function addProbes(parent: Element|ShadowRoot) {
    const probes = document.createElement('div')
    probes.className = PROBES_CLASS
    // Below the component, so not in its screenshots
    probes.style.cssText = `position: absolute; left: 0; top: ${COMPONENT_HEIGHT + 20}px;`
    probes.innerHTML = PROBES_HTML
    parent.appendChild(probes)
}

//==============================================================================

export type Snapshot = Record<string, Record<string, string>>

function computedStyles(element: Element): Record<string, string> {
    const style = getComputedStyle(element)
    const result: Record<string, string> = {}
    // `style` lists standard properties and, in some browsers, custom properties
    for (const name of style) {
        result[name] = style.getPropertyValue(name)
    }
    return result
}

/**
 * Finish the transitions (and finite animations) of the host's elements, so that a
 * snapshot has their final styles.
 *
 * A host's CSS may transition its elements to their styles (e.g. `* { transition: all 2s }`).
 * A transition of an inherited property starts further transitions in an element's
 * descendants, so this is repeated until there are none.
 */
function finishHostTransitions(wrapper: Element) {
    const inComponent = (node: Node|null): boolean => {
        while (node) {
            if (node === wrapper) return true
            node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
        }
        return false
    }
    for (let i = 0; i < 100; i += 1) {
        const animations = document.getAnimations().filter(animation => {
            const effect = animation.effect
            return effect instanceof KeyframeEffect
                && Number.isFinite(effect.getComputedTiming().endTime)
                && !inComponent(effect.target)
        })
        if (!animations.length) break
        for (const animation of animations) {
            animation.finish()
        }
    }
}

/**
 * Take a snapshot of the host: its probe elements' computed styles, the `<html>`
 * element's classes and inline style, PrimeVue's styles in the document's head,
 * and the plugins installed in the host's Vue app.
 */
function probeHost(mounted: MountedComponent): Snapshot {
    finishHostTransitions(mounted.wrapper)
    const snapshot: Snapshot = {}
    const roots: [string, Document|ShadowRoot][] = [['document', document]]
    if (mounted.shadowRoot) {
        roots.push(['shadow', mounted.shadowRoot])
    }
    for (const [scope, root] of roots) {
        const probes = root.querySelector(`.${PROBES_CLASS}`)
        if (!probes) continue
        snapshot[`${scope} host container`] = computedStyles(probes.parentElement ?? probes)
        for (const selector of PROBE_SELECTORS) {
            const element = probes.querySelector(selector)
            if (element) {
                snapshot[`${scope} ${selector}`] = computedStyles(element)
            }
        }
    }
    snapshot.html = computedStyles(document.documentElement)
    snapshot['html attributes'] = {
        class: document.documentElement.getAttribute('class') ?? '',
        style: document.documentElement.getAttribute('style') ?? ''
    }
    snapshot['document head'] = {
        'primevue styles': [...document.head.querySelectorAll('style[data-primevue-style-id]')]
            .filter(node => !(node as HTMLStyleElement).disabled)
            .map(node => node.getAttribute('data-primevue-style-id'))
            .sort()
            .join(' ')
    }
    const appContext = mounted.app._context
    snapshot['host app'] = {
        'global properties': Object.keys(appContext.config.globalProperties).sort().join(' '),
        directives: Object.keys(appContext.directives).sort().join(' '),
        components: Object.keys(appContext.components).sort().join(' ')
    }
    return snapshot
}

/**
 * The checks that a snapshot is split into.
 */
export const SNAPSHOT_CHECKS = {
    'element styles': 'Computed styles of the host\'s elements (and of <html>)',
    'custom properties': 'Custom properties (CSS variables) of the host\'s elements (and of <html>)',
    'html attributes': 'Classes and inline style of the document\'s <html> element',
    'head styles': 'PrimeVue styles in the document\'s head',
    'host app': 'Plugins, directives, and components installed in the host\'s Vue app'
} as const

export type SnapshotCheck = keyof typeof SNAPSHOT_CHECKS

function isElementEntry(key: string): boolean {
    return key === 'html' || (key.startsWith('document ') && key !== 'document head') || key.startsWith('shadow ')
}

/**
 * The part of a snapshot that a check compares.
 */
export function snapshotPart(snapshot: Snapshot, check: SnapshotCheck): Snapshot {
    const part: Snapshot = {}
    for (const [key, values] of Object.entries(snapshot)) {
        if (check === 'element styles' || check === 'custom properties') {
            if (isElementEntry(key)) {
                const custom = check === 'custom properties'
                part[key] = Object.fromEntries(Object.entries(values).filter(([name]) => name.startsWith('--') === custom))
            }
        } else if ((check === 'html attributes' && key === 'html attributes')
                || (check === 'head styles' && key === 'document head')
                || (check === 'host app' && key === 'host app')) {
            part[key] = values
        }
    }
    return part
}

/**
 * The differences between two snapshots, as readable lines.
 *
 * Each changed property is reported once, with the snapshot entries (e.g. probe
 * elements) it changed on. Custom properties that are newly defined are summarised
 * by their prefix (e.g. `--p-*`).
 */
export function snapshotDifferences(before: Snapshot, after: Snapshot): string[] {
    const shorten = (value?: string) => value === undefined ? '(none)'
                                      : value.length > 60 ? `'${value.slice(0, 57)}...'`
                                      : `'${value}'`
    const changes = new Map<string, string[]>()
    const addedCustomProperties = new Map<string, Set<string>>()
    const affected = new Set<string>()

    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const beforeValues = before[key] ?? {}
        const afterValues = after[key] ?? {}
        for (const name of new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)])) {
            if (beforeValues[name] === afterValues[name]) continue
            affected.add(key)
            if (name.startsWith('--') && beforeValues[name] === undefined) {
                const prefix = name.match(/^--[a-z]+-/)?.[0] ?? '--'
                if (!addedCustomProperties.has(prefix)) {
                    addedCustomProperties.set(prefix, new Set())
                }
                addedCustomProperties.get(prefix)?.add(name)
                continue
            }
            const change = `${name}: ${shorten(beforeValues[name])} → ${shorten(afterValues[name])}`
            if (!changes.has(change)) {
                changes.set(change, [])
            }
            changes.get(change)?.push(key)
        }
    }

    const differences = [...changes.entries()].map(([change, keys]) => `${change}  [${keys.join(', ')}]`)
    for (const [prefix, names] of addedCustomProperties) {
        differences.push(`${names.size} custom properties ${prefix}* newly defined on host elements`)
    }
    if (differences.length) {
        differences.unshift(`${affected.size} host entries affected`)
    }
    return differences
}

//==============================================================================

export interface MountOptions {
    theme: Theme
    placement?: Placement
}

export interface MountedComponent {
    host: Host
    theme: Theme
    placement: Placement
    app: vue.App
    /** The host's shadow root, if the component is placed in one */
    shadowRoot: ShadowRoot|null
    /** The host's element in which the component is mounted */
    wrapper: HTMLElement
    /** The root element of the component */
    element: HTMLElement
    /** The host's element that contains (just) the component, in the document's light DOM */
    container: HTMLElement
    /** A snapshot of the host before the component was mounted */
    before: Snapshot
    /** Take a snapshot of the host now */
    probe: () => Snapshot
    /** Send a command to the component */
    sendCommand: (command: CellDLEditorCommand) => Promise<void>
    /** Open the test diagram in the component */
    openDiagram: () => Promise<void>
    /** Find an element in the component's DOM (its shadow root, if it has one) */
    query: <T extends Element = HTMLElement>(selector: string) => T
    /** Find an element in the component's diagram */
    queryDiagram: <T extends Element = SVGElement>(selector: string) => T|null
    unmount: () => void
}

let current: MountedComponent|null = null

/**
 * Mount the component in a host.
 *
 * A snapshot of the host is taken just before the component is mounted, with any
 * styles the component added to the document (in earlier tests) disabled, so that
 * it shows the host as it was before the component was loaded.
 */
export async function mountInHost(hostName: HostName, options: MountOptions): Promise<MountedComponent> {
    current?.unmount()

    const host = getHost(hostName)
    const placement = options.placement ?? 'document'

    // The host's styles and elements

    const container = document.createElement('div')
    container.className = 'test-host'
    // The container is what screenshots are taken of (it is always in the document's
    // light DOM, unlike the component in the shadow placement). The component fills it.
    container.style.cssText = 'position: relative; display: block; box-sizing: content-box; '
                            + `width: ${COMPONENT_WIDTH}px; height: ${COMPONENT_HEIGHT}px; `
                            + 'margin: 0; padding: 0; border: 0;'
    container.setAttribute('data-testid', CONTAINER_TEST_ID)
    document.body.appendChild(container)

    let shadowRoot: ShadowRoot|null = null
    let parent: Element|ShadowRoot = container
    const hostStyle = document.createElement('style')
    hostStyle.setAttribute(HOST_STYLE_ATTR, host.name)
    if (placement === 'shadow') {
        // Like OpenCOR: the host renders itself, and the component, in its shadow root
        shadowRoot = container.attachShadow({ mode: 'open' })
        keepShadowHostEventTargets(container)
        hostStyle.textContent = toShadowCss(host.css)
        shadowRoot.appendChild(hostStyle)
        parent = shadowRoot
    } else {
        hostStyle.textContent = host.css
        document.head.appendChild(hostStyle)
    }
    addProbes(parent)

    // The host's own content (if any) is outside the element that contains the
    // component, so that the component is the same size in every host
    const hostContent = document.createElement('div')
    hostContent.className = 'test-host-content'
    hostContent.style.cssText = `position: absolute; left: 0; top: ${COMPONENT_HEIGHT + 300}px;`
    parent.appendChild(hostContent)

    // The element that contains the component. Its box is fixed (with inline styles,
    // which a host's own, non-important, rules can't override), since a host can of
    // course size the element in which it places the component.
    const wrapper = document.createElement('div')
    wrapper.className = `test-host-wrapper ${host.wrapperClass ?? ''}`
    wrapper.style.cssText = 'position: absolute; left: 0; top: 0; display: flex; flex-direction: column; '
                          + `box-sizing: content-box; width: ${COMPONENT_WIDTH}px; height: ${COMPONENT_HEIGHT}px; `
                          + 'margin: 0; padding: 0; border: 0;'
    parent.appendChild(wrapper)

    // The host's Vue app, which shows the component once `showComponent` is set

    const { default: CellDLEditor } = await import('#root/index')

    const showComponent = vue.ref(false)
    const editorCommand = vue.ref<CellDLEditorCommand>()
    let resolveReady: () => void
    const ready = new Promise<void>(resolve => { resolveReady = resolve })

    const app = vue.createApp({
        render: () => [
            host.renderContent ? vue.h(vue.Teleport, { to: hostContent }, [host.renderContent()]) : null,
            showComponent.value
                ? vue.h(CellDLEditor, {
                    style: 'flex: 1 1 auto; min-height: 0;',
                    theme: options.theme,
                    editorCommand: editorCommand.value,
                    onEditorReady: () => resolveReady()
                })
                : null
        ]
    })
    host.setupApp?.(app)
    app.mount(wrapper)

    // Copy the component's styles into the host's shadow root, as OpenCOR does

    let styleObserver: MutationObserver|null = null
    const copyStyles = () => {
        if (!shadowRoot) return
        for (const node of shadowRoot.querySelectorAll(`[${COPIED_STYLE_ATTR}]`)) {
            node.remove()
        }
        for (const node of componentHeadStyles(host)) {
            if (node instanceof HTMLStyleElement) {
                const copy = document.createElement('style')
                copy.setAttribute(COPIED_STYLE_ATTR, '')
                copy.textContent = toShadowCss(node.textContent ?? '')
                shadowRoot.insertBefore(copy, wrapper)
            }
        }
    }

    // The host before the component is mounted

    await settle()
    enableComponentStyles(host, false)
    let mounted: MountedComponent
    const probe = () => probeHost(mounted)

    // The component may render in its own shadow root, in which case that is where
    // its elements are found
    const componentRoot = (): Element|ShadowRoot => {
        return [...wrapper.children].find(child => child.shadowRoot)?.shadowRoot ?? wrapper
    }

    let unmounted = false
    const unmount = () => {
        if (unmounted) return
        unmounted = true
        styleObserver?.disconnect()
        app.unmount()
        container.remove()
        hostStyle.remove()
        // The component sets its theme's class each time it is mounted. (Its inline
        // style on <html> is only set when its module is loaded, so is left alone.)
        setHtmlAttribute('class', initialHtmlClass)
        if (current === mounted) {
            current = null
        }
    }

    mounted = {
        host,
        theme: options.theme,
        placement,
        app,
        shadowRoot,
        wrapper,
        element: wrapper,
        container,
        before: {},
        probe,
        sendCommand: async (command) => {
            editorCommand.value = command
            await vue.nextTick()
        },
        openDiagram: async () => {
            editorCommand.value = {
                command: 'file',
                options: { action: 'open', data: diagramSvg, name: 'test.celldl.svg' }
            }
            await vi.waitFor(() => {
                if (!mounted.queryDiagram('.celldl-Component')) {
                    throw new Error('The diagram has not been opened')
                }
            }, { timeout: 10000 })
        },
        query: <T extends Element = HTMLElement>(selector: string): T => {
            const element = componentRoot().querySelector<T>(selector)
            if (!element) {
                throw new Error(`Cannot find '${selector}' in the component`)
            }
            return element
        },
        queryDiagram: <T extends Element = SVGElement>(selector: string): T|null => {
            const diagramHost = componentRoot().querySelector('.celldl-diagram-host')
            return diagramHost?.shadowRoot?.querySelector<T>(selector) ?? null
        },
        unmount
    }
    // The component's module may already have changed <html> (in an earlier test),
    // so <html> is as it was before the component was loaded while it is probed
    const htmlStyle = document.documentElement.getAttribute('style')
    setHtmlAttribute('style', initialHtmlStyle)
    mounted.before = probe()
    setHtmlAttribute('style', htmlStyle)

    // Mount the component

    enableComponentStyles(host, true)
    if (shadowRoot) {
        // The component's styles must be in the shadow root before it is mounted
        copyStyles()
        styleObserver = new MutationObserver(copyStyles)
        styleObserver.observe(document.head, { childList: true, characterData: true, subtree: true })
    }
    showComponent.value = true
    await Promise.race([
        ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('The component did not become ready')), 20000))
    ])
    mounted.element = mounted.query('.celldl-editor')
    mounted.element.setAttribute('data-testid', COMPONENT_TEST_ID)

    current = mounted
    return mounted
}

//==============================================================================

/**
 * Wait until the browser has rendered any pending changes.
 */
export async function settle(frames: number = 2) {
    for (let i = 0; i < frames; i += 1) {
        await new Promise(resolve => requestAnimationFrame(resolve))
    }
}

//==============================================================================
//==============================================================================
