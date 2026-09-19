import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { z } from 'zod';

export const moveToSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type MoveToArgs = z.infer<typeof moveToSchema>;

export const MOVE_TO_TOOL_NAME = 'move_to';

function withoutSchemaKeyword(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _schema, ...rest } = schema;
  return rest;
}

export const TOOLS: ChatCompletionFunctionTool[] = [
  {
    type: 'function',
    function: {
      name: MOVE_TO_TOOL_NAME,
      description:
        '让自身通过自动寻路机制开始前往指定的坐标。坐标为世界坐标 XYZ 三元组，X 正方向是南，Z 正方向是西，单位为米。此工具是异步调用，即调用成功后并非已到达目标地点。',
      parameters: withoutSchemaKeyword(
        z.toJSONSchema(moveToSchema) as unknown as Record<string, unknown>,
      ),
    },
  },
];
