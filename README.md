# dsh-pages

English | [中文](<README-ZH.md>)

![dsh-pages with the native DSH workbench](<docs/screenshot.png>)

## Purpose

Add a persistent page rail to DeepSeek Harness, with built-in **DSH workbench** (`home`) and **Page manager** (`pages`) pages. Open product pages alongside the native workbench without replacing or remounting its root.

## Install

```sh
npm i dsh-pages
```

Add the package to your profile bundle:

```yaml
- id: dsh-pages
  name: dsh-pages
```

## Quick start

A product bundle can install the same page shell programmatically:

```js
import { apply } from 'dsh-pages/client';

await apply(ctx);
```

Both `apply` and `applyWithConfig` install the formal page shell; there is no alternate legacy entry. Await installation and declare the host dependencies required by the client entry. A plugin consuming `ctx.pages` must run after that service is available, rather than injecting it into the plugin that creates it.

Register navigation metadata and page content separately, with the same id. Each registration needs its own effect cleanup:

```jsx
ctx.effect(() => ctx.pages.registerPage({
  id: 'notes', label: 'Notes', glyph: 'N', region: 'top', order: 10,
}));

ctx.effect(() => ctx.slots.inject('page.content', () =>
  ctx.slots.register({ name: 'page.content', key: 'notes' }, NotesPage)
));
```

`NotesPage` is your React component. Live page ids must be unique. Removing the active page returns to the workbench; saved preferences do not recreate missing plugin pages.

## Manage pages

Open **Page manager** to arrange pages:

- `top`: normal entries at the top of the rail.
- `overflow`: the recycle group, reachable through **…** whenever nonempty.
- `bottom`: entries at the bottom of the rail.
- Change group, reorder, open, or recycle a page. The manager can itself be recycled and reopened from **…**.
- Pin a recycled page to append a shortcut after **…** in the top group. The page stays in the recycle group. Unpinning removes only the shortcut.
- Adjust rail width from **40–96px**, default **64px**. Changes apply immediately and are saved locally.

Explicit arrangement, pinning, and width preferences survive reload in the same browser and origin. They do not sync across devices or tabs.

## Limits

- The native root and native settings UI remain owned by DSH. This package does not export native slots, rebuild settings, or automatically turn floating windows into pages.
- Covered native UI stays mounted. Switching pages does not stop native plugins, background tasks, or global shortcuts.
- This is not an iframe or security sandbox; plugins share the document and services.
- Host slot contracts, overlay layering, root geometry, and browser CSS support still affect compatibility. No arbitrary third-party compatibility or latest real-device validation is claimed.
- Storage failure leaves controls usable in memory but preferences may not survive reload.

See [design and lifecycle boundaries](<DESIGN.md>) for implementation details and retired approaches.

## License

MIT
