# LexAI 开发者指南

## 1. 快速开始

### 1.1 系统环境要求

| 工具    | 版本  | 说明                             |
| ------- | ----- | -------------------------------- |
| Rust    | 1.70+ | 通过 `rustup` 安装               |
| Python  | 3.12+ | 建议使用 `pyenv` 或 `conda` 管理 |
| Node.js | 18+   | 前端开发依赖                     |
| pnpm    | 8.0+  | 前端包管理器                     |
| Poetry  | 1.6+  | Python 包管理器                  |
| Git     | 2.40+ | 版本控制                         |

### 1.2 环境搭建

#### 步骤 1：克隆仓库
```bash
git clone https://github.com/mengdehong/LexAI.git
cd LexAI
```

#### 步骤 2：前端环境 (React + Vite)
```bash
cd client
pnpm install

# 验证安装
pnpm --version
npm run dev  # 启动 Vite 开发服务器 (仅前端)
```

#### 步骤 3：后端 Python 环境
```bash
cd backend
poetry install

# 验证安装
poetry run python --version
poetry run pytest  # 运行后端测试
```

#### 步骤 4：后端 Rust 环境 (PyO3 扩展)
```bash
# 在 backend 目录下
poetry run maturin develop --release

# 验证 PyO3 扩展
poetry run python -c "from rust_core import hello_from_rust; print(hello_from_rust())"
# 输出: Hello from Rust!
```

#### 步骤 5：启动完整应用
```bash
# 在 client 目录下
npm run tauri dev

# 首次启动会自动：
# 1. 启动 Vite 开发服务器 (前端)
# 2. 启动 Tauri 开发容器
# 3. 编译 Rust 层并启动应用
```

---

## 2. 项目结构

```
LexAI/
├── client/                              # 前端 (React + Tauri)
│   ├── src/
│   │   ├── App.tsx                      # 主应用组件
│   │   ├── App.css                      # 全局样式与主题
│   │   ├── main.tsx                     # React 入口
│   │   ├── vite-env.d.ts                # Vite 环境类型
│   │   ├── components/                  # UI 组件库
│   │   │   ├── ReadingPanel.tsx         # 文档阅读区
│   │   │   ├── TermsPanel.tsx           # 术语列表
│   │   │   ├── ContextPanel.tsx         # 上下文展示
│   │   │   ├── GlobalTermbaseView.tsx   # 全局术语库
│   │   │   ├── ReviewCenter.tsx         # 复习中心
│   │   │   ├── SettingsView.tsx         # 设置面板
│   │   │   ├── OnboardingView.tsx       # 入门向导
│   │   │   ├── DiagnosticsPanel.tsx     # 诊断面板
│   │   │   └── ui/                      # 通用 UI 组件
│   │   ├── lib/                         # 工具函数库
│   │   │   ├── apiKeys.ts               # 密钥管理 (Stronghold)
│   │   │   ├── configStore.ts           # 配置存储
│   │   │   ├── llmClient.ts             # LLM API 客户端
│   │   │   ├── promptBuilder.ts         # 提示词构建
│   │   │   ├── sessionStore.ts          # 会话状态
│   │   │   ├── termUtils.ts             # 术语工具函数
│   │   │   └── __tests__/               # 单元测试
│   │   ├── state/                       # 全局状态
│   │   │   ├── AppState.tsx             # React Context 状态
│   │   │   └── LocaleContext.tsx        # 国际化上下文
│   │   ├── assets/                      # 静态资源
│   │   │   └── fonts/                   # 字体文件
│   │   ├── types/                       # TypeScript 类型定义
│   │   └── public/                      # 公共资源
│   ├── src-tauri/                       # Tauri 后端 (Rust)
│   │   ├── src/
│   │   │   ├── main.rs                  # Tauri 入口
│   │   │   ├── lib.rs                   # 模块定义
│   │   │   ├── commands.rs              # Tauri 命令 (术语、复习)
│   │   │   ├── rpc_client.rs            # RPC Worker 通信
│   │   │   ├── secrets.rs               # Stronghold 密钥管理
│   │   │   ├── db.rs                    # SQLite 初始化与查询
│   │   │   ├── diagnostics.rs           # 后端诊断
│   │   │   └── review.rs                # 复习 SRS 算法
│   │   ├── Cargo.toml                   # Rust 依赖配置
│   │   ├── tauri.conf.json              # Tauri 应用配置
│   │   ├── capabilities/                # Tauri 权限配置
│   │   ├── migrations/                  # SQLite 迁移脚本
│   │   └── resources/                   # 资源包 (RPC Worker)
│   ├── package.json                     # Node.js 依赖
│   ├── tsconfig.json                    # TypeScript 配置
│   ├── vite.config.ts                   # Vite 配置
│   ├── tailwind.config.js               # Tailwind CSS 配置
│   └── postcss.config.js                # PostCSS 配置
│
├── backend/                             # 后端 (Python + Rust)
│   ├── app/
│   │   ├── main.py                      # FastAPI 主应用 (开发模式)
│   │   ├── config.py                    # 配置管理
│   │   ├── services.py                  # 业务逻辑 (文档处理、向量化)
│   │   ├── schemas.py                   # Pydantic 数据模型
│   │   └── routers/
│   │       └── documents.py             # 文档 API 路由
│   ├── rpc_worker/                      # JSON-RPC Worker (生产模式)
│   │   ├── Cargo.toml                   # Rust 依赖
│   │   └── src/
│   │       ├── main.rs                  # RPC 服务器入口
│   │       ├── lib.rs                   # 模块定义
│   │       ├── jsonrpc.rs               # JSON-RPC 2.0 实现
│   │       ├── manager.rs               # 请求管理器
│   │       ├── document.rs              # 文档处理逻辑
│   │       ├── embeddings.rs            # 向量化逻辑
│   │       ├── qdrant.rs                # Qdrant 客户端
│   │       └── tokenizer.rs             # 分词器
│   ├── rust_core/                       # PyO3 Rust 扩展
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── lib.rs                   # 文本提取接口 (extract_text)
│   ├── tests/
│   │   └── test_pipeline.py             # 集成测试
│   ├── pyproject.toml                   # Python 依赖与配置
│   ├── requirements-build.txt           # 构建时依赖
│   ├── build.py                         # PyInstaller 构建脚本
│   ├── rpc_server.spec                  # PyInstaller 配置
│   └── README.md                        # 后端说明
│
├── docs/                                # 文档
│   ├── README.md                        # 文档目录说明
│   └── versions/                        # 阶段总结
│       ├── _TEMPLATE.md                 # 阶段总结模板
│       ├── phase-0-*.md
│       ├── phase-1-*.md
│       ├── ...
│       └── phase-14-*.md
│
├── ARCHITECTURE.md                      # 架构文档 (本文件)
├── DEVELOPER.md                         # 开发者指南
├── CONTRIBUTING.md                      # 贡献规范
├── ROADMAP.md                           # 产品路线图
├── CHANGELOG.md                         # 变更日志
├── README.md                            # 项目概览
├── CONFIGURING.md                       # 配置指南
├── Agent.md                             # AI 代理指南
└── Cargo.toml                           # 工作区配置
```

