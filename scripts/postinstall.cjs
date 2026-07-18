#!/usr/bin/env node

const lines = [
  "",
  "Kitty 已安装完成。",
  "",
  "常用起步命令：",
  "  kitty start     初始化项目并打开本地控制台",
  "  kitty status    查看当前运行事实",
  "  kitty           启动 TUI",
  "  kitty run       执行一次明确任务",
  "",
  "首次使用时，在要工作的项目里运行 kitty start，然后在本地页面配置并测试模型。",
  "",
];

for (const line of lines) {
  console.log(line);
}
