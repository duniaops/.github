import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export function declarations(files) {
  const found = [];
  for (const [path, content] of Object.entries(files)) {
    if (['.nvmrc', '.node-version'].includes(basename(path))) {
      found.push({ path, value: content.trim() });
    } else if (basename(path).startsWith('Dockerfile')) {
      for (const match of content.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?(?:docker\.io\/(?:library\/)?)?node:([^\s@]+)/gim)) {
        found.push({ path, value: match[1] });
      }
    } else if (basename(path) === 'netlify.toml') {
      for (const match of content.matchAll(/^\s*NODE_VERSION\s*=\s*["']([^"']+)["']/gm)) {
        found.push({ path, value: match[1] });
      }
    } else if (path.startsWith('.github/workflows/')) {
      for (const match of content.matchAll(/^\s*node-version:\s*["']?([^\s"'#]+)["']?/gm)) {
        found.push({ path, value: match[1] });
      }
    }
  }
  return found;
}

function version(value) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:$|[-@])/.exec(value);
  return match && match.slice(1).map((part) => part === undefined ? null : Number(part));
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function assess(files, releases, schedule, today) {
  if (!Array.isArray(releases) || !releases.length || !schedule || !schedule.v24) {
    throw new Error('Official Node release/support data is missing or malformed.');
  }
  const security = new Map();
  for (const release of releases) {
    const parsed = version(release.version);
    if (!parsed || parsed.includes(null) || !release.security) continue;
    const previous = security.get(parsed[0]);
    if (!previous || compare(parsed, previous) > 0) security.set(parsed[0], parsed);
  }
  const errors = [];
  const warnings = [];
  const entries = declarations(files);
  const rootPin = entries.find((entry) => entry.path === '.nvmrc' || entry.path === '.node-version');
  const anchor = rootPin && version(rootPin.value);
  for (const entry of entries) {
    const parsed = version(entry.value);
    const label = `${entry.path}: ${entry.value}`;
    if (!parsed) {
      // Matrix/expression values need an explicit version file to be auditable.
      warnings.push(`${label}: dynamic selector; verify its source and actual runtime.`);
      continue;
    }
    const support = schedule[`v${parsed[0]}`];
    if (!support?.end || support.end <= today) {
      errors.push(`${label}: Node ${parsed[0]} is unsupported as of ${today}.`);
      continue;
    }
    if (anchor && parsed[0] !== anchor[0]) {
      errors.push(`${label}: major differs from ${rootPin.path} (${rootPin.value}).`);
    }
    if (parsed.includes(null)) {
      const minimum = security.get(parsed[0]);
      if (minimum && parsed[1] !== null && parsed[1] < minimum[1]) {
        errors.push(`${label}: this fixed minor line is below ${minimum.join('.')}.`);
      }
      warnings.push(`${label}: floating selector; rebuild and verify the installed patch.`);
      continue;
    }
    const minimum = security.get(parsed[0]);
    if (!minimum) throw new Error(`No security release baseline found for Node ${parsed[0]}.`);
    if (compare(parsed, minimum) < 0) {
      errors.push(`${label}: use at least ${minimum.join('.')} for this release line.`);
    }
    if (anchor && !anchor.includes(null) && compare(parsed, anchor) !== 0) {
      errors.push(`${label}: exact version differs from ${rootPin.path} (${rootPin.value}).`);
    }
  }
  return { entries, errors, warnings };
}

async function officialJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}: ${url}`);
  return response.json();
}

async function main() {
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = {};
  for (const path of paths) {
    const name = basename(path);
    if (['.nvmrc', '.node-version', 'netlify.toml'].includes(name) || name.startsWith('Dockerfile') ||
        (path.startsWith('.github/workflows/') && /\.ya?ml$/.test(path))) {
      files[path] = readFileSync(path, 'utf8');
    }
  }
  const [releases, schedule] = await Promise.all([
    officialJson('https://nodejs.org/dist/index.json'),
    officialJson('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json'),
  ]);
  const result = assess(files, releases, schedule, new Date().toISOString().slice(0, 10));
  for (const entry of result.entries) console.log(`CHECK ${entry.path}: ${entry.value}`);
  for (const warning of result.warnings) console.warn(`WARNING ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.log(`${result.entries.length} Node declarations; ${result.errors.length} errors; ${result.warnings.length} warnings.`);
  if (!result.entries.length) console.log('No Node declarations detected; no Node runtime is covered by this check.');
  process.exitCode = result.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
