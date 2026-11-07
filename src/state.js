/** Page registration, navigation and user arrangement. No native UI ownership. */
export function isLocalizedText(value) {
  return value !== null && typeof value === 'object'
    && typeof value.en === 'string'
    && Object.values(value).every(entry => typeof entry === 'string');
}

/** Normalize the supported page-shell configuration. */
export function normalizeConfig(input = {}) {
  const text = (key, fallback) => {
    const value = input[key] ?? fallback;
    if (typeof value === 'string' && value.length > 0 || isLocalizedText(value)) return value;
    throw new Error(`dsh-pages: \`${key}\` must be a non-empty string or LocalizedText`);
  };
  const id = (key, fallback) => {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string' || value.length === 0) throw new Error(`dsh-pages: \`${key}\` must be a non-empty string`);
    return value;
  };
  const homePage = id('homePage', 'home');
  const managerPage = id('managerPage', 'pages');
  const pageSlot = id('pageSlot', 'page.content');
  if (!pageSlot.startsWith('page.')) throw new Error('dsh-pages: `pageSlot` must start with page.');
  if (homePage === managerPage) throw new Error('dsh-pages: `managerPage` must differ from `homePage`');
  const railActionSlot = id('railActionSlot', 'page.rail-action');
  if (!railActionSlot.startsWith('page.') || railActionSlot === pageSlot) {
    throw new Error('dsh-pages: `railActionSlot` must start with page. and differ from pageSlot');
  }
  const railPosition = input.railPosition ?? 'left';
  if (!RAIL_POSITIONS.includes(railPosition)) throw new Error(`dsh-pages: \`railPosition\` must be one of ${RAIL_POSITIONS.join(', ')}`);
  // Retain the identity fields so existing browser-local arrangements keep their key.
  return {
    homePage, managerPage, pageSlot,
    classPrefix: id('classPrefix', 'dsh-pages'),
    navigationSlot: id('navigationSlot', 'page.navigation'),
    homeLabel: text('homeLabel', { en: 'DSH workbench', zh: 'DSH 工作台' }),
    managerLabel: text('managerLabel', { en: 'Pages', zh: '页面管理' }),
    // The product's own opening width and the value "reset width" returns to.
    // Omitted means the shell fallback; an out-of-range value is ignored rather
    // than thrown, so a product typo cannot stop the shell from booting.
    defaultRailWidth: validRailWidth(input.defaultRailWidth) ? input.defaultRailWidth : undefined,
    railActionSlot,
    railPosition,
    railPlaceholderIcon: input.railPlaceholderIcon,
    homeIcon: input.homeIcon,
    managerIcon: input.managerIcon,
  };
}

/** Recycle membership is independent of a pinned shortcut in the top group. */
export const PAGE_REGIONS = Object.freeze(['top', 'overflow', 'bottom']);
export const RAIL_POSITIONS = Object.freeze(['left', 'top', 'bottom', 'right']);
export const RAIL_WIDTH = Object.freeze({ min: 40, max: 96, default: 64 });
export function validRailWidth(width) {
  return Number.isInteger(width) && width >= RAIL_WIDTH.min && width <= RAIL_WIDTH.max;
}

