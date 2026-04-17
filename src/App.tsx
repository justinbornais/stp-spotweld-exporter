import React from 'react';
import { useAppStore } from './store';
import { FileUpload } from './components/FileUpload';
import { Viewer3D } from './components/Viewer3D';
import { WeldPanel } from './components/WeldPanel';
import { Toolbar } from './components/Toolbar';
import { LoadingOverlay } from './components/LoadingOverlay';
import './App.css';

const App: React.FC = () => {
  const model = useAppStore((s) => s.model);
  const isLoading = useAppStore((s) => s.isLoading);
  const loadingMessage = useAppStore((s) => s.loadingMessage);

  return (
    <div className="app">
      {isLoading && <LoadingOverlay message={loadingMessage} />}

      {!model ? (
        <div className="upload-screen">
          <FileUpload />
        </div>
      ) : (
        <>
          <Toolbar />
          <div className="main-layout">
            <div className="viewer-container">
              <Viewer3D />
            </div>
            <div className="panel-container">
              <WeldPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
