import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderOpen, CheckCircle, Loader2, XCircle, 
  FileText, ArrowRight, Settings, AlertCircle, RefreshCw,
  HelpCircle, TrendingUp, Clock, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Vitality Graph Component (Heart Rate Monitor Style) ---
const VitalityGraph = ({ files, activeIndex }) => {
  if (!files || files.length === 0) return null;

  const lengths = files.map(f => f.content.length);
  const sortedLengths = [...lengths].sort((a, b) => a - b);
  const ninetyPercentile = sortedLengths[Math.floor(sortedLengths.length * 0.9)] || sortedLengths[sortedLengths.length - 1] || 1000;
  const maxChars = Math.max(800, Math.min(ninetyPercentile * 1.1, 2200));
  
  return (
    <div className="vitality-container">
      <div className="vitality-label">
        <Zap size={14} /> 글길이 바이탈 사인
      </div>
      <div className="vitality-bars">
        {files.map((file, i) => {
          const heightPercent = Math.min(100, Math.max((file.content.length / maxChars) * 100, 5));
          let barClass = "vital-bar";
          if (i === activeIndex) barClass += " active";
          else if (file.status === 'success' || file.status === 'updated') barClass += " success";
          else if (file.status === 'error') barClass += " error";
          else if (file.status === 'skipped') barClass += " skipped";

          return (
            <motion.div
              key={i}
              className={barClass}
              initial={{ height: 0 }}
              animate={{ height: `${heightPercent}%` }}
              transition={{ duration: 0.5, delay: i * 0.001 }}
              title={`${file.name}: ${file.content.length} bytes`}
            />
          );
        })}
      </div>
    </div>
  );
};

