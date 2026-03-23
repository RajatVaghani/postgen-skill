#!/usr/bin/env node
/**
 * PostGen – Determine and create the next post directory.
 *
 * Usage:
 *   node next-post-dir.mjs [<workspace-path>]
 *
 * Prints the absolute path of the next available post directory:
 *   {workspace}/output/{YYYY-MM-DD}/{NNN}/
 *
 * where NNN is the next zero-padded number (001, 002, ...) for today's date.
 * Creates the directory automatically.
 *
 * If no workspace-path is given, searches upward from the current directory
 * for postgen.config.json.
 */
import fs from 'fs';
import path from 'path';
import { findWorkspaceRoot } from './workspace.mjs';

const inputDir = path.resolve(process.argv[2] || '.');

// Find workspace root
let wsRoot = findWorkspaceRoot(inputDir);
if (!wsRoot) {
  // If a direct path was given, check if it has postgen.config.json
  if (fs.existsSync(path.join(inputDir, 'postgen.config.json'))) {
    wsRoot = inputDir;
  } else {
    console.error('postgen.config.json not found. Run setup first or provide the workspace path.');
    process.exit(1);
  }
}

// Today's date folder
const now = new Date();
const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
const dateDir = path.join(wsRoot, 'output', dateStr);

fs.mkdirSync(dateDir, { recursive: true });

// Find next number
let nextNum = 1;
if (fs.existsSync(dateDir)) {
  const existing = fs
    .readdirSync(dateDir)
    .filter((d) => /^\d+$/.test(d))
    .map(Number)
    .sort((a, b) => a - b);

  if (existing.length > 0) {
    nextNum = existing[existing.length - 1] + 1;
  }
}

const postDir = path.join(dateDir, String(nextNum).padStart(3, '0'));
fs.mkdirSync(postDir, { recursive: true });

// Print the path (this is what the agent captures)
console.log(postDir);
