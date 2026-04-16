# 📊 Notion Markdown Uploader

로컬 폴더의 마크다운(.md) 파일들을 읽어 Gemini AI로 한줄 요약을 생성하고, 이를 Notion 데이터베이스에 자동으로 업로드하는 도구입니다.

## 🚀 주요 기능

- ⚡ **실시간 대시보드**: 업로드 진행률, 남은 시간(ETA), 처리 속도 실시간 표시
- 📊 **바이탈 그래프**: 업로드되는 각 파일의 글자 수(분량)를 시각화
- 🤖 **Gemini AI 연동**: 각 문서의 내용을 분석하여 핵심적인 한줄 요약 생성
- 🔄 **멱등성 보장**: 이미 업로드된 파일은 자동으로 감지하여 건너뛰거나 요약만 업데이트 (중복 방지)
- 🛡️ **안정적인 에러 처리**: Notion API의 Rate Limit(429) 자동 감지 및 지수 백오프(Exponential Backoff) 재시도
- 📋 **실패 관리**: 업로드에 실패한 파일들을 별도 탭에서 확인하고 개별적으로 재시도 가능

## 🛠️ 설정 방법

### 1. 환경 변수 설정
`.env` 파일을 생성하고 다음 정보들을 입력합니다:
```env
NOTION_TOKEN=your_notion_internal_integration_token
NOTION_DATABASE_ID=your_database_id
GEMINI_API_KEY=your_google_gemini_api_key
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 노션 데이터베이스 준비
데이터베이스에 다음 속성들이 정의되어 있어야 합니다:
- **Name** (Title): 파일 이름
- **한줄요약** (Text): AI가 생성한 요약
- **해시태그** (Multi-select): 문서 분석을 통한 태그 (선택사항)

## 🏃 실행 방법

```bash
# 개발 모드 (프론트엔드 + 백엔드 동시 실행)
npm run dev
```

또는 개별 실행:
```bash
# 백엔드 서버 실행
npm run server

# 프론트엔드 클라이언트 실행
npm run client
```

실행 후 브라우저에서 `http://localhost:5173`에 접속하여 폴더를 선택하세요.

## 📁 프로젝트 구조

- `src/App.jsx`: 프리미엄 UI 대시보드 및 로직
- `server.js`: 파일 스캔 및 Notion/Gemini API 처리 백엔드
- `lib/gemini.js`: Gemini AI 연동 모듈
- `lib/notion.js`: Notion API 연동 모듈
- `SETUP_GUIDE.md`: 상세 설정 및 트러블슈팅 가이드

---
---
Developed with ✨ by Antigravity

<br/>

---

# 📊 Notion Markdown Uploader (English)

A tool that reads Markdown (.md) files from a local folder, generates a one-sentence summary using Gemini AI, and automatically uploads them to a Notion database.

## 🚀 Key Features

- ⚡ **Real-time Dashboard**: Real-time display of upload progress, Estimated Time of Arrival (ETA), and processing speed.
- 📊 **Vitality Graph**: Visualizes the character count (length) of each uploaded file.
- 🤖 **Gemini AI Integration**: Analyzes each document's content to generate a concise one-sentence summary.
- 🔄 **Idempotency Guarantee**: Automatically detects already uploaded files to skip them or update only the summary (prevents duplicates).
- 🛡️ **Robust Error Handling**: Automatic detection of Notion API Rate Limits (429) and retries with Exponential Backoff.
- 📋 **Failure Management**: Check failed uploads in a separate tab and retry them individually.

## 🛠️ Setup Guide

### 1. Environment Variables
Create a `.env` file and enter the following:
```env
NOTION_TOKEN=your_notion_internal_integration_token
NOTION_DATABASE_ID=your_database_id
GEMINI_API_KEY=your_google_gemini_api_key
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Prepare Notion Database
The following properties must be defined in your database:
- **Name** (Title): File name
- **한줄요약** (Text): AI-generated summary
- **해시태그** (Multi-select): Tags based on document analysis (optional)

## 🏃 How to Run

```bash
# Development Mode (Frontend + Backend)
npm run dev
```

Or run individually:
```bash
# Backend Server
npm run server

# Frontend Client
npm run client
```

After running, visit `http://localhost:5173` in your browser and select a folder.

## 📁 Project Structure

- `src/App.jsx`: Premium UI dashboard and logic
- `server.js`: Backend for file scanning and Notion/Gemini API processing
- `lib/gemini.js`: Gemini AI integration module
- `lib/notion.js`: Notion API integration module
- `SETUP_GUIDE.md`: Detailed setup and troubleshooting guide