function App() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [shouldUpdateExisting, setShouldUpdateExisting] = useState(false);
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'errors'
  const [showTooltip, setShowTooltip] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState(8);
  const maxConcurrentRef = useRef(maxConcurrent);

  useEffect(() => {
    maxConcurrentRef.current = maxConcurrent;
  }, [maxConcurrent]);

  // Stats & Metrics
  const [metrics, setMetrics] = useState({
    startTime: null,
    itemsPerMinute: 0,
    estimatedTimeRemaining: null,
    progress: 0
  });

  const stats = {
    total: files.length,
    processed: files.filter(f => ['success', 'error', 'skipped', 'updated'].includes(f.status)).length,
    success: files.filter(f => f.status === 'success' || f.status === 'updated').length,
    error: files.filter(f => f.status === 'error').length,
    skipped: files.filter(f => f.status === 'skipped').length,
  };

  const failedFiles = files.filter(f => f.status === 'error');
  const activeFiles = files.filter(f => ['pending', 'summarizing', 'uploading', 'error'].includes(f.status));
  const visibleFiles = activeFiles.slice(0, 10);
  const hiddenActiveCount = Math.max(0, activeFiles.length - visibleFiles.length);

  // Update metrics when progress changes
  useEffect(() => {
    if (isProcessing && metrics.startTime && stats.processed > 0) {
      const elapsedMs = Date.now() - metrics.startTime;
      const itemsPerMs = stats.processed / elapsedMs;
      const itemsPerMin = Math.round(itemsPerMs * 60000);
      
      const remainingItems = stats.total - stats.processed;
      const remainingMs = remainingItems / itemsPerMs;
      
      setMetrics(prev => ({
        ...prev,
        itemsPerMinute: itemsPerMin,
        estimatedTimeRemaining: remainingMs,
        progress: (stats.processed / stats.total) * 100
      }));
    }
  }, [stats.processed, isProcessing]);

  const selectFolder = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker();
      setIsProcessing(true);
      setFiles([]);
      setActiveIndex(-1);
      setMetrics({ startTime: Date.now(), itemsPerMinute: 0, estimatedTimeRemaining: null, progress: 0 });
      
      const mdFiles = [];
      async function walk(handle, path = '') {
        for await (const entry of handle.values()) {
          const fullPath = path ? `${path}/${entry.name}` : entry.name;
          if (entry.kind === 'file' && entry.name.endsWith('.md')) {
            const file = await entry.getFile();
            const content = await file.text();
            const isAlreadyUploaded = /notion_page_id:\s*([a-zA-Z0-9-]+)/i.exec(content);
            const existingSummary = /summary:\s*"([^"]+)"|summary:\s*(.+?)$/m.exec(content);

            // 이미 요약이 있고 notion_page_id도 있으면 스킵 (완전히 처리된 파일)
            const hasSummary = existingSummary && (existingSummary[1] || existingSummary[2]);
            const shouldSkip = isAlreadyUploaded && hasSummary && !shouldUpdateExisting;

            mdFiles.push({
              name: entry.name,
              content,
              pageId: isAlreadyUploaded ? isAlreadyUploaded[1] : null,
              status: shouldSkip ? 'skipped' : 'pending',
              summary: hasSummary ? (existingSummary[1] || existingSummary[2]) : '',
              tags: []
            });
          } else if (entry.kind === 'directory') {
            await walk(entry, fullPath);
          }
        }
      }

      await walk(dirHandle);
      setFiles(mdFiles);
      processFiles(mdFiles);
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert('Error: ' + err.message);
      }
      setIsProcessing(false);
    }
  };

  // 병렬 처리: 동시성 제어 (Concurrency Control)
  const processFilesParallel = async (fileList, targetIndices = null) => {
    const indices = targetIndices || Array.from({ length: fileList.length }, (_, i) => i);
    const MAX_CONCURRENT = 8; // 더 빠른 처리: 8개 동시 실행
    
    // 처리 대기열
    const queue = [...indices].filter(i => {
      const file = fileList[i];
      return !(file.status === 'skipped' || file.status === 'success' || file.status === 'updated');
    });

    const processSingleFile = async (i) => {
      const file = fileList[i];
      setActiveIndex(i);
      updateFileStatus(i, { status: 'summarizing' });
      
      try {
        // 1. AI Summary
        const sumRes = await fetch('http://localhost:3001/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: file.content })
        });
        
        if (!sumRes.ok) {
          const errorData = await sumRes.json();
          throw new Error(errorData.error || '요약 생성 실패');
        }
        
        const { summary, tags } = await sumRes.json();
        updateFileStatus(i, { summary, tags, status: 'uploading' });

        // 2. Notion Create or Update
        const isUpdate = !!file.pageId;
        const endpoint = isUpdate ? '/api/update-summary' : '/api/upload';
        const method = isUpdate ? 'PATCH' : 'POST';
        const body = isUpdate 
          ? { pageId: file.pageId, summary }
          : { title: file.name.replace('.md', ''), content: file.content, summary, tags };

        const res = await fetch(`http://localhost:3001${endpoint}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        
        if (res.ok) {
          updateFileStatus(i, { status: isUpdate ? 'updated' : 'success' });
        } else {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Request failed');
        }
      } catch (error) {
        updateFileStatus(i, { error: error.message, status: 'error' });
      }
    };

    // 동시성 제어: 실행 중에도 변경값이 반영됩니다.
    while (queue.length > 0) {
      const batchSize = Math.max(1, Math.min(20, maxConcurrentRef.current));
      const batch = queue.splice(0, batchSize);
      await Promise.all(batch.map(processSingleFile));
    }
  };

  const processFiles = async (fileList, targetIndices = null) => {
    setIsProcessing(true);
    await processFilesParallel(fileList, targetIndices);
    setIsProcessing(false);
    setActiveIndex(-1);
  };

  const retryFailed = () => {
    const failedIndices = files
      .map((f, idx) => f.status === 'error' ? idx : -1)
      .filter(idx => idx !== -1);
    
    const freshList = files.map(f => f.status === 'error' ? { ...f, status: 'pending', error: null } : f);
    setFiles(freshList);
    processFiles(freshList, failedIndices);
  };

  const retryFile = (index) => {
    const freshList = [...files];
    freshList[index] = { ...freshList[index], status: 'pending', error: null };
    setFiles(freshList);
    processFiles(freshList, [index]);
  };

  const updateFileStatus = (index, updates) => {
    setFiles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const formatTime = (ms) => {
    if (!ms || ms < 0) return "--:--";
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}분 ${sec}초`;
  };

  return (
    <div className="app-container">
      <header>
        <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          Notion Uploader
        </motion.h1>
        <p className="subtitle">마크다운 폴더를 선택하면, AI가 요약/태그를 생성하여 노션 DB로 자동 업로드합니다. 대량 처리 시 중복 생성을 방지합니다.</p>
      </header>

      <div className="dashboard-grid">
        <div className="control-panel">
          <button className="btn-primary" onClick={selectFolder} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="animate-spin" /> : <FolderOpen />}
            {isProcessing ? '처리 중...' : 'Select Local Folder'}
          </button>
          
          <div className="settings-toggle">
            <label className="switch">
              <input 
                type="checkbox" 
                checked={shouldUpdateExisting} 
                onChange={(e) => setShouldUpdateExisting(e.target.checked)}
                disabled={isProcessing}
              />
              <span className="slider round"></span>
            </label>
            <span className="toggle-label">이미 업로드된 글 요약 채우기</span>
          </div>

          <div className="concurrency-control">
            <label htmlFor="concurrencyRange">동시 처리 수</label>
            <div className="concurrency-input">
              <input
                id="concurrencyRange"
                type="range"
                min="1"
                max="20"
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              />
              <span>{maxConcurrent}개</span>
            </div>
          </div>
        </div>

        {stats.total > 0 && (
          <motion.div className="stats-board" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="stats-header">
              <div className="progress-section">
                <div className="progress-text">
                  <span className="percent">{Math.round(metrics.progress)}%</span>
                  <span className="count">{stats.processed} / {stats.total} 완료</span>
                </div>
                <div className="time-metrics">
                  {isProcessing && stats.processed > 0 ? (
                    <>
                      <div className="metric-item">
                        <TrendingUp size={16} />
                        <span>{metrics.itemsPerMinute}개/분</span>
                      </div>
                      <div className="metric-item">
                        <Clock size={16} />
                        <span>약 {formatTime(metrics.estimatedTimeRemaining)} 남음</span>
                      </div>
                    </>
                  ) : (
                    stats.total > 0 && (
                      <div className="metric-item">
                        <AlertCircle size={16} />
                        <span>대기 중</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
            
            <div className="progress-bar-bg">
              <motion.div className="progress-bar-fill" animate={{ width: `${metrics.progress}%` }} />
            </div>

            <VitalityGraph files={files} activeIndex={activeIndex} />

            {/* Tab System */}
            <div className="tab-system">
              <div className="tab-buttons">
                <button 
                  className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                  onClick={() => setActiveTab('stats')}
                >
                  📊 통계
                </button>
                {failedFiles.length > 0 && (
                  <button 
                    className={`tab-btn ${activeTab === 'errors' ? 'active' : ''}`}
                    onClick={() => setActiveTab('errors')}
                  >
                    ⚠️ 실패 ({failedFiles.length})
                  </button>
                )}
              </div>

              {activeTab === 'stats' && (
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="label">성공</span>
                    <span className="value success">{stats.success}</span>
                  </div>
                  <div className="stat-item">
                    <span className="label">건너뜀</span>
                    <span className="value skipped">{stats.skipped}</span>
                    <span className="tooltip-icon" 
                      onMouseEnter={() => setShowTooltip('skip')}
                      onMouseLeave={() => setShowTooltip('')}
                    >
                      <HelpCircle size={12} />
                      {showTooltip === 'skip' && (
                        <div className="tooltip">같은 제목의 페이지가 이미 존재할 때 자동으로 건너뜁니다</div>
                      )}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="label">실패</span>
                    <span className="value error">{stats.error}</span>
                  </div>
                </div>
              )}

              {activeTab === 'errors' && failedFiles.length > 0 && (
                <div className="error-tab-content">
                  <div className="error-list">
                    {failedFiles.map((f, i) => (
                      <div key={i} className="error-item">
                        <div className="error-file-info">
                          <span className="error-file-name">{f.name}</span>
                          <span className="error-reason">{f.error}</span>
                        </div>
                        <button 
                          className="retry-btn"
                          onClick={() => retryFile(i)}
                          disabled={isProcessing}
                        >
                          🔄 재시도
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* 탭 시스템으로 통합됨 - 기존 failure-section 제거됨 */}

      <div className="file-list">
        <div className="file-list-header">
          <span>현재 진행 중인 항목 ({activeFiles.length}개 중 최대 10개 표시)</span>
          {hiddenActiveCount > 0 && <span className="file-list-note">+{hiddenActiveCount}개 추가</span>}
        </div>
        <AnimatePresence>
          {visibleFiles.map((file, idx) => (
            <motion.div 
              key={idx}
              className={`file-card ${file.status} ${files.indexOf(file) === activeIndex ? 'active' : ''}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-status-text">
                  {file.status === 'summarizing' && <span className="working">🤖 AI 요약 중...</span>}
                  {file.status === 'uploading' && <span className="working">📤 업로드 중...</span>}
                  {file.status === 'success' && <span className="success">✅ 완료</span>}
                  {file.status === 'updated' && <span className="success">✨ 요약 업데이트됨</span>}
                  {file.status === 'skipped' && <span className="skipped">⏭️ 건너뜀</span>}
                  {file.status === 'error' && <span className="error">❌ {file.error}</span>}
                  {file.status === 'pending' && <span>대기 중</span>}
                </div>
              </div>
              <div className="file-icon">
                {file.status === 'success' || file.status === 'updated' ? <CheckCircle color="var(--success-color)" /> : 
                 file.status === 'error' ? <XCircle color="var(--error-color)" /> : <FileText color="var(--text-secondary)" />}
              </div>
            </motion.div>
          ))}
          {visibleFiles.length === 0 && (
            <div className="empty-file-list">현재 처리 중인 항목이 없습니다.</div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;
