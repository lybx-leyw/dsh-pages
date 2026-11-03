/** Browser entry for the page shell. Native slots and their owners stay untouched. */
import { normalizeConfig } from './state.js';
import { installPageShell } from './page-shell.jsx';

export const name = 'dsh-pages-client';
export const inject = { slots: { required: true }, locale: { required: true } };
export { normalizeConfig, installPageShell };

/** Install the same page shell for both host-loader and product-bundle callers. */
export function apply(ctx, config = {}) {
  return applyWithConfig(ctx, config);
}

export function applyWithConfig(ctx, config = {}) {
  return installPageShell(ctx, normalizeConfig(config));
}
