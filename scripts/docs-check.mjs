import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  '.angular',
  '.git',
  'dist',
  'node_modules',
  'out-tsc',
  'storybook-static',
]);

const MERMAID_START_PATTERNS = [
  /^flowchart\s+(TB|TD|BT|RL|LR)\b/,
  /^graph\s+(TB|TD|BT|RL|LR)\b/,
  /^sequenceDiagram\b/,
  /^classDiagram\b/,
  /^stateDiagram(?:-v2)?\b/,
  /^erDiagram\b/,
  /^journey\b/,
  /^gantt\b/,
  /^pie(?:\s+showData)?\b/,
  /^mindmap\b/,
  /^timeline\b/,
];

async function findMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      files.push(...(await findMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function startsWithFence(line) {
  return line.startsWith('```');
}

function validateMermaidBlock(file, block) {
  const errors = [];
  const nonEmpty = block.lines.find((line) => line.text.trim().length > 0);

  if (!nonEmpty) {
    errors.push(`${file}:${block.startLine}: empty mermaid block`);
    return errors;
  }

  const firstStatement = nonEmpty.text.trim();
  const isValidStart = MERMAID_START_PATTERNS.some((pattern) =>
    pattern.test(firstStatement),
  );

  if (!isValidStart) {
    errors.push(
      `${file}:${nonEmpty.line}: mermaid block must start with a supported diagram declaration`,
    );
  }

  for (const line of block.lines) {
    const text = line.text.trim();
    if (text.startsWith('%%{')) {
      errors.push(
        `${file}:${line.line}: mermaid init directives are discouraged for GitHub-safe diagrams`,
      );
    }
  }

  return errors;
}

function validateMarkdownFile(file, content) {
  const errors = [];
  const mermaidBlocks = [];
  const lines = content.split(/\r?\n/);

  let inFence = false;
  let fenceStartLine = 0;
  let currentFenceLang = '';
  let currentMermaid = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (!inFence) {
      if (startsWithFence(line)) {
        inFence = true;
        fenceStartLine = lineNumber;
        currentFenceLang = line.slice(3).trim().toLowerCase();

        if (currentFenceLang === 'mermaid') {
          currentMermaid = { startLine: lineNumber, lines: [] };
        }
      }
      continue;
    }

    if (startsWithFence(line)) {
      if (currentMermaid) {
        mermaidBlocks.push(currentMermaid);
        currentMermaid = null;
      }

      inFence = false;
      currentFenceLang = '';
      continue;
    }

    if (currentFenceLang === 'mermaid' && currentMermaid) {
      currentMermaid.lines.push({ line: lineNumber, text: line });
    }
  }

  if (inFence) {
    errors.push(`${file}:${fenceStartLine}: unclosed code fence`);
  }

  for (const block of mermaidBlocks) {
    errors.push(...validateMermaidBlock(file, block));
  }

  return { errors, mermaidCount: mermaidBlocks.length };
}

async function main() {
  const files = await findMarkdownFiles(ROOT);
  const sortedFiles = files
    .map((file) => path.relative(ROOT, file))
    .sort((a, b) => a.localeCompare(b));

  const errors = [];
  let mermaidCount = 0;

  for (const relativeFile of sortedFiles) {
    const absoluteFile = path.join(ROOT, relativeFile);
    const content = await readFile(absoluteFile, 'utf8');
    const result = validateMarkdownFile(relativeFile, content);
    errors.push(...result.errors);
    mermaidCount += result.mermaidCount;
  }

  if (errors.length > 0) {
    console.error('docs:check failed');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `docs:check passed (${sortedFiles.length} markdown files, ${mermaidCount} mermaid blocks)`,
  );
}

main().catch((error) => {
  console.error('docs:check failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
