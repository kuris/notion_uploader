import React, { useState } from 'react';
import { FolderOpen, CheckCircle, Loader2, XCircle, FileText, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectFolder = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker();
      setIsProcessing(true);
      const mdFiles = [];
      
      async function walk(handle, path = '') {
        for await (const entry of handle.values()) {
          const fullPath = path ? `${path}/${entry.name}` : entry.name;
          if (entry.kind === 'file' && entry.name.endsWith('.md')) {
            const file = await entry.getFile();
            const content = await file.text();
            mdFiles.push({
              name: entry.name,
              content,
              status: 'pending', // pending, summarizing, uploading, success, error
              summary: '',
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
        alert('Error selecting folder: ' + err.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const processFiles = async (fileList) => {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      
      // Update status to summarizing
      updateFileStatus(i, { status: 'summarizing' });
      
      try {
        // 1. Summarize
        const sumRes = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: file.content })
        });
        const { summary, tags } = await sumRes.json();
        updateFileStatus(i, { summary, tags, status: 'uploading' });

        // 2. Upload
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: file.name.replace('.md', ''),
            content: file.content,
            summary,
            tags
          })
        });
        
        if (uploadRes.ok) {
          updateFileStatus(i, { status: 'success' });
        } else {
          const errorData = await uploadRes.json();
          throw new Error(errorData.error || 'Upload failed');
        }
      } catch (error) {
        updateFileStatus(i, { error: error.message, status: 'error' });
      }
    }
  };

  const updateFileStatus = (index, updates) => {
    setFiles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  return (
    <div className="app-container">
      <header>
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Notion Uploader
        </motion.h1>
        <motion.p 
          className="subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          마크다운 파일을 분석하고 노션으로 자동 업로드합니다.
        </motion.p>
      </header>

      <div className="upload-section">
        <button className="btn-primary" onClick={selectFolder} disabled={isProcessing}>
          {isProcessing ? <Loader2 className="animate-spin" /> : <FolderOpen />}
          {isProcessing ? 'Searching...' : 'Select Local Folder'}
        </button>
      </div>

      <div className="file-list">
        <AnimatePresence>
          {files.map((file, idx) => (
            <motion.div 
              key={idx}
              className="file-card"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-status">
                  {file.status === 'pending' && <span>대기 중...</span>}
                  {file.status === 'summarizing' && (
                    <span className="working-pulse">
                      <Loader2 className="inline animate-spin mr-1 w-4 h-4" /> 🤖 AI 요약 생성 중...
                    </span>
                  )}
                  {file.status === 'uploading' && (
                    <span className="working-pulse">
                      <Loader2 className="inline animate-spin mr-1 w-4 h-4" /> 📤 노션 업로드 중...
                    </span>
                  )}
                  {file.status === 'success' && <span className="text-success-color" style={{ color: 'var(--success-color)' }}>✅ 업로드 완료</span>}
                  {file.status === 'error' && <span className="text-error-color" style={{ color: 'var(--error-color)' }}>❌ 실패: {file.error}</span>}
                </div>
              </div>
              <div className="file-action">
                 {file.status === 'success' ? (
                   <CheckCircle color="var(--success-color)" />
                 ) : file.status === 'error' ? (
                   <XCircle color="var(--error-color)" />
                 ) : (
                   <FileText color="var(--text-secondary)" />
                 )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {files.length === 0 && !isProcessing && (
        <motion.div 
          style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          업로드할 폴더를 선택해 주세요.
        </motion.div>
      )}
    </div>
  );
}

export default App;
