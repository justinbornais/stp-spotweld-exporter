import React from 'react';

interface LoadingOverlayProps {
  message: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => (
  <div className="loading-overlay">
    <div className="loading-spinner" />
    <p>{message}</p>
  </div>
);
