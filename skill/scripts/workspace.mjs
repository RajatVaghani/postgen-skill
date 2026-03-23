/**
 * Shared utility: find the PostGen workspace root and create a
 * require() function that resolves packages from its node_modules.
 *
 * This solves the module-resolution problem: scripts live in the
 * skill directory but npm packages live in the workspace.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';

export function findWorkspaceRoot(startDir) {
  let dir = path.resolve(startDir);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'postgen.config.json'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

export function loadConfig(startDir) {
  const root = findWorkspaceRoot(startDir);
  if (!root) throw new Error('postgen.config.json not found in any parent of ' + startDir);
  return JSON.parse(fs.readFileSync(path.join(root, 'postgen.config.json'), 'utf-8'));
}

/**
 * Returns a require() function that resolves from the workspace's node_modules.
 * Use this instead of bare `import 'pkg'` for any npm package (playwright, openai, etc).
 */
export function workspaceRequire(startDir) {
  const root = findWorkspaceRoot(startDir);
  if (!root) throw new Error('Cannot find workspace root from ' + startDir);
  const nmDir = path.join(root, 'node_modules');
  if (!fs.existsSync(nmDir)) {
    throw new Error(
      `node_modules not found at ${nmDir}. Run setup first:\n` +
        `  node <skill-path>/scripts/setup.mjs ${root}`
    );
  }
  return createRequire(path.join(root, 'package.json'));
}
