import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  clearRegistryCache,
  findInvalidComponentTags,
  findRegisteredComponents,
} from '../../lib/core/tooling/componentTagNaming.js';

console.log('Testing component registry cache invalidation...');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avenx-registry-'));
const componentsDir = path.join(root, 'src', 'components');

function addComponent(dir, name) {
  fs.mkdirSync(path.join(componentsDir, dir), { recursive: true });
  fs.writeFileSync(path.join(componentsDir, dir, `${name}.component.js`), '<div>x</div>\n');
}

// Push the directory mtime forward explicitly so the test does not depend on
// the filesystem's timestamp resolution.
let bumps = 0;
function bumpMtime(dir) {
  bumps += 1;
  const later = new Date(Date.now() + bumps * 60_000);
  fs.utimesSync(dir, later, later);
}

const sorted = (set) => [...set].sort();

try {
  clearRegistryCache();
  addComponent('navbar', 'navbar');
  assert.deepStrictEqual(sorted(findRegisteredComponents(root)), ['Navbar']);

  // ----------------------------------------------------
  // Test 1: A new component folder is picked up right away
  // ----------------------------------------------------
  addComponent('side-bar', 'side-bar');
  bumpMtime(componentsDir);
  assert.deepStrictEqual(sorted(findRegisteredComponents(root)), ['Navbar', 'SideBar']);

  // The false negative from the stale cache: <sidebar> must be reported again.
  const invalid = findInvalidComponentTags('<div><sidebar /></div>', findRegisteredComponents(root));
  assert.strictEqual(invalid.length, 1);
  assert.strictEqual(invalid[0].expectedName, 'SideBar');
  console.log('Added component folder picked up!');

  // ----------------------------------------------------
  // Test 2: The cache still avoids a rescan in the common case
  // ----------------------------------------------------
  // Written into an existing folder, so the components directory mtime does
  // not move and a fresh entry is reused.
  fs.writeFileSync(path.join(componentsDir, 'navbar', 'nav-item.component.js'), '<li>x</li>\n');
  assert.deepStrictEqual(sorted(findRegisteredComponents(root)), ['Navbar', 'SideBar']);
  console.log('Fresh cache entry reused!');

  // ----------------------------------------------------
  // Test 3: Nested additions show up once the entry expires
  // ----------------------------------------------------
  assert.deepStrictEqual(sorted(findRegisteredComponents(root, 'src/components', { maxAgeMs: 0 })), [
    'NavItem',
    'Navbar',
    'SideBar',
  ]);
  console.log('Nested component picked up after expiry!');

  // ----------------------------------------------------
  // Test 4: A removed component stops being returned
  // ----------------------------------------------------
  fs.rmSync(path.join(componentsDir, 'side-bar'), { recursive: true });
  bumpMtime(componentsDir);
  assert.deepStrictEqual(sorted(findRegisteredComponents(root)), ['NavItem', 'Navbar']);
  console.log('Removed component dropped!');

  // ----------------------------------------------------
  // Test 5: clearRegistryCache forces a rescan
  // ----------------------------------------------------
  fs.rmSync(path.join(componentsDir, 'navbar', 'nav-item.component.js'));
  clearRegistryCache();
  assert.deepStrictEqual(sorted(findRegisteredComponents(root)), ['Navbar']);
  console.log('clearRegistryCache resets the cache!');
} finally {
  clearRegistryCache();
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('All component registry cache tests passed!');
