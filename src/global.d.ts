interface Window {
  electronAPI?: {
    selectDirectory: () => Promise<string | null>;
  };
}
