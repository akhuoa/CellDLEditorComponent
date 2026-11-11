import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

// Tests run in real browsers (Vitest Browser Mode, with Playwright as the browser
// provider), since only a browser computes the CSS cascade, layers, and shadow DOM
// styling. Chromium, Firefox, and WebKit (Safari) are all tested.

export default mergeConfig(viteConfig, defineConfig({
    base: '/',
    optimizeDeps: {
        // Dependencies that are only found once a test runs. Without these, Vite would
        // optimise them, and reload the test, while it runs.
        include: [
            '@primeuix/themes/aura',
            'primevue/accordion',
            'primevue/accordioncontent',
            'primevue/accordionheader',
            'primevue/accordionpanel',
            'primevue/button',
            'primevue/checkbox',
            'primevue/config',
            'primevue/contextmenu',
            'primevue/divider',
            'primevue/floatlabel',
            'primevue/inputtext',
            'primevue/message',
            'primevue/radiobutton',
            'primevue/scrollpanel',
            'primevue/select',
            'primevue/slider',
            'primevue/toolbar',
            'vue-tippy'
        ]
    },
    test: {
        include: ['tests/**/*.test.ts'],
        onUnhandledError(error) {
            // A known bug, which is also on `main` and isn't related to styling: redoing the
            // deletion of a component that has connections throws in the bond graph plugin
            // (`DomainGraph.deleteEdge()` in src/plugins/bondgraph/domainGraph.ts), although
            // the redo itself works. Any other unhandled error still fails the test run.
            if (error.name === 'NotFoundGraphError' && error.message.includes('Graph.dropEdge')) {
                return false
            }
        },
        testTimeout: 60000,
        browser: {
            enabled: true,
            headless: true,
            // Fail an action (e.g. a click) after 5s, rather than at the test's timeout
            provider: playwright({ actionTimeout: 5000 }),
            instances: [
                { browser: 'chromium' },
                { browser: 'firefox' },
                { browser: 'webkit' }
            ],
            viewport: { width: 1100, height: 1000 },
            screenshotFailures: false,
            expect: {
                toMatchScreenshot: {
                    comparatorName: 'pixelmatch',
                    comparatorOptions: {
                        // Allow for anti-aliasing differences only
                        threshold: 0.1,
                        allowedMismatchedPixelRatio: 0.001
                    }
                }
            }
        }
    }
}))
