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
    <a href="#-产品亮点">产品亮点</a> •
    <a href="#-快速开始">快速开始</a> •
    <a href="#-核心功能">核心功能</a> •
    <a href="#-部署模式">部署模式</a> •
    <a href="#-技术栈">技术栈</a>
  </p>
</div>

---

## 产品亮点

> 一站式 AI 科研助手，覆盖「研究方向 -> 文献检索 -> 综述撰写」全流程

传统科研写作痛点：
- 文献检索耗时，筛选效率低
- 综述撰写重复劳动多
- 引用管理混乱，格式调整繁琐

**AI-References 的解决方案：**

| 痛点 | 解决方案 |
|------|----------|
| 文献检索慢 | AI 智能检索 + 多源聚合（Web of Science、Scopus） |
| 筛选效率低 | 自动摘要 + 相关性评分 + 批量处理 |
| 综述难写 | Agent 自动生成文献综述，支持引用插入 |
| 管理混乱 | 项目化知识库，文献/文档/章节结构化管理 |

---

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- 一个 AI 模型的 API Key（支持 DeepSeek、OpenAI、Claude、Gemini 等）

### 方式一：本地模式（推荐，3 步开始）

本地模式使用 SQLite 存储数据，**无需注册账号、无需配置数据库**，开箱即用。

```bash
# 1. 克隆并安装
git clone https://github.com/your-username/AI-References.git
cd AI-References && npm install

# 2. 配置环境变量
cp .env.example .env
```

编辑 `.env` 文件，只需修改以下配置即可启动：

```env
# 切换为本地模式
STORAGE_PROVIDER=sqlite

# 填入你的 AI 模型 API Key（至少配置一个）
ARK_API_KEY=your_api_key_here
```

```bash
# 3. 启动
npm run dev
```

访问 `http://localhost:5173`，点击登录页面的**「本地模式」**按钮直接进入，无需注册。

### 方式二：云端模式（Supabase）

如果需要多设备同步或远程访问，可以使用 Supabase 作为数据库后端。

```bash
# 1. 克隆并安装
git clone https://github.com/your-username/AI-References.git
cd AI-References && npm install

# 2. 配置环境变量
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 使用 Supabase 云端存储
STORAGE_PROVIDER=supabase

# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI 模型 API Key
ARK_API_KEY=your_api_key_here
```

```bash
# 3. 启动
npm run dev
```

访问 `http://localhost:5173`，使用邮箱注册/登录账号。

---

## 部署模式

AI-References 支持两种**互斥**的数据存储模式，通过环境变量 `STORAGE_PROVIDER` 切换：

| 特性 | 本地模式 (SQLite) | 云端模式 (Supabase) |
|------|-------------------|---------------------|
| 环境变量 | `STORAGE_PROVIDER=sqlite` | `STORAGE_PROVIDER=supabase` |
| 数据库配置 | 零配置，自动创建 | 需要 Supabase 账号和 API Key |
| 用户认证 | 免登录，点击「本地模式」直接使用 | 邮箱注册/登录 |
| 数据位置 | 本地 `app.db` 文件 | Supabase 云端 PostgreSQL |
| 多设备同步 | 不支持 | 支持 |
| 适用场景 | 个人本地使用、快速体验 | 多设备、团队协作、持久化云存储 |

> 两种模式的数据不互通。切换模式后，之前模式的数据不会自动迁移。

### 环境变量说明

完整的环境变量配置请参考 `.env.example` 文件。核心配置项：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `STORAGE_PROVIDER` | 存储模式：`sqlite` 或 `supabase` | `supabase` |
| `SQLITE_DB_PATH` | SQLite 数据库文件路径 | `app.db` |
| `ARK_API_KEY` | 火山引擎 DeepSeek API Key | - |
| `DEFAULT_LLM_PROVIDER` | 默认模型提供商 | `ark` |
| `WOS_API_KEY` | Web of Science API Key（可选） | - |
| `SCOPUS_API_KEY` | Scopus API Key（可选） | - |

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

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 18 + TypeScript + Vite |
| **UI 组件** | shadcn/ui + Radix UI + Tailwind CSS |
| **状态管理** | Zustand |
| **后端服务** | Node.js + Express |
| **数据库** | SQLite (本地) / Supabase PostgreSQL (云端) |
| **AI 能力** | DeepSeek / OpenAI / Claude / Gemini 兼容接口 |
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
│   │   ├── services/       # 业务逻辑层
│   │   ├── routes/         # 路由定义
│   │   ├── middleware/     # 中间件
│   │   ├── lib/            # 核心库（repository、sqlite、supabase）
│   │   └── leaves/         # 叶子工具（按阶段分组）
├── prompts/                # AI Prompt 模板管理
└── data/                   # 本地数据存储目录
```

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
