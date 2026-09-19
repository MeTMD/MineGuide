import { readFileSync } from 'node:fs';

import type { Plugin } from 'esbuild';
import { defineConfig } from 'tsup';

import {
  generateDataJs,
  loadMinecraftData,
  parsePcBlocks,
  parseRequested,
  selectDirs,
} from './scripts/mc-versions';

function filterMinecraftData(dataJsText: string): string {
  const requested = parseRequested(process.env['MC_VERSIONS']);
  const context = loadMinecraftData();
  const blocks = parsePcBlocks(dataJsText);
  const selected = requested === 'all' ? [...blocks.keys()] : selectDirs(requested, context, blocks);

  console.log(
    `[minecraft-data] MC_VERSIONS=${requested === 'all' ? 'all' : requested.join(',')} -> ${selected.join(', ')}`,
  );
  return generateDataJs(blocks, selected);
}

function minecraftDataFilter(): Plugin {
  return {
    name: 'minecraft-data-filter',
    setup(build) {
      build.onLoad({ filter: /minecraft-data[\\/]data\.js$/ }, (args) => ({
        contents: filterMinecraftData(readFileSync(args.path, 'utf8')),
        loader: 'js',
      }));
    },
  };
}

export default defineConfig({
  entry: { main: 'main.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
  noExternal: [/.*/],
  outExtension: () => ({ js: '.cjs' }),
  esbuildPlugins: [minecraftDataFilter()],
});
