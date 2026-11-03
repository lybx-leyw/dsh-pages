# Versioning and release

`dsh-pages` has its own version line and `dsh-pages-v<version>` tags. A public config or export removal is a breaking change; an internal rename alone is not. This cleanup removes the retired adapter API and must not be described as a compatibility-preserving release for its callers.

## Validation before release

In the standalone package:

```sh
npm test
npm run build
npm pack --dry-run
```

In the monorepo, synchronize the authoritative package into the vendor directory, rebuild with `buildClientPackage('dsh-pages')`, and run the page integration and packaging tests. Inspect the dry-run payload for the current source, built client bundle, bundle patch, documentation, and license. No retired modules or prototype documents should ship.

Update both package manifests consistently when preparing a release. Do not publish, commit, create a tag, or push without explicit approval; repository pushes go through a PR. Check the public payload and commit metadata for credentials, personal information, and local paths.

## Compatibility claims

The current shell does not mutate native root registrations. It still depends on host overlay/child-slot support, CSS root geometry, and browser behavior. Test host versions and third-party combinations separately and record evidence for the actual release. Historical adapter host lists and test counts are not verification of the current implementation.

Architecture and lifecycle boundaries are documented in [DESIGN](<DESIGN.md>).
