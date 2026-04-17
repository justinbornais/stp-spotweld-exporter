import React, { useCallback } from 'react';
import { useAppStore } from '../store';
import { parseStepFile, parseIgesFile, parseBrepFile } from '../cadParser';

const ACCEPTED_EXTENSIONS = ['.step', '.stp', '.iges', '.igs', '.brep'];

export const FileUpload: React.FC = () => {
  const setModel = useAppStore((s) => s.setModel);
  const setIsLoading = useAppStore((s) => s.setIsLoading);
  const setLoadingMessage = useAppStore((s) => s.setLoadingMessage);
  const clearWelds = useAppStore((s) => s.clearWelds);

  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        alert(`Unsupported file format: ${ext}\nSupported: ${ACCEPTED_EXTENSIONS.join(', ')}`);
        return;
      }

      setIsLoading(true);
      setLoadingMessage(`Loading ${file.name}...`);
      clearWelds();

      try {
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        setLoadingMessage('Parsing CAD geometry...');

        let model;
        if (ext === '.step' || ext === '.stp') {
          model = await parseStepFile(uint8, file.name);
        } else if (ext === '.iges' || ext === '.igs') {
          model = await parseIgesFile(uint8, file.name);
        } else if (ext === '.brep') {
          model = await parseBrepFile(uint8, file.name);
        } else {
          throw new Error(`Unsupported format: ${ext}`);
        }

        if (model.meshes.length === 0) {
          throw new Error('No geometry found in the file');
        }

        setModel(model);
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
      onClick={() => document.getElementById('file-input')?.click()}
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
      <p className="upload-formats">
        Supported: STEP (.step, .stp), IGES (.iges, .igs), BREP (.brep)
      </p>
    </div>
  );
};
