# 项目调试指南

本文档介绍如何调试和测试这个文件上传 GitHub Action 项目。

## 本地开发环境设置

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建项目

```bash
pnpm run prepare
```

### 3. 代码格式化和检查

```bash
# 格式化代码
pnpm run format

# 检查代码风格
pnpm run lint

# 运行测试
pnpm run test
```

## 本地测试方法

### 方法一：使用 Node.js 直接运行

1. 设置环境变量：

```bash
# PowerShell
$env:INPUT_API_TOKEN = "your-api-token"
$env:INPUT_SITE_ID = "your-site-id"
$env:INPUT_API_BASE_URL = "http://localhost:3000"
$env:INPUT_SOURCE_DIR = "./test-files"
$env:GITHUB_REPOSITORY = "username/repo"
$env:GITHUB_RUN_ID = "123456"
$env:GITHUB_SHA = "abc123"
```

2. 创建测试文件目录：

```bash
mkdir test-files
echo "Hello World" > test-files/index.html
echo "body { margin: 0; }" > test-files/style.css
```

3. 运行项目：

```bash
node dist/index.js
```

### 方法二：在 GitHub Actions 中测试

创建 `.github/workflows/test-upload.yml`：

```yaml
name: 测试文件上传

on:
  workflow_dispatch:
  push:
    branches: [ test ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: 检出代码
        uses: actions/checkout@v4

      - name: 创建测试文件
        run: |
          mkdir -p test-dist
          echo "<h1>测试页面</h1>" > test-dist/index.html
          echo "body { color: blue; }" > test-dist/style.css

      - name: 测试文件上传
        uses: ./
        with:
          api_token: ${{ secrets.API_TOKEN }}
          site_id: ${{ secrets.SITE_ID }}
          source_dir: './test-dist'
```

## 调试技巧

### 1. 启用详细日志

在 GitHub Actions 中设置 `ACTIONS_STEP_DEBUG=true` 来启用详细日志：

```yaml
env:
  ACTIONS_STEP_DEBUG: true
```

### 2. 添加调试输出

在代码中添加调试信息：

```javascript
// 在 src/internal/api-client.js 中
core.debug(`正在上传文件: ${filePath}`)
core.debug(`文件大小: ${fileSize} bytes`)
core.debug(`API 响应: ${JSON.stringify(response.data)}`)
```

### 3. 检查文件路径

```javascript
// 验证源目录是否存在
const fs = require('fs')
if (!fs.existsSync(sourceDir)) {
  core.error(`源目录不存在: ${sourceDir}`)
}

// 列出所有要上传的文件
const files = await getAllFiles(sourceDir)
core.info(`找到 ${files.length} 个文件:`)
files.forEach(file => {
  core.info(`  - ${file.relativePath} (${file.size} bytes)`)
})
```

## 常见问题排查

### 1. API 连接问题

**症状**: 上传失败，提示网络错误

**排查步骤**:
- 检查 API Token 是否正确
- 验证 API Base URL 是否可访问
- 检查网络连接

```javascript
// 测试 API 连接
try {
  const response = await axios.get(`${apiBaseUrl}/health`)
  core.info(`API 状态: ${response.status}`)
} catch (error) {
  core.error(`API 连接失败: ${error.message}`)
}
```

### 2. 文件路径问题

**症状**: 找不到文件或目录结构错误

**排查步骤**:
- 检查源目录路径是否正确
- 验证文件权限
- 确认相对路径计算

```javascript
// 调试文件路径
const path = require('path')
const absolutePath = path.resolve(sourceDir)
core.info(`源目录绝对路径: ${absolutePath}`)

const relativePath = path.relative(sourceDir, filePath)
core.info(`文件相对路径: ${relativePath}`)
```

### 3. 权限问题

**症状**: 上传被拒绝，返回 403 错误

**排查步骤**:
- 验证 API Token 权限
- 检查 Site ID 是否正确
- 确认用户对目标网站的访问权限

### 4. 文件大小限制

**症状**: 大文件上传失败

**排查步骤**:
- 检查文件大小是否超过限制
- 验证 API 服务的文件大小限制
- 考虑分块上传大文件

## 性能调试

### 1. 监控上传速度

```javascript
const startTime = Date.now()
// ... 上传逻辑
const endTime = Date.now()
const duration = endTime - startTime
core.info(`上传耗时: ${duration}ms`)
```

### 2. 并发控制

```javascript
// 限制并发上传数量
const pLimit = require('p-limit')
const limit = pLimit(5) // 最多5个并发上传

const uploadPromises = files.map(file =>
  limit(() => uploadFile(file))
)
```

## 错误处理测试

### 1. 模拟网络错误

```javascript
// 使用 nock 模拟 API 错误
const nock = require('nock')

nock('http://localhost:3000')
  .post('/upload')
  .reply(500, { error: '服务器内部错误' })
```

### 2. 测试重试机制

```javascript
// 验证重试逻辑
let retryCount = 0
const maxRetries = 3

while (retryCount < maxRetries) {
  try {
    await uploadFile(file)
    break
  } catch (error) {
    retryCount++
    core.warning(`上传失败，重试 ${retryCount}/${maxRetries}: ${error.message}`)
    if (retryCount >= maxRetries) {
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
  }
}
```

## 日志分析

### GitHub Actions 日志位置

1. 进入 GitHub 仓库
2. 点击 "Actions" 标签
3. 选择对应的工作流运行
4. 点击具体的作业查看详细日志

### 关键日志信息

- `📁 发现 X 个文件需要上传` - 文件发现阶段
- `🚀 开始批量上传文件...` - 上传开始
- `✓ filename.ext (X.X KB)` - 单个文件上传成功
- `✗ filename.ext: error message` - 单个文件上传失败
- `📊 上传完成统计` - 最终统计信息

## 开发工具推荐

### VS Code 扩展

- **GitHub Actions** - 语法高亮和验证
- **YAML** - YAML 文件支持
- **ESLint** - 代码质量检查
- **Prettier** - 代码格式化

### 调试配置

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "调试 Action",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/index.js",
      "env": {
        "INPUT_API_TOKEN": "your-token",
        "INPUT_SITE_ID": "your-site-id",
        "INPUT_SOURCE_DIR": "./test-files"
      }
    }
  ]
}
```

## 单元测试

运行现有测试：

```bash
pnpm test
```

添加新的测试用例：

```javascript
// src/__tests__/api-client.test.js
const { uploadFile } = require('../internal/api-client')

test('应该成功上传文件', async () => {
  // 模拟 API 响应
  // 测试上传逻辑
})
```

通过以上方法，你可以有效地调试和测试这个文件上传 GitHub Action 项目。