---

## 3. 核心开发任务

### 3.1 前端开发流程

#### 添加新 UI 组件
```bash
# 1. 创建组件文件
touch client/src/components/MyComponent.tsx

# 2. 编写 React 组件
# client/src/components/MyComponent.tsx
export function MyComponent() {
  return <div>Hello</div>;
}

# 3. 在 App.tsx 中导入并使用
import { MyComponent } from './components/MyComponent';

# 4. 启动开发服务器
cd client && npm run tauri dev

# 5. 热加载预览 (Vite 会自动刷新)
```

#### 调用 Tauri 命令
```typescript
// client/src/components/MyComponent.tsx
import { invoke } from '@tauri-apps/api/core';

export function MyComponent() {
  const handleClick = async () => {
    // 调用 Tauri 后端命令
    const result = await invoke('add_term', { term: 'example', definition: 'def' });
    console.log(result);
  };

  return <button onClick={handleClick}>Save Term</button>;
}
```

#### 使用全局状态
```typescript
import { useAppState } from '../state/AppState';

export function MyComponent() {
  const { document, setDocument } = useAppState();

  return <div>Current doc: {document?.name}</div>;
}
```

#### 国际化支持
```typescript
import { useLocale } from '../state/LocaleContext';

export function MyComponent() {
  const { locale, t } = useLocale();
  
  return <button>{t('save')}</button>;  // 自动选择中文/英文
}
```

---

### 3.2 后端开发流程 (Python)

#### 开发新 API 端点
```python
# backend/app/routers/my_router.py
from fastapi import APIRouter

router = APIRouter(prefix="/my_api", tags=["my-api"])

@router.post("/process")
async def process_data(data: dict):
    """处理数据的端点"""
    return {"status": "ok", "data": data}

# 在 backend/app/main.py 中注册
app.include_router(my_router)
```

#### 编写服务层逻辑
```python
# backend/app/services.py
from sentence_transformers import SentenceTransformer

def embed_text(text: str) -> list[float]:
    """将文本转换为向量"""
    model = SentenceTransformer('all-MiniLM-L6-v2')
    embedding = model.encode(text)
    return embedding.tolist()
```

