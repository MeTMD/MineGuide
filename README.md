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

### 安装依赖

进入仓库根目录，执行：

```bash
pnpm install
```

### 运行

在运行程序前，请先阅读[配置指南](#配置指南)章节，并正确配置 `mg.config.env` 与景点数据。

完成后执行：

```bash
pnpm dev
```

智能体将尝试连接并加入 Minecraft 服务器。

### 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 以 tsx 直接运行，开发调试用 |
| `pnpm test` | 运行 vitest 单元测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm build` | 打包为单文件 `dist/main.cjs`（需设置 `MC_VERSIONS`） |
| `pnpm build:sea` | 构建单文件可执行程序（Windows 为 `.exe`，Linux/macOS 无扩展名） |

### 项目结构

```
main.ts                程序入口
src/core.ts            主流程、消息分发、FCFC 函数调用解析、串行队列
src/data.ts            INI 配置解析与校验、景点数据 Zod 校验、路径基准
src/logger.ts          日志输出（[L] Module - message）
src/queue.ts           有界串行队列
src/vector.ts          坐标格式化
src/api/bot.ts         mineflayer 封装（连接、聊天、寻路、事件回调）
src/chat/agent.ts      OpenAI 客户端、流式输出、记忆窗口
src/chat/prompts.ts    导游人设与提示词
src/chat/think.ts      <think> 跨 chunk 剥离状态机
scripts/build-sea.mjs  SEA 构建脚本
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

版本号会解析到 `minecraft-data` 的版本块，并自动带上其引用到的旧版本数据；无法解析时构建报错。若目标服务器版本不在所选集合内，运行时会连接失败，因此请按目标服务器版本构建。

构建脚本使用 Node.js 24 的 SEA（Single Executable Application）与 postject 注入，产物输出到 `build/`：Windows 为 `MineGuide-v<version>.exe`，Linux/macOS 为 `MineGuide-v<version>`（Linux 会自动补上可执行权限）。

> **必须在目标平台上构建**：SEA 是把打包脚本注入本机 `node` 二进制，无法交叉编译（在 Windows 上只能产出 Windows 产物）。构建机需 Node >= 24，而运行产物无需安装 Node。Linux 依赖 glibc（不支持 Alpine 等 musl 发行版）；macOS 仅支持 arm64 且尚未验证。

分发时请将 `mg.config.env` 与 `data/` 目录放在可执行文件**同目录**下：程序以可执行文件所在目录为基准查找配置与景点数据（开发模式下以工作目录为基准）。

## 配置指南

程序依赖于以下两类配置文件，当程序启动时会读取它们。

### 环境变量配置文件

文件 `mg.config.env` 是环境变量配置文件，它记录了程序运行所需的重要信息。在根目录中，提供有示例文件 `mg.config.env.example`，您可以拷贝该文件，并删除 `.example` 后缀，然后修改配置文件的内容：

- `[Connection]`：Minecraft 服务器地址、端口与机器人用户名。
- `[Scene]`：载入的景点数据文件（位于 `data/` 目录下）。
- `[LLM]`：`model_name` 指定模型名称；可选 `history_rounds` 控制发送给 LLM 的最近对话轮数（user + assistant 记 1 轮），默认 20，填 0 表示不截断。
- `[LLMClient]`：OpenAI 兼容客户端参数，支持 `baseURL`、`apiKey`（必填）、`timeout`（单位：秒）、`maxRetries`、`defaultHeaders`（JSON 对象）。出现未知键会在启动时报错。

> 本项目仅支持标准 OpenAI 兼容接口，不再支持 USTB 专用客户端（原 `ustb_openai`）。

### 景点数据配置文件

文件夹 `data` 中，以 JSON 格式存储着景点数据（每个景点对应一张 Minecraft 地图），包括景点的基本信息（`meta`）与各锚点（`anchors`）的名称、别称、坐标与描述。您可以参照示例，根据您的需求来编写景点数据文件。在 `data` 文件夹下，可以存储多个景点数据文件，要想指定智能体所载入的景点，只需在 `mg.config.env` 中进行指定。

> 旧版数据中的 `routes` 字段已废弃，校验时会被忽略。

## 参考资料

- Minecraft Java 版客户端（[官网](https://www.minecraft.net)
| [HMCL 启动器](https://hmcl.huangyuhui.net) | [PCL2 启动器](https://afdian.com/p/0164034c016c11ebafcb52540025c377)）
- Mineflayer 库（[GitHub](https://github.com/PrismarineJS/mineflayer)）
- Mineflayer Pathfinder 插件（[GitHub](https://github.com/PrismarineJS/mineflayer-pathfinder?tab=readme-ov-file)）
- Node.js 单可执行文件应用（[文档](https://nodejs.org/api/single-executable-applications.html)）
