'use strict';
/**
 * backup-worker.js — Standalone Node.js child process for heavy backup I/O.
 *
 * Invoked by backup-runner.ts via child_process.fork():
 *   fork(workerPath, [jobType, jsonPayload])
 *
 * Communicates back via process.send():
 *   { type: 'progress', percent: number, message: string }
 *   { type: 'done',     result: object }
 *   { type: 'error',    error: string }
 *
 * This script intentionally has NO mongoose dependency — all DB work is
 * handled in the parent process (backup-runner.ts).
 */

const path = require('node:path');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdir, rm, rename, stat, open: fsOpen, readdir } = require('node:fs/promises');
const { createGzip, createGunzip } = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const tar = require('tar-stream');
const yauzl = require('yauzl');

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// IPC helpers
// ---------------------------------------------------------------------------

function sendProgress(percent, message) {
  if (process.send) process.send({ type: 'progress', percent, message });
}

function sendDone(result) {
  if (process.send) process.send({ type: 'done', result: result ?? {} });
}

function sendError(err) {
  if (process.send) process.send({ type: 'error', error: err?.message ?? String(err) });
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const COMPONENT_DIRS = {
  world:      ['world', 'world_nether', 'world_the_end'],
  config:     ['server.properties', 'bukkit.yml', 'spigot.yml', 'paper.yml', 'config'],
  mods:       ['mods'],
  plugins:    ['plugins'],
  datapacks:  ['world/datapacks'],
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function fixOwnership(dirPath) {
  // Remove stale session.lock so MC can start after restore
  await rm(path.join(dirPath, 'world', 'session.lock'), { force: true }).catch(() => {});
  try {
    await execFileAsync('chown', ['-R', '1000:1000', dirPath]);
  } catch {
    // chown may not be available on Windows dev environments
  }
}

async function addDirectoryToTar(pack, dirPath, prefix, onFile) {
  let totalSize = 0;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const archivePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      totalSize += await addDirectoryToTar(pack, fullPath, archivePath, onFile);
    } else {
      try {
        const s = await stat(fullPath);
        totalSize += s.size;
        onFile?.();
        await new Promise((resolve, reject) => {
          const entryStream = pack.entry(
            { name: archivePath, size: s.size, mtime: s.mtime },
            (err) => (err ? reject(err) : resolve()),
          );
          createReadStream(fullPath).pipe(entryStream);
        });
      } catch {
        // file may have been removed between readdir and stat
      }
    }
  }
  return totalSize;
}

function detectComponents(paths) {
  const found = new Set();
  for (const p of paths) {
    for (const [comp, dirs] of Object.entries(COMPONENT_DIRS)) {
      if (dirs.some((d) => p === d || p.startsWith(d + '/'))) {
        found.add(comp);
        break;
      }
    }
  }
  return [...found];
}

async function isZipFile(filePath) {
  const fh = await fsOpen(filePath, 'r');
  try {
    const buf = Buffer.alloc(4);
    await fh.read(buf, 0, 4, 0);
    return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  } finally {
    await fh.close();
  }
}

async function convertZipToTarGz(zipPath, tarGzPath, onEntry) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('Failed to open ZIP'));

      const entryPaths = [];
      const pack = tar.pack();
      const gzip = createGzip();
      const output = createWriteStream(tarGzPath);

      pack.pipe(gzip).pipe(output);
      pack.on('error', reject);
      gzip.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => resolve(entryPaths));

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        const name = entry.fileName.replace(/\\/g, '/');
        if (/\/$/.test(name)) { zipfile.readEntry(); return; }
        entryPaths.push(name);
        onEntry?.();
        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2 || !readStream) return reject(err2 ?? new Error('Failed to read ZIP entry'));
          const tarEntry = pack.entry(
            { name, size: entry.uncompressedSize, mtime: entry.getLastModDate() },
            (err3) => { if (err3) return reject(err3); zipfile.readEntry(); },
          );
          readStream.pipe(tarEntry);
        });
      });

      zipfile.on('end', () => pack.finalize());
      zipfile.on('error', reject);
    });
  });
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Import a backup file (tar.gz or zip) into the imports directory.
 * @param {{ tempFilePath: string, filename: string, importDir: string }} payload
 */
