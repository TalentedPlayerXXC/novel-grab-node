import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Typography, Progress, Button, Result, Empty } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { StarryLoading } from '../components/StarryLoading';
import { submitDownload, getTaskResult, createTaskSocket, BookData, ChapterData } from '../services/api';
import { getCachedBook, setCachedBook, CachedBook } from '../services/cache';
import './index.css';

const { Title, Paragraph } = Typography;

function getAdultSetting(): boolean {
  try {
    return localStorage.getItem('novel-grab-adult') === 'true';
  } catch {
    return false;
  }
}

function getDownloadPath(): string {
  try {
    return localStorage.getItem('novel-grab-download-path') || '';
  } catch {
    return '';
  }
}

function BookDetailPage() {
  const { sourceKey } = useParams<{ sourceKey: string; bookId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const book = location.state as BookData | undefined;

  const [status, setStatus] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [dlMessage, setDlMessage] = useState('');
  const [totalChapters, setTotalChapters] = useState(0);
  const [completedChapters, setCompletedChapters] = useState(0);
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [chapterList, setChapterList] = useState<{ index: number; title: string; url: string }[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [error, setError] = useState('');
  const [filepath, setFilepath] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!book) {
      setError('未找到书籍信息');
      setStatus('error');
      return;
    }
    const cached = getCachedBook(book.chapter_url);
    if (cached) {
      setChapterList(cached.chapters);
      setStatus('idle');
    }
  }, [book]);

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [selectedIdx]);

  if (!book) {
    return (
      <div className="book-detail" style={{ justifyContent: 'center' }}>
        <Result status="error" title="页面参数异常" />
      </div>
    );
  }

  const chapterCount = chapterList.length > 0 ? chapterList.length : chapters.length;
  const effectiveTotal = totalChapters || chapterCount;

  const handleDownload = async () => {
    if (!book || !sourceKey) return;
    setStatus('downloading');
    setProgress(0);
    setError('');

    try {
      const { task_id } = await submitDownload(sourceKey, book, getAdultSetting(), undefined, undefined, getDownloadPath());

      const ws = createTaskSocket(task_id);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgress(data.progress || 0);
          setDlMessage(data.message || '');
          setTotalChapters(data.total_chapters || 0);
          setCompletedChapters(data.completed_chapters || 0);

          if (data.status === 'done') {
            ws.close();
            fetchResultAndFinalize(task_id);
          } else if (data.status === 'error') {
            setError(data.message || '下载失败');
            setStatus('error');
            ws.close();
          }
        } catch {}
      };

      ws.onerror = () => {
        setError('WebSocket 连接失败');
        setStatus('error');
      };
    } catch (e: any) {
      setError(e.message || '提交任务失败');
      setStatus('error');
    }
  };

  const fetchResultAndFinalize = async (taskId: string) => {
    try {
      const data = await getTaskResult(taskId);
      let foundChapters: ChapterData[] = [];
      let foundPath = '';
      for (const books of Object.values(data)) {
        for (const result of Object.values(books)) {
          foundChapters = result.chapters || [];
          foundPath = result.filepath || '';
          break;
        }
      }
      setChapters(foundChapters);
      setFilepath(foundPath);
      setSelectedIdx(0);

      const toc = foundChapters.map((ch) => ({
        index: ch.index,
        title: ch.title,
        url: ch.url,
      }));
      setChapterList(toc);
      if (toc.length > 0 && book) {
        setCachedBook(book.chapter_url, book, toc);
      }

      setStatus('done');
    } catch {
      setError('获取结果失败');
      setStatus('error');
    }
  };

  if (status === 'error') {
    return (
      <div className="book-detail" style={{ justifyContent: 'center' }}>
        <Result
          status="error"
          title="加载失败"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => navigate('/')}>
              返回首页
            </Button>
          }
        />
      </div>
    );
  }

  const hasContent = chapters.length > 0;
  const showChapters = chapterList.length > 0;

  return (
    <div className="book-detail">
      <div className="book-detail__top">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/')}
        >
          返回
        </Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }} ellipsis>
          {book.title}
        </Title>
      </div>

      {status === 'downloading' && (
        <div className="book-detail__progress">
          <Progress
            percent={progress}
            size="small"
            status="active"
            format={() => `${progress}%`}
          />
          <span className="book-detail__progress-text">
            {dlMessage || '正在获取章节...'}
            {effectiveTotal > 0 && ` (${completedChapters}/${effectiveTotal})`}
          </span>
        </div>
      )}

      {status === 'done' && (
        <div className="book-detail__progress book-detail__progress--done">
          <Progress percent={100} size="small" status="success" />
          <span className="book-detail__progress-text">
            共 {effectiveTotal} 章
            {filepath && (
              <span style={{ marginLeft: 12, color: '#52c41a', fontSize: 11 }}>
                {filepath}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="book-detail__body">
        {showChapters ? (
          <>
            <div className="book-detail__sidebar">
              {chapterList.map((ch, i) => (
                <div
                  key={i}
                  className={`book-detail__ch ${i === selectedIdx ? 'book-detail__ch--active' : ''}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  {ch.title || `第${ch.index}章`}
                </div>
              ))}
            </div>
            <div className="book-detail__content" ref={contentRef}>
              {hasContent ? (
                <>
                  <div className="book-detail__content-title">
                    {chapters[selectedIdx]?.title || `第${chapters[selectedIdx]?.index}章`}
                  </div>
                  <div className="book-detail__content-body">
                    {chapters[selectedIdx]?.content
                      ? chapters[selectedIdx].content.split('\n').map((line, i) => (
                          <Paragraph key={i}>{line || '\u00A0'}</Paragraph>
                        ))
                      : <Empty description="暂无内容" />}
                  </div>
                </>
              ) : (
                <div className="book-detail__content-empty">
                  {status === 'downloading' ? (
                    <StarryLoading text={`正在下载章节... (${completedChapters}/${effectiveTotal || '?'})`} />
                  ) : (
                    <div className="book-detail__content-actions">
                      <Button
                        type="primary"
                        size="large"
                        icon={<DownloadOutlined />}
                        onClick={handleDownload}
                      >
                        下载正文 ({chapterCount}章)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="book-detail__loading">
            <div className="book-detail__content-actions">
              <Button
                type="primary"
                size="large"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
                loading={status === 'downloading'}
              >
                下载正文
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BookDetailPage;
