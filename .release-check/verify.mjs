import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const root = path.resolve('.release-check/clean/node_modules/@lybx-leyw/dsh-pages');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.version, '0.1.3');
assert.deepEqual(manifest.exports['./client'], { import: './lib/client.mjs', default: './lib/client.js' });
const client = await import(pathToFileURL(path.join(root, manifest.exports['./client'].import)));
assert.equal(typeof client.applyWithConfig, 'function');
assert.equal(client.normalizeConfig().railPosition, 'left');
let registration;
const loader = await readFile(path.join(root, 'lib/client.js'), 'utf8');
vm.runInNewContext(loader, { window: { __ModuleLoader__: { load(value) { registration = value; } } } });
assert.equal(registration.id, manifest.name);
assert.equal(typeof registration.factory(createRequire(import.meta.url)).apply, 'function');
let count = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { assert.notEqual(entry.name, 'node_modules'); await scan(file); continue; }
    count++;
    assert.ok(!/(?:\.npmrc|\.env|\.log|\.tgz|\.test\.mjs)$/.test(entry.name), 'unexpected payload file: ' + entry.name);
    if (file.endsWith('.png')) continue;
    const text = await readFile(file, 'utf8');
    for (const pattern of [/[A-Za-z]:[\\/]Users[\\/]/, /\/(?:Users|home)\/[^\s/]+\//, /npm_[A-Za-z0-9]{20,}/, /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]) {
      assert.ok(!pattern.test(text), 'potential private information in ' + path.relative(root, file));
    }
  }
}
await scan(root);
assert.equal(count, 18);
console.log(JSON.stringify({ version: manifest.version, files: count, esmImport: 'ok', dshLoader: 'ok', payloadScan: 'ok' }));
