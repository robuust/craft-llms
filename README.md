# craft-llms

Minimal Node.js TypeScript CLI that builds a versioned, LLM-friendly index of the Craft CMS documentation from [`craftcms/docs`](https://github.com/craftcms/docs). Craft publishes no official `llms.txt`, so this repository maintains one per Craft major.

## Requirements

- Node.js >= 20
- Git

## Setup

```bash
npm install
npm run build
```

## Usage

```bash
node dist/src/cli.js build      # build every major into OUTPUT_DIR
node dist/src/cli.js validate   # check OUTPUT_DIR against the index contract
```

`build` clones or updates `craftcms/docs` and writes one folder per Craft major (`5` and `6` by default):

| File                    | Contents                                                          |
| ----------------------- | ----------------------------------------------------------------- |
| `{major}/index.json`    | The page index, described below.                                  |
| `{major}/pages/{path}`  | Each page as cleaned Markdown, at its source path from the index. |
| `{major}/llms.txt`      | Pages grouped by section, with title, URL and summary.            |
| `{major}/llms-full.txt` | All pages concatenated.                                           |

A rebuild replaces each major's folder, so pages removed from the docs disappear.

`validate` exits non-zero when an index is malformed, a path repeats, a referenced page is missing, or `llms.txt` or `llms-full.txt` lost its format.

## Index contract

```json
{
  "major": "5",
  "source": "craftcms/docs",
  "revision": "<full commit sha of craftcms/docs>",
  "generated_at": "<ISO 8601 build time>",
  "pages": [
    {
      "path": "docs/5.x/reference/twig/tags.md",
      "title": "Tags",
      "url": "https://craftcms.com/docs/5.x/reference/twig/tags.html",
      "headings": ["cache", "Parameters", "..."]
    }
  ]
}
```

- Pages are keyed by `path`, the source path relative to the `craftcms/docs` root, which is unique and sorted. Titles may repeat: Craft 5 has two pages titled `Tags`.
- A page's Markdown is at `{major}/pages/{path}`, for example `5/pages/docs/5.x/reference/twig/tags.md`. Frontmatter and VuePress directives are removed, includes are expanded and links are absolute.
- `headings` lists the page's H2 and H3 headings as plain text.
- `{major}/llms.txt` and `{major}/llms-full.txt` keep the format of the earlier root `llms.txt` and `llms-full.txt`, including the `Last updated: <date> (commit <short sha>)` line.

## Where the index is served

The [Docs index](.github/workflows/index.yml) workflow builds the index every Monday and on demand (**Actions → Docs index → Run workflow**). It runs the linter and tests, builds into a temporary folder and commits the result to the `index` branch, which holds only the build output. A run that would change only `generated_at` makes no commit.

Read the index from the branch:

```text
https://raw.githubusercontent.com/robuust/craft-llms/index/5/index.json
https://raw.githubusercontent.com/robuust/craft-llms/index/5/pages/docs/5.x/install.md
```

`robuust/boost` uses `https://raw.githubusercontent.com/robuust/craft-llms/index` as its default docs base URL. GitHub Pages (`https://robuust.github.io/craft-llms/`) can serve the same tree later; switching needs an organization owner to enable Pages.

To publish by hand, build and run the publish script. It validates the output first, and `PUBLISH_DRY_RUN=1` commits in a temporary worktree without pushing:

```bash
npm run build
OUTPUT_DIR=public node dist/src/cli.js build
scripts/publish-index.sh public index
```

The Netlify site still builds `public/` and rewrites the legacy `/llms.txt` and `/llms-full.txt` URLs to the Craft 5 files.

## Configuration

Environment variables (defaults shown):

- `OUTPUT_DIR=public`
- `MAJORS=5,6`
- `BASE_URL=https://craftcms.com/docs/{major}.x/` (must contain `{major}`)
- `DOCS_REPO=https://github.com/craftcms/docs`
- `DOCS_DIR=.cache/craftcms-docs`

`scripts/publish-index.sh` also reads `PUBLISH_REMOTE` (default `origin`) and `PUBLISH_DRY_RUN`.

## Scheduler examples

- GitHub Actions: `.github/workflows/index.yml` (the `index` branch).
- Netlify scheduled function: `examples/netlify/functions/llms-build-schedule.js` (uses `BUILD_HOOK_URL`).
- Render cron job command:

```bash
node dist/src/cli.js build
```

## Scripts

- `npm run build` - compile TypeScript
- `npm run index` - build the docs index (after `npm run build`)
- `npm run index:validate` - validate the docs index
- `npm run lint` - run ESLint
- `npm run format` - run Prettier
- `npm test` - run tests