#### 集成 Qdrant
```python
# backend/app/services.py
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

def save_to_qdrant(document_id: str, chunks: list[str]):
    """保存文本块到向量数据库"""
    client = QdrantClient(":memory:")  # 开发：嵌入式
    # client = QdrantClient(host="localhost", port=6333)  # 生产：远程
    
    points = [
        PointStruct(
            id=i,
            vector=embed_text(chunk),
            payload={"document_id": document_id, "text": chunk}
        )
        for i, chunk in enumerate(chunks)
    ]
    
    client.upsert(collection_name="lexai_documents", points=points)
```

#### 编写单元测试
```python
# backend/tests/test_my_module.py
import pytest
from app.services import embed_text

def test_embed_text():
    """测试文本向量化"""
    embedding = embed_text("hello world")
    assert len(embedding) == 384  # all-MiniLM-L6-v2 输出维度
    assert isinstance(embedding, list)

# 运行测试
pytest backend/tests/test_my_module.py -v
```

---

### 3.3 Rust 开发流程

#### 编写 Tauri 命令
```rust
// client/src-tauri/src/commands.rs
use tauri::State;

#[tauri::command]
pub async fn my_command(value: String) -> Result<String, String> {
    Ok(format!("Received: {}", value))
}

// 在 client/src-tauri/src/lib.rs 中注册
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![my_command, ...])
```

#### 调用 SQLite
```rust
// client/src-tauri/src/commands.rs
use sqlx::{Row, SqlitePool};

#[tauri::command]
pub async fn get_terms(db: State<'_, SqlitePool>) -> Result<Vec<String>, String> {
    let terms = sqlx::query("SELECT term FROM terms")
        .fetch_all(db.as_ref())
        .await
        .map_err(|e| e.to_string())?
        .iter()
        .map(|row| row.get::<String, _>("term"))
        .collect();
    
    Ok(terms)
}
```

#### 调用 RPC Worker
```rust
// client/src-tauri/src/rpc_client.rs
use serde_json::json;

pub async fn upload_document(file_path: &str) -> Result<String, String> {
    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "upload_document",
        "params": { "file_path": file_path }
    });
    
    // 通过 stdin/stdout 发送给 RPC Worker
    // ...
}
```

#### 编写单元测试
```rust
// client/src-tauri/src/tests.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        assert_eq!(2 + 2, 4);
    }
}

# 运行测试
cargo test
```

---

## 4. 常见开发命令

### 前端 (React)
```bash
cd client

# 安装依赖
pnpm install

# 开发模式 (含 Tauri)
npm run tauri dev

# 仅 Vite 前端开发
npm run dev

# 构建应用
npm run build

# 构建桌面版 (所有平台)
npm run tauri build

# 运行单元测试
npm run test

# 代码格式检查 (Prettier)
npm run format

# 类型检查
npx tsc --noEmit
```

### 后端 Python
```bash
cd backend

# 安装依赖
poetry install

# 启动 FastAPI 服务器 (开发模式)
poetry run python -m uvicorn app.main:app --reload

# 启动 RPC Worker 服务器
poetry run python rpc_server.py

# 运行单元测试
poetry run pytest tests/ -v

# 覆盖率测试
poetry run pytest tests/ --cov=app --cov-report=html

# 代码格式化 (Ruff)
poetry run ruff format .

# 代码检查 (Ruff lint)
poetry run ruff check . --fix

# 类型检查 (MyPy)
poetry run mypy app/
```

### 后端 Rust (PyO3)
```bash
cd backend

# 开发模式构建
poetry run maturin develop

# 发布模式构建
poetry run maturin develop --release

# 编译检查
cd rust_core && cargo check

# 格式化
cd rust_core && cargo fmt

# Lint 检查
cd rust_core && cargo clippy -D warnings

# 运行测试
cd rust_core && cargo test
```

### RPC Worker 构建
```bash
cd backend

# 生成 PyInstaller 打包产物
python build.py

# 输出:
# dist/rpc_server/rpc_server (可执行文件)
# dist/rpc_server/_internal/ (共享库)

# 复制到 Tauri 资源目录
cp -r dist/rpc_server/* ../client/src-tauri/resources/rpc_server/
```

### 完整工作流
```bash
# 1. 更新代码后，重新构建后端
cd backend && poetry run maturin develop --release

# 2. 更新 Tauri 命令或前端后，启动开发服务器
cd client && npm run tauri dev

# 3. 所有测试通过后，运行格式检查
npm run format
cd backend && poetry run ruff format .
cd client/src-tauri && cargo fmt --all

# 4. 提交代码
git add -A
git commit -m "feat(module): description"

# 5. 发布前，完整构建
npm run tauri build
```

