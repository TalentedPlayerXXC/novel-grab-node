import { Drawer, Radio, Divider, Row, Col, Button, Typography, theme } from 'antd';
import { DeleteOutlined, BulbOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function Settings({
  open,
  onClose,
  themeMode,
  onThemeChange,
  searchCacheCount,
  searchCacheSizeMB,
  chapterCacheCount,
  onClearSearchCache,
  onClearChapterCache,
  onClearAllCache,
}) {
  const { token } = theme.useToken();

  const cardBorder = `1px solid ${token.colorBorderSecondary}`;
  return (
    <Drawer
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BulbOutlined />
          设置
        </span>
      }
      placement="right"
      open={open}
      onClose={onClose}
      width={380}
    >
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 14 }}>主题</Text>
      </div>
      <Radio.Group
        value={themeMode}
        onChange={(e) => onThemeChange(e.target.value)}
        optionType="button"
        buttonStyle="solid"
        size="middle"
        style={{ width: '100%' }}
      >
        <Radio.Button value="light" style={{ width: '33.33%', textAlign: 'center' }}>
          浅色
        </Radio.Button>
        <Radio.Button value="dark" style={{ width: '33.33%', textAlign: 'center' }}>
          深色
        </Radio.Button>
        <Radio.Button value="auto" style={{ width: '33.33%', textAlign: 'center' }}>
          跟随系统
        </Radio.Button>
      </Radio.Group>
      <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
        深色主题更适合长时间阅读，选择"跟随系统"将自动匹配 macOS / Windows 的浅深色设置
      </Text>

      <Divider />

      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 14 }}>缓存管理</Text>
      </div>

      <Row gutter={[12, 12]}>
        <Col span={12}>
          <div
            style={{
              border: cardBorder,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text strong style={{ fontSize: 13 }}>搜索缓存</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {searchCacheCount} 条 · {searchCacheSizeMB()} MB
              </Text>
            </div>
            <Button
              size="small"
              icon={<DeleteOutlined />}
              onClick={onClearSearchCache}
              disabled={searchCacheCount === 0}
              style={{ marginTop: 8 }}
              block
            >
              清空
            </Button>
          </div>
        </Col>
        <Col span={12}>
          <div
            style={{
              border: cardBorder,
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text strong style={{ fontSize: 13 }}>章节缓存</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {chapterCacheCount} 条
              </Text>
            </div>
            <Button
              size="small"
              icon={<DeleteOutlined />}
              onClick={onClearChapterCache}
              disabled={chapterCacheCount === 0}
              style={{ marginTop: 8 }}
              block
            >
              清空
            </Button>
          </div>
        </Col>
      </Row>

      <Button
        danger
        icon={<DeleteOutlined />}
        onClick={onClearAllCache}
        disabled={searchCacheCount === 0 && chapterCacheCount === 0}
        style={{ marginTop: 12 }}
        block
      >
        清空全部缓存
      </Button>

      <Divider />
      <Text type="secondary" style={{ fontSize: 12 }}>
        小说抓取工具 v1.0.0 —— 跨书源聚合搜索与下载
      </Text>
    </Drawer>
  );
}
