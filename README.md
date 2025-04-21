# MineGuide

An agent guide in Minecraft.

## 开发指南

### 环境要求

前置条件：

1. 语言环境：**Python** >= 3.9（[官网](https://www.python.org)）
2. 安装 **Minecraft** Java 版客户端（[官网](https://www.minecraft.net) 
| [HMCL 启动器](https://hmcl.huangyuhui.net) | [PCL2 启动器](https://afdian.com/p/0164034c016c11ebafcb52540025c377)）。
3. 克隆本仓库到本地。

### 安装依赖

本项目使用 **Poetry** 作为依赖管理工具（[官网](https://python-poetry.org) | [安装教程](https://python-poetry.org/docs/#installation)）。如果您不想使用或者想使用其他的依赖管理工具，请参照 [pyproject.toml](pyproject.toml) 来安装所需的依赖库。

在安装 Poetry 后，进入仓库根目录。使用如下命令来初始化虚拟环境和安装依赖库：

```bash
poetry env use python
poetry install
```

依赖安装完毕后，如果您使用的 IDE 是 VS Code，请选择 Python 解释器为 `3.x.x ('mine-guide-xxx': Poetry)`。

### 开始调试

打开 Minecraft 客户端并进入任意存档，随后将客户端开放至局域网（端口号必须与程序内所定义的一致）。运行 Main.py，智能体将尝试连接并加入到 Minecraft 中。初次运行需要少许时间下载额外的 JS 依赖库。