export function createPagesState(config, initialPage = config.homePage, { preferences } = {}) {
  // The product may choose its own default; the shell only supplies a fallback.
  // "Reset width" must return to THIS value, otherwise a product that changed the
  // default would still be reset to the shell's 64.
  const defaultWidth = validRailWidth(config.defaultRailWidth) ? config.defaultRailWidth : RAIL_WIDTH.default;
  const storedPosition = preferences?.getRailPosition?.();
  const railPosition = RAIL_POSITIONS.includes(storedPosition) ? storedPosition : config.railPosition ?? 'left';
  let snapshot = { railPosition, railWidth: preferences?.getRailWidth?.() ?? defaultWidth, defaultRailWidth: defaultWidth, railPlaceholderIcon: config.railPlaceholderIcon, activePage: initialPage, pages: Object.freeze([]) };
  const listeners = new Set();
  const pages = new Map();
  const registrations = new Map();
  let sequence = 0;
  const publish = patch => {
    if (Object.entries(patch).every(([key, value]) => snapshot[key] === value)) return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of [...listeners]) listener();
  };
  const publishPages = (patch = {}) => publish({
    ...patch,
    pages: Object.freeze([...pages.values()]
      .sort((a, b) => a.order - b.order || a.seq - b.seq)
      .map(entry => Object.freeze({ ...entry }))),
  });
  const validateRegion = region => {
    if (!PAGE_REGIONS.includes(region)) throw new Error(`dsh-pages: page \`region\` must be one of ${PAGE_REGIONS.join(', ')}`);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    selectPage(activePage) {
      if (!pages.has(activePage)) throw new Error(`dsh-pages: unknown page "${activePage}"`);
      publish({ activePage });
    },
    /** A client-owned component, not a persisted user preference. */
    setRailPlaceholderIcon(icon) {
      if (icon !== undefined && typeof icon !== 'function' && (icon === null || typeof icon !== 'object')) {
        throw new TypeError('dsh-pages: rail placeholder icon must be a component or undefined');
      }
      publish({ railPlaceholderIcon: icon });
    },
    /** Product defaults are client-owned, separate from the user's saved width. */
    setDefaultRailWidth(width) {
      if (!validRailWidth(width)) throw new RangeError('dsh-pages: default navigation width must be an integer between 40 and 96');
      publish({ defaultRailWidth: width });
    },
    setRailPosition(position) {
      if (!RAIL_POSITIONS.includes(position)) throw new RangeError(`dsh-pages: navigation position must be one of ${RAIL_POSITIONS.join(', ')}`);
      preferences?.setRailPosition?.(position);
      publish({ railPosition: position });
    },
    setRailWidth(width) {
      if (!validRailWidth(width)) throw new RangeError('dsh-pages: navigation width must be an integer between 40 and 96');
      preferences?.setRailWidth?.(width);
      publish({ railWidth: width });
    },
    /** The returned disposer removes only this live registration, never a later one. */
    registerPage(spec) {
      if (spec === null || typeof spec !== 'object') throw new TypeError('dsh-pages: registerPage() needs a spec object');
      const { id, label, icon } = spec;
      if (typeof id !== 'string' || !id) throw new Error('dsh-pages: page `id` must be a non-empty string');
      if (!(typeof label === 'string' && label.length > 0) && !isLocalizedText(label)) throw new Error('dsh-pages: page `label` must be a non-empty string or LocalizedText');
      if (pages.has(id)) throw new Error(`dsh-pages: page "${id}" is already registered`);
      const region = spec.region ?? 'top';
      validateRegion(region);
      const order = spec.order ?? 0;
      if (!Number.isFinite(order)) throw new Error('dsh-pages: page `order` must be a finite number');
      if (icon !== undefined && typeof icon !== 'function' && (icon === null || typeof icon !== 'object')) throw new Error('dsh-pages: page `icon` must be a component');
      const entry = { id, label, icon, glyph: spec.glyph ?? '●', region, order, seq: ++sequence, ...preferences?.getArrangement(id) };
      pages.set(id, entry);
      registrations.set(id, entry);
      publishPages();
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        if (registrations.get(id) !== entry) return;
        pages.delete(id);
        registrations.delete(id);
        publishPages(snapshot.activePage === id ? { activePage: config.homePage } : {});
      };
    },
    setPageRegion(id, region) {
      validateRegion(region);
      const entry = pages.get(id);
      if (!entry) return false;
      preferences?.setArrangement(id, { region });
      if (entry.region === region) return false;
      if (entry.pinned) preferences?.setArrangement(id, { pinned: false, pinOrder: 0 });
      pages.set(id, { ...entry, region, pinned: false, pinOrder: 0 });
      publishPages();
      return true;
    },
    /** Append/remove a shortcut; do not change recycle membership or register a page. */
    setPagePinned(id, pinned) {
      const entry = pages.get(id);
      if (!entry || entry.region !== 'overflow' || Boolean(entry.pinned) === Boolean(pinned)) return false;
      const pinOrder = pinned ? Math.max(0, ...[...pages.values()].map(page => page.pinOrder || 0)) + 1 : 0;
      const patch = { pinned: Boolean(pinned), pinOrder };
      preferences?.setArrangement(id, { region: 'overflow', ...patch });
      pages.set(id, { ...entry, ...patch });
      publishPages();
      return true;
    },
    setPageOrder(id, order) {
      if (!Number.isFinite(order)) throw new Error('dsh-pages: page `order` must be a finite number');
      const entry = pages.get(id);
      if (!entry) return false;
      preferences?.setArrangement(id, { order });
      if (entry.order === order) return false;
      pages.set(id, { ...entry, order });
      publishPages();
      return true;
    },
    /** Move to the front of the default top group, distinct from pinning. */
    promotePage(id) {
      const entry = pages.get(id);
      if (!entry) return false;
      const others = [...pages.values()].filter(page => page.region === 'top' && page.id !== id);
      const first = others.length ? Math.min(...others.map(page => page.order)) : undefined;
      if (entry.region === 'top' && (first === undefined || entry.order < first)) {
        preferences?.setArrangement(id, { region: 'top', order: entry.order });
        return false;
      }
      const patch = { region: 'top', order: first === undefined ? 0 : first - 1, pinned: false, pinOrder: 0 };
      pages.set(id, { ...entry, ...patch });
      preferences?.setArrangement(id, patch);
      publishPages();
      return true;
    },
  };
}
