import { describe, expect, it } from 'vitest';

import {
  generateDataJs,
  parsePcBlocks,
  parseRequested,
  selectDirs,
  type MinecraftDataContext,
} from '../scripts/mc-versions';

const DATA_JS = `module.exports =
{
  'pc': {
    '1.16.2': {
      get blocks () { return require("./minecraft-data/data/pc/1.16.2/blocks.json") }
    },
    '1.20': {
      get blocks () { return require("./minecraft-data/data/pc/1.20/blocks.json") },
      get biomes () { return require("./minecraft-data/data/pc/1.16.1/biomes.json") }
    },
    '1.21': {
      get blocks () { return require("./minecraft-data/data/pc/1.21/blocks.json") }
    }
  },
  'bedrock': {
    '1.20.0': {
      get blocks () { return require("./minecraft-data/data/bedrock/1.20.0/blocks.json") }
    }
  }
}
`;

const context: MinecraftDataContext = {
  dataJsPath: 'data.js',
  resolveDir: (version) => (version === '1.20.4' ? '1.20' : null),
};

describe('parseRequested', () => {
  it('requires an explicit MC_VERSIONS', () => {
    expect(() => parseRequested(undefined)).toThrow();
    expect(() => parseRequested('  ')).toThrow();
    expect(() => parseRequested(',')).toThrow();
  });

  it('recognises the all sentinel', () => {
    expect(parseRequested('all')).toBe('all');
    expect(parseRequested('ALL')).toBe('all');
  });

  it('splits and trims a version list', () => {
    expect(parseRequested('1.20.4, 1.21.1')).toEqual(['1.20.4', '1.21.1']);
  });
});

describe('parsePcBlocks', () => {
  it('extracts pc version blocks only', () => {
    const blocks = parsePcBlocks(DATA_JS);

    expect([...blocks.keys()]).toEqual(['1.16.2', '1.20', '1.21']);
    expect(blocks.get('1.20')?.join('\n')).toContain('1.16.1/biomes.json');
  });
});

describe('selectDirs', () => {
  const blocks = parsePcBlocks(DATA_JS);

  it('accepts directory names and resolves minecraft versions', () => {
    expect(selectDirs(['1.20.4', '1.16.2'], context, blocks)).toEqual(['1.20', '1.16.2']);
  });

  it('deduplicates resolved directories', () => {
    expect(selectDirs(['1.20.4', '1.20'], context, blocks)).toEqual(['1.20']);
  });

  it('rejects unresolvable versions', () => {
    expect(() => selectDirs(['9.9.9'], context, blocks)).toThrow();
  });
});

describe('generateDataJs', () => {
  it('keeps only selected blocks and drops bedrock data', () => {
    const blocks = parsePcBlocks(DATA_JS);
    const output = generateDataJs(blocks, ['1.20']);

    expect(output).toContain("'1.20': {");
    expect(output).not.toContain("'1.16.2': {");
    expect(output).not.toContain("'1.21': {");
    expect(output).toContain("'bedrock': {}");
    expect(output).toContain('1.16.1/biomes.json');
  });
});
