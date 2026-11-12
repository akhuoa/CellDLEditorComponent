/******************************************************************************

What OpenCOR does for its own shadow root (its src/common/shadowCompat.ts), for
the hosts that place the component in a shadow root.

For listeners outside OpenCOR's shadow root, OpenCOR makes an event's target the
element the event came from within its shadow root (rather than its shadow host),
which PrimeVue's overlays need. The component does the same for its own shadow
root, and the two must work together.

OpenCOR is loaded before the component, so its listeners are added first: this
module must be imported before the component is.

******************************************************************************/

const shadowHosts = new WeakSet<Element>()

const EVENTS = [
    'auxclick', 'click', 'contextmenu', 'dblclick', 'focusin', 'focusout', 'keydown', 'keyup',
    'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchend', 'touchstart'
]

const nativeTarget = Object.getOwnPropertyDescriptor(Event.prototype, 'target')?.get

function isWithin(node: Node, shadowRoot: ShadowRoot): boolean {
    let root = node.getRootNode()
    while (root instanceof ShadowRoot) {
        if (root === shadowRoot) {
            return true
        }
        root = root.host.getRootNode()
    }
    return false
}

function keepEventTarget(event: Event) {
    if (!nativeTarget || Object.hasOwn(event, 'target')) {
        return
    }
    const path = event.composedPath()
    for (let i = 1; i < path.length; i += 1) {
        const host = path[i]
        const shadowRoot = path[i - 1]
        if (host instanceof Element && shadowHosts.has(host) && shadowRoot instanceof ShadowRoot) {
            const target = path.slice(0, i - 1).find((node) => node instanceof Node && node.getRootNode() === shadowRoot)
            if (target) {
                Object.defineProperty(event, 'target', {
                    configurable: true,
                    get() {
                        const currentTarget = (this as Event).currentTarget
                        return currentTarget instanceof Node
                            && (currentTarget === shadowRoot || isWithin(currentTarget, shadowRoot))
                            ? nativeTarget.call(this)
                            : target
                    }
                })
            }
            return
        }
    }
}

for (const event of EVENTS) {
    window.addEventListener(event, keepEventTarget, { capture: true, passive: true })
}

/**
 * Keep the targets of events from within a host's shadow root, as OpenCOR does.
 */
export function keepShadowHostEventTargets(host: Element) {
    shadowHosts.add(host)
}

//==============================================================================
//==============================================================================
