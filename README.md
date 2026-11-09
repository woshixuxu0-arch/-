# JobFit AI H5 · v2.1.0

原项目升级，生产 Worker 仍为 `worker`，仓库仍为 `woshixuxu0-arch/-`。不创建新网站、不修改原来的独立 Sites 演示站。Dify 工作流输入继续使用 `resume`、`job_description`，输出使用 `result`。

## 文件导入与隐私

- 保留粘贴文本；简历和岗位要求都可选择单个 PDF、DOCX、TXT、JPG/JPEG 或 PNG。安卓文件选择器可选文件、相册图片。
- 所有解析都在浏览器本地运行：PDF.js 提取 PDF，Mammoth 提取 Word 文字，Tesseract 中文 / 英文 OCR 识别图片和扫描 PDF。
- **不使用第三方解析 API，也不上传原始文件。** 组件与语言模型由同一个 Cloudflare 站点提供；首次 OCR 下载约 10 MB 识别资源，之后浏览器可按普通静态资源策略缓存。缓存的是程序和语言数据，不是简历。
- 默认流程为：选择简历文件和招聘文件 / 截图 → 勾选数据处理同意 → 点击开始分析。系统在设备内自动识别两份文件，再提交识别文字，不强制弹出预览或手动复制。选文件本身不会请求 AI；也可主动点击「预览 / 编辑（可选）」核对识别文字。文字输入折叠保留，支持文件与手填混用。
- 不保存文件、识别文字或简历到服务端数据库、磁盘、localStorage、sessionStorage 或 IndexedDB。关闭 / 刷新页面后应用不保留文档。用户主动复制到剪贴板的内容由系统管理。
- Dify 及其工作流使用的模型服务可能保留输入和执行日志；站点无法控制第三方留存。请在 Dify 与模型供应商后台核对保留设置，并提示试用者移除敏感信息。

### 文件与设备限制

每个文件 ≤10 MiB；PDF ≤20 页，其中 OCR ≤5 页。可勾选「PDF 按扫描件识别」应对含水印 / 少量文字但主体为扫描图的文件。图片最长边缩至 2400 像素，拒绝异常尺寸或超过 4000 万像素的图片。DOCX 校验 ZIP 结构、最多 1000 项且声明解压内容 ≤24 MiB。提取 120 秒超时，可取消。识别后超出当前工作流上限会停止提交、展开文字编辑；不会静默截断或自动调用 AI。

不支持旧 DOC、HEIC、加密 PDF / DOCX；请先转换或移除密码。Word 内嵌图片不自动 OCR，请将图片导出为 JPG/PNG，或导出扫描 PDF 后导入。OCR 对模糊截图、复杂排版和手写文字可能不准，必须预览核对。低内存手机可优先上传 TXT 或少页 PDF。

## 服务端额度保护

使用 **一个 SQLite Durable Object** `QuotaLedger`，通过固定对象名 `jobfit-global-v1` 处理全站预留。`wrangler.jsonc` 包含原 Worker 的资产绑定、Durable Object 绑定与 `new_sqlite_classes` 迁移，部署时自动创建，无需另建数据库或填写新的密钥。

默认规则：

| 配置 | 默认值 | 意义 |
| --- | --- | --- |
| `VISITOR_DAILY_LIMIT` | `3` | 每个签名访客 Cookie 和每个网络地址当天分别最多预留 3 次 |
| `GLOBAL_DAILY_LIMIT` | `30` | 全站当天最多批准 30 次 AI 调用预留，可设 0 暂停 AI |

