# 知法 KnowLaw：劳动维权一站式平台

知法 KnowLaw 是一个面向劳动者权益保护场景的 Web 应用原型，围绕“咨询、检索、合同审查、文书生成、证据管理”提供一站式辅助能力。项目包含前端交互页面、FastAPI 后端服务、劳动合同审查规则、典型案例与劳动监察渠道数据。

> 本项目用于课程、科研和原型展示，不构成正式法律意见。涉及仲裁、诉讼、合同签署或具体维权行动时，请咨询律师、劳动监察部门或劳动争议仲裁机构。

## 演示视频

仓库根目录包含演示视频，可在 README 中直接播放：

<video src="demo视频演示文件.mp4" controls width="100%">
  您的浏览器不支持 HTML5 视频播放。可以点击下方链接下载或查看演示视频。
</video>

[无法播放时点击查看演示视频](demo视频演示文件.mp4)

## 核心功能

- 劳动法律咨询：围绕工资、加班、社保、解除劳动合同、工伤等问题提供问答入口。
- 劳动合同审查：基于审查清单识别劳动合同中的常见风险点，并生成修改建议。
- 案例检索：检索和查看典型劳动争议案例，辅助理解相似场景的处理路径。
- 权益指引：按维权主题组织知识内容，帮助用户理解维权流程和注意事项。
- 文书生成：支持劳动仲裁申请书、民事起诉状、执行申请书、证据清单等文书模板。
- 证据管理：围绕案件材料、证据文件、时间线和证据图谱进行整理。
- 多源数据：内置劳动监察渠道、咨询样本、合同审查规则和典型案例数据。

## 技术栈

- 前端：Vite、React、React Router、原生静态页面兼容层
- 后端：FastAPI、Flask、OpenAI SDK、pypdf、python-docx、openpyxl
- 数据：SQLite、本地 JSON、劳动合同审查清单、典型案例数据
- 可选能力：腾讯云 OCR、有道 OCR、得理法搜接口、大模型接口

## 项目结构

```text
assets/                 # 旧版静态页面资源、样式、图片和脚本
backend/                # 后端服务、合同审查、文书生成、证据图谱等能力
docs/                   # 项目文档和规则说明
frontend/               # Vite + React 前端
scripts/                # 数据生成与采集脚本
demo视频演示文件.mp4       # 项目演示视频
requirements.txt        # Python 依赖
```

## 安全说明

公开上传前请务必确认不要提交真实密钥、数据库和用户上传文件。

已通过 `.gitignore` 忽略：

- `backend/config/*_config.json` 中的真实运行配置
- `data.sqlite`
- `backend/database/*.db`
- `backend/uploads/`
- `frontend/node_modules/`
- `frontend/dist/`
- Python 缓存和虚拟环境

可提交的配置模板包括：

- `backend/config/llm_config.example.json`
- `backend/config/contract_review_llm.example.json`
- `backend/config/tencent_ocr_config.example.json`
- `backend/config/youdao_ocr_config.example.json`
- `backend/config/deli_config.example.json`
- `backend/config/evidence_graph_llm_config.example.json`
- `backend/config/evidence_file_llm_config.example.json`

如果真实 API Key 已经出现在本地文件或截图中，请先在对应平台轮换密钥，再公开上传仓库。

## 安装依赖

### 后端

```powershell
conda create -n KnowLaw python=3.13
conda activate KnowLaw
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 前端

```powershell
cd frontend
npm install
```

## 配置服务

复制示例配置并填写自己的密钥：

```powershell
Copy-Item backend\config\llm_config.example.json backend\config\llm_config.json
Copy-Item backend\config\contract_review_llm.example.json backend\config\contract_review_llm.json
Copy-Item backend\config\tencent_ocr_config.example.json backend\config\tencent_ocr_config.json
Copy-Item backend\config\youdao_ocr_config.example.json backend\config\youdao_ocr_config.json
Copy-Item backend\config\deli_config.example.json backend\config\deli_config.json
```

不需要某项外部能力时，可以保持占位配置，相关功能会在调用时提示配置缺失。

## 启动项目

### 启动后端

```powershell
cd backend
python fastapi_server.py
```

默认后端端口为 `8080`。

### 启动前端

```powershell
cd frontend
npm run dev
```

前端启动后访问：

```text
http://localhost:5173/
```

## 上传 GitHub 建议

由于本目录当前还不是 Git 仓库，首次上传可以执行：

```powershell
cd F:\KnowLaw-Labor-Rights-Protection
git init
git branch -M main
git remote add origin https://github.com/TanGuozhao/KnowLaw-Labor-Rights-Protection.git
git add .
git status
git commit -m "Initial KnowLaw labor rights protection project"
git push -u origin main
```

提交前请再次确认 `git status` 中没有真实配置、数据库和用户上传文件。
