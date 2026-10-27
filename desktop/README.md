# JobHunter 桌面版（Electron）

把现有 Next.js 应用包成 Windows 桌面程序：双击 `JobHunter.exe` 打开独立窗口，免登录，数据落在
`%LOCALAPPDATA%\JobHunter`。Web / Docker 部署方式完全不受影响。

## 一、运行原理

```
JobHunter.exe (Electron 主进程)
  ├─ 读/建 %LOCALAPPDATA%\JobHunter\config.json（JWT_SECRET / AI_KEY_MASTER_SECRET / 窗口状态）
  ├─ 取空闲端口 → spawn resources\runtime\node.exe resources\app\launcher.cjs
  │      env: NODE_ENV=production AUTH_MODE=local APP_DATA_DIR=… DB_PATH=… PORT=… HOSTNAME=127.0.0.1
  └─ 轮询 /api/v1/health 到 db=ok → 打开 http://127.0.0.1:<port>/dashboard
```

- 内置的是**官方 node.exe**，不是 Electron 的 Node：`better-sqlite3` 是原生模块，本机没有 MSVC 无法按 Electron ABI 重编，
  所以走「自带运行时」这条路，构建用的 Node 必须与随包 node.exe 版本一致（22.22.2 / ABI 127）。
- 数据目录由 `APP_DATA_DIR` 注入，`DB_PATH` 必须是该目录下的绝对路径（`src/server/config/db-path.ts` 会在加载期校验）。

## 二、构建（三条命令）

> 下列命令在 **PowerShell** 中执行（Windows PowerShell 5.1 不支持 `&&`，请分行执行；本机验证环境为 PowerShell 7）。

前置：Node **22.22.2**（`process.versions.modules === "127"`），网络可访问 nodejs.org 与 npm。

```bash
# 1) 隔离副本里装依赖 + next build(standalone) + 组装 build/app
node desktop/scripts/prepare-build.mjs --src D:\text02 --dest D:\jh-desktop-build

# 2) 取官方 node.exe（校验 ABI 127）
node desktop/scripts/fetch-node.mjs --version 22.22.2

# 3) 打包前冒烟（不通过就不要出包）
node desktop/scripts/make-fixtures.mjs          # 首次执行，生成 sample.pdf/docx
node desktop/scripts/verify-app.mjs

# 4) 出包
cd desktop && npm ci && npx electron-builder --win nsis portable --x64
```

产物：`desktop/release/JobHunter-<version>-x64.exe`（安装版）与 `JobHunter-<version>-portable.exe`。

> **为什么要隔离副本**：本机 `D:\text02\node_modules` 是按 Node 24（ABI 137）装的，直接在里面 `npm ci`
> 会把开发环境的依赖翻成 127，导致 `npm test` 与正在跑的 dev server 出问题。

## 三、界面里有什么

- **首次启动向导**：欢迎 → 数据位置 → 完成（三步，不会要求登录）。
- **主窗口**：直接加载应用自身的 5 个入口（仪表盘 / 简历工作台 / 职位中心 / 官方招聘导航 / 设置）。
- **菜单**：文件（打开数据目录、打开日志、立即备份、从备份恢复、退出）、视图（刷新/缩放）、帮助（关于）。
- **托盘**：显示主界面、打开数据目录、立即备份、退出。
- **失败页**：启动超时/数据库损坏/目录不可写时给出原因 + 打开日志 + 重试入口。

关闭窗口即退出（不做开机自启，不留后台 node 进程）。托盘仅用于把最小化的窗口叫回来。

## 四、数据、日志与备份

| 内容 | 位置 |
|---|---|
| 数据库 | `%LOCALAPPDATA%\JobHunter\data\jobhunter.db`（WAL） |
| 上传文件 | `%LOCALAPPDATA%\JobHunter\data\uploads\` |
| 配置（含两个密钥） | `%LOCALAPPDATA%\JobHunter\config.json` |
| 日志 | `%LOCALAPPDATA%\JobHunter\logs\server-YYYYMMDD.log` |
| 备份 | 菜单「立即备份」→ 选目录 → `JobHunter-backup-<时间>/` |

- `JWT_SECRET` 与 `AI_KEY_MASTER_SECRET` **首次生成后不再改写**；后者丢失会导致已保存的 AI Key 解不开（需重填）。
- 想换数据位置：退出程序 → 移动整个 `data` 目录 → 改 `config.json` 的 `dataDir`。

## 五、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 启动失败并提示「数据目录不可写」 | 目录被安全软件锁定或磁盘只读；换目录或加白名单 |
| 首次双击 portable 后长时间没有窗口 | 首次启动要先把 ~3000 个文件解压到 `%TEMP%\<随机目录>`（约 20-40 秒，机械盘/安全软件扫描下更久），属正常现象；**不要连续双击**，重复运行会重复解压同一目录、反而引发文件占用 |
| 启动超时 / 提示「服务进程提前退出」 | 打开日志看 `server-*.log`：启动器会自动重试 3 次（仅针对 EBUSY/EPERM/EACCES 等文件占用类瞬时错误）；仍失败时日志尾部附在弹窗详情里，常见是数据库损坏或安全软件持续锁定 |
| 首次运行弹「Windows 已保护你的电脑」 | 未签名包，点「更多信息 → 仍要运行」；拿到证书后 `CSC_LINK=xxx.pfx CSC_KEY_PASSWORD=*** npm run dist` 重出 |
| 页面白屏 | 多为系统代理劫持了 127.0.0.1；主进程已加 `--no-proxy-server`，仍有问题请检查 PAC |
| 卸载后想彻底清空 | 卸载默认保留数据；手动删 `%LOCALAPPDATA%\JobHunter` |

## 六、不变量（改动时守住）

1. `APP_DATA_DIR` 不设时，DB 与上传仍落 `<cwd>/data`（dev / Docker / 测试行为不变）。
2. `AUTH_MODE=local` 才免登录；不设时 production 仍要求登录。
3. 桌面代码全部在 `desktop/`，不进 `next build` 产物。
4. 现有 42 个测试文件必须全绿，`npm run typecheck` 0 错。
