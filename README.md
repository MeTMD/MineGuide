# MineGuide

An agent guide in Minecraft.

## 开发指南

### 环境要求

前置条件：

1. 语言环境 **Python** >= 3.9（[官网](https://www.python.org)）
2. 拥有一个 Minecraft 客户端或服务器。
3. 克隆本仓库到本地。

### 安装依赖

本项目使用 **Poetry** 作为依赖管理工具（[官网](https://python-poetry.org) | [安装教程](https://python-poetry.org/docs/#installation)）。如果您不想使用或者想使用其他的依赖管理工具，请参照 [pyproject.toml](pyproject.toml) 来安装所需的依赖库。

在安装 Poetry 后，进入仓库根目录。使用如下命令来初始化虚拟环境和安装依赖库：

```bash
poetry env use python
poetry install
```

依赖安装完毕后，如果您使用的 IDE 是 VS Code，请选择 Python 解释器为 `3.x.x ('mine-guide-xxx': Poetry)`。

### 数据配置

在运行程序前，请先阅读[配置指南](#配置指南)章节，并正确配置程序运行时的环境变量和其他必须的数据。

数据配置完成后，运行 Main.py，智能体将尝试连接并加入到 Minecraft 中。初次运行需要少许时间下载额外的 JS 依赖库。

### 构建分发

运行 Build.py 以构建可执行文件。

## 配置指南

程序依赖于以下两类配置文件，当程序启动时会读取它们。

### 环境变量配置文件

文件 `mg.config.env` 是环境变量配置文件，它记录了程序运行所需的重要信息，例如 Minecraft 服务器地址等。在根目录中，提供有示例文件 `mg.config.env.example`，您可以拷贝该文件，并删除 `.example` 后缀，然后修改配置文件的内容。

### 景点数据配置文件

文件夹 `data` 中，以 JSON 格式存储着景点数据（每个景点对应一张 Minecraft 地图），包括景点的基本信息、景点中的各锚点坐标等。您可以参照示例，根据您的需求来编写景点数据文件。在 `data` 文件夹下，可以存储多个景点数据文件，要想指定智能体所载入的景点，只需在 `mg.config.env` 中进行指定。

## 参考资料

- Minecraft Java 版客户端（[官网](https://www.minecraft.net) 
| [HMCL 启动器](https://hmcl.huangyuhui.net) | [PCL2 启动器](https://afdian.com/p/0164034c016c11ebafcb52540025c377)）
- Mineflayer 库（[GitHub](https://github.com/PrismarineJS/mineflayer)）
- Mineflayer Pathfinder 插件（[GitHub](https://github.com/PrismarineJS/mineflayer-pathfinder?tab=readme-ov-file)）
