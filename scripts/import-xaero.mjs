import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const USAGE = 'Usage: node scripts/import-xaero.mjs -i <waypoints.txt> -o <scene.json>';

const WAYPOINT_FIELDS = 'name initials x y z color disabled type set rotate_on_tp tp_yaw visibility_type destination'.split(' ');

function fail(message) {
  console.error(`error: ${message}`);
  console.error(USAGE);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    if (flag === '-i' || flag === '--input') {
      options.input = inline ?? argv[(index += 1)];
    } else if (flag === '-o' || flag === '--output') {
      options.output = inline ?? argv[(index += 1)];
    } else if (flag === '-h' || flag === '--help') {
      options.help = true;
    } else {
      fail(`unknown argument "${arg}"`);
    }
  }
  if (!options.help && !options.input) {
    fail('missing required option -i/--input');
  }
  if (!options.help && !options.output) {
    fail('missing required option -o/--output');
  }
  return options;
}

function parseWaypoints(text) {
  const waypoints = new Map();
  const duplicates = new Set();
  let disabled = 0;
  let invalid = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('waypoint:')) {
      continue;
    }
    const parts = line.split(':');
    const values = {};
    WAYPOINT_FIELDS.forEach((field, index) => {
      values[field] = parts[index + 1];
    });
    const name = (values.name ?? '').trim();
    const position = ['x', 'y', 'z'].map((axis) => Number(values[axis]));
    if (!name || position.some((value) => !Number.isFinite(value))) {
      invalid += 1;
      continue;
    }
    if ((values.disabled ?? '').toLowerCase() === 'true') {
      disabled += 1;
      continue;
    }
    if (waypoints.has(name)) {
      duplicates.add(name);
    }
    waypoints.set(name, position);
  }

  return { waypoints, duplicates: [...duplicates], disabled, invalid };
}

function updateAnchors(scene, waypoints) {
  if (!Array.isArray(scene.anchors)) {
    scene.anchors = [];
  }
  const byName = new Map();
  for (const anchor of scene.anchors) {
    if (anchor && typeof anchor.name === 'string' && !byName.has(anchor.name)) {
      byName.set(anchor.name, anchor);
    }
  }

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const [name, position] of waypoints) {
    const anchor = byName.get(name);
    if (!anchor) {
      const created = { name, alias: [], position, description: '' };
      scene.anchors.push(created);
      byName.set(name, created);
      added += 1;
    } else if (!samePosition(anchor.position, position)) {
      anchor.position = position;
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return { added, updated, unchanged };
}

function samePosition(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function readScene(path) {
  if (!existsSync(path)) {
    return { meta: { name: '', location: '' }, anchors: [] };
  }
  let scene;
  try {
    scene = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`failed to parse existing output file "${path}": ${error.message}`);
  }
  if (typeof scene !== 'object' || scene === null || Array.isArray(scene)) {
    fail(`existing output file "${path}" must contain a JSON object`);
  }
  return scene;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

const inputPath = resolve(options.input);
const outputPath = resolve(options.output);

if (!outputPath.toLowerCase().endsWith('.json')) {
  fail(`output path must end with ".json", got "${options.output}"`);
}
if (!existsSync(inputPath)) {
  fail(`input file not found: "${inputPath}"`);
}

const { waypoints, duplicates, disabled, invalid } = parseWaypoints(readFileSync(inputPath, 'utf8'));
if (waypoints.size === 0) {
  fail(`no enabled waypoints found in "${inputPath}"`);
}

const scene = readScene(outputPath);
const { added, updated, unchanged } = updateAnchors(scene, waypoints);

let backupPath = null;
if (existsSync(outputPath)) {
  backupPath = `${outputPath.slice(0, -'.json'.length)}.bak.json`;
  renameSync(outputPath, backupPath);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(scene, null, 4)}\n`, 'utf8');

console.log(`Parsed ${waypoints.size} enabled waypoints (${disabled} disabled, ${invalid} invalid skipped).`);
for (const name of duplicates) {
  console.warn(`warning: duplicate waypoint name "${name}", the last entry wins`);
}
console.log(`Anchors: ${added} added, ${updated} updated, ${unchanged} unchanged.`);
if (backupPath) {
  console.log(`Backup: ${backupPath}`);
}
console.log(`Written: ${outputPath}`);
