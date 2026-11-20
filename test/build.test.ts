import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type DocsIndex } from '../src/build.js';
import { readConfig } from '../src/config.js';
import { validateOutput } from '../src/validate.js';

const FIXTURE: Record<string, string> = {
  'docs/5.x/README.md': '---\ndescription: Home\n---\n\n# About Craft\n\nCraft is a CMS.\n',
  'docs/5.x/reference/twig/tags.md': [
    '# Tags',
    '',
    'Twig tags in Craft.',
    '',
    '## `cache` <Since ver="5.1.0" feature="Cache tag" />',
    '',
    '```twig',
    '## not a heading',
    '```',
    '',
    '### Parameters {#cache-params}',
    '',
    'See [install](../../install.md) and [Commerce](/commerce/5.x/README.md).',
    '',
  ].join('\n'),
  'docs/5.x/install.md': '# Installation\n\nInstall Craft.\n\n!!!include(docs/5.x/_shared.md)!!!\n',
  'docs/5.x/_shared.md': '## Shared Step\n\nShared text.\n',
  'docs/5.x/system/install.md': '# Installation\n\nA second page with the same title.\n',
  'docs/6.x/README.md': '# About Craft 6\n\nBeta docs.\n\n## Upgrade\n',
};

async function makeDocsRepo(root: string): Promise<string> {
  const repo = path.join(root, 'docs-repo');
  for (const [file, contents] of Object.entries(FIXTURE)) {
    await fs.mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await fs.writeFile(path.join(repo, file), contents);
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'docs');
  return repo;
}

async function buildFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'craft-llms-'));
  const repo = await makeDocsRepo(root);
  const revision = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD']).toString().trim();
  const config = readConfig({
    OUTPUT_DIR: path.join(root, 'out'),
    DOCS_REPO: pathToFileURL(repo).toString(),
    DOCS_DIR: path.join(root, 'clone'),
  });
  const result = await build(config, new Date('2026-11-20T12:00:00Z'));
  const readIndex = async (major: string): Promise<DocsIndex> =>
    JSON.parse(await fs.readFile(path.join(root, 'out', major, 'index.json'), 'utf8'));
  return { root, out: path.join(root, 'out'), revision, result, readIndex };
}

test('build writes a versioned index for each major', async () => {
  const { out, revision, result, readIndex } = await buildFixture();
  assert.deepEqual(
    result.majors.map((major) => [major.major, major.totalPages]),
    [
      ['5', 5],
      ['6', 1],
    ],
  );

  const index = await readIndex('5');
  assert.equal(index.major, '5');
  assert.equal(index.revision, revision);
  assert.equal(index.generated_at, '2026-11-20T12:00:00.000Z');
  assert.deepEqual(
    index.pages.map((page) => page.path),
    [
      'docs/5.x/README.md',
      'docs/5.x/_shared.md',
      'docs/5.x/install.md',
      'docs/5.x/reference/twig/tags.md',
      'docs/5.x/system/install.md',
    ],
  );

  const tags = index.pages.find((page) => page.path === 'docs/5.x/reference/twig/tags.md');
  assert.deepEqual(tags, {
    path: 'docs/5.x/reference/twig/tags.md',
    title: 'Tags',
    url: 'https://craftcms.com/docs/5.x/reference/twig/tags.html',
    headings: ['cache', 'Parameters'],
  });

  const install = index.pages.find((page) => page.path === 'docs/5.x/install.md');
  assert.deepEqual(install?.headings, ['Shared Step']);

  const page = await fs.readFile(path.join(out, '5/pages/docs/5.x/reference/twig/tags.md'), 'utf8');
  assert.match(page, /^# Tags\n\nTwig tags in Craft\./);
  assert.match(page, /\[install\]\(https:\/\/craftcms\.com\/docs\/5\.x\/install\.html\)/);
  assert.match(page, /\[Commerce\]\(https:\/\/craftcms\.com\/docs\/commerce\/5\.x\/index\.html\)/);

  const six = await readIndex('6');
  assert.equal(six.pages[0].url, 'https://craftcms.com/docs/6.x/index.html');
  assert.deepEqual(six.pages[0].headings, ['Upgrade']);
});

test('pages with the same title stay apart by path', async () => {
  const { readIndex } = await buildFixture();
  const index = await readIndex('5');
  const installs = index.pages.filter((page) => page.title === 'Installation');
  assert.deepEqual(
    installs.map((page) => page.path),
    ['docs/5.x/install.md', 'docs/5.x/system/install.md'],
  );
  assert.notEqual(installs[0].url, installs[1].url);
});

test('llms.txt and llms-full.txt keep their format', async () => {
  const { out } = await buildFixture();
  const list = await fs.readFile(path.join(out, '5/llms.txt'), 'utf8');
  assert.match(
    list,
    /^# Craft CMS Documentation Index\nLast updated: \S+ \(commit [0-9a-f]+\)\n\n/,
  );
  assert.match(
    list,
    /\n## reference\n- \[Tags\]\(https:\/\/craftcms\.com\/docs\/5\.x\/reference\/twig\/tags\.html\) — Twig tags in Craft\.\n/,
  );
  const full = await fs.readFile(path.join(out, '5/llms-full.txt'), 'utf8');
  assert.match(full, /^# Craft CMS Documentation\nCraft CMS 5\.x documentation covering /);
  assert.match(full, /\n---\n# Tags\n/);
});

test('validate accepts a build and reports a missing page', async () => {
  const { out } = await buildFixture();
  const valid = await validateOutput(out, ['5', '6']);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.majors.length, 2);

  await fs.rm(path.join(out, '5/pages/docs/5.x/install.md'));
  const invalid = await validateOutput(out, ['5', '6']);
  assert.deepEqual(invalid.errors, [
    '5: docs/5.x/install.md: page file 5/pages/docs/5.x/install.md does not exist',
  ]);
});

test('validate reports duplicate paths and a missing major', async () => {
  const { out, readIndex } = await buildFixture();
  const index = await readIndex('5');
  index.pages.push(index.pages[0]);
  await fs.writeFile(path.join(out, '5/index.json'), JSON.stringify(index));
  const result = await validateOutput(out, ['5', '7']);
  assert.ok(result.errors.includes('5: docs/5.x/README.md: duplicate path'));
  assert.ok(result.errors.some((error) => error.startsWith('7: cannot read index.json')));
});

test('a rebuild removes pages that left the docs', async () => {
  const { root, out } = await buildFixture();
  const stale = path.join(out, '5/pages/docs/5.x/removed.md');
  await fs.writeFile(stale, '# Removed\n');
  await build(
    readConfig({
      OUTPUT_DIR: out,
      DOCS_REPO: pathToFileURL(path.join(root, 'docs-repo')).toString(),
      DOCS_DIR: path.join(root, 'clone'),
      MAJORS: '5',
    }),
  );
  await assert.rejects(fs.access(stale));
});
