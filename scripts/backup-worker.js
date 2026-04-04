'use strict';
/**
 * backup-worker.js — Standalone Node.js child process for heavy backup I/O.
 *
 * Invoked by backup-runner.ts via exec():
 *   node /path/to/backup-worker.js <jobId>
 *
 * The worker connects to MongoDB directly (via MONGODB_URI env var) and
 * updates the AsyncJob document for progress / completion / error.
 * No IPC channel needed — MongoDB is the message bus.
 */

const path = require('node:path');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdir, rm, rename, stat, open: fsOpen, readdir } = require('node:fs/promises');
const { createGzip, createGunzip } = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const mongoose = require('mongoose');
const tar = require('tar-stream');
const yauzl = require('yauzl');

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// MongoDB — minimal inline schemas (avoids importing Next.js server code)
// ---------------------------------------------------------------------------

const AsyncJob = mongoose.models.AsyncJob || mongoose.model('AsyncJob', new mongoose.Schema(
  {
    type:     String,
    status:   String,
    progress: Number,
    message:  String,
    payload:  mongoose.Schema.Types.Mixed,
    result:   mongoose.Schema.Types.Mixed,
    error:    String,
  },
  { timestamps: true },
));

const Backup = mongoose.models.Backup || mongoose.model('Backup', new mongoose.Schema({
  serverId:   mongoose.Schema.Types.ObjectId,
  name:       String,
  filename:   String,
  path:       String,
  size:       Number,
  components: [String],
  status:     String,
  strategy:   String,
  jobId:      String,
  createdBy:  mongoose.Schema.Types.ObjectId,
  createdAt:  { type: Date, default: Date.now },
}));

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
}

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

async function setProgress(jobId, percent, message) {
  await AsyncJob.findByIdAndUpdate(jobId, { progress: percent, message });
}

async function setDone(jobId, result) {
  await AsyncJob.findByIdAndUpdate(jobId, {
    status: 'done', progress: 100, message: 'Done', result: result ?? {},
  });
}

