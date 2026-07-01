#!/usr/bin/env node

const lines = [
  "",
  "Kitty 已安装完成。",
  "",
  "常用起步命令：",
  "  kitty init      初始化当前项目配置",
  "  kitty doctor    检查 API key 和 provider 连接",
  "  kitty           启动 TUI",
  "  kitty agent     启动文字版交互",
  "",
  "首次使用时，通常先在要工作的项目里运行 kitty init，然后填写 .kitty/.env 里的 KITTY_API_KEY。",
  "",
];

for (const line of lines) {
  console.log(line);
}
