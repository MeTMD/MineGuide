import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const buildDir = join(root, 'build');
const bundle = join(root, 'dist', 'main.cjs');
const blobName = 'sea-prep.blob';
const configPath = join(buildDir, 'sea-config.json');
const postjectCli = join(root, 'node_modules', 'postject', 'dist', 'cli.js');

const isWindows = process.platform === 'win32';
const outputName = isWindows ? `MineGuide-v${pkg.version}.exe` : `MineGuide-v${pkg.version}`;
const outputPath = join(buildDir, outputName);

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

writeFileSync(
  configPath,
  JSON.stringify({ main: bundle, output: join(buildDir, blobName), disableExperimentalSEAWarning: true }, null, 2),
);

execFileSync(process.execPath, ['--experimental-sea-config', configPath], { stdio: 'inherit' });

copyFileSync(process.execPath, outputPath);
if (!isWindows) {
  chmodSync(outputPath, 0o755);
}
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--remove-signature', outputName], { cwd: buildDir, stdio: 'inherit' });
}

const postjectArgs = [postjectCli, outputName, 'NODE_SEA_BLOB', blobName, '--sentinel-fuse', SEA_FUSE];
if (process.platform === 'darwin') {
  postjectArgs.push('--macho-segment-name', 'NODE_SEA');
}
execFileSync(process.execPath, postjectArgs, { cwd: buildDir, stdio: 'inherit' });

cpSync(join(root, 'data'), join(buildDir, 'data'), { recursive: true });
copyFileSync(join(root, 'mg.config.env.example'), join(buildDir, 'mg.config.env.example'));

console.log(`[Done] ${outputPath}`);