async function runImport(payload) {
  const { tempFilePath, filename, importDir } = payload;
  await mkdir(importDir, { recursive: true });

  sendProgress(5, 'Detecting archive format…');
  const isZip = await isZipFile(tempFilePath);
  let finalPath, storedFilename, entryPaths;

  if (isZip) {
    storedFilename = filename.replace(/\.zip$/i, '.tar.gz');
    finalPath = path.join(importDir, `${Date.now()}-${storedFilename}`);
    sendProgress(10, 'Converting ZIP to tar.gz…');
    let count = 0;
    entryPaths = await convertZipToTarGz(tempFilePath, finalPath, () => {
      count++;
      if (count % 50 === 0) {
        sendProgress(Math.min(88, 10 + Math.floor(count / 10)), `Converting… (${count} files)`);
      }
    });
    await rm(tempFilePath, { force: true });
  } else {
    storedFilename = filename;
    finalPath = path.join(importDir, `${Date.now()}-${storedFilename}`);
    await rename(tempFilePath, finalPath);
    sendProgress(20, 'Scanning archive contents…');
    entryPaths = [];
    let count = 0;
    await new Promise((resolve, reject) => {
      const extract = tar.extract();
      extract.on('entry', (header, stream, next) => {
        if (header.type === 'file') {
          entryPaths.push(header.name);
          count++;
          if (count % 100 === 0) {
            sendProgress(Math.min(88, 20 + Math.floor(count / 20)), `Scanning… (${count} files)`);
          }
        }
        stream.resume();
        next();
      });
      extract.on('finish', resolve);
      extract.on('error', reject);
      createReadStream(finalPath).pipe(createGunzip()).pipe(extract);
    });
  }

  sendProgress(95, 'Detecting components…');
  const detectedComponents = detectComponents(entryPaths);
  const fileStat = await stat(finalPath);
  sendProgress(100, 'Done');

  return { finalPath, storedFilename, detectedComponents, size: fileStat.size };
}

/**
 * Restore selected components from a backup into a server data directory.
 * @param {{ backupPath: string, serverDir: string, components: string[] }} payload
 */
async function runRestore(payload) {
  const { backupPath, serverDir, components } = payload;

  const allowedPrefixes = [];
  for (const comp of components) {
    const dirs = COMPONENT_DIRS[comp] ?? [];
    for (const d of dirs) {
      allowedPrefixes.push(d + '/');
      allowedPrefixes.push(d);
    }
  }

  sendProgress(5, 'Extracting backup…');
  let count = 0;

  await new Promise((resolve, reject) => {
    const extract = tar.extract();
    extract.on('entry', (header, stream, next) => {
      const filePath = header.name;
      const matches = allowedPrefixes.some(
        (p) => filePath === p || filePath.startsWith(p.endsWith('/') ? p : p + '/'),
      );
      if (!matches) { stream.resume(); next(); return; }

      const destPath = path.resolve(serverDir, filePath);
      if (!destPath.startsWith(serverDir)) { stream.resume(); next(); return; }

      count++;
      if (count % 100 === 0) {
        sendProgress(Math.min(85, 5 + Math.floor(count / 50)), `Extracting… (${count} files)`);
      }

      if (header.type === 'directory') {
        mkdir(destPath, { recursive: true }).then(() => { stream.resume(); next(); }, reject);
      } else {
        const dir = path.dirname(destPath);
        mkdir(dir, { recursive: true }).then(() => {
          const ws = createWriteStream(destPath);
          stream.pipe(ws);
          ws.on('finish', next);
          ws.on('error', reject);
        }, reject);
      }
    });
    extract.on('finish', resolve);
    extract.on('error', reject);
    createReadStream(backupPath).pipe(createGunzip()).pipe(extract);
  });

  sendProgress(92, 'Fixing file ownership…');
  await fixOwnership(serverDir);
  sendProgress(100, 'Done');
}

/**
 * Create a tar.gz backup of selected server components.
 * @param {{ serverDir: string, destDir: string, filename: string, components: string[] }} payload
 */
async function runCreate(payload) {
  const { serverDir, destDir, filename, components } = payload;
  await mkdir(destDir, { recursive: true });
  const filePath = path.join(destDir, filename);

  sendProgress(5, 'Building archive…');
  const pack = tar.pack();
  let fileCount = 0;

  const addAll = async () => {
    for (const component of components) {
      const dirs = COMPONENT_DIRS[component] ?? [];
      for (const rel of dirs) {
        const absPath = path.join(serverDir, rel);
        await addDirectoryToTar(pack, absPath, rel, () => {
          fileCount++;
          if (fileCount % 100 === 0) {
            sendProgress(Math.min(85, 5 + Math.floor(fileCount / 20)), `Packing… (${fileCount} files)`);
          }
        });
      }
    }
    pack.finalize();
  };

  const [, archiveStat] = await Promise.all([
    addAll(),
    pipeline(pack, createGzip(), createWriteStream(filePath)).then(() => stat(filePath)),
  ]);

  sendProgress(100, 'Done');
  return { path: filePath, size: archiveStat.size };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const jobType = process.argv[2];
  if (!jobType) {
    sendError(new Error('Missing job type argument'));
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(process.argv[3] ?? '{}');
  } catch {
    sendError(new Error('Invalid payload JSON'));
    process.exit(1);
  }

  try {
    sendProgress(0, 'Starting…');
    let result;
    if (jobType === 'backup:import') {
      result = await runImport(payload);
    } else if (jobType === 'backup:restore') {
      await runRestore(payload);
      result = {};
    } else if (jobType === 'backup:create') {
      result = await runCreate(payload);
    } else {
      throw new Error(`Unknown job type: ${jobType}`);
    }
    sendDone(result);
    process.exit(0);
  } catch (err) {
    sendError(err);
    process.exit(1);
  }
}

main();
