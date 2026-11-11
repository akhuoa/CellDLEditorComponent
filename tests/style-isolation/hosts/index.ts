/******************************************************************************

Host fixtures for the style isolation tests.

Each host stands in for a kind of application that embeds the component. A host
has some CSS, may install plugins into its Vue app, and may wrap the component
in its own elements.

The same hosts are used in OpenCOR's style isolation tests.

******************************************************************************/

import * as vue from 'vue'

import primeVueAuraTheme from '@primeuix/themes/aura'
import PrimeVueButton from 'primevue/button'
import primeVueConfig from 'primevue/config'

import elementPlusCss from './element-plus.css?inline'
import hostileCss from './hostile.css?inline'
import tailwindPrimeVueCss from './tailwind-primevue.css?inline'
import vitepressCss from './vitepress.css?inline'

//==============================================================================

export type HostName = 'tailwind-primevue' | 'plain' | 'element-plus' | 'vitepress' | 'hostile'

export interface Host {
    name: HostName
    description: string
    css: string
    /** Classes for the element that wraps the component */
    wrapperClass?: string
    /** Set up the host's Vue app, before the component is mounted */
    setupApp?: (app: vue.App) => void
    /** The host's own content, shown next to the component */
    renderContent?: () => vue.VNode
    /** The host uses PrimeVue, so PrimeVue's styles in the document's head are (also) the host's */
    usesPrimeVue?: boolean
}

//==============================================================================

/**
 * The reference host: the editor looks as it does in its dev app and in the
 * CellDL Editor app. Screenshots in other hosts are compared with this host's.
 */
export const REFERENCE_HOST: HostName = 'tailwind-primevue'

export const HOSTS: Host[] = [
    {
        name: 'tailwind-primevue',
        description: 'Tailwind (with preflight) and PrimeVue, like the CellDL Editor app',
        css: tailwindPrimeVueCss,
        setupApp: (app) => {
            app.use(primeVueConfig as unknown as vue.Plugin, {
                theme: {
                    preset: primeVueAuraTheme,
                    options: {
                        darkModeSelector: '.celldl-dark-mode'
                    }
                }
            })
        },
        // A PrimeVue component of the host's own, so that the host's PrimeVue theme is
        // loaded before the component is mounted (as it is in the CellDL Editor app)
        renderContent: () => vue.h(PrimeVueButton, { label: 'Host PrimeVue button', class: 'host-content' }),
        usesPrimeVue: true
    },
    {
        name: 'plain',
        description: 'No CSS',
        css: ''
    },
    {
        name: 'element-plus',
        description: "Element Plus, like OpenCOR's `test-control` app",
        css: elementPlusCss
    },
    {
        name: 'vitepress',
        description: "VitePress's default theme, within a documentation page",
        css: vitepressCss,
        wrapperClass: 'vp-doc'
    },
    {
        name: 'hostile',
        description: 'Aggressive, global CSS',
        css: hostileCss
    }
]

export function getHost(name: HostName): Host {
    // biome-ignore lint/style/noNonNullAssertion: all host names are defined
    return HOSTS.find(host => host.name === name)!
}

//==============================================================================
//==============================================================================
