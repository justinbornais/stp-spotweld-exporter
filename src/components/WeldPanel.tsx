import React, { useState, useCallback, useRef } from 'react';
import { useAppStore } from '../store';
import type { WeldPoint } from '../types';

export const WeldPanel: React.FC = () => {
  const welds = useAppStore((s) => s.welds);
  const removeWeld = useAppStore((s) => s.removeWeld);
  const updateWeld = useAppStore((s) => s.updateWeld);
  const reorderWelds = useAppStore((s) => s.reorderWelds);
  const selectedWeldId = useAppStore((s) => s.selectedWeldId);
  const setSelectedWeldId = useAppStore((s) => s.setSelectedWeldId);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const startEdit = (weld: WeldPoint) => {
    setEditingId(weld.id);
    setEditLabel(weld.label);
  };

  const saveEdit = () => {
    if (editingId && editLabel.trim()) {
      updateWeld(editingId, { label: editLabel.trim() });
    }
    setEditingId(null);
  };

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
    setDraggingIndex(index);
  };

  const handleDragEnter = (index: number) => {
    dragOverItemRef.current = index;
    setDropIndex(index);
  };

  const handleDragLeave = () => {
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    if (dragItemRef.current !== null && dragOverItemRef.current !== null && dragItemRef.current !== dragOverItemRef.current) {
      reorderWelds(dragItemRef.current, dragOverItemRef.current);
    }
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    setDraggingIndex(null);
    setDropIndex(null);
  };

  const exportJSON = useCallback(() => {
    const data = {
      part_id: useAppStore.getState().model?.fileName || 'unknown',
      origin: [0, 0, 0] as [number, number, number],
      welds: welds.map((w) => ({
        id: w.id,
        position: w.position,
        normal: w.normal,
        sequence: w.sequence,
        approach_distance: w.approach_distance,
        label: w.label,
      })),
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weld_inspection_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [welds]);

  return (
    <div className="weld-panel">
      <div className="panel-header">
        <h3>Weld Points ({welds.length})</h3>
        <div className="panel-actions">
          <button
            className={`mode-btn ${mode === 'select' ? 'active' : ''}`}
            onClick={() => setMode(mode === 'select' ? 'view' : 'select')}
            title="Toggle weld placement mode"
          >
            {mode === 'select' ? '✋ Stop Selecting' : '📌 Place Welds'}
          </button>
        </div>
      </div>

      <div className="weld-list">
        {welds.length === 0 && (
          <div className="empty-state">
            <p>No welds placed yet.</p>
            <p>Click "Place Welds" then click on the 3D model to add weld points.</p>
          </div>
        )}

        {welds.map((weld, index) => (
          <div
            key={weld.id}
            className={`weld-item ${weld.id === selectedWeldId ? 'selected' : ''} ${draggingIndex === index ? 'dragging' : ''} ${dropIndex === index ? 'drop-target' : ''}`}
            onClick={() => setSelectedWeldId(weld.id)}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="weld-item-header">
              <span className="weld-drag-handle" title="Drag to reorder">⋮⋮</span>
              <span className="weld-seq">{weld.sequence}</span>
              {editingId === weld.id ? (
                <input
                  className="weld-label-input"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="weld-label"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startEdit(weld);
                  }}
                >
                  {weld.label}
                </span>
              )}
              <button
                className="weld-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  removeWeld(weld.id);
                }}
                title="Remove weld"
              >
                ✕
              </button>
            </div>
            <div className="weld-details">
              <span>
                Pos: [{weld.position.map((v) => v.toFixed(1)).join(', ')}]
              </span>
              <span>
                Normal: [{weld.normal.map((v) => v.toFixed(2)).join(', ')}]
              </span>
            </div>
          </div>
        ))}
      </div>

      {welds.length > 0 && (
        <div className="panel-footer">
          <button className="export-btn" onClick={exportJSON}>
            📥 Export JSON
          </button>
        </div>
      )}
    </div>
  );
};
