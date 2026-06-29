import { Modal, Button, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import './Disclaimer.css';

const { Title, Paragraph } = Typography;

interface Props {
  onAgree: () => void;
}

function Disclaimer({ onAgree }: Props) {
  return (
    <Modal open closable={false} maskClosable={false} footer={null} centered width={480}>
      <div className="disclaimer">
        <ExclamationCircleOutlined className="disclaimer__icon" style={{ fontSize: 42, color: '#1677ff' }} />
        <Title level={4} style={{ marginTop: 10, marginBottom: 0 }}>用户须知与免责声明</Title>
      </div>
      <Paragraph style={{ lineHeight: 2, fontSize: 14, marginTop: 16, marginBottom: 0 }}>
        本软件仅供<b>个人学习、测试和研究</b>使用，严禁用于任何商业用途。
      </Paragraph>
      <ul style={{ paddingLeft: 20, lineHeight: 2.2, fontSize: 13 }}>
        <li>用户应遵守所在地法律法规，尊重原创作者的著作权及相关权益。</li>
        <li>本软件不存储、不传播任何小说内容，仅为用户提供网页内容检索与阅读辅助。</li>
        <li>使用本软件获取的任何内容均来自公开的网络资源，开发者不对其合法性、准确性负责。</li>
        <li>因使用本软件产生的任何法律纠纷或损失，由用户自行承担，开发者不承担任何责任。</li>
      </ul>
      <div className="disclaimer__actions">
        <Button type="primary" block onClick={onAgree}>
          我已阅读并同意
        </Button>
      </div>
    </Modal>
  );
}

export default Disclaimer;
