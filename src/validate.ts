import fs from 'node:fs/promises';
import path from 'node:path';

export type ValidationResult = {
  majors: { major: string; pages: number; revision: string }[];
  errors: string[];
};

const LIST_HEADER_RE =
  /^# Craft CMS Documentation Index\nLast updated: \S+ \(commit [0-9a-f]+\)\n\n## /;
const LIST_ENTRY_RE = /^- \[.+?\]\(https:\/\/\S+\)(?: — .*)?$/;
const FULL_HEADER_RE =
  /^# Craft CMS Documentation\nCraft CMS \d+\.x documentation .+\nLast updated: \S+ \(commit [0-9a-f]+\)\n\n---\n# /;

/**
 * Checks a build output directory against the docs index contract: every
 * `{major}/index.json` is well formed, paths are unique, every page exists
 * under `{major}/pages/{path}`, and `llms.txt` and `llms-full.txt` keep their format.
 */
export async function validateOutput(
  outputDir: string,
  majors: string[],
): Promise<ValidationResult> {
  const result: ValidationResult = { majors: [], errors: [] };
  for (const major of majors) {
    await validateMajor(path.resolve(outputDir), major, result);
  }
  return result;
}

async function validateMajor(
  outputDir: string,
  major: string,
  result: ValidationResult,
): Promise<void> {
  const majorDir = path.join(outputDir, major);
  const fail = (message: string) => result.errors.push(`${major}: ${message}`);

  let index: unknown;
  try {
    index = JSON.parse(await fs.readFile(path.join(majorDir, 'index.json'), 'utf8'));
  } catch (error) {
    fail(`cannot read index.json: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!isRecord(index)) {
    fail('index.json is not an object');
    return;
  }

  if (index.major !== major) fail(`major is ${JSON.stringify(index.major)}, expected "${major}"`);
  if (typeof index.source !== 'string' || !index.source) fail('source is missing');
  const revision = typeof index.revision === 'string' ? index.revision : '';
  if (!/^[0-9a-f]{40}$/.test(revision)) fail(`revision is not a full commit SHA: ${revision}`);
  if (
    typeof index.generated_at !== 'string' ||
    Number.isNaN(Date.parse(index.generated_at)) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(index.generated_at)
  ) {
    fail('generated_at is not an ISO 8601 date');
  }
  if (!Array.isArray(index.pages) || index.pages.length === 0) {
    fail('pages is empty');
    return;
  }

  const seen = new Set<string>();
  for (const [position, page] of index.pages.entries()) {
    if (!isRecord(page)) {
      fail(`pages[${position}] is not an object`);
      continue;
    }
    const pagePath = typeof page.path === 'string' ? page.path : '';
    const label = pagePath || `pages[${position}]`;
    if (!pagePath.startsWith(`docs/${major}.x/`) || !pagePath.endsWith('.md')) {
      fail(`${label}: path must start with docs/${major}.x/ and end with .md`);
    }
    if (pagePath.split('/').includes('..')) fail(`${label}: path must not contain ..`);
    if (seen.has(pagePath)) fail(`${label}: duplicate path`);
    seen.add(pagePath);
    if (typeof page.title !== 'string' || !page.title) fail(`${label}: title is missing`);
    if (typeof page.url !== 'string' || !page.url.startsWith('https://')) {
      fail(`${label}: url is not an https URL`);
    }
    if (!Array.isArray(page.headings) || page.headings.some((h) => typeof h !== 'string')) {
      fail(`${label}: headings must be a list of strings`);
    }
    if (pagePath && !(await isFile(path.join(majorDir, 'pages', pagePath)))) {
      fail(`${label}: page file ${major}/pages/${pagePath} does not exist`);
    }
  }

  const list = await readOptional(path.join(majorDir, 'llms.txt'));
  if (list === null) {
    fail('llms.txt is missing');
  } else {
    if (!LIST_HEADER_RE.test(list)) fail('llms.txt header does not match the llms.txt format');
    const entries = list.split('\n').filter((line) => line.startsWith('- '));
    if (entries.length !== index.pages.length) {
      fail(`llms.txt lists ${entries.length} pages, index.json ${index.pages.length}`);
    }
    const malformed = entries.filter((line) => !LIST_ENTRY_RE.test(line));
    if (malformed.length > 0) fail(`llms.txt has malformed entries: ${malformed[0]}`);
  }

  const full = await readOptional(path.join(majorDir, 'llms-full.txt'));
  if (full === null) {
    fail('llms-full.txt is missing');
  } else if (!FULL_HEADER_RE.test(full)) {
    fail('llms-full.txt header does not match the llms-full.txt format');
  }

  result.majors.push({ major, pages: index.pages.length, revision });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}
