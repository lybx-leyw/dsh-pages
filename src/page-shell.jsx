import React, { useEffect, useId, useRef, useState } from 'react';
import { createPages } from './pages-service.js';
import { PageManager } from './page-manager.jsx';

const namespace = 'dsh-pages';
const translations = {
  en: {
    navigation: 'Pages', back: 'Back to workbench', more: 'More pages', pin: 'Pin to top group', unpin: 'Unpin',
    managerTitle: 'Page manager', managerHint: 'Arrange the top, recycle and bottom groups. Recycled pages remain accessible in …; pin them to append shortcuts after … in the top group.',
    managerTop: 'Top group', managerBottom: 'Bottom group', managerHidden: 'Recycle group', managerEmpty: 'No pages here.',
    managerUp: 'Move up', managerDown: 'Move down', managerShow: 'Show', managerHide: 'Hide',
    navigationWidth: 'Navigation width', resetWidth: 'Reset width',
    managerPin: 'Move to top', managerOpen: 'Open', managerGroup: 'Group',
  },
  zh: {
    navigation: '页面', back: '返回工作台', more: '更多页面', pin: '固定到顶部组末尾', unpin: '取消固定',
    managerTitle: '页面管理', managerHint: '管理顶部默认组、回收组和底部组。收起的页面仍可从 … 打开；固定后在顶部组的 … 下方追加入口。',
    managerTop: '顶部组', managerBottom: '底部组', managerHidden: '回收组', managerEmpty: '这里没有页面。',
    managerUp: '上移', managerDown: '下移', managerShow: '显示', managerHide: '隐藏',
    navigationWidth: '导航宽度', resetWidth: '恢复默认宽度',
    managerPin: '移到最前', managerOpen: '打开', managerGroup: '分组',
  },
};
const secondary = 'var(--dsw-alias-label-secondary, #aaa)';
const border = '1px solid var(--dsw-alias-border-l2, #555)';
const surface = 'var(--dsw-alias-bg-layer-2, #181818)';
const foreground = 'var(--dsw-alias-label-primary, #ddd)';
const button = {
  font: 'inherit', fontSize: 13, color: foreground,
  background: surface, border, borderRadius: 6, padding: '9px 14px', cursor: 'pointer',
};
// Explicit shell geometry, not discovery or relocation of native slots. Removing
// this component removes the rule and restores the original geometry.
const layoutCss = width => `
#root:has([data-dsh-pages-shell]) { box-sizing: border-box; padding-left: ${width}px; }
[data-dsh-pages-rail] button:hover { background: var(--dsw-alias-interactive-bg-hover, #333); }
[data-dsh-pages-shell] button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
`;

/** Scale the rendered icon, including third-party icons with fixed dimensions. */
function RailIcon({ width, children }) {
  return <span data-dsh-pages-rail-icon="" aria-hidden="true" style={{
    display: 'grid', gridTemplateColumns: '23px', gridTemplateRows: '23px', placeItems: 'center', width: 23, height: 23, lineHeight: 1,
    transform: `scale(${width / 64})`, transformOrigin: 'center',
  }}>{children}</span>;
}

/** Icons for the pages this shell itself registers. */
function PageIcon({ entry, home }) {
  if (entry.icon) return <entry.icon/>;
  if (entry.id === home) {
    return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><path d="m3 10 9-7 9 7M6 9v12h12V9M10 21v-7h4v7"/></svg>;
  }
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1.6"/><rect x="14" y="4" width="7" height="7" rx="1.6"/><rect x="3" y="13" width="7" height="7" rx="1.6"/><rect x="14" y="13" width="7" height="7" rx="1.6"/></svg>;
}

/**
 * Persistent navigation over the untouched native workbench.
 *
 * This component owns navigation and page content only. It deliberately renders
 * no native settings UI: those contributions remain with their original owner.
 *
 * @param props - injected page face and framework hooks.
 * @returns the rail and, when a product page is active, its content.
 */
