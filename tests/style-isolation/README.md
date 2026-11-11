# Style isolation tests

These tests check that the component and the application hosting it don't affect each other's styles. They also check that changes made for style isolation don't change what the component looks like or does. OpenCOR has the same tests.

The tests run in real browsers (Chromium, Firefox and WebKit, the engine behind Safari) using [Vitest Browser Mode](https://vitest.dev/guide/browser/), with Playwright as the browser driver. Real browsers are needed because only a browser computes the CSS cascade, CSS layers and shadow DOM styling.

## Running the tests

```sh
bun run test                                        # all browsers
bunx vitest run --project chromium                  # one browser
bunx vitest run tests/style-isolation/functionality.test.ts
```

The first time, install the browsers with `bunx playwright install chromium firefox webkit`.

## What is tested

Each test mounts the component in a **host**: an application that has its own CSS and, possibly, its own Vue plugins. The hosts are defined in `hosts/index.ts`.

| Host | Stands in for |
|---|---|
| `tailwind-primevue` | The reference host: the component's dev app and the CellDL Editor app (Tailwind with preflight, PrimeVue Aura) |
| `plain` | A host with no CSS |
| `element-plus` | OpenCOR's `test-control` app (Element Plus) |
| `vitepress` | A VitePress documentation page |
| `hostile` | Aggressive, global CSS |

The component is placed in one of two ways:
- **`document`:** in the host's document.
- **`shadow`:** inside a host's shadow root, the way OpenCOR does it.

Every test runs in both the light and the dark theme.

### `component-to-parent.test.ts`

This file checks that the component doesn't affect its host. A snapshot of the host is taken before and after the component is mounted, and the two must be identical. Each snapshot is split into checks:

| Check | What is compared |
|---|---|
| `element styles` | The computed styles of the host's own elements: buttons, SVGs, `.hidden`, `.active`, `.error`, PrimeVue elements, tippy elements, and so on |
| `custom properties` | The CSS variables on those elements |
| `html attributes` | The classes and inline style of `<html>` |
| `head styles` | PrimeVue's `<style>` elements in the document's `<head>` |
| `host app` | The plugins, directives and components installed in the host's Vue app |

### `parent-to-component.test.ts`

This file checks that the host doesn't affect the component. Screenshots of the component in several states must match the reference screenshots:
- `diagram`: a diagram is open;
- `tooltip`: a toolbar tooltip is shown;
- `context-menu`: the context menu is open;
- `style-panel` and `properties-panel`: those panels are open;
- `dropdown`: a dropdown in the Properties panel is open.

### `functionality.test.ts`

This file checks that the component still works as a user expects. It covers:
- the status bar;
- tooltips;
- the context menu;
- delete, undo and redo;
- adding a component from the toolbar, by clicking or by dragging;
- the Style panel;
- closing a file.

## Reference screenshots

The reference screenshots in `__screenshots__/` show the component as it looks on `main`, in the reference host, in its document. Every host and placement is compared against them. So the screenshots must only be (re)recorded from `main`:

1. Check out `main` in a separate worktree, and copy this directory and `vitest.config.ts` into it.
2. Run `bunx vitest run tests/style-isolation/parent-to-component.test.ts -t "tailwind-primevue.*document"` twice:
   - the first run records the screenshots;
   - the second run checks that they are stable.
3. Copy the worktree's `tests/style-isolation/__screenshots__/` back to this directory.

When a screenshot doesn't match, the actual image and a diff image are saved in `.vitest/attachments/`.

## Known leaks

`known-leaks.ts` lists the leaks that are known but not yet fixed. Their tests are expected to fail (`test.fails`). When a fix makes such a test pass, Vitest reports it as a failure, so that the leak gets removed from the list. That way, every fix shows up as a change in `known-leaks.ts`.

## Known bug (not about styling)

Redoing the deletion of a component that has connections throws `NotFoundGraphError` in the bond graph plugin (`src/plugins/bondgraph/domainGraph.ts`). This also happens on `main`. The redo itself works, so `vitest.config.ts` ignores that one error. Any other unhandled error still fails the test run.
