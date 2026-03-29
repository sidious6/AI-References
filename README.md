<div align="center">
  <h1>AI-References</h1>
  <p><strong>AI 驱动的科研写作与文献研究工作台</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License" />
  </p>

  <p>
    <a href="#快速开始">快速开始</a> •
    <a href="#产品亮点">产品亮点</a> •
    <a href="#核心功能">核心功能</a> •
    <a href="#进阶配置">进阶配置</a> •
    <a href="#技术栈">技术栈</a>
  </p>
</div>

---

## 快速开始

只需 **2 步**，无需配置数据库、无需注册账号。

### 环境要求

- [Node.js](https://nodejs.org/) 18 ~ 22（推荐 20 LTS）
- 一个 AI 模型的 API Key（任选其一：DeepSeek、OpenAI、Claude、Gemini、通义千问等）

> 使用 [nvm](https://github.com/nvm-sh/nvm) 的用户可直接 `nvm use`，项目已包含 `.nvmrc`。

### 第 1 步：克隆并安装

```bash
git clone https://github.com/sidious6/AI-References.git
cd AI-References
npm install
```

安装过程**无需 Python、无需 C++ 编译器**，所有依赖均为纯 JavaScript/WASM。

### 第 2 步：配置 API Key 并启动

首次启动时，`.env` 文件会从 `.env.example` **自动创建**，你只需要编辑它：

```bash
# 打开 .env，填入你的 API Key（至少填一个）
# 默认已是本地模式（STORAGE_PROVIDER=sqlite），无需修改其他配置

# 启动
npm run dev
```

`.env` 文件中需要关注的配置：

```env
# 存储模式（默认 sqlite，无需改动）
STORAGE_PROVIDER=sqlite

# 填入你的 AI 模型 API Key（至少配置一个即可使用）
# 方式 A：火山引擎 / DeepSeek
ARK_API_KEY=your_key_here

# 方式 B：OpenAI
OPENAI_API_KEY=your_key_here

# 方式 C：其他模型可在启动后通过「设置 > 模型配置」页面添加
```

### 开始使用

打开浏览器访问 **http://localhost:5173**

- 点击登录页的 **「本地模式」** 按钮直接进入，无需注册
- 进入后在「设置 > 模型配置」中可以测试连接、切换模型
- 在「Agent」页面输入你的研究方向，AI 将自动完成从检索到综述的全流程

---

## 产品亮点

> 一站式 AI 科研助手，覆盖「研究方向 -> 文献检索 -> 综述撰写」全流程

| 痛点 | 解决方案 |
|------|----------|
| 文献检索慢 | AI 智能检索 + 多源聚合（Web of Science、Scopus） |
| 筛选效率低 | 自动摘要 + 相关性评分 + 批量处理 |
| 综述难写 | Agent 自动生成文献综述，支持引用插入 |
| 管理混乱 | 项目化知识库，文献/文档/章节结构化管理 |

---

## 核心功能

### Deep-reference Agent

智能研究助手，支持两种工作模式：

- **Human-in-loop 模式**：每一步都可人工介入，精细控制研究过程
- **Agent 模式**：全自动代理，从研究问题到综述生成一键完成

Agent 能力：
- 理解研究问题，自动生成检索策略
- 多数据库并行检索，智能去重
- 文献筛选与相关性评估
- 自动生成文献综述初稿

### 项目知识库

- **项目管理**：创建研究项目，设定研究目标和范围
- **文献库**：导入、管理、标注文献
- **文档管理**：支持多级章节结构
- **引用管理**：一键插入引用，自动生成参考文献列表

### 文献检索

- 支持 Web of Science、Scopus 等学术数据库
- 高级检索语法支持
- 检索结果自动解析与结构化存储

---

## 进阶配置

### 云端模式（Supabase）

如需多设备同步或远程访问，可切换为 Supabase 云端存储。

编辑 `.env`：

```env
STORAGE_PROVIDER=supabase

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

重新启动后访问 `http://localhost:5173`，使用邮箱注册/登录。

### 两种模式对比

| 特性 | 本地模式 (SQLite) | 云端模式 (Supabase) |
|------|-------------------|---------------------|
| 数据库配置 | 零配置，自动创建 | 需要 Supabase 账号 |
| 用户认证 | 免登录，一键进入 | 邮箱注册/登录 |
| 数据位置 | 本地 `data/app.db` | 云端 PostgreSQL |
| 多设备同步 | 不支持 | 支持 |
| 适用场景 | 个人使用、快速体验 | 团队协作、多端同步 |

> 两种模式的数据不互通。切换模式后，之前的数据不会自动迁移。

### 学术数据库配置（可选）

如需使用 AI 自动检索文献，可在 `.env` 中配置学术数据库 API Key：

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `WOS_API_KEY` | Web of Science API | [Clarivate Developer Portal](https://developer.clarivate.com/) |
| `SCOPUS_API_KEY` | Scopus (Elsevier) API | [Elsevier Developer Portal](https://dev.elsevier.com/) |
| `SCOPUS_INSTTOKEN` | Scopus 机构令牌（可选） | 由所在机构申请 |

> 不配置学术数据库也可以正常使用项目管理和 AI 对话功能，检索功能会在调用时提示未配置。

### 环境变量速查

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `STORAGE_PROVIDER` | 存储模式：`sqlite` 或 `supabase` | `sqlite` |
| `SQLITE_DB_PATH` | SQLite 数据库文件路径 | `app.db` |
| `DEFAULT_LLM_PROVIDER` | 默认 AI 模型提供商 | `ark` |
| `PORT` | 后端服务端口 | `8000` |
| `NODE_ENV` | 运行环境 | `development` |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 18 + TypeScript + Vite |
| **UI 组件** | shadcn/ui + Radix UI + Tailwind CSS |
| **状态管理** | Zustand |
| **后端服务** | Node.js + Express |
| **数据库** | SQLite/WASM (本地) / Supabase PostgreSQL (云端) |
| **AI 能力** | DeepSeek / OpenAI / Claude / Gemini 等兼容接口 |
| **图标** | Lucide Icons |

---

## 项目结构

```
AI-References/
├── client/                 # 前端 React 项目
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── pages/          # 页面组件
│   │   ├── stores/         # 状态管理
│   │   ├── services/       # API 服务
│   │   └── router.tsx      # 路由配置
├── server/                 # 后端 Node.js 项目
│   ├── src/
│   │   ├── config/         # 配置文件
│   │   ├── controllers/    # 控制器层
│   │   ├── services/       # 业务逻辑层（含 DeepReference 引擎）
│   │   ├── routes/         # 路由定义
│   │   ├── middleware/     # 中间件
│   │   ├── lib/            # 核心库（repository、sqlite、supabase）
│   │   ├── prompts/        # AI Prompt 模板管理
│   │   └── leaves/         # 工作流工具函数（按阶段分组）
├── scripts/                # 工具脚本
├── .nvmrc                  # Node.js 版本声明
└── .env.example            # 环境变量模板
```

---

## 常见问题

**Q: `npm install` 报错？**

本项目所有依赖均为纯 JavaScript/WASM，不需要 C++ 编译器或 Python。如果遇到问题：
1. 确认 Node.js 版本在 18 ~ 22 之间（`node -v`）
2. 使用 nvm 的用户可以直接 `nvm use` 自动切换
3. 删除 `node_modules` 和 `package-lock.json` 后重新 `npm install`

**Q: 如何切换 AI 模型？**

- 方式 A：在 `.env` 文件中配置对应模型的 API Key
- 方式 B：启动后在「设置 > 模型配置」页面添加/管理模型端点

**Q: 数据存储在哪里？**

本地模式下，数据存储在项目 `data/app.db` 文件中。可通过 `SQLITE_DB_PATH` 环境变量修改路径。

---

## 贡献

欢迎提交 Issue 和 Pull Request!

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。

---

<div align="center">
  <sub>Built with passion for researchers</sub>
</div>
