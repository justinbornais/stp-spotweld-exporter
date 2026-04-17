import React, { useCallback } from 'react';
import { useAppStore } from '../store';
import { parseStepFile, parseIgesFile, parseBrepFile } from '../cadParser';

const ACCEPTED_EXTENSIONS = ['.step', '.stp', '.iges', '.igs', '.brep'];
const SAMPLE_FILE_URL = '/samples/sample-assembly.stp';

export const FileUpload: React.FC = () => {
  const setModel = useAppStore((s) => s.setModel);
  const setIsLoading = useAppStore((s) => s.setIsLoading);
  const setLoadingMessage = useAppStore((s) => s.setLoadingMessage);
  const clearWelds = useAppStore((s) => s.clearWelds);

  const parseCadBuffer = useCallback(
    async (fileBuffer: Uint8Array, fileName: string) => {
      const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        throw new Error(
          `Unsupported file format: ${ext}\nSupported: ${ACCEPTED_EXTENSIONS.join(', ')}`
        );
      }

      setLoadingMessage(`Loading ${fileName}...`);
      clearWelds();

      setLoadingMessage('Parsing CAD geometry...');

      let model;
      if (ext === '.step' || ext === '.stp') {
        model = await parseStepFile(fileBuffer, fileName);
      } else if (ext === '.iges' || ext === '.igs') {
        model = await parseIgesFile(fileBuffer, fileName);
      } else if (ext === '.brep') {
        model = await parseBrepFile(fileBuffer, fileName);
      } else {
        throw new Error(`Unsupported format: ${ext}`);
      }

      if (model.meshes.length === 0) {
        throw new Error('No geometry found in the file');
      }

      setModel(model);
    },
    [setModel, setLoadingMessage, clearWelds]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setIsLoading(true);

      try {
        const buffer = await file.arrayBuffer();
        await parseCadBuffer(new Uint8Array(buffer), file.name);
      } catch (err: any) {
        console.error('Failed to parse CAD file:', err);
        alert(`Failed to parse file: ${err.message || 'Unknown error'}`);
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    },
    [setModel, setIsLoading, setLoadingMessage, clearWelds]
  );

  const handleSample = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(SAMPLE_FILE_URL);
      if (!response.ok) {
        throw new Error(`Failed to load sample file (${response.status})`);
      }

      const buffer = await response.arrayBuffer();
      await parseCadBuffer(new Uint8Array(buffer), 'sample-assembly.stp');
    } catch (err: any) {
      console.error('Failed to load sample CAD file:', err);
      alert(`Failed to load sample file: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [parseCadBuffer, setIsLoading, setLoadingMessage]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  return (
    <div
      className="file-upload"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <input
        id="file-input"
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={onFileSelect}
        style={{ display: 'none' }}
      />
      <div className="upload-icon">📁</div>
      <h2>Upload CAD File</h2>
      <p>Drag & drop or click to select</p>
      <div className="upload-actions">
        <button
          type="button"
          className="upload-action-btn primary"
          onClick={() => document.getElementById('file-input')?.click()}
        >
          Upload File
        </button>
        <button
          type="button"
          className="upload-action-btn"
          onClick={handleSample}
        >
          Use Sample
        </button>
      </div>
      <p className="upload-formats">
        Supported: STEP (.step, .stp), IGES (.iges, .igs), BREP (.brep)
      </p>
    </div>
  );
};
