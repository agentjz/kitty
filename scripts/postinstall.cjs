#!/usr/bin/env node

const lines = [
  "",
  "Kitty 已安装完成。",
  "",
  "常用起步命令：",
  "  kitty init      初始化当前项目配置",
  "  kitty status    查看当前运行事实",
  "  kitty           启动 TUI",
  "  kitty run       执行一次明确任务",
  "",
  "首次使用时，通常先在要工作的项目里运行 kitty init，然后填写 .kitty/.env 里的 KITTY_API_KEY。",
  "",
];

for (const line of lines) {
  console.log(line);
}
