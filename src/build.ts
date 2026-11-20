import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDocsRepo, getRepoMeta, type RepoMeta } from './git.js';
import {
  docPathToUrl,
  expandIncludeDirectives,
  extractHeadings,
  extractSummary,
  extractTitle,
  normalizeLinks,
  stripFrontmatter,
  stripLeadingH1,
  stripVuePressDirectives,
} from './markdown.js';
import { baseUrlFor, sourceName, type BuildConfig } from './config.js';

export type IndexPage = {
  /** Source path relative to the docs repository root, such as `docs/5.x/install.md`. */
  path: string;
  title: string;
  url: string;
  headings: string[];
};

export type DocsIndex = {
  major: string;
  source: string;
  revision: string;
  generated_at: string;
  pages: IndexPage[];
};

export type MajorResult = {
  major: string;
  dir: string;
  totalPages: number;
};

export type BuildResult = {
  outputDir: string;
  revision: string;
  majors: MajorResult[];
};

type ListEntry = {
  title: string;
  url: string;
  summary: string;
  relPath: string;
};

export async function build(config: BuildConfig, now: Date = new Date()): Promise<BuildResult> {
  const docsRepoDir = path.resolve(config.docsDir);
  const outputDir = path.resolve(config.outputDir);

  await ensureDocsRepo(docsRepoDir, config.docsRepo);
  const meta = await getRepoMeta(docsRepoDir);
  const generatedAt = now.toISOString();
  const source = sourceName(config.docsRepo);

  const majors: MajorResult[] = [];
  for (const major of config.majors) {
    majors.push(
      await buildMajor({
        major,
        docsRepoDir,
        outputDir,
        baseUrl: baseUrlFor(config, major),
        meta,
        source,
        generatedAt,
      }),
    );
  }

  return { outputDir, revision: meta.revision, majors };
}

async function buildMajor(options: {
  major: string;
  docsRepoDir: string;
  outputDir: string;
  baseUrl: string;
  meta: RepoMeta;
  source: string;
  generatedAt: string;
}): Promise<MajorResult> {
  const { major, docsRepoDir, baseUrl, meta } = options;
  const docsRoot = await resolveDocsRoot([
    path.join(docsRepoDir, 'docs', `${major}.x`),
    path.join(docsRepoDir, 'docs', 'docs', `${major}.x`),
  ]);
  const files = await collectMarkdownFiles(docsRoot);
  if (files.length === 0) {
    throw new Error(`No Markdown pages found in ${docsRoot}`);
  }

  const majorDir = path.join(options.outputDir, major);
  await fs.rm(majorDir, { recursive: true, force: true });
  await fs.mkdir(majorDir, { recursive: true });

  const pageChunks: string[] = [];
  const listGroups = new Map<string, ListEntry[]>();
  const pages: IndexPage[] = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const withoutFrontmatter = stripFrontmatter(raw);
    const expanded = await expandIncludeDirectives(withoutFrontmatter, {
      repoRoot: docsRepoDir,
      currentFilePath: filePath,
    });
    const cleaned = stripVuePressDirectives(expanded);

    const relPath = toPosixPath(path.relative(docsRoot, filePath));
    const repoPath = toPosixPath(path.relative(docsRepoDir, filePath));
    const fallbackTitle = path.basename(filePath, path.extname(filePath));
    const title = extractTitle(cleaned, fallbackTitle);

    const contentWithoutTitle = stripLeadingH1(cleaned);
    const normalizedContent = normalizeLinks(contentWithoutTitle, {
      baseUrl,
      currentFilePath: relPath,
    }).trimEnd();

    pageChunks.push('---', `# ${title}`, normalizedContent, '');

    const url = docPathToUrl(relPath, baseUrl);
    pages.push({ path: repoPath, title, url, headings: extractHeadings(expanded) });
    await writeFile(
      path.join(majorDir, 'pages', repoPath),
      `# ${title}\n\n${normalizedContent.trimStart()}\n`,
    );

    const summary = extractSummary(contentWithoutTitle);
    const group = relPath.includes('/') ? relPath.split('/')[0] : 'root';
    const entries = listGroups.get(group) ?? [];
    entries.push({ title, url, summary, relPath });
    listGroups.set(group, entries);
  }

  pages.sort((a, b) => compare(a.path, b.path));
  const index: DocsIndex = {
    major,
    source: options.source,
    revision: meta.revision,
    generated_at: options.generatedAt,
    pages,
  };
  await writeFile(path.join(majorDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(path.join(majorDir, 'llms-full.txt'), renderFullText(major, meta, pageChunks));
  await writeFile(path.join(majorDir, 'llms.txt'), renderListText(meta, listGroups));

  return { major, dir: majorDir, totalPages: pages.length };
}

function renderFullText(major: string, meta: RepoMeta, pageChunks: string[]): string {
  const headerLines = [
    '# Craft CMS Documentation',
    `Craft CMS ${major}.x documentation covering installation, configuration, templating, and extension points.`,
    `Last updated: ${meta.timestamp} (commit ${meta.commit})`,
    '',
  ];
  return `${headerLines.join('\n')}\n${pageChunks.join('\n').trimEnd()}\n`;
}

function renderListText(meta: RepoMeta, groups: Map<string, ListEntry[]>): string {
  const lines: string[] = [];
  lines.push('# Craft CMS Documentation Index');
  lines.push(`Last updated: ${meta.timestamp} (commit ${meta.commit})`, '');

  const sortedGroups = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  for (const group of sortedGroups) {
    lines.push(`## ${group}`);
    const entries = groups.get(group) ?? [];
    entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
    for (const entry of entries) {
      const summary = entry.summary ? ` — ${entry.summary}` : '';
      lines.push(`- [${entry.title}](${entry.url})${summary}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

async function writeFile(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

async function resolveDocsRoot(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(`Docs path not found. Checked: ${candidates.join(', ')}`);
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const mdFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const file of mdFiles) {
    files.push(path.join(rootDir, file.name));
  }

  for (const dir of dirs) {
    const childPath = path.join(rootDir, dir.name);
    const childFiles = await collectMarkdownFiles(childPath);
    files.push(...childFiles);
  }

  return files;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
