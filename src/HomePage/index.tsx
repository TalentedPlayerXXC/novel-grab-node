import { Input, Button, Card, Tag, Empty, Badge, Typography } from 'antd';
import { DownloadOutlined, ReadOutlined } from '@ant-design/icons';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { StarryLoading } from '../components/StarryLoading';
import { search, submitDownload, fetchSources, SearchResponse, BookData, SourceInfo } from '../services/api';
import { getCachedSearch, setCachedSearch } from '../services/cache';
import './index.css';

const { Text } = Typography;

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

function getVisualStyle(): 'starry' | 'cyberpunk' {
  try {
    return (localStorage.getItem('novel-grab-visual-style') as 'starry' | 'cyberpunk') || 'starry';
  } catch {
    return 'starry';
  }
}

function HomePage() {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadSources() {
      setSourcesLoading(true);
      try {
        const data = await fetchSources(getAdultSetting());
        setSources(data.sources);
      } catch {
      } finally {
        setSourcesLoading(false);
      }
    }
    loadSources();
    window.addEventListener('adult-change', loadSources);
    return () => window.removeEventListener('adult-change', loadSources);
  }, []);

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    sources.forEach((s, i) => map.set(s.key, `线路 ${i + 1}`));
    return map;
  }, [sources]);

  const handleSearch = async () => {
    const kw = keyword.trim();
    if (kw.length < 2) return;

    const cached = getCachedSearch(kw);
    if (cached) {
      setResults(cached);
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);
    try {
      const data = await search(kw, getAdultSetting());
      setResults(data);
      setCachedSearch(kw, data);
    } catch (e: any) {
      setError(e.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewChapters = (sourceKey: string, bookId: string, book: BookData) => {
    navigate(`/book/${sourceKey}/${bookId}`, { state: book });
  };

  const handleDownload = async (sourceKey: string, book: BookData) => {
    try {
      const { task_id } = await submitDownload(sourceKey, book, getAdultSetting(), undefined, undefined, getDownloadPath());
      navigate(`/task/${task_id}`);
    } catch (e: any) {
      setError(e.message || '下载请求失败');
    }
  };

  return (
    <div className="home">
      <div className="home__search">
        <Input.Search
          placeholder="输入小说名搜索（至少2个字符）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          loading={loading}
          enterButton="搜索"
          size="large"
          style={{ maxWidth: 480 }}
          disabled={loading}
        />
      </div>

      {!loading && !results && !error && (
        <div className="home__sources">
          <Text strong style={{ fontSize: 14 }}>可用线路</Text>
          {sourcesLoading ? (
            <StarryLoading size="small" variant={getVisualStyle()} text="加载书源..." />
          ) : (
            <div className="home__sources-list">
              {sources.map((s) => (
                <Tag key={s.key} color={s.online ? 'green' : 'red'}>
                  <Badge status={s.online ? 'success' : 'error'} />
                  {sourceNameMap.get(s.key) || s.name}
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                    {s.latency_ms}ms
                  </Text>
                </Tag>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="home__error">{error}</div>
      )}

      {loading && (
        <div className="home__loading">
          <StarryLoading text="正在搜索..." variant={getVisualStyle()} />
        </div>
      )}

      {results && !loading && (
        <div className="home__results">
          {Object.keys(results).length === 0 ? (
            <Empty description="未找到相关小说" />
          ) : (
            Object.entries(results).map(([sourceKey, books]) => (
              <div key={sourceKey} className="home__source">
                <div className="home__source-head">
                  <Tag color="blue">{sourceNameMap.get(sourceKey) || sourceKey}</Tag>
                  <span className="home__source-count">{Object.keys(books).length} 条结果</span>
                </div>
                <div className="home__book-list">
                  {Object.entries(books).map(([bookId, book]) => (
                    <Card
                      key={bookId}
                      size="small"
                      className="home__book-card"
                      actions={[
                        <Button
                          key="chapters"
                          size="small"
                          icon={<ReadOutlined />}
                          onClick={() => handleViewChapters(sourceKey, bookId, book)}
                        >
                          章节
                        </Button>,
                        <Button
                          key="download"
                          type="primary"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownload(sourceKey, book)}
                        >
                          下载
                        </Button>,
                      ]}
                    >
                      <Card.Meta
                        title={book.title}
                        description={
                          <div className="home__book-meta">
                            <span>{book.author || '未知作者'}</span>
                            {book.status && book.status !== '未知' && (
                              <Tag>{book.status}</Tag>
                            )}
                            {book.word_count > 0 && (
                              <span>{(book.word_count / 10000).toFixed(1)}万字</span>
                            )}
                          </div>
                        }
                      />
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default HomePage;