export function PageShell(props) {
  const snapshot = props.usePages(value => value);
  const railWidth = snapshot.railWidth ?? 64;
  const scale = railWidth / 64;
  const railButton = {
    width: 46 * scale, height: 46 * scale, minHeight: 46 * scale,
    padding: 0, boxSizing: 'border-box', display: 'grid', placeItems: 'center', flexShrink: 0,
    border: 'none', borderRadius: 9 * scale, cursor: 'pointer', font: 'inherit', lineHeight: 1,
  };
  const home = props.homePage;
  const open = snapshot.activePage !== home;
  const manager = snapshot.activePage === props.managerPage;
  const close = useRef(null);
  const shell = useRef(null);
  const moreButton = useRef(null);
  const contentId = useId();
  // Which rail group is open in the "…" popover; local because it is a transient
  // view, not page state. Only one popover can be open at a time.
  const [menu, setMenu] = useState(null);
  const active = snapshot.pages.find(entry => entry.id === snapshot.activePage);
  const top = snapshot.pages.filter(entry => entry.region === 'top');
  // The recycle group is an explicit region, not "whatever did not fit": a page
  // is either on the rail or parked here, and parking never invents a new order.
  const parked = snapshot.pages.filter(entry => entry.region === 'overflow');
  // The popover follows its trigger. Computed on open from the live button box so
  // a scrolled or resized rail still anchors it correctly.
  const menuTop = menu === 'more' && moreButton.current !== null
    ? Math.max(12, Math.min(moreButton.current.getBoundingClientRect().top, globalThis.innerHeight - 260))
    : 12;
  const dismiss = () => props.selectPage(home);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const containFocus = event => {
      if (!shell.current?.contains(event.target)) close.current?.focus();
    };
    document.addEventListener('focusin', containFocus);
    return () => document.removeEventListener('focusin', containFocus);
  }, [open, snapshot.activePage]);
  // A popover left open while its group empties would strand the panel; closing on
  // outside pointer input keeps it a transient view.
  useEffect(() => {
    if (menu === null) return undefined;
    const onPointer = event => {
      if (event.target.closest?.('[data-dsh-pages-more], [data-dsh-pages-more-panel]')) return;
      setMenu(null);
    };
    const onKey = event => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);
  const keyDown = event => {
    if (!open) return;
    // Native document-capture shortcuts stay with the host.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    } else if (event.key === 'Tab') {
      const controls = Array.from(shell.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'))
        .filter(node => node.getClientRects().length > 0);
      const index = controls.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
      event.preventDefault();
      (controls[next] || shell.current).focus();
    }
  };
  const navItem = entry => {
    const selected = entry.id === snapshot.activePage;
    const label = props.resolveLabel(entry.label);
    return <button key={entry.id} type="button"
      title={label} aria-label={label} aria-current={selected ? 'page' : undefined}
      aria-controls={entry.id === home ? undefined : contentId}
      onClick={() => props.selectPage(entry.id)} style={{
        ...railButton,
        color: selected ? foreground : secondary,
        background: selected ? 'var(--dsw-alias-interactive-bg-hover, #333)' : 'transparent',
        boxShadow: selected ? 'inset 2px 0 0 currentColor' : 'none',
      }}><RailIcon width={railWidth}><PageIcon entry={entry} home={home}/></RailIcon></button>;
  };
  return <div ref={shell} data-dsh-pages-shell="" data-active-page={snapshot.activePage}
    role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined}
    aria-label={open ? props.resolveLabel(active?.label ?? '') : undefined}
    tabIndex={open ? -1 : undefined}
    style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none', color: foreground, fontFamily: 'inherit' }}
    onKeyDown={keyDown} onKeyUp={event => { if (open) event.stopPropagation(); }}>
    <style data-dsh-pages-layout="">{layoutCss(railWidth)}</style>
    <nav data-dsh-pages-rail="" aria-label={props.t('navigation')} style={{
      position: 'absolute', inset: '0 auto 0 0', width: railWidth, boxSizing: 'border-box',
      background: surface, borderRight: border, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8 * scale, padding: `${16 * scale}px ${8 * scale}px`, pointerEvents: 'auto', overflowY: 'auto', overflowX: 'hidden',
    }}>
      <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 46 * scale, fontSize: 11 * scale, lineHeight: 1, letterSpacing: '0.08em', fontWeight: 700, padding: `${4 * scale}px 0 ${20 * scale}px`, color: secondary }}>P /</span>
      {top.map(navItem)}
      {parked.length > 0 && <button ref={moreButton} type="button" data-dsh-pages-more=""
        title={props.t('more')} aria-label={props.t('more')}
        aria-expanded={menu === 'more'} aria-haspopup="menu"
        onClick={() => setMenu(menu === 'more' ? null : 'more')} style={{
          ...railButton,
          color: parked.some(entry => entry.id === snapshot.activePage) ? foreground : secondary,
          background: menu === 'more' ? 'var(--dsw-alias-interactive-bg-hover, #333)' : 'transparent',
        }}><RailIcon width={railWidth}><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg></RailIcon></button>}
      {parked.some(entry => entry.pinned) && <span data-dsh-pages-pin-divider="" style={{ display: 'block', flexShrink: 0, width: 28 * scale, borderTop: border }}/>}
      {parked.filter(entry => entry.pinned).sort((a, b) => a.pinOrder - b.pinOrder).map(navItem)}
      <span style={{ flex: 1 }}/>
      {snapshot.pages.filter(entry => entry.region === 'bottom').map(navItem)}
    </nav>
    {/* The "…" group: `position:fixed` and measured coordinates, because the rail
        column clips overflow and an absolutely positioned panel would be cut off. */}
    {menu === 'more' && <div data-dsh-pages-more-panel="" role="menu" aria-label={props.t('more')} style={{
      position: 'fixed', top: menuTop, left: railWidth + 8, zIndex: 1001, minWidth: 200, maxHeight: '60vh', overflowY: 'auto',
      padding: 6, boxSizing: 'border-box', pointerEvents: 'auto',
      background: surface, border, borderRadius: 10, boxShadow: '0 10px 32px #0007',
    }}>
      {parked.map(entry => {
        const label = props.resolveLabel(entry.label);
        const selected = entry.id === snapshot.activePage;
        // Recycle membership is independent of the optional top-tail shortcut.
        return <div key={entry.id} data-dsh-pages-more-row="" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" role="menuitem" aria-current={selected ? 'page' : undefined}
            onClick={() => { setMenu(null); props.selectPage(entry.id); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, minHeight: 36,
              padding: '0 10px', border: 'none', borderRadius: 7, cursor: 'pointer', font: 'inherit',
              textAlign: 'left', color: selected ? foreground : secondary,
              background: selected ? 'var(--dsw-alias-interactive-bg-hover, #333)' : 'transparent',
            }}><span style={{ display: 'grid', placeItems: 'center', width: 20, height: 20 }}><PageIcon entry={entry} home={home}/></span>{label}</button>
          <button type="button" title={props.t(entry.pinned ? 'unpin' : 'pin')} aria-label={`${props.t(entry.pinned ? 'unpin' : 'pin')} ${label}`}
            data-dsh-pages-pin="" aria-pressed={Boolean(entry.pinned)} onClick={() => props.setPagePinned(entry.id, !entry.pinned)}
            style={{
              width: 32, minHeight: 32, display: 'grid', placeItems: 'center', flexShrink: 0,
              border: 'none', borderRadius: 6, cursor: 'pointer', font: 'inherit', color: secondary,
              background: 'transparent',
            }}><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2 22 10l-2.6 2.6-1.4-1.4-3.5 3.5.7 4.3-2.1 2.1-3.5-3.5L4 23l-1-1 4.5-5.5L4 13l2.1-2.1 4.3.7 3.5-3.5-1.4-1.4z"/></svg></button>
        </div>;
      })}
    </div>}
    {open && <section id={contentId} aria-labelledby={contentId} style={{
      position: 'absolute', inset: `0 0 0 ${railWidth}px`, overflow: 'auto', boxSizing: 'border-box', pointerEvents: 'auto',
      background: surface, color: foreground, fontSize: 14, lineHeight: 1.6, padding: '24px clamp(16px, 5vw, 80px)',
    }}>
      <header style={{ borderBottom: border, paddingBottom: 24, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <button type="button" ref={close} style={button} onClick={dismiss}>← {props.t('back')}</button>
        <span style={{ color: secondary, fontSize: 11, letterSpacing: '0.12em' }}>{props.resolveLabel(active?.label ?? '')}</span>
      </header>
      <div style={{ maxWidth: 760, margin: 'clamp(32px, 8vh, 100px) auto' }}>
        {manager
          ? <PageManager entries={snapshot.pages} railWidth={railWidth}
              resolveLabel={entry => props.resolveLabel(entry.label)} t={props.t}
              actions={{
                selectPage: props.selectPage,
                setPageRegion: props.setPageRegion,
                 setPagePinned: props.setPagePinned,
                 setRailWidth: props.setRailWidth,
                setPageOrder: props.setPageOrder,
                promotePage: props.promotePage,
              }}/>
          : <React.Fragment key={snapshot.activePage}>{props.renderSlot(props.pageSlot, {}, { entryKey: snapshot.activePage })}</React.Fragment>}
      </div>
    </section>}
  </div>;
}

/**
 * Install the parallel rail and its page slot without taking over native UI.
 *
 * @param ctx - client context with slots and locale.
 * @param config - page-shell configuration.
 * @returns the tracked disposer for this installation.
 */
export function installPageShell(ctx, config = {}) {
  const { slots } = ctx;
  const cleanups = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    let failure;
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  };
  return ctx.effect(() => {
    try {
      const pages = createPages(config);
      cleanups.push(() => pages.dispose());
      cleanups.push(ctx.reflect.provide('pages', pages.service));
      cleanups.push(ctx.locale.register(namespace, translations));
      cleanups.push(slots.inject('shell.overlay', () => slots.register({
        name: 'shell.overlay', id: 'dsh-pages.rail',
        children: { [pages.service.config.pageSlot]: { kind: 'keyed', scope: 'root' } },
        inject: () => ({
          hooks: { pages: { getSnapshot: pages.state.getSnapshot, subscribe: pages.state.subscribe } },
          homePage: pages.service.config.homePage, managerPage: pages.service.config.managerPage,
          pageSlot: pages.service.config.pageSlot,
          selectPage: pages.service.selectPage,
          setPageRegion: pages.service.setPageRegion,
           setPagePinned: pages.service.setPagePinned,
           setRailWidth: pages.service.setRailWidth,
          setPageOrder: pages.service.setPageOrder,
          promotePage: pages.service.promotePage,
          resolveLabel: value => typeof value === 'string' ? value : ctx.locale.resolveText(value),
        }),
        locale: namespace,
      }, PageShell)));
      return dispose;
    } catch (error) {
      try { dispose(); } catch { /* Preserve the original setup failure. */ }
      throw error;
    }
  }, 'dsh-pages: page shell');
}
