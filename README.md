<div align="center">
  <h1>AI-References</h1>
  <p><strong>AI 驱动的科研写作与文献研究工作台</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License" />
  </p>

  <p>
    <a href="#-产品亮点">产品亮点</a> •
    <a href="#-核心功能">核心功能</a> •
    <a href="#-快速开始">快速开始</a> •
    <a href="#-技术栈">技术栈</a> •
    <a href="#-路线图">路线图</a>
  </p>
</div>

---

## 产品亮点

> 一站式 AI 科研助手，覆盖「研究方向 → 文献检索 → 综述撰写」全流程

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

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- Supabase 账号（或本地 PostgreSQL）

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/your-username/AI-References.git
cd AI-References

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的配置

# 启动开发服务器
npm run dev
```

访问 `http://localhost:5173` 开始使用

### 环境变量配置

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI API
VITE_AI_API_KEY=your_ai_api_key
VITE_AI_BASE_URL=your_ai_base_url
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端框架** | React 18 + TypeScript + Vite |
| **UI 组件** | shadcn/ui + Radix UI + Tailwind CSS |
| **状态管理** | Zustand |
| **后端服务** | Node.js + Express |
| **数据库** | Supabase (PostgreSQL) |
| **AI 能力** | DeepSeek / OpenAI 兼容接口 |
| **图标** | Lucide Icons |

---

## 项目结构

```
AI-References/
├── src/
│   ├── components/     # UI 组件
│   ├── pages/          # 页面组件
│   ├── stores/         # 状态管理
│   ├── services/       # API 服务
│   ├── hooks/          # 自定义 Hooks
│   ├── types/          # TypeScript 类型
│   └── utils/          # 工具函数
├── server/             # 后端服务
├── prompts/            # AI Prompt 管理
└── docs/               # 文档
```

---

## 路线图

- [x] 项目知识库管理
- [x] Deep-reference Agent 核心对话
- [x] 文献检索与筛选（Web of Science、Scopus）
- [x] 文献详情与摘要展示
- [ ] 文献综述自动撰写
- [ ] 写作室模块
- [ ] 多模型路由支持
- [ ] 团队协作功能

---

## 文档

- [产品规划](./产品规划.md) - 产品设计与功能规划
- [开发进度](./开发进度.md) - 开发日志与进度追踪
- [数据库设计](./DATABASE.md) - 数据库表结构设计
- [架构说明](./Recode架构.md) - 系统架构设计

---

## 贡献

欢迎提交 Issue 和 Pull Request！

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
