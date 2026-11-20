import test from 'node:test';
import assert from 'node:assert/strict';
import { baseUrlFor, readConfig, sourceName } from '../src/config.js';

test('readConfig builds Craft 5 and 6 by default', () => {
  const config = readConfig({});
  assert.deepEqual(config.majors, ['5', '6']);
  assert.equal(baseUrlFor(config, '6'), 'https://craftcms.com/docs/6.x/');
});

test('readConfig rejects a BASE_URL without a major placeholder', () => {
  assert.throws(
    () => readConfig({ BASE_URL: 'https://craftcms.com/docs/5.x/' }),
    /\{major\} placeholder/,
  );
});

test('readConfig rejects invalid majors', () => {
  assert.throws(() => readConfig({ MAJORS: '5,x' }), /MAJORS/);
});

test('sourceName names GitHub repositories by owner and name', () => {
  assert.equal(sourceName('https://github.com/craftcms/docs'), 'craftcms/docs');
  assert.equal(sourceName('git@github.com:craftcms/docs.git'), 'craftcms/docs');
  assert.equal(sourceName('file:///tmp/docs'), 'file:///tmp/docs');
});
