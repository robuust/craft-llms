export type BuildConfig = {
  /** Directory that receives one folder per Craft major. */
  outputDir: string;
  /** Docs URL per major; `{major}` is replaced by the major, such as `5`. */
  baseUrl: string;
  docsRepo: string;
  docsDir: string;
  /** Craft majors to build, such as `['5', '6']`. */
  majors: string[];
};

const DEFAULTS = {
  outputDir: 'public',
  baseUrl: 'https://craftcms.com/docs/{major}.x/',
  docsRepo: 'https://github.com/craftcms/docs',
  docsDir: '.cache/craftcms-docs',
  majors: '5,6',
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): BuildConfig {
  const baseUrl = env.BASE_URL || DEFAULTS.baseUrl;
  if (!baseUrl.includes('{major}')) {
    throw new Error(`BASE_URL must contain a {major} placeholder, got ${baseUrl}`);
  }

  const majors = (env.MAJORS || DEFAULTS.majors)
    .split(',')
    .map((major) => major.trim())
    .filter(Boolean);
  const invalid = majors.filter((major) => !/^\d+$/.test(major));
  if (majors.length === 0 || invalid.length > 0) {
    throw new Error(`MAJORS must be a comma-separated list of numbers, got ${env.MAJORS}`);
  }

  return {
    outputDir: env.OUTPUT_DIR || DEFAULTS.outputDir,
    baseUrl,
    docsRepo: env.DOCS_REPO || DEFAULTS.docsRepo,
    docsDir: env.DOCS_DIR || DEFAULTS.docsDir,
    majors: Array.from(new Set(majors)),
  };
}

export function baseUrlFor(config: Pick<BuildConfig, 'baseUrl'>, major: string): string {
  const url = config.baseUrl.replaceAll('{major}', major);
  return url.endsWith('/') ? url : `${url}/`;
}

/** Names the docs source as `owner/repo` for GitHub URLs, or returns the URL as given. */
export function sourceName(docsRepo: string): string {
  const match = docsRepo.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  return match ? match[1] : docsRepo;
}
