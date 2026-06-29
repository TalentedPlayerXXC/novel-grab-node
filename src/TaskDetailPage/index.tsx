import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router';
import { Progress, Typography, Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { createTaskSocket, getTaskResult, getTaskProgress, TaskStatus, TaskResult } from '../services/api';
import './index.css';

const { Title, Text, Paragraph } = Typography;

function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [error, setError] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const ws = createTaskSocket(taskId);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data: TaskStatus & { status: string } = JSON.parse(event.data);
        setStatus(data);

        if (data.status === 'done') {
          ws.close();
          fetchResult();
        } else if (data.status === 'error') {
          ws.close();
          setError(data.message || '下载失败');
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setError('WebSocket 连接失败，尝试轮询...');
      pollProgress();
    };

    return () => {
      ws.close();
    };
  }, [taskId]);

  const fetchResult = async () => {
    if (!taskId) return;
    try {
      const data = await getTaskResult(taskId);
      setResult(data);
    } catch (e: any) {
      setError(e.message || '获取结果失败');
    }
  };

  const pollProgress = async () => {
    if (!taskId) return;
    try {
      const data = await getTaskProgress(taskId);
      setStatus(data);
      if (data.status === 'done') {
        fetchResult();
      } else if (data.status === 'error') {
        setError(data.message || '下载失败');
      } else {
        setTimeout(pollProgress, 2000);
      }
    } catch {
      setTimeout(pollProgress, 2000);
    }
  };

  const handleRetry = () => {
    setError('');
    setStatus(null);
    setResult(null);
    window.location.reload();
  };

  if (!taskId) {
    return <Result status="error" title="无效的任务 ID" />;
  }

  return (
    <div className="task">
      <Title level={3} style={{ marginBottom: 24 }}>
        {status?.title || '下载任务'}
      </Title>

      <div className="task__id">
        <Text type="secondary">任务 ID：{taskId}</Text>
      </div>

      {status && (
        <div className="task__progress">
          <Progress
            percent={status.progress}
            status={status.status === 'error' ? 'exception' : status.status === 'done' ? 'success' : 'active'}
            format={() => `${status.progress}%`}
          />
          <Text>{status.message}</Text>
          {status.total_chapters > 0 && (
            <Text type="secondary">
              已完成 {status.completed_chapters}/{status.total_chapters} 章
            </Text>
          )}
        </div>
      )}

      {!status && !error && (
        <div className="task__waiting">
          <Text type="secondary">正在连接任务...</Text>
        </div>
      )}

      {error && (
        <Result
          status="error"
          title="任务异常"
          subTitle={error}
          extra={
            <Button type="primary" icon={<ReloadOutlined />} onClick={handleRetry}>
              重试
            </Button>
          }
        />
      )}

      {result && (
        <div className="task__result">
          <Title level={4}>下载完成</Title>
          {Object.entries(result).map(([sourceKey, books]) =>
            Object.entries(books).map(([bookId, data]) => (
              <div key={bookId} className="task__result-item">
                <Paragraph>
                  <Text strong>{data.title}</Text>
                  <br />
                  <Text>总章节：{data.total_chapters}</Text>
                  <br />
                  <Text type="success">文件路径：{data.filepath}</Text>
                </Paragraph>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default TaskDetailPage;