- 日期按 **北京时间 Asia/Shanghai 每天 00:00** 重置；日期键自动轮换，不依赖定时任务。
- 在同一个 SQLite `transactionSync` 中检查并同时更新全站、访客、网络三项计数。实际请求必须先成功预留，且每次预留只调用一次 Dify，不自动重试、也不跟随重定向。
- **统计的是已批准的调用尝试，而非成功报告数。** 网络错误、工作流失败、超时、用户取消仍占额度，不退回，防止因重试或不确定执行状态突破上限。无效输入和未同意提交不调用 AI、不占用日额度。
- 计数服务缺失、不可用、超时（5 秒）或异常时返回中文 503，**禁止调用 Dify**。没有内存计数降级放行。
- 使用 HttpOnly、Secure、SameSite=Lax 的 30 天匿名签名 Cookie。签名密钥在 DO 内自动生成并持久化，客户端不能伪造有效标识。Cookie 不含简历。
- 网络依据 Cloudflare 注入的 `CF-Connecting-IP`，不信任 `X-Forwarded-For`。IPv6 按 /64 归并；Cookie 重置仍受网络上限约束，换 IP 但保留 Cookie 仍受访客上限约束。每个网络每分钟最多 6 次有效分析尝试。
- **无登录无法识别真实自然人**：同时更换设备标识和代理 IP 可绕过个人额度，但仍不能超过全站原子上限；共享 Wi-Fi / 运营商 NAT 用户可能共用 3 次网络额度。
- 计数只存日期、次数、按日 HMAC 后的匿名访客 / 网络摘要，不保存原始 IP、简历或结果。每次访问会惰性清理 7 天前的计数和旧分钟桶；签名密钥长期保留。无访问时不会主动运行清理任务。
- API 仅接受 JSON，两个文本变量各 20–20,000 字符，总请求体 ≤180 KB；读取请求体 10 秒，Dify 请求 115 秒超时。没有文件上传 API，直接提交 multipart 文件返回 415。

### 硬上限的准确边界

本系统能保证：**在当前这一个生产 Worker、同一个 DO namespace / 固定对象名下，每个额度日期最多批准配置数量的 Dify API 调用尝试**，跨并发、边缘实例与运行时重启仍由持久化账本约束。

初次升级前的旧版调用没有历史计数，因此升级当日从启用新账本时开始统计。不要删除 / 重建 DO namespace、改固定对象名、重置存储，或另外部署绕过账本的调用端。直接在 Dify、其他站点或工作流里调用不属于此上限。

这不是费用金额硬上限：一次工作流可能运行多个模型节点或使用不同 Token 数量。实际 AI 费用仍按 Dify / 模型供应商配置计费；应同时设置供应商预算与工作流输出长度限制。Cloudflare 的网页 / API / DO 请求量也独立计费或受免费额度限制。

## 怎样查看 / 调整额度

首页「今日 AI 额度」显示你 / 当前网络剩余次数、全站已批准次数与上限。点击「刷新额度」不消耗 AI 次数。

`GET /api/usage` 返回同样的汇总 JSON、北京时间日期和重置时刻，不包含密钥、IP 或简历。查看真实 Token / 金额，请打开 Dify 工作流的日志 / 运行记录，以及模型供应商账单。工作流失败也会占本站已预留次数，两者不能直接按成功报告数对账。

调整上限：修改 `wrangler.jsonc` 的两个公开 `vars` 后提交并部署。降低上限不会清零已有计数，已用超过新上限即停止。不要删除 DO 以「重置」额度。

## 部署与 Secret

原 Cloudflare 项目：生产分支 `main`，根目录为仓库根，部署命令 `npx wrangler deploy`。配置里的 `build.command` 自动执行 `npm run build`。依赖已用 `package-lock.json` 锁定，静态 PDF / OCR 资源与 Worker 一同部署。

唯一必需的敏感变量仍是 **运行时 Secret `DIFY_API_KEY`**，在 Cloudflare `worker → 设置 → 运行时变量和密钥 → 生产` 中由所有者自行填写。不要填到构建变量、前端、代码仓库或聊天。已有的 Secret 会由 Wrangler 保留，本升级不读取或改写它。

`DIFY_API_URL=https://api.dify.ai/v1` 为公开配置，已写入 `wrangler.jsonc`。检查 `/api/config` 的 `version: "2.1.0"`、`mode: "live"` 与 `quotaProtected: true`；配置存在不代表真实工作流已运行，需一次脱敏材料测试确认。

迁移若因 Cloudflare 账户权限 / 配额受阻，不应移除计数器强行发布。修复账户绑定后重试构建即可；计数不可用时真实 AI 保持停止。

## Cloudflare 成本

