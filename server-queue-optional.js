/**
 * 🚀 선택사항: BullMQ + WebSocket을 이용한 백그라운드 작업 큐 시스템
 * 
 * 이 파일은 참고용이며, 필요할 때만 사용하세요.
 * 
 * 설치:
 * npm install bullmq redis socket.io
 * 
 * 실행:
 * Redis 서버가 로컬에서 실행 중이어야 함 (포트 6379)
 * brew install redis && redis-server
 */

const express = require('express');
const { Queue, Worker } = require('bullmq');
const { Server } = require('socket.io');
const http = require('http');
const { generateSummary, generateTags } = require('./lib/gemini');
const { createNotionPage, updateNotionPageSummary } = require('./lib/notion');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Redis 연결 설정
const redis = { host: 'localhost', port: 6379 };

// 작업 큐 생성
const uploadQueue = new Queue('notion-uploads', { connection: redis });

// ============================================
// 👇 클라이언트가 파일을 업로드하면 큐에 작업 추가
// ============================================
app.post('/api/queue-uploads', express.json(), async (req, res) => {
  const { files } = req.body;
  
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: '파일 목록이 필요합니다' });
  }

  try {
    // 작업을 큐에 추가
    const job = await uploadQueue.add('upload-batch', { files }, {
      attempts: 3, // 최대 3회 재시도
      backoff: {
        type: 'exponential',
        delay: 2000, // 초기 지연 2초
      },
      removeOnComplete: {
        age: 3600, // 1시간 후 자동 삭제
      },
    });

    res.json({
      success: true,
      jobId: job.id,
      totalFiles: files.length,
      message: '작업이 큐에 추가되었습니다. 진행 상황을 모니터링해주세요.',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 👇 작업 진행 상황 조회
// ============================================
app.get('/api/job/:jobId', async (req, res) => {
  try {
    const job = await uploadQueue.getJob(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: '작업을 찾을 수 없습니다' });
    }

    const progress = job._progress || 0;
    const state = await job.getState();
    const data = job.data;

    res.json({
      jobId: job.id,
      state, // 'active', 'completed', 'failed', 'pending' 등
      progress: Math.round(progress),
      totalFiles: data.files.length,
      processedFiles: Math.round((progress / 100) * data.files.length),
      createdAt: job.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 👇 Worker: 실제 업로드 작업을 수행
// ============================================
const worker = new Worker('notion-uploads', async (job) => {
  const { files } = job.data;
  const results = {
    success: 0,
    error: 0,
    skipped: 0,
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      // 이미 업로드된 파일 확인
      if (file.pageId) {
        // 업데이트 모드
        await updateNotionPageSummary(file.pageId, file.summary);
        results.success++;
      } else {
        // 새 페이지 생성
        await createNotionPage(
          {
            title: file.name,
            tags: file.tags || [],
            summary: file.summary,
          },
          file.content
        );
        results.success++;
      }

      // 진행 상황을 소켓으로 브로드캐스트
      io.emit('progress', {
        jobId: job.id,
        current: i + 1,
        total: files.length,
        percent: Math.round(((i + 1) / files.length) * 100),
        results,
      });

      // Job 진행률 업데이트
      job.updateProgress(((i + 1) / files.length) * 100);
    } catch (error) {
      console.error(`Error processing ${file.name}:`, error.message);
      results.error++;

      io.emit('file-error', {
        jobId: job.id,
        filename: file.name,
        error: error.message,
      });
    }
  }

  return results;
}, { connection: redis });

// ============================================
// 👇 Worker 이벤트 핸들링
// ============================================
worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed:`, job.returnvalue);
  io.emit('job-completed', {
    jobId: job.id,
    results: job.returnvalue,
  });
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
  io.emit('job-failed', {
    jobId: job.id,
    error: err.message,
  });
});

// ============================================
// 👇 WebSocket 이벤트
// ============================================
io.on('connection', (socket) => {
  console.log(`📱 Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`📱 Client disconnected: ${socket.id}`);
  });

  // 클라이언트가 작업 상태를 요청할 때
  socket.on('check-job', async (jobId) => {
    const job = await uploadQueue.getJob(jobId);
    if (job) {
      socket.emit('job-status', {
        jobId: job.id,
        state: await job.getState(),
        progress: job._progress || 0,
      });
    }
  });
});

// ============================================
// 👇 서버 시작
// ============================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Queue server running at http://localhost:${PORT}`);
  console.log(`📊 Redis must be running on localhost:6379`);
});

/**
 * 📋 사용 흐름:
 * 
 * 1️⃣ 클라이언트: POST /api/queue-uploads
 *    → 파일 목록과 함께 요청
 *    → jobId를 받음
 * 
 * 2️⃣ 클라이언트: WebSocket 연결
 *    → 'progress', 'file-error', 'job-completed' 이벤트 수신
 *    → UI 업데이트
 * 
 * 3️⃣ 서버 Worker: 백그라운드에서 파일 처리
 *    → AI 요약 생성
 *    → Notion DB에 업로드
 *    → 진행률 브로드캐스트
 * 
 * 4️⃣ 작업 완료: 결과 반환
 *    → job-completed 이벤트
 *    → 클라이언트에서 완료 메시지 표시
 */

/**
 * ⚠️ 주의사항:
 * 
 * - Redis 서버가 필수로 필요합니다
 * - 프로덕션 배포 시 Redis를 클라우드(AWS ElastiCache, Redis Cloud 등)에서 호스팅
 * - 대량 파일 처리 시 Worker 수를 조정 (여러 Worker 실행 가능)
 * - 작업 제한 시간 설정 권장
 */
