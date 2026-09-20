# MineGuide

An agent guide in Minecraft.

MineGuide 是一个运行在 Minecraft 中的 **AI 智能导游机器人**。玩家在游戏聊天框中以自然语言提问，机器人调用 LLM 生成导游讲解，并可自主寻路走向景点坐标。项目使用 **TypeScript** 编写，直接调用 [mineflayer](https://github.com/PrismarineJS/mineflayer) 与 [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder)，支持任意 OpenAI 兼容接口。

## 开发指南

### 环境要求

前置条件：

1. 语言环境 **Node.js** >= 24（[官网](https://nodejs.org)）。
2. 包管理器 **pnpm**（[官网](https://pnpm.io)，可通过 `corepack enable pnpm` 启用）。
3. 拥有一个 Minecraft Java 版客户端或服务器。
4. 克隆本仓库到本地。

### 开始使用

进入仓库根目录，执行下面命令安装依赖：

```bash
pnpm install
```

在运行程序前，请先阅读[配置指南](#配置指南)章节，并正确配置 `mg.config.env` 与景点数据。

完成后执行：

```bash
pnpm dev
```

智能体将尝试连接并加入 Minecraft 服务器。

### 常用命令

| 命令             | 说明                                                        |
| ---------------- | ----------------------------------------------------------- |
| `pnpm dev`       | 以 tsx 直接运行程序，开发调试用                             |
| `pnpm test`      | 运行 vitest 单元测试                                        |
| `pnpm typecheck` | 运行 TypeScript 类型检查                                    |
| `pnpm build`     | 打包为单文件 `dist/main.cjs` 代码，详见下方指引             |
| `pnpm build:sea` | 构建为单文件可执行程序（Windows/Linux/macOS），详见下方指引 |

### 项目结构

```
main.ts                程序入口
src/core.ts            主流程、消息分发、导航事件播报、串行队列
src/data.ts            INI 配置解析与校验、景点数据 Zod 校验、路径基准
src/logger.ts          日志系统（时间戳、级别过滤、颜色、全局异常）
src/debug/events.ts    调试事件类型与双环形缓冲（pipeline / log）
src/debug/tracer.ts    追踪器：Turn / Step / 工具 / Token 埋点
src/debug/server.ts    调试页 HTTP/SSE 服务（token 鉴权、仅回环）
src/debug/ui.ts        调试页单页（vanilla，构建期内联）
src/queue.ts           有界串行队列
src/vector.ts          坐标格式化
src/api/bot.ts         mineflayer 封装（连接、聊天、寻路、导航事件回调）
src/chat/agent.ts      OpenAI 客户端、工具调用循环、流式输出、记忆
src/chat/prompts.ts    导游人设与提示词
src/chat/tools.ts      工具定义（Zod schema 与 JSON Schema）
scripts/build-sea.mjs  SEA 构建脚本
scripts/import-xaero.mjs  Xaero 路点导入脚本
tests/                 vitest 单元测试
data/                  景点数据
```

### 构建分发

构建产物会内嵌 `minecraft-data` 的版本数据，因此**必须在构建时**通过环境变量 `MC_VERSIONS` 指定目标服务器版本（内嵌数据无法在运行时更换）。支持逗号分隔多个版本；填 `all` 表示内嵌全部 Java 版本（体积最大）：

```bash
# bash
MC_VERSIONS=1.20.4 pnpm build:sea
MC_VERSIONS=1.20.4,1.21.1 pnpm build:sea
MC_VERSIONS=all pnpm build:sea
```

```powershell
# PowerShell
$env:MC_VERSIONS = "1.20.4"; pnpm build:sea
```

若目标服务器版本不在构建时所选的集合内，运行时会连接失败，因此请按目标服务器版本构建。

构建脚本使用 Node.js 的 SEA（Single Executable Application）与 postject 注入，产物输出到 `build/`,**必须在目标平台上构建**：Windows 为 `MineGuide-v<version>.exe`，Linux/macOS 为 `MineGuide-v<version>`（Linux 会自动补上可执行权限）。

分发时请将 `mg.config.env` 与 `data/` 目录放在可执行文件**同目录**下：程序以可执行文件所在目录为基准查找配置与景点数据（开发模式下以工作目录为基准）。

## 配置指南

程序依赖于以下两类配置文件，当程序启动时会读取它们。

### 环境变量配置文件

文件 `mg.config.env` 是环境变量配置文件，它记录了程序运行所需的重要信息。在根目录中，提供有示例文件 `mg.config.env.example`，您可以拷贝该文件，并删除 `.example` 后缀，然后修改配置文件的内容：

- `[Connection]`：Minecraft 服务器地址、端口与机器人用户名。
- `[Scene]`：载入的景点数据文件（位于 `data/` 目录下）。
- `[LLM]`：大语言模型配置。
  - `model_name` 指定模型名称；
  - `max_tool_subturns` 控制单条用户消息内最多的 LLM 生成次数（工具调用循环上限）；
  - `max_context_tokens` 为上下文压缩阈值；
  - `thinking` 为 `enabled` 或 `disabled`；
  - `reasoning_effort` 为 `low`、`high` 或 `max`。
- `[LLMClient]`：OpenAI 兼容客户端参数，支持 `baseURL`、`apiKey`（必填）、`timeout`（单位：秒）、`maxRetries`、`defaultHeaders`（JSON 对象）。
- `[Debug]`：
  - `enabled`（默认 `true`）控制是否启动网页调试页；
  - `port`（默认 `25564`）为调试页端口。
  - 日志级别由环境变量 `MG_LOG_LEVEL` 控制，不在此文件配置。

对话记忆默认完整保留、不做截断，以维持前缀缓存命中；工具调用会产生 `reasoning_content` 与工具消息，均按原样回传给模型。

当用户发送消息触发 Agent 时，若对话历史估算长度超过 `max_context_tokens`（默认 `50000`），程序会自动把最旧的对话历史交给 LLM 压缩成一条系统记忆，并保留最近一段原文：按 token 预算保留，至少最近一个用户轮，工具调用与结果不会被拆断。首条系统提示（全部锚点信息）与最新用户消息不参与压缩；摘要失败时仅告警并保留完整历史。压缩是滚动式的，旧摘要会与新历史合并成单条新摘要。

本项目仅支持标准 OpenAI 兼容接口，不再支持 USTB 专用客户端（原 `ustb_openai`）。

### 景点数据配置文件

文件夹 `data` 中，以 JSON 格式存储着景点数据（每个景点对应一张 Minecraft 地图），包括景点的基本信息（`meta`）与各锚点（`anchors`）的名称、别称、坐标与描述。您可以参照示例，根据您的需求来编写景点数据文件。在 `data` 文件夹下，可以存储多个景点数据文件，要想指定智能体所载入的景点，只需在 `mg.config.env` 中进行指定。

> 旧版数据中的 `routes` 字段已废弃，校验时会被忽略。

## 脚本工具

### Xaero 路点导入

`scripts/import-xaero.mjs` 可将 Xaero 小地图模组的本地路点批量转换为 MineGuide 景点数据，用于新增或校正 `anchors` 坐标：

```bash
node scripts/import-xaero.mjs -i <路点文件.txt> -o <景点数据.json>
```

- `-i/--input`：Xaero 路点 txt 文件，例如 `.../.minecraft/xaero/minimap/<世界名>/dim%0/mw0,-1,0_1.txt`。
- `-o/--output`：输出的景点数据 JSON，后缀必须为 `.json`。

脚本以路点名称为 Key：同名锚点仅更新 `position`，新名称则追加锚点。已有 JSON 的其余字段原样保留；若输出文件已存在，会先重命名为 `<原名>.bak.json` 再写入。被禁用的路点、空名称与坐标非法的行会被跳过，重名路点以最后一条为准并打印警告。

## 调试与日志

### 日志

日志输出到 stderr。日志级别由环境变量 `MG_LOG_LEVEL` 控制，可取 `debug`、`info`、`warn`、`error`，默认为 `info`：

```bash
# bash
MG_LOG_LEVEL=debug pnpm dev
```

```powershell
# PowerShell
$env:MG_LOG_LEVEL = "debug"; pnpm dev
```

在 `debug` 级别下，每个 Step（一次 LLM 请求）结束时会输出一行摘要，包含耗时、TTFT、token 用量与工具数量。`uncaughtException` 与 `unhandledRejection` 也会进入日志与调试页。

### 网页调试页

程序启动后会在 `127.0.0.1` 上启动调试页（仅本机可访问），并在日志中打印带随机 token 的地址：

```
[I] Core - Debug page: http://127.0.0.1:25564/?token=xxxxxxxxxxxxxxxx
```

在浏览器中打开该地址即可实时观测 Agent pipeline：

- **时间线**：`Input` / `Model` / `Tools` 三条泳道，`Model` 块中浅色部分表示 TTFT，进行中的块会实时增长；点击可查看详情。
- **事件流**：输入（USER / CONTEXT）、`ASSISTANT`（标注 `Turn n · Step m`）、`TOOL`、`COMPACT`、`ERROR` 卡片。
- **详情面板**：`Summary`（来源、状态、token 用量、开始时间、总耗时、TTFT、生成耗时、吞吐）、`Preview`（本次请求的完整消息）、`Raw`（原始请求与响应 JSON）。
- **Logs 标签**：与 pipeline 事件同一时间轴，可按级别与关键字过滤。
- 顶栏可暂停自动滚动、按类型/文本过滤，以及清空当前缓冲。

调试数据保存在内存环形缓冲中，进程重启即清空，不写入磁盘。token 每次启动随机生成，端口被占用时仅记录警告并禁用调试页，不影响运行。

## 参考资料

- Minecraft Java 版客户端（[官网](https://www.minecraft.net)
| [HMCL 启动器](https://hmcl.huangyuhui.net) | [PCL2 启动器](https://afdian.com/p/0164034c016c11ebafcb52540025c377)）
- Mineflayer 库（[GitHub](https://github.com/PrismarineJS/mineflayer)）
- Mineflayer Pathfinder 插件（[GitHub](https://github.com/PrismarineJS/mineflayer-pathfinder?tab=readme-ov-file)）
- Node.js 单可执行文件应用（[文档](https://nodejs.org/api/single-executable-applications.html)）
