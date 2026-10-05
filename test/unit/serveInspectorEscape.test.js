import assert from 'assert';
import vm from 'node:vm';
import { escapeInlineJson, getInspectorHtml } from '../../bin/commands/serve.js';

function testScriptBreakoutIsNeutralised() {
  const baseline = getInspectorHtml({ config: { distDir: 'dist' } });
  const baselineClosers = baseline.match(/<\/script>/g) || [];

  const config = {
    distDir: 'dist</script><script>alert(1)</script>',
    outputName: 'bundle',
  };
  const html = getInspectorHtml({ config });
  const scriptCloses = html.match(/<\/script>/g) || [];

  assert.strictEqual(
    scriptCloses.length,
    baselineClosers.length,
    'evil config added ' + scriptCloses.length + ' script elements, baseline ' + baselineClosers.length,
  );
  assert.ok(
    html.indexOf('dist</script>') === -1,
    'config value must not break out of the inline script',
  );
}

function testEscapedJsonParsesBackToSameObject() {
  const config = {
    distDir: 'dist</script><script>alert(1)</script>',
    nested: { headers: { 'X-Test': 'a>b' } },
    list: [1, 'two<three'],
  };
  assert.deepStrictEqual(JSON.parse(escapeInlineJson(config)), config);
}

function testUnicodeLineTerminatorsAreEscaped() {
  const config = { value: 'line\u2028separator\u2029paragraph' };
  const escaped = escapeInlineJson(config);

  assert.ok(escaped.indexOf('\u2028') === -1, 'raw U+2028 must not survive');
  assert.ok(escaped.indexOf('\u2029') === -1, 'raw U+2029 must not survive');
  assert.ok(escaped.indexOf('\\u2028') !== -1, 'U+2028 must be backslash-u escaped');
  assert.ok(escaped.indexOf('\\u2029') !== -1, 'U+2029 must be backslash-u escaped');
  assert.deepStrictEqual(JSON.parse(escaped), config);
}

function testOrdinaryConfigRendersUnchanged() {
  const config = { distDir: 'dist', port: 3000, open: false };
  const html = getInspectorHtml({ config });
  assert.ok(
    html.includes('window.__avenx_config = {"distDir":"dist","port":3000,"open":false};'),
    'ordinary configs must serialise exactly as before',
  );
  assert.ok(html.includes('<title>Avenx Inspection Dashboard</title>'));
}

function testConnectionStatusOnlyAnnouncesTransitions() {
  const html = getInspectorHtml({ config: { distDir: 'dist' } });
  assert.match(html, /id="statusBadge"[^>]*role="status"[^>]*aria-live="polite"/);
  for (const id of ['routingList', 'componentsList', 'bridgesList']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-live="off"`));
  }

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'inspector script must be present');

  const changes = [];
  const badge = {
    set textContent(value) { changes.push(value); },
    set className(value) { this._className = value; },
  };
  const fields = new Map([['statusBadge', badge]]);
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (!fields.has(id)) fields.set(id, { textContent: '' });
        return fields.get(id);
      },
    },
    window: {},
    BroadcastChannel: class { postMessage() {} },
    setInterval() {},
    Date,
  });

  vm.runInContext(script, context);
  assert.deepStrictEqual(changes, ['○ Disconnected']);
  vm.runInContext('updateStatus(false); updateStatus(true); updateStatus(true); updateStatus(false)', context);
  assert.deepStrictEqual(changes, ['○ Disconnected', '● Connected', '○ Disconnected']);
}

async function main() {
  try {
    testScriptBreakoutIsNeutralised();
    testEscapedJsonParsesBackToSameObject();
    testUnicodeLineTerminatorsAreEscaped();
    testOrdinaryConfigRendersUnchanged();
    testConnectionStatusOnlyAnnouncesTransitions();
    console.log('Inspector inline-script escaping tests passed!');
  } catch (error) {
    console.error('Inspector inline-script escaping tests failed!');
    console.error(error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
