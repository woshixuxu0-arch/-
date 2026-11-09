# JobFit AI

面向中国求职者的中文 H5 简历与岗位匹配 MVP。移动端优先，蓝白界面，无账号、收费或数据库。

## 当前状态

默认 **Mock 演示**，未连接真实 AI。演示只返回固定的五部分结构示例，不评估输入，不虚构分数、技能、经历。演示请求不发送用户粘贴的文本。

技术栈：原生 HTML / CSS / JavaScript + Node.js 22+ 服务端；零运行时 npm 依赖。支持 Docker，也可构建为 Cloudflare Worker ESM。无需在安卓手机上配置开发环境。

## 本地 / 云端运行

```sh
npm start
# http://localhost:3000
npm run check
npm run build
```

没有依赖安装步骤。Node 22+。可在 GitHub Codespaces 中运行，Ports 面板打开 3000 端口。

## 当前 Cloudflare Workers 部署

此仓库 `woshixuxu0-arch/-` 用于 JobFit AI，目标 Cloudflare Worker 名为 `worker`。仓库名字是一个连字符，不影响 Git 克隆。原来的公开 `chatgpt.site` 网站由 Sites 独立托管，不会随本仓库推送更新。

源码不含 API 密钥。`wrangler.jsonc` 仅配置公开的 `DIFY_API_URL=https://api.dify.ai/v1`。缺少 `DIFY_API_KEY` 时网站维持演示模式。

### 手机端最少操作

1. Cloudflare → Workers & Pages → **worker** → Builds：连接 `woshixuxu0-arch/-`，生产分支 `main`，根目录为仓库根目录。
2. 部署命令使用 `npx wrangler deploy`。Build command 可留空；Wrangler 自动执行配置中的 `npm run build`。如果已填 `npm run build` 也可正常运行。
3. 首次提交后，Cloudflare 通常自动触发构建；若未触发，在 Builds 点击 Retry／重试。
4. 部署成功后，进入 **worker → Settings → Variables and Secrets → Add**：Type 选择 **Secret**，Variable name 填 `DIFY_API_KEY`，Value 在 Cloudflare 自己的安全输入框粘贴工作流密钥。点击 Deploy／Save and deploy，使 Secret 应用于当前运行版本。不要填在 Build variables、代码编辑器或 GitHub 中。
5. 点击 worker 的 Visit／访问地址。确认显示 Dify 接入模式，用脱敏材料测试；配置模式不等于已验证 API 通畅。

如果 Cloning 仍失败，查看该次日志并检查 Cloudflare 的 GitHub App 是否被授权访问此仓库；没有明确证据前不要更改其他项目的权限。

### 其他部署方式

本项目也可用 Docker 部署至支持 Node Web Service 的平台。使用根目录 Dockerfile，平台 Environment／Secrets 填写 `DIFY_API_URL` 与 `DIFY_API_KEY`。Node 服务监听平台提供的 `PORT`。GitHub Pages 只能托管静态文件，无法运行保管密钥的服务端 API。

## 接入现有 Dify 工作流

只需要配置服务端环境变量（参考 `.env.example`）：

| 变量 | 内容 |
| --- | --- |
| `DIFY_API_URL` | 工作流「访问 API」页面的基础 URL，例如 `https://api.dify.ai/v1`，不含 `/workflows/run` |
| `DIFY_API_KEY` | 该已发布工作流的 API Key，仅存放在服务端 Secrets |
| `PORT` | Node 服务端端口，默认 3000，云平台通常自动提供 |

两项 Dify 变量均非空时进入接入模式，模式标记表示配置存在，连通性在首次分析时验证。未配置完整时保持演示。Dify Web App 分享链接不是 API 地址。

调用链：浏览器 → 同源 `POST /api/analyze` → 服务端携带 Bearer Key → `POST {DIFY_API_URL}/workflows/run`。请求为：

```json
{
  "inputs": {"resume": "用户简历", "job_description": "岗位要求"},
  "response_mode": "blocking",
  "user": "每次请求随机生成的匿名 UUID"
}
```

读取 `data.outputs.result`，检查 `data.status === "succeeded"`。不使用对话接口，不修改你现有的输入变量。

### 推荐 result 格式

为了稳定分区展示，建议在现有工作流的提示词中要求 `result` 为以下 JSON 字符串，或含同名标题的 Markdown；不必改两个输入变量：

```json
{
  "岗位匹配": "逐项比较岗位要求与简历证据，不凭空给分",
  "个人优势": "引用简历中的真实证据，并对应岗位要求",
  "主要不足": "区分能力不足与简历尚未体现；无法判断时说明",
  "简历优化建议": "只优化真实经历的表达，不杜撰数据或成果",
  "下一步行动": "具体、可执行的准备清单"
}
```

已有工作流返回其他文本时仍安全展示完整原文，避免误分或丢失内容。所有模型输出通过 `textContent` 展示，不执行 HTML。前端无法保证模型永不产生错误，必须在工作流约束并人工核实。没有伪造分数或补全经历的前端逻辑。

## 隐私与安全边界

- 本应用不写磁盘保存输入，不使用数据库、浏览器持久存储、分析埋点或请求正文日志。刷新后页面清空；系统剪贴板由用户主动复制触发。
- 真实模式必须明确勾选单次数据处理同意。内容发送至 Dify 与其配置的模型供应商，第三方可能保留运行记录；上线前检查其日志与保留政策。没有「绝不离开设备」的承诺。
- 服务端限制每个字段 20–20,000 字符、总请求体 180KB，限制请求方法与跨站来源，115 秒上游超时；不将 Dify 原始错误或密钥返回给用户。
- Node 版本每实例最多两次并发真实分析。Worker 版本需使用托管平台限速；多实例部署也需要平台级限速。没有登录功能意味着公开 API 可被脚本请求，接入真实 Key 后请配置平台额度、限速及 Dify 用量监控。
- Dify Key 仅在运行时从服务器环境读取，构建过程不会读取或打包环境变量。不要把 Key 改成前端常量或使用 `VITE_` / `NEXT_PUBLIC_` 前缀。

## 验证

`npm run check` 执行语法检查与 Node 内置测试：演示隔离、密钥不泄漏、输入/同意校验、请求上限、跨站拒绝、Dify 字段映射、五段报告解析、原文回退及上游失败处理。

手动移动端检查：360/390/412px 宽度无横向溢出；填入示例 → 演示报告 → 复制 → 清空；空输入时聚焦错误项；分析可取消；键盘打开后按钮可滚动抵达；系统大字体可读；键盘 Tab 操作与减少动态效果设置有效。

尚无 Dify 配置时不能进行真实工作流端到端验证。Android 真机和复制权限也需在实际 HTTPS 部署上复核。
