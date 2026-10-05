import fs from 'fs';
import path from 'path';

// How long a cached registry is trusted before the next call rescans it.
// The components directory's own mtime catches components added or removed
// directly inside it right away, but not a file appearing in a nested folder
// (src/components/<name>/<name>.component.js), so this bounds that staleness
// without registering a watcher in someone else's lint process.
const DEFAULT_REGISTRY_MAX_AGE_MS = 2000;

/** @type {Map<string, { names: Set<string>, mtimeMs: number, scannedAt: number }>} */
const registryCache = new Map();

/**
 * Clears the cached component registries. Mostly useful in tests, since the
 * cache is module state shared across the whole process.
 */
export function clearRegistryCache() {
  registryCache.clear();
}

/**
 * Returns the mtime of a directory, or -1 when it does not exist.
 * @param {string} directory
 * @returns {number}
 */
function directoryMtimeMs(directory) {
  try {
    return fs.statSync(directory).mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * Converts an Avenx component filename into its canonical PascalCase name.
 * @param {string} fileName
 * @returns {string}
 */
export function componentNameFromFile(fileName) {
  const baseName = String(fileName)
    .replace(/^.*[/\\]/, '')
    .replace(/\.component\.js$/i, '');
  return baseName
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Finds components registered by the Avenx compiler.
 * Avenx registers components by scanning src/components for
 * .component.js files and normalizing their filenames.
 *
 * Results are cached per directory. The cache is rescanned when the
 * components directory's mtime changes (a component added or removed directly
 * inside it) or when the entry is older than `maxAgeMs`. A component added in
 * a nested folder that already existed only changes that folder's mtime, so it
 * shows up once the entry expires, at most `maxAgeMs` later.
 * @param {string} projectRoot
 * @param {string} [componentsDir]
 * @param {{ maxAgeMs?: number }} [options]
 * @returns {Set<string>}
 */
export function findRegisteredComponents(
  projectRoot,
  componentsDir = 'src/components',
  { maxAgeMs = DEFAULT_REGISTRY_MAX_AGE_MS } = {},
) {
  const root = path.resolve(projectRoot);
  const directory = path.resolve(root, componentsDir);
  const cacheKey = directory;
  const mtimeMs = directoryMtimeMs(directory);
  const now = Date.now();

  const cached = registryCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtimeMs && now - cached.scannedAt < maxAgeMs) {
    return new Set(cached.names);
  }

  const names = new Set();

  const visit = (currentDir) => {
    if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
      return;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.component.js')) {
        names.add(componentNameFromFile(entry.name));
      }
    }
  };

  visit(directory);

  registryCache.set(cacheKey, { names: new Set(names), mtimeMs, scannedAt: now });
  return new Set(names);
}

/**
 * Resolves the configured Avenx components directory.
 * @param {string} projectRoot
 * @param {string} [componentsDir]
 * @returns {string}
 */
export function resolveComponentsDir(projectRoot, componentsDir) {
  if (componentsDir) {
    return componentsDir;
  }

  const configPath = path.join(path.resolve(projectRoot), 'avenx.config.json');

  if (!fs.existsSync(configPath)) {
    return 'src/components';
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const srcDir =
      typeof config.srcDir === 'string' && config.srcDir.trim() !== ''
        ? config.srcDir.trim()
        : 'src';

    return path.join(srcDir, 'components');
  } catch {
    return 'src/components';
  }
}

/**
 * Masks text while preserving line positions.
 * @param {string} value
 * @returns {string}
 */
function mask(value) {
  return value.replace(/[^\r\n]/g, ' ');
}

/**
 * Removes Avenx metadata blocks that are not part of the template.
 * @param {string} source
 * @returns {string}
 */
export function extractLintableTemplate(source) {
  let template = source;

  const patterns = [
    /<!--[\s\S]*?-->/g,
    /<state\b[\s\S]*?\/>/gi,
    /<computed\b[\s\S]*?\/>/gi,
    /<action\b[\s\S]*?<\/action>/gi,
    /<resource\b[\s\S]*?<\/resource>/gi,
    /<resource\b[\s\S]*?\/>/gi,
  ];

  for (const pattern of patterns) {
    template = template.replace(pattern, mask);
  }

  return template;
}

/**
 * Finds registered component tags that are not written in PascalCase.
 * @param {string} source
 * @param {Set<string>} registeredComponents
 * @returns {Array<{tagName: string, expectedName: string, index: number}>}
 */
export function findInvalidComponentTags(source, registeredComponents) {
  const template = extractLintableTemplate(source);
  const invalidTags = [];
  const tagRegex = /<([A-Za-z][A-Za-z0-9:_-]*)\b/g;

  let match;

  while ((match = tagRegex.exec(template)) !== null) {
    const tagName = match[1];

    if (registeredComponents.has(tagName)) {
      continue;
    }

    const comparableTag = tagName.replace(/[-_]/g, '').toLowerCase();

    const normalized = [...registeredComponents].find(
      (componentName) =>
        componentName.replace(/[-_]/g, '').toLowerCase() === comparableTag,
    );

    if (normalized && normalized !== tagName) {
      invalidTags.push({
        tagName,
        expectedName: normalized,
        index: match.index + 1,
      });
    }
  }

  return invalidTags;
}

/**
 * Finds the nearest package root.
 * @param {string} filePath
 * @param {string} fallbackRoot
 * @returns {string}
 */
export function findProjectRoot(filePath, fallbackRoot) {
  let currentDir = path.dirname(path.resolve(filePath));
  const fallback = path.resolve(fallbackRoot);

  while (true) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);
    const relativeToFallback = path.relative(fallback, parent);

    if (
      parent === currentDir ||
      relativeToFallback.startsWith('..') ||
      path.isAbsolute(relativeToFallback)
    ) {
      break;
    }

    currentDir = parent;
  }

  return fallback;
}