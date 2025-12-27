# AI-References

AI 科研写作与文献研究工作台

## 功能特性

- AI 驱动的文献检索与分析
- 多源学术数据库支持（Web of Science、Scopus）
- 智能文献综述生成
- 项目管理与文献整理
- 支持多种 AI 模型（DeepSeek、GPT-4、Claude、Gemini）

## 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制环境变量模板并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下必要项：

```bash
# AI 模型 API Key（至少配置一个）
ARK_API_KEY=your_ark_api_key          # 火山引擎 DeepSeek
OPENAI_API_KEY=your_openai_api_key    # OpenAI GPT
ANTHROPIC_API_KEY=your_anthropic_key  # Anthropic Claude
GOOGLE_API_KEY=your_google_api_key    # Google Gemini

# Supabase 数据库（必需）
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# 学术数据库 API（可选，用于文献检索）
WOS_API_KEY=your_wos_api_key
SCOPUS_API_KEY=your_scopus_api_key
SCOPUS_INSTTOKEN=your_scopus_insttoken
```

### 3. 启动开发服务器

同时启动前端和后端：

```bash
npm run dev
```

或分别启动：

```bash
# 启动后端（端口 8000）
npm run dev:server

# 启动前端（端口 5173）
npm run dev:client
```

### 4. 访问应用

打开浏览器访问：http://localhost:5173

## 项目结构

```
AI-References/
├── client/          # 前端 React 应用
│   ├── src/
│   │   ├── pages/   # 页面组件
│   │   ├── components/  # 通用组件
│   │   ├── services/    # API 服务
│   │   └── lib/     # 工具函数
│   └── ...
├── server/          # 后端 Express 服务
│   ├── src/
│   │   ├── routes/  # API 路由
│   │   ├── services/    # 业务逻辑
│   │   └── lib/     # 工具函数
│   └── ...
├── data/            # 本地数据存储
└── .env             # 环境变量配置
```

## 构建部署

```bash
# 构建前后端
npm run build

# 启动生产服务
npm run start
```

## 技术栈

**前端**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand（状态管理）
- React Router

**后端**
- Node.js + Express
- TypeScript
- Supabase（数据库）
- OpenAI SDK / Anthropic SDK

## License

MIT