依据 [Cloudflare Durable Objects 官方定价](https://developers.cloudflare.com/durable-objects/platform/pricing/)，SQLite Durable Objects 支持 Workers Free：每天 100,000 个 DO 请求、13,000 GB-s 时长，SQLite 每天 500 万行读取、10 万行写入，总存储 5 GB。平台可调整额度，以账号控制台和官方最新定价为准。

按每天最多 30 次 AI 预留和少量访问估算，计数写入 / 存储很小，正常 MVP 试用通常可处于免费配额内。访问页面、读取额度、被拒绝的请求仍会消耗相应 Workers / DO 用量；遇到恶意流量、已有账户其他业务或付费计划时不能保证 Cloudflare 账单为零。本升级不会开通或升级付费套餐。

本地文件解析和 OCR **没有第三方解析服务调用费**；主要代价是手机流量、CPU、内存与电量。Dify 的真实分析仍可能产生原有模型费用。

## 开发与验证

Node.js 22+；先 `npm ci`，再 `npm start`。本地使用 Miniflare / workerd 和 SQLite DO，默认无 Dify Key，仅演示，不请求付费模型。`.wrangler` 本地计数文件已被 Git 忽略。部署目标是 Cloudflare Workers；旧 Node server / Docker 启动方式不用于 v2 生产额度保护。

- `npm run check`：构建、语法检查、API / 文件校验 / 真实 SQLite DO 并发和重启持久化测试。
- `npm run build`：输出 `dist/server/index.js` 与同源 `dist/client` PDF / OCR 资源，不读取或打包 Secret。
- 本地预览运行时，`CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-check.mjs`：生成虚构 TXT、DOCX、文字 PDF、JPG、PNG、扫描 PDF，验证本地提取、预览确认、伪装格式拒绝、手机视口与不上传文件的网络断言。

真实 Android 设备和不同字体 / 扫描质量仍需用户试用反馈。整个项目不含登录、收费或业务数据库功能；SQLite 仅用于额度与安全元数据。

## v2.0.1 手机 PDF 兼容性修复

PDF 主模块与后台 Worker 统一使用官方 legacy 构建，为缺少 Uint8Array.toHex / Base64、Promise.withResolvers、Map.getOrInsertComputed 等新接口的手机补齐兼容支持。Worker 使用新文件路径，避免复用旧版资源。遇到解析器内部异常时提供中文重试 / 粘贴文本提示。

`LEGACY_BROWSER_TEST=1 npm run test:browser` 在页面和 PDF Worker 中移除上述新版接口，验证文字 PDF、扫描 PDF、OCR 和导入预览；保留原隐私规则、额度和 Secret 配置。

## v2.0.2 Dify 输入与错误诊断

新增只读 `/api/input-limits`。服务端使用现有 Secret 读取 Dify `/parameters`，仅向浏览器返回 resume、job_description 的数值长度限制，绝不返回默认值、凭据或原始工作流配置。元数据读取不运行模型、不消耗本站 AI 次数；短期缓存最多 60 秒。无法读取时明确标记使用站点上限，不能把它当作 Dify 已确认上限。

前后端均检查已经确认的 Dify 上限；超长内容在扣额度和调用工作流前拒绝，已有输入不静默截断。Dify 参数、认证、额度、未发布、上游异常分别提供固定中文提示与安全错误代码，不透传可能含个人内容的原始上游报错。

若 Dify 中变量上限低于实际简历需求，需在 Dify 工作流起始节点提高 resume / job_description 的最大长度，并重新发布；本站不拥有 Dify 编辑权限，无法通过运行 API 修改工作流。修改发布后最多等一分钟刷新，或重新打开网页。

`node scripts/input-limits-browser-check.mjs` 验证手机页面的上限同步、超长拦截、保留原文及中文错误。读取参数接口不代表 AI 调用成功，真实执行仍受原有 3 / 30 次硬额度保护。

## v2.1.0 选文件后一键分析

原始文件仍只保留在当前页面内存。默认选择文件后不做 OCR、不打开弹窗、不提交分析；在勾选同意后点击一次开始分析，按简历、岗位顺序本地识别，再发送现有两个文本变量。预览、编辑与手填均为可选入口。识别结果可能有错字，建议使用已脱敏且清晰的文件；用户可在分析前选择核对。

识别失败、取消识别或文字超限时停止在付费请求之前。已经进入 Dify 阶段的失败 / 取消仍按原额度规则计数。不自动重试 Dify；失败后保留文件和文字，修正后可重试。自动提取过的文字可编辑，重试不会用原文件覆盖编辑内容，除非重新选择文件或主动改变扫描识别方式。

验证：`node scripts/direct-analysis-browser-check.mjs` 覆盖文件 + 招聘图片一键识别分析、同意门槛、重复点击、文件 / 文字混用、解析失败、超长保留原文、编辑重试及取消。使用模拟分析接口，不消耗真实 AI 次数。`scripts/browser-check.mjs` 继续覆盖可选预览的六种格式与旧浏览器兼容。
