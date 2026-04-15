/**
 * 🚀 선택사항: WebSocket을 이용한 진행률 모니터링 (클라이언트)
 * 
 * 이 파일은 참고용이며, 현재는 직접 fetch를 사용하는 방식으로 구현되어 있습니다.
 * 백그라운드 큐 시스템으로 전환하려면 이 코드를 사용하세요.
 * 
 * 설치:
 * npm install socket.io-client
 */

import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

// WebSocket 연결
const socket = io('http://localhost:3001');

function AppWithQueue() {
  const [files, setFiles] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobState, setJobState] = useState('pending'); // pending, active, completed, failed
  const [results, setResults] = useState(null);

  // ============================================
  // 👇 폴더 선택 및 작업 시작
  // ============================================
  const selectFolderAndQueue = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker();
      const mdFiles = [];

      async function walk(handle) {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file' && entry.name.endsWith('.md')) {
            const file = await entry.getFile();
            const content = await file.text();

            mdFiles.push({
              name: entry.name,
              content,
              summary: '', // AI가 생성할 요약
              tags: [],
            });
          } else if (entry.kind === 'directory') {
            await walk(entry);
          }
        }
      }

      await walk(dirHandle);

      // 1️⃣ 파일 목록을 서버 큐에 전송
      const response = await fetch('http://localhost:3001/api/queue-uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: mdFiles }),
      });

      const data = await response.json();
      setJobId(data.jobId);
      setJobState('pending');
      setJobProgress(0);
      setFiles(mdFiles);

      console.log(`✅ Job queued: ${data.jobId}`);
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  // ============================================
  // 👇 WebSocket 이벤트 리스너
  // ============================================
  useEffect(() => {
    // 진행률 업데이트
    socket.on('progress', (data) => {
      if (data.jobId === jobId) {
        setJobProgress(data.percent);
        console.log(`📊 Progress: ${data.percent}% (${data.processedFiles}/${data.totalFiles})`);
      }
    });

    // 파일별 에러
    socket.on('file-error', (data) => {
      if (data.jobId === jobId) {
        console.error(`❌ Error on ${data.filename}: ${data.error}`);
      }
    });

    // 작업 완료
    socket.on('job-completed', (data) => {
      if (data.jobId === jobId) {
        setJobState('completed');
        setResults(data.results);
        console.log(`✅ Job completed:`, data.results);
      }
    });

    // 작업 실패
    socket.on('job-failed', (data) => {
      if (data.jobId === jobId) {
        setJobState('failed');
        console.error(`❌ Job failed: ${data.error}`);
      }
    });

    return () => {
      socket.off('progress');
      socket.off('file-error');
      socket.off('job-completed');
      socket.off('job-failed');
    };
  }, [jobId]);

  // ============================================
  // 👇 주기적으로 작업 상태 확인 (폴백)
  // ============================================
  useEffect(() => {
    if (!jobId || jobState === 'completed' || jobState === 'failed') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/job/${jobId}`);
        const data = await response.json();

        if (data.progress) {
          setJobProgress(data.progress);
          setJobState(data.state);
        }
      } catch (error) {
        console.error('Failed to check job status:', error);
      }
    }, 2000); // 2초마다 확인

    return () => clearInterval(interval);
  }, [jobId, jobState]);

  // ============================================
  // 👇 UI 렌더링
  // ============================================
  return (
    <div className="app-container">
      <header>
        <h1>Notion Uploader (Queue Version)</h1>
        <p className="subtitle">
          대량 파일 처리용 백그라운드 큐 시스템
        </p>
      </header>

      <div className="dashboard">
        <button 
          onClick={selectFolderAndQueue}
          disabled={jobId && jobState === 'active'}
          className="btn-primary"
        >
          {jobId ? `작업 진행 중... (${jobProgress}%)` : '폴더 선택'}
        </button>

        {jobId && (
          <div className="job-status">
            <h3>작업 ID: {jobId}</h3>
            <p>상태: {jobState}</p>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${jobProgress}%` }}
              />
            </div>
            <p>{jobProgress}% 완료</p>

            {results && (
              <div className="results">
                <h4>결과:</h4>
                <ul>
                  <li>✅ 성공: {results.success}</li>
                  <li>❌ 실패: {results.error}</li>
                  <li>⏭️ 건너뜀: {results.skipped}</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AppWithQueue;

/**
 * 💡 직접 fetch 방식 vs 큐 방식 비교
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 직접 fetch 방식 (현재 구현)                                    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ ✅ 장점:                                                      │
 * │   - 간단한 구현                                               │
 * │   - 셋업 필요 없음                                             │
 * │   - 로컬 개발에 최적화                                          │
 * │                                                              │
 * │ ❌ 단점:                                                      │
 * │   - 브라우저가 탭을 닫으면 작업 중단                             │
 * │   - 메모리 사용량이 클수록 느려짐                               │
 * │   - 1990개 파일 시 타임아웃 가능성                              │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 백그라운드 큐 방식 (선택사항)                                   │
 * ├─────────────────────────────────────────────────────────────┤
 * │ ✅ 장점:                                                      │
 * │   - 브라우저 종료 후에도 계속 실행                              │
 * │   - 대량 처리에 최적화                                         │
 * │   - 서버가 독립적으로 처리                                      │
 * │   - 실시간 진행률 모니터링                                      │
 * │                                                              │
 * │ ❌ 단점:                                                      │
 * │   - Redis 서버 필수                                          │
 * │   - 셋업이 더 복잡                                             │
 * │   - 운영 비용 증가                                             │
 * └─────────────────────────────────────────────────────────────┘
 */
