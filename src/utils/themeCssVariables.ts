/**
 * Composable utility for injecting PrimeVue theme CSS variables into the DOM.
 *
 * Ex https://github.com/CellDL/CellDLEditor/pull/4/changes from https://github.com/akhuoa
 */

import { getCurrentInstance, onMounted } from 'vue';

import primeVueAuraTheme from '@primeuix/themes/aura';

//==============================================================================

/**
 * The PrimeVue components whose theme variables the editor needs (i.e. the
 * components passed to `useThemeCssVariables()`).
 */
const THEMED_COMPONENTS = [
    'button',
    'card',
    'checkbox',
    'contextmenu',
    'divider',
    'floatlabel',
    'inputtext',
    'radiobutton',
    'scrollpanel',
    'select',
    'slider',
    'toolbar'
];

// biome-ignore lint/suspicious/noExplicitAny: a PrimeVue preset is untyped
type ThemePreset = { components?: Record<string, any> };

//==============================================================================

/**
 * Get the CSS that defines the theme variables used by the editor's PrimeVue components.
 *
 * This is for hosts that don't let the editor's PrimeVue inject its theme (e.g. that
 * configure PrimeVue with `theme: 'none'`), or that show the editor in a shadow root
 * and so need to inject the CSS themselves. The variables are defined on both `:root`
 * and `:host`, so the CSS can be used in a document or a shadow root.
 *
 * @param preset The PrimeVue theme preset to use (defaults to Aura)
 * @returns The CSS
 */
export function celldlEditorThemeCss(preset: ThemePreset = primeVueAuraTheme as ThemePreset): string {
    const components = preset?.components ?? {};
    return THEMED_COMPONENTS
        .filter(name => components[name])
        .map(name => generateComponentStyles(components[name], name))
        .join('\n');
}

//==============================================================================

/**
 * Inject the theme variables of a PrimeVue component.
 *
 * The variables come from the theme preset in `$primevue.config.theme`. If there is no
 * preset (e.g. the host uses `theme: 'none'`) nothing is injected, and the host should
 * use `celldlEditorThemeCss()` instead.
 *
 * The styles are injected into the root node of the component (a shadow root, or
 * the document's head), once per root.
 *
 * @param componentName The key name in the preset (e.g., 'card', 'button', 'select')
 */
export function useThemeCssVariables(componentName: string) {
    const instance = getCurrentInstance();

    onMounted(() => {
        const primevue = instance?.appContext.config.globalProperties.$primevue;
        const preset = primevue?.config?.theme?.preset;
        const element = instance?.proxy?.$el as Node|null|undefined;

        if (element && preset?.components?.[componentName]) {
            injectStyles(element.getRootNode(), `lib-fix-${componentName}`,
                () => generateComponentStyles(preset.components[componentName], componentName));
        }
    });
}

//==============================================================================

const injectedStyles = new WeakMap<Node, Set<string>>();

function injectStyles(rootNode: Node, id: string, css: () => string) {
    const container = rootNode instanceof ShadowRoot ? rootNode
                    : rootNode instanceof Document ? rootNode.head
                    : null;
    if (container === null) return;   // Not (yet) attached to a document

    let ids = injectedStyles.get(rootNode);
    if (ids === undefined) {
        ids = new Set();
        injectedStyles.set(rootNode, ids);
    }
    if (ids.has(id)) return;
    ids.add(id);

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css();
    container.appendChild(style);
}

//==============================================================================

function resolveReference<T>(value: T|string): T|string {
    if (typeof value !== 'string') return value;
    return value.replace(/\{([^}]+)\}/g, (_, path) => {
        return `var(--p-${path.replace(/\./g, '-')})`;
    });
}

function toKebabCase(str: string) {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

function generateComponentStyles(tokenObj: object, prefix: string) {
    let css = `:root, :host {`;

    const traverse = (obj: object, parentKey: string) => {
        Object.entries(obj).forEach(([key, value]) => {
            const kebabKey = toKebabCase(key);
            let newKey: string;

            if (key === 'root') {
                newKey = parentKey;
            } else {
                newKey = parentKey ? `${parentKey}-${kebabKey}` : kebabKey;
            }

            if (typeof value === 'object' && value !== null) {
                traverse(value, newKey);
            } else {
                const resolvedValue = resolveReference(value);
                css += `--p-${prefix}-${newKey}: ${resolvedValue};`;
            }
        });
    };

    traverse(tokenObj, '');
    css += `}`;
    return css;
}
