import { describe, expect, it } from 'vitest';

import { formatAgentChat, formatAgentInit, formatAnchors } from '../src/chat/prompts';
import type { SceneAnchor } from '../src/data';
import { formatPosition } from '../src/vector';

const ANCHORS: SceneAnchor[] = [
  { name: '正门', alias: ['东门', '主门'], position: [30, 60, 20], description: '描述一' },
  { name: '主楼', alias: [], position: [80, 70, 50], description: '描述二' },
];

describe('formatAnchors', () => {
  it('renders one line per anchor with python-style lists', () => {
    expect(formatAnchors(ANCHORS)).toBe(
      "- 名称`正门`，别称表`['东门', '主门']`，坐标`[30, 60, 20]`，描述`描述一`\n" +
        "- 名称`主楼`，别称表`[]`，坐标`[80, 70, 50]`，描述`描述二`\n",
    );
  });
});

describe('formatAgentInit', () => {
  it('embeds scene, location and anchors', () => {
    const anchors = formatAnchors(ANCHORS);
    const prompt = formatAgentInit('示例景点', '中国北京', anchors);

    expect(prompt).toContain('你所在的场景是“示例景点”，位于“中国北京”。');
    expect(prompt).toContain('除非消息中包含安全词“MineGuideAdmin”。');
    expect(prompt.endsWith(`以下是景点内所有点位的信息：\n${anchors}\n`)).toBe(true);
  });
});

describe('formatAgentChat', () => {
  it('renders the chat prompt', () => {
    expect(
      formatAgentChat({
        username: 'Alice',
        userPosition: '(1.0, 2.0, 3.0)',
        selfPosition: '(4.0, 5.0, 6.0)',
        message: '你好',
      }),
    ).toBe('你现在位于`(4.0, 5.0, 6.0)`。位于`(1.0, 2.0, 3.0)`的用户`Alice`说```你好```');
  });
});

describe('formatPosition', () => {
  it('rounds coordinates to one decimal place like python', () => {
    expect(formatPosition({ x: 30, y: 60.26, z: -0.04 })).toBe('(30.0, 60.3, -0.0)');
    expect(formatPosition({ x: 1.25, y: 12.35, z: 0.35 })).toBe('(1.2, 12.3, 0.3)');
  });

  it('rounds exact ties half to even like python', () => {
    expect(formatPosition({ x: 60.25, y: 0.75, z: -1.25 })).toBe('(60.2, 0.8, -1.2)');
    expect(formatPosition({ x: -0.75, y: 12.25, z: -12.75 })).toBe('(-0.8, 12.2, -12.8)');
  });
});
