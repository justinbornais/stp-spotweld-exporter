import type { ParsedCADModel, ParsedMesh, FaceRange } from './types';

export interface OcctResult {
  success: boolean;
  root: {
    name: string;
    meshes: number[];
    children: OcctNode[];
  };
  meshes: OcctMesh[];
}

interface OcctNode {
  name: string;
  meshes: number[];
  children: OcctNode[];
}

interface OcctMesh {
  name: string;
  color?: [number, number, number];
  brep_faces: {
    first: number;
    last: number;
    color: [number, number, number] | null;
  }[];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index: { array: number[] };
}

let occtModule: any = null;

async function loadOcctFactory(): Promise<(opts: any) => Promise<any>> {
  // Load the UMD script directly so we get the raw factory function,
  // bypassing Vite's ESM interop which wraps it in a module object.
  return new Promise((resolve, reject) => {
    if ((window as any).occtimportjs) {
      resolve((window as any).occtimportjs);
      return;
    }
    const script = document.createElement('script');
    script.src = '/occt-import-js.js';
    script.onload = () => resolve((window as any).occtimportjs);
    script.onerror = () => reject(new Error('Failed to load occt-import-js script'));
    document.head.appendChild(script);
  });
}

async function getOcctModule(): Promise<any> {
  if (occtModule) return occtModule;

  const factory = await loadOcctFactory();
  occtModule = await factory({
    locateFile: (name: string) => {
      if (name.endsWith('.wasm')) {
        return '/occt-import-js.wasm';
      }
      return name;
    },
  });
  return occtModule;
}

export async function parseStepFile(
  fileBuffer: Uint8Array,
  fileName: string
): Promise<ParsedCADModel> {
  const occt = await getOcctModule();

  const result: OcctResult = occt.ReadStepFile(fileBuffer, {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  });

  if (!result.success) {
    throw new Error('Failed to parse STEP file');
  }

  const meshes: ParsedMesh[] = result.meshes.map((mesh, idx) => {
    const positions = new Float32Array(mesh.attributes.position.array);
    const normals = mesh.attributes.normal
      ? new Float32Array(mesh.attributes.normal.array)
      : new Float32Array(positions.length);
    const indices = new Uint32Array(mesh.index.array);

    const faceRanges: FaceRange[] = mesh.brep_faces.map((face, faceIdx) => ({
      faceIndex: faceIdx,
      startTriangle: face.first,
      endTriangle: face.last,
    }));

    return {
      name: mesh.name || `Mesh_${idx}`,
      positions,
      normals,
      indices,
      faceRanges,
    };
  });

  return { meshes, fileName };
}

export function parseIgesFile(
  fileBuffer: Uint8Array,
  fileName: string
): Promise<ParsedCADModel> {
  return parseGenericFile(fileBuffer, fileName, 'ReadIgesFile');
}

export function parseBrepFile(
  fileBuffer: Uint8Array,
  fileName: string
): Promise<ParsedCADModel> {
  return parseGenericFile(fileBuffer, fileName, 'ReadBrepFile');
}

async function parseGenericFile(
  fileBuffer: Uint8Array,
  fileName: string,
  method: string
): Promise<ParsedCADModel> {
  const occt = await getOcctModule();
  const result: OcctResult = occt[method](fileBuffer, null);

  if (!result.success) {
    throw new Error(`Failed to parse file with ${method}`);
  }

  const meshes: ParsedMesh[] = result.meshes.map((mesh, idx) => {
    const positions = new Float32Array(mesh.attributes.position.array);
    const normals = mesh.attributes.normal
      ? new Float32Array(mesh.attributes.normal.array)
      : new Float32Array(positions.length);
    const indices = new Uint32Array(mesh.index.array);

    const faceRanges: FaceRange[] = mesh.brep_faces.map((face, faceIdx) => ({
      faceIndex: faceIdx,
      startTriangle: face.first,
      endTriangle: face.last,
    }));

    return {
      name: mesh.name || `Mesh_${idx}`,
      positions,
      normals,
      indices,
      faceRanges,
    };
  });

  return { meshes, fileName };
}
