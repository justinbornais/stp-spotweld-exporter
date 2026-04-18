import React from 'react';
import { useAppStore } from '../store';

export const Toolbar: React.FC = () => {
  const model = useAppStore((s) => s.model);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const setModel = useAppStore((s) => s.setModel);
  const clearWelds = useAppStore((s) => s.clearWelds);

  const handleNewFile = () => {
    setModel(null);
    clearWelds();
  };

  if (!model) return null;

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-title">Weld Identifier</span>
        <span className="toolbar-file" title={model.fileName}>
          {model.fileName}
        </span>
      </div>
      <div className="toolbar-center">
        <button
          className={`toolbar-btn ${mode === 'view' ? 'active' : ''}`}
          onClick={() => setMode('view')}
        >
          👁 View
        </button>
        <button
          className={`toolbar-btn ${mode === 'select' ? 'active' : ''}`}
          onClick={() => setMode('select')}
        >
          📌 Select
        </button>
      </div>
      <div className="toolbar-right">
        <button className="toolbar-btn" onClick={handleNewFile}>
          📂 New File
        </button>
      </div>
    </div>
  );
};
