import { Routes, Route } from 'react-router';
import HomePage from '../HomePage';
import TaskDetailPage from '../TaskDetailPage';
import BookDetailPage from '../BookDetailPage';
import SettingsPage from '../SettingsPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/book/:sourceKey/:bookId" element={<BookDetailPage />} />
      <Route path="/task/:taskId" element={<TaskDetailPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}

export default AppRoutes;
