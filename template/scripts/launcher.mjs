// Mac 上手动打开工作台用的“启动工作台.command”：安装时放进工作台文件夹（install.mjs 的 finish 也认这个位置）。
// 以前由 AI 搭建时现写，写法每次不一样（2026-11-24 实测有一次去探不存在的 /api/health），改成安装时统一生成。
// 已经有了就不动（老板或 AI 可能改过）；路径里有引号、反斜杠、$、` 的不写，免得脚本跑错。Windows 的启动文件在 autostart.mjs。
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const unsafe = (p) => /["\\$`]/.test(p)

/** @param {{ app: string, root: string, db: string, port: number }} ctx */
export function macLauncherText({ app, root, db, port }) {
  const url = `http://127.0.0.1:${port}`
  return `#!/bin/zsh
# 老板工作台：双击启动，网页 ${url} ；关掉这个窗口就停了。
URL="${url}"
cd "${app}" || { echo "找不到程序文件夹：${app}"; read -k1 "?按任意键关闭…"; exit 1; }

# 已经开着就直接打开网页
if curl -s -o /dev/null --max-time 2 "$URL/"; then
  echo "工作台已经开着了：$URL"; open "$URL"; exit 0
fi

# 找 node（要 22.18 以上）：先用当前环境里的，没有就从 nvm、Homebrew 装的里挑
NODE="$(command -v node 2>/dev/null)"
if [[ -z "$NODE" ]]; then
  for d in $(ls -d "$HOME"/.nvm/versions/node/v*/bin(N) 2>/dev/null | sort -V -r); do
    [[ -x "$d/node" ]] && { NODE="$d/node"; break; }
  done
fi
[[ -z "$NODE" && -x /opt/homebrew/bin/node ]] && NODE=/opt/homebrew/bin/node
[[ -z "$NODE" && -x /usr/local/bin/node ]] && NODE=/usr/local/bin/node
if [[ -z "$NODE" ]]; then echo "没找到 Node.js（要 22.18 以上）。装好以后再双击。"; read -k1 "?按任意键关闭…"; exit 1; fi

export WORKBENCH_ROOT="${root}" WORKBENCH_DB="${db}" PORT=${port}
echo "启动中：$URL （用的是 $("$NODE" -v)）。关掉这个窗口就停了。"
(for i in {1..30}; do sleep 1; curl -s -o /dev/null --max-time 1 "$URL/" && { open "$URL"; break; }; done) &
"$NODE" server/index.ts
echo "工作台停了。上面如果有报错，截图发给 AI。"
read -k1 "?按任意键关闭…"
`
}

/** 写好返回文件路径；已经有了、或路径不安全，返回 null */
export function writeMacLauncher(ctx) {
  const file = join(ctx.root, '启动工作台.command')
  if (existsSync(file) || [ctx.app, ctx.root, ctx.db].some(unsafe)) return null
  writeFileSync(file, macLauncherText(ctx), 'utf8')
  chmodSync(file, 0o755)
  return file
}
