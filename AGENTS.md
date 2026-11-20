# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

craft-llms is a CLI tool that generates a versioned, LLM-friendly docs index from the Craft CMS docs repository. It clones/updates the craftcms/docs repo, processes the markdown files, and writes one folder per Craft major (`5` and `6` by default) into `public/`:

- `{major}/index.json` - Page index keyed by source path, with the docs revision (contract in README.md)
- `{major}/pages/{path}` - Each page as cleaned Markdown
- `{major}/llms-full.txt` - Full concatenated documentation with all pages
- `{major}/llms.txt` - Index of all pages with titles, URLs, and summaries

Netlify builds and serves the output. Keep the `index.json` shape and the `llms.txt` format stable: `robuust/boost` and the legacy MCP read them.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run build:watch    # Watch mode compilation
npm run lint           # ESLint with zero warnings allowed
npm run format         # Format with Prettier
npm run format:check   # Check formatting
npm run test           # Build then run tests with Node test runner
```

Run a single test:

```bash
npm run build && node --test dist/test/markdown.test.js
```

Run the CLI locally:

```bash
node dist/src/cli.js build
node dist/src/cli.js validate
```

## Architecture

The tool follows a pipeline architecture:

1. **CLI Entry** (`src/cli.ts`) - Parses the `build` and `validate` commands, reads config from environment
2. **Config** (`src/config.ts`) - Reads `OUTPUT_DIR`, `MAJORS`, `BASE_URL` (with a `{major}` placeholder), `DOCS_REPO`, `DOCS_DIR` from env with defaults
3. **Git** (`src/git.ts`) - Clones/pulls the docs repo to `.cache/craftcms-docs` and reads its revision
4. **Build** (`src/build.ts`) - Orchestrates the build per major: collects markdown files, processes each, writes the index, pages and llms files
5. **Validate** (`src/validate.ts`) - Checks build output against the index contract
6. **Markdown** (`src/markdown.ts`) - Core processing functions:
   - `expandIncludeDirectives` - Resolves `!!!include(path)!!!` directives recursively
   - `stripFrontmatter`, `stripVuePressDirectives` - Clean VuePress-specific syntax
   - `normalizeLinks` - Converts relative `.md` links to absolute URLs; root links resolve against the docs root
   - `extractTitle`, `extractSummary`, `extractHeadings` - Parse page metadata

The docs are sourced from `docs/{major}.x/` (or `docs/docs/{major}.x/`) within the cloned repo.

## Key Patterns

- Uses Node.js built-in test runner (`node:test`)
- ESM modules with `.js` extensions in imports (TypeScript compiles to ESM)
- Tests import from compiled `dist/` directory
- Component tags (VuePress custom components) are handled by tag name sets in `markdown.ts`: `INLINE_COMPONENT_TAGS`, `DROP_COMPONENT_TAGS`, `STANDARD_HTML_TAGS`