---

## 5. 调试技巧

### 前端调试

#### 浏览器开发者工具
```bash
# 在应用中按 Ctrl+Shift+I (Windows) 或 Cmd+Option+I (macOS)
# 或在 tauri.conf.json 中启用开发工具
```

#### 日志输出
```typescript
// 前端代码
console.log('Debug info:', data);

// 在浏览器控制台查看
// F12 → Console 标签
```

#### Tauri 命令调试
```typescript
// 添加详细日志
await invoke('my_command', { param: 'value' })
  .then(result => console.log('Success:', result))
  .catch(err => console.error('Error:', err));
```

### 后端调试 (Python)

#### 打印调试
```python
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

logger.debug("Debug message: %s", data)
logger.info("Info message: %s", data)
logger.error("Error message: %s", data)
```

#### 使用 pdb 断点调试
```python
# backend/app/services.py
def my_function(data):
    import pdb; pdb.set_trace()  # 断点，进入交互式调试
    return process(data)

# 运行代码，在断点处停止
# 输入命令：c (继续), s (步入), n (步过), p var (打印变量)
```

#### VS Code 调试
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload"],
      "cwd": "${workspaceFolder}/backend",
      "jinja": true
    }
  ]
}
```

### Rust 调试
```bash
# 启用调试符号
RUST_LOG=debug cargo run

# 使用 rust-gdb 或 lldb
rust-gdb ./target/debug/my_binary

# 在代码中使用断言
assert_eq!(result, expected);
```

---

## 6. 测试策略

### 前端测试 (Vitest)
```bash
cd client

# 运行所有测试
npm run test

# 监视模式 (自动重新运行)
npm run test -- --watch

# 生成覆盖率报告
npm run test -- --coverage
```

### 后端测试 (pytest)
```bash
cd backend

# 运行所有测试
poetry run pytest tests/ -v

# 运行指定测试文件
poetry run pytest tests/test_pipeline.py -v

# 运行指定测试函数
poetry run pytest tests/test_pipeline.py::test_upload_document -v

# 显示打印输出 (-s 标志)
poetry run pytest tests/ -s

# 生成覆盖率报告
poetry run pytest tests/ --cov=app --cov-report=term-missing
```

### Rust 测试
```bash
cd backend/rust_core

# 运行所有测试
cargo test

# 运行指定测试
cargo test test_extract_text

# 显示输出
cargo test -- --nocapture
```

---

## 7. 常见问题

### Q: "yarn/npm command not found"
**A:**
```bash
# 确认 Node.js 已安装
node --version  # 应该 ≥ 18

# 安装 pnpm
npm install -g pnpm

# 验证
pnpm --version
```

### Q: "Poetry 找不到 Python 3.12"
**A:**
```bash
# 检查 Python 版本
python3 --version  # 应该 ≥ 3.12

# 创建虚拟环境 (如需)
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# 或 venv\Scripts\activate  # Windows

# 告诉 Poetry 使用这个 Python
poetry env use $(which python3)

# 验证
poetry run python --version
```

### Q: "PyO3 构建失败"
**A:**
```bash
# 清空缓存并重建
cd backend
rm -rf .maturin
poetry run maturin develop --release --verbose

# 检查 Rust 工具链
rustc --version
cargo --version
```

### Q: "Tauri 开发服务器启动失败"
**A:**
```bash
# 1. 检查端口占用
lsof -i :1420  # Vite 前端端口
lsof -i :8000  # 后端端口 (如需)

# 2. 清空缓存
cd client && rm -rf dist node_modules
pnpm install

# 3. 重新启动
npm run tauri dev --verbose

# 4. 查看日志
# Linux/macOS: ~/.local/share/lexai/
# Windows: %APPDATA%/lexai/
```

### Q: "RPC Worker 连接失败"
**A:**
```bash
# 1. 确认 RPC Worker 已构建
python build.py  # 在 backend 目录

# 2. 检查资源目录
ls client/src-tauri/resources/rpc_server/

# 3. 手动测试 RPC Worker
cd backend && poetry run python -m rpc_server  # 应该输出 "RPC Server listening on ..."

# 4. 查看诊断信息
# 在应用中打开 DiagnosticsPanel，查看错误日志
```

---

## 8. 扩展资源

- [Tauri 官方文档](https://docs.tauri.app/)
- [React 官方文档](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [FastAPI 教程](https://fastapi.tiangolo.com/zh/)
- [SQLx 文档](https://github.com/launchbadge/sqlx)
- [PyO3 使用指南](https://pyo3.rs/latest/)