async function setError(jobId, err) {
  const msg = err?.message ?? String(err);
  await AsyncJob.findByIdAndUpdate(jobId, { status: 'error', message: msg, error: msg });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPONENT_DIRS = {
  world:     ['world', 'world_nether', 'world_the_end'],
  config:    ['server.properties', 'bukkit.yml', 'spigot.yml', 'paper.yml', 'config'],
  mods:      ['mods'],
  plugins:   ['plugins'],
  datapacks: ['world/datapacks'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fixOwnership(dirPath) {
  await rm(path.join(dirPath, 'world', 'session.lock'), { force: true }).catch(() => {});
  try {
    await execFileAsync('chown', ['-R', '1000:1000', dirPath]);
  } catch { /* chown not available on Windows dev */ }
}

async function addDirectoryToTar(pack, dirPath, prefix, onFile) {
  let totalSize = 0;
  let entries;
  try { entries = await readdir(dirPath, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    const fullPath    = path.join(dirPath, entry.name);
    const archivePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      totalSize += await addDirectoryToTar(pack, fullPath, archivePath, onFile);
    } else {
      try {
        const s = await stat(fullPath);
        totalSize += s.size;
        onFile?.();
        await new Promise((resolve, reject) => {
          const e = pack.entry(
            { name: archivePath, size: s.size, mtime: s.mtime },
            (err) => (err ? reject(err) : resolve()),
          );
          createReadStream(fullPath).pipe(e);
        });
      } catch { /* file removed mid-operation */ }
    }
  }
  return totalSize;
}

function detectComponents(paths) {
  const found = new Set();
  for (const p of paths) {
    for (const [comp, dirs] of Object.entries(COMPONENT_DIRS)) {
      if (dirs.some((d) => p === d || p.startsWith(d + '/'))) { found.add(comp); break; }
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
  } finally { await fh.close(); }
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

async function runImport(jobId, payload) {
  const { tempFilePath, filename, importDir, actorId } = payload;
  await mkdir(importDir, { recursive: true });

  await setProgress(jobId, 5, 'Detecting archive format…');
  const isZip = await isZipFile(tempFilePath);
  let finalPath, storedFilename, entryPaths;

  if (isZip) {
    storedFilename = filename.replace(/\.zip$/i, '.tar.gz');
    finalPath = path.join(importDir, `${Date.now()}-${storedFilename}`);
    await setProgress(jobId, 10, 'Converting ZIP to tar.gz…');
    let count = 0;
    entryPaths = await convertZipToTarGz(tempFilePath, finalPath, async () => {
      count++;
      if (count % 50 === 0) {
        await setProgress(jobId, Math.min(88, 10 + Math.floor(count / 10)), `Converting… (${count} files)`);
      }
    });
    await rm(tempFilePath, { force: true });
  } else {
    storedFilename = filename;
    finalPath = path.join(importDir, `${Date.now()}-${storedFilename}`);
    await rename(tempFilePath, finalPath);
    await setProgress(jobId, 20, 'Scanning archive contents…');
    entryPaths = [];
    let count = 0;
    await new Promise((resolve, reject) => {
      const extract = tar.extract();
      extract.on('entry', (header, stream, next) => {
        if (header.type === 'file') { entryPaths.push(header.name); count++; }
        stream.resume();
        next();
      });
      extract.on('finish', resolve);
      extract.on('error', reject);
      createReadStream(finalPath).pipe(createGunzip()).pipe(extract);
    });
    await setProgress(jobId, 85, `Scanned ${count} files`);
  }

  await setProgress(jobId, 90, 'Detecting components…');
  const detectedComponents = detectComponents(entryPaths);
  const fileStat = await stat(finalPath);

  const backup = await Backup.create({
    serverId:   new mongoose.Types.ObjectId('000000000000000000000000'),
    name:       storedFilename.replace(/\.(tar\.gz|tgz|zip)$/i, ''),
    filename:   storedFilename,
    path:       finalPath,
    size:       fileStat.size,
    components: detectedComponents,
    status:     'completed',
    strategy:   'import',
    createdBy:  new mongoose.Types.ObjectId(actorId),
  });

  await setDone(jobId, { backupId: backup._id.toString() });
}

async function runRestore(jobId, payload) {
  const { backupPath, serverDir, components } = payload;
  const allowedPrefixes = [];
  for (const comp of components) {
    for (const d of (COMPONENT_DIRS[comp] ?? [])) {
      allowedPrefixes.push(d + '/');
      allowedPrefixes.push(d);
    }
  }

  await setProgress(jobId, 5, 'Extracting backup…');
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
      if (count % 200 === 0) {
        setProgress(jobId, Math.min(85, 5 + Math.floor(count / 50)), `Extracting… (${count} files)`).catch(() => {});
      }

      if (header.type === 'directory') {
        mkdir(destPath, { recursive: true }).then(() => { stream.resume(); next(); }, reject);
      } else {
        mkdir(path.dirname(destPath), { recursive: true }).then(() => {
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

  await setProgress(jobId, 92, 'Fixing file ownership…');
  await fixOwnership(serverDir);
  await setDone(jobId, {});
}

async function runCreate(jobId, payload) {
  const { serverDir, destDir, filename, components, backupId } = payload;
  await mkdir(destDir, { recursive: true });
  const filePath = path.join(destDir, filename);

  await setProgress(jobId, 5, 'Building archive…');
  const pack = tar.pack();
  let fileCount = 0;

  const addAll = async () => {
    for (const component of components) {
      for (const rel of (COMPONENT_DIRS[component] ?? [])) {
        await addDirectoryToTar(pack, path.join(serverDir, rel), rel, async () => {
          fileCount++;
          if (fileCount % 200 === 0) {
            await setProgress(jobId, Math.min(85, 5 + Math.floor(fileCount / 20)), `Packing… (${fileCount} files)`);
          }
        });
      }
    }
    pack.finalize();
  };

  await Promise.all([
    addAll(),
    pipeline(pack, createGzip(), createWriteStream(filePath)),
  ]);

  const archiveStat = await stat(filePath);
  await Backup.findByIdAndUpdate(backupId, { status: 'completed', path: filePath, size: archiveStat.size });
  await setDone(jobId, { backupId });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error('[backup-worker] Usage: node backup-worker.js <jobId>');
    process.exit(1);
  }

  try { await connectMongo(); } catch (err) {
    console.error('[backup-worker] MongoDB connection failed:', err);
    process.exit(1);
  }

  let job;
  try {
    job = await AsyncJob.findById(jobId).lean();
    if (!job) throw new Error(`Job ${jobId} not found in MongoDB`);
  } catch (err) {
    console.error('[backup-worker] Failed to load job:', err);
    process.exit(1);
  }

  try {
    const { type, payload } = job;
    if      (type === 'backup:import')  await runImport(jobId, payload);
    else if (type === 'backup:restore') await runRestore(jobId, payload);
    else if (type === 'backup:create')  await runCreate(jobId, payload);
    else throw new Error(`Unknown job type: ${type}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`[backup-worker] Job ${jobId} failed:`, err);
    await setError(jobId, err).catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
