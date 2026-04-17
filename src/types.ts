export interface WeldPoint {
  id: string;
  position: [number, number, number];
  normal: [number, number, number];
  sequence: number;
  approach_distance: number;
  label: string;
  faceIndex?: number;
}

export interface ParsedCADModel {
  meshes: ParsedMesh[];
  fileName: string;
}

export interface ParsedMesh {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  faceColors?: Float32Array;
  faceRanges?: FaceRange[];
}

export interface FaceRange {
  faceIndex: number;
  startTriangle: number;
  endTriangle: number;
}

export interface ExportData {
  part_id: string;
  origin: [number, number, number];
  welds: {
    id: string;
    position: [number, number, number];
    normal: [number, number, number];
    sequence: number;
    approach_distance: number;
    label: string;
  }[];
}

export type WeldPathStyle = 'linear' | 'curved';

export type AppMode = 'upload' | 'view' | 'select' | 'sequence';
