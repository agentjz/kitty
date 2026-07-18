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

如果显示 `v22.13.0` 或更高版本，可以继续。

如果提示“不是内部或外部命令”，打开 https://nodejs.org/ ，安装 Node.js 22.13.0 或更高版本。安装完成后关闭 CMD，重新按 `Win + R`，输入 `cmd` 再打开。

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

## 阶段五：打开 Kitty 本地控制台

确认 CMD 已经进入项目目录，然后输入：

```cmd
kitty start
```

Kitty 会在当前项目创建 `.kitty` 文件夹，并自动打开只连接本机的配置页面。它保存这个项目自己的配置和运行现场。浏览器没有自动打开时，手动打开终端显示的地址。

## 阶段六：配置并测试模型

页面默认使用简体中文，也可以在“其他设置”的“界面语言”中选择英文、日文或韩文。“语言模型设置”会显示短配置位置 `.kitty/.env`，用于确认当前 Provider、模型、Base URL、API Key 和模型行为；切换 Provider 后需要填入它对应的 API Key，再保存并发送测试请求。“插件和 Skill”管理 Extension 开关并查看项目 Skill，其余运行参数位于“其他设置”。

不要把真实 API key 发给别人，也不要把 `.kitty/.env` 上传到公开仓库。

配置完成后可以关闭网页和运行 `kitty start` 的终端；需要登录或运行微信、Telegram，调整运行设置或查看 Skill 时，再运行 `kitty start`。定时任务由 Kitty 对话中的 scheduler 工具管理。

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
| `kitty start` | 初始化项目并打开本地控制台 |
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

Node.js 没有安装成功，版本低于 22.13.0，或者安装后还没有重新打开 CMD。安装 Node.js 22.13.0 或更高版本，再打开新的 CMD。

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
