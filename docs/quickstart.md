# Kitty 小白快速启动

这份教程写给第一次使用命令行的人。只要按顺序完成，不需要先理解编程、Agent 或 Git。

## 阶段一：打开 Windows 命令行

1. 同时按住键盘上的 `Win + R`。
2. 左下角会出现“运行”窗口。
3. 输入 `cmd`。
4. 按 `Enter`。

现在看到的黑色窗口就是 CMD。后面的命令都在这个窗口输入。每输入一行，就按一次 `Enter`。

## 阶段二：检查 Node.js

输入：

```cmd
node --version
```

如果显示 `v22` 或更高版本，可以继续。

如果提示“不是内部或外部命令”，打开 https://nodejs.org/ ，安装 Node.js 22 或更高版本。安装完成后关闭 CMD，重新按 `Win + R`，输入 `cmd` 再打开。

再检查 npm：

```cmd
npm --version
```

能显示版本号就可以进入下一阶段。

## 阶段三：安装 Kitty

输入：

```cmd
npm install -g @jun133/kitty
```

安装结束后检查：

```cmd
kitty --version
```

能看到版本号，说明 Kitty 已安装。

## 阶段四：进入你的项目文件夹

Kitty 会在“当前文件夹”工作，所以先进入你的项目。

例如项目在 `D:\my-project`：

```cmd
cd /d D:\my-project
```

没有项目也可以先建一个练习文件夹：

```cmd
mkdir D:\kitty-demo
cd /d D:\kitty-demo
```

不知道文件夹路径时：在文件资源管理器中打开文件夹，点击顶部地址栏，复制完整路径，再把它放到 `cd /d` 后面。

路径里有空格时要加双引号：

```cmd
cd /d "D:\My Project"
```

## 阶段五：初始化 Kitty

确认 CMD 已经进入项目目录，然后输入：

```cmd
kitty init
```

Kitty 会在当前项目创建 `.kitty` 文件夹。它保存这个项目自己的配置和运行现场。

## 阶段六：填写 API Key

用记事本打开配置：

```cmd
notepad .kitty\.env
```

找到：

```dotenv
KITTY_API_KEY=
```

把你的 provider API key 填在等号后面，例如：

```dotenv
KITTY_API_KEY=你的APIKey
```

不要把真实 API key 发给别人，也不要把 `.kitty/.env` 上传到公开仓库。

保存记事本并关闭。

## 阶段七：启动 Kitty

输入：

```cmd
kitty
```

现在可以直接描述任务，例如：

```text
先阅读这个项目，告诉我它是做什么的，不要修改文件。
```

或者：

```text
检查当前失败的测试，找到根因，修复后重新验证。
```

## 只需要记住这些命令

| 命令 | 作用 |
| --- | --- |
| `kitty` | 启动 Kitty |
| `kitty init` | 初始化当前项目 |
| `kitty resume` | 继续最近会话 |
| `kitty status` | 查看当前现场 |
| `kitty run <prompt>` | 在新会话中执行一次任务 |
| `kitty --version` | 查看版本 |

其他命令不需要背：

```cmd
kitty --help
```

进入 TUI 后，输入 `/` 可以查看命令；空输入时按 `?` 可以查看键位。

## 常见问题

### `kitty` 不是内部或外部命令

先关闭 CMD 再重新打开。如果仍然失败，重新安装：

```cmd
npm install -g @jun133/kitty
```

### `npm` 不是内部或外部命令

Node.js 没有安装成功，或者安装后还没有重新打开 CMD。重新安装 Node.js 22，再打开新的 CMD。

### 提示缺少 API Key

重新打开配置：

```cmd
notepad .kitty\.env
```

填写 `KITTY_API_KEY`，保存后运行：

```cmd
kitty
```

### 进入了错误的文件夹

先按 `Ctrl + C` 停止当前操作，再用下面的格式进入正确目录：

```cmd
cd /d "你的项目完整路径"
```

然后重新运行 `kitty`。
