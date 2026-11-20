#!/usr/bin/env node
import { build } from './build.js';
import { readConfig } from './config.js';
import { validateOutput } from './validate.js';

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'build') {
  run(async () => {
    const config = readConfig();
    const result = await build(config);
    console.log(`Docs revision: ${result.revision}`);
    for (const major of result.majors) {
      console.log(`Craft ${major.major}: ${major.totalPages} pages in ${major.dir}`);
    }
  });
} else if (command === 'validate') {
  run(async () => {
    const config = readConfig();
    const outputDir = args[1] ?? config.outputDir;
    const result = await validateOutput(outputDir, config.majors);
    for (const major of result.majors) {
      console.log(`Craft ${major.major}: ${major.pages} pages at ${major.revision}`);
    }
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(error);
      }
      throw new Error(`${result.errors.length} problem(s) in ${outputDir}`);
    }
    console.log(`${outputDir} is valid.`);
  });
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

function run(task: () => Promise<void>): void {
  task().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${command} failed: ${message}`);
    process.exit(1);
  });
}

function printHelp(): void {
  console.log(`craft-llms <command>

Commands:
  build              Build the docs index for each Craft major into OUTPUT_DIR:
                     {major}/index.json, {major}/pages/, {major}/llms.txt, {major}/llms-full.txt
  validate [dir]     Check a build output against the index contract (default: OUTPUT_DIR)

Environment variables:
  OUTPUT_DIR   Output directory (default: public)
  MAJORS       Craft majors to build (default: 5,6)
  BASE_URL     Docs URL per major, with a {major} placeholder (default: https://craftcms.com/docs/{major}.x/)
  DOCS_REPO    Docs repository (default: https://github.com/craftcms/docs)
  DOCS_DIR     Local clone directory (default: .cache/craftcms-docs)`);
}
