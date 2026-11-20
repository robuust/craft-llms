import test from 'node:test';
import assert from 'node:assert/strict';
import { docPathToUrl, extractTitle, normalizeLinks, stripFrontmatter } from '../src/markdown.js';

test('docPathToUrl maps markdown to html', () => {
  const baseUrl = 'https://craftcms.com/docs/5.x/';
  assert.equal(
    docPathToUrl('system/updates.md', baseUrl),
    'https://craftcms.com/docs/5.x/system/updates.html',
  );
  assert.equal(
    docPathToUrl('guides/README.md', baseUrl),
    'https://craftcms.com/docs/5.x/guides/index.html',
  );
  assert.equal(docPathToUrl('index.md', baseUrl), 'https://craftcms.com/docs/5.x/index.html');
});

test('extractTitle returns first H1', () => {
  const input = ['---', 'title: Ignored', '---', '', '# Real Title', '', 'Content'].join('\n');
  const stripped = stripFrontmatter(input);
  assert.equal(extractTitle(stripped, 'fallback'), 'Real Title');
});

test('stripFrontmatter removes yaml block', () => {
  const input = ['---', 'title: Example', 'description: Test', '---', '', 'Body'].join('\n');
  const output = stripFrontmatter(input);
  assert.equal(output.trim(), 'Body');
});

test('normalizeLinks resolves relative links against the version URL', () => {
  const output = normalizeLinks(
    'See [tags](../reference/twig/tags.md#cache) and [up](../../4.x/x.md).',
    {
      baseUrl: 'https://craftcms.com/docs/5.x/',
      currentFilePath: 'development/templates.md',
    },
  );
  assert.equal(
    output,
    'See [tags](https://craftcms.com/docs/5.x/reference/twig/tags.html#cache) and [up](https://craftcms.com/docs/4.x/x.html).',
  );
});

test('normalizeLinks resolves root links against the docs root', () => {
  const output = normalizeLinks(
    '[a](/5.x/install.md) [b](/commerce/5.x/README.md) [c](/docs/5.x/update.md)',
    { baseUrl: 'https://craftcms.com/docs/6.x/', currentFilePath: 'README.md' },
  );
  assert.equal(
    output,
    '[a](https://craftcms.com/docs/5.x/install.html) [b](https://craftcms.com/docs/commerce/5.x/index.html) [c](https://craftcms.com/docs/5.x/update.html)',
  );
});
