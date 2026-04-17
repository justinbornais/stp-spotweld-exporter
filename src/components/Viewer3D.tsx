import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useAppStore } from '../store';
import type { ParsedMesh, WeldPathStyle, WeldPoint } from '../types';

const getWeldIdFromObject = (object: THREE.Object3D | null) => {
  let current = object;
  while (current) {
    if (typeof current.userData.weldId === 'string') {
      return current.userData.weldId;
    }
    current = current.parent;
  }
  return null;
};

const disposeObjectResources = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };

    renderable.geometry?.dispose();

    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];

    materials.forEach((material) => {
      const mappedMaterial = material as THREE.Material & {
        map?: THREE.Texture;
      };
      mappedMaterial.map?.dispose();
      material.dispose();
    });
  });
};

const stopPointerEvent = (event: React.PointerEvent<HTMLDivElement>) => {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
};

const toVector3 = (coords: [number, number, number]) =>
  new THREE.Vector3(coords[0], coords[1], coords[2]);

const getOutwardNormal = (
  weld: WeldPoint,
  point: THREE.Vector3,
  modelCenter: THREE.Vector3
) => {
  const normal = toVector3(weld.normal);
  if (normal.lengthSq() === 0) {
    normal.copy(point).sub(modelCenter);
  }
  if (normal.lengthSq() === 0) {
    normal.set(0, 1, 0);
  }

  normal.normalize();
  return normal;
};

const segmentIntersectsModel = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  meshGroup: THREE.Group,
  epsilon: number
) => {
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= epsilon * 2) return false;

  const raycaster = new THREE.Raycaster(
    start,
    delta.normalize(),
    epsilon,
    length - epsilon
  );

  return raycaster
    .intersectObjects(meshGroup.children, true)
    .some((hit) => hit.distance > epsilon && hit.distance < length - epsilon);
};

const pathIntersectsModel = (
  points: THREE.Vector3[],
  meshGroup: THREE.Group,
  epsilon: number
) => {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (segmentIntersectsModel(points[i], points[i + 1], meshGroup, epsilon)) {
      return true;
    }
  }
  return false;
};

const getCurvedPathSamples = (points: THREE.Vector3[]) => {
  if (points.length < 2) return points;
  if (points.length === 2) {
    return new THREE.LineCurve3(points[0], points[1]).getPoints(12);
  }
  return new THREE.CatmullRomCurve3(
    points,
    false,
    'centripetal'
  ).getPoints(32);
};

const getAvoidingSegmentPoints = (
  startWeld: WeldPoint,
  endWeld: WeldPoint,
  meshGroup: THREE.Group,
  modelCenter: THREE.Vector3,
  baseClearance: number,
  epsilon: number,
  pathStyle: WeldPathStyle
) => {
  const start = toVector3(startWeld.position);
  const end = toVector3(endWeld.position);
  const directPath = [start, end];

  const startNormal = getOutwardNormal(startWeld, start, modelCenter);
  const endNormal = getOutwardNormal(endWeld, end, modelCenter);
  const midpoint = start.clone().lerp(end, 0.5);
  let bridgeNormal = startNormal.clone().add(endNormal);

  if (bridgeNormal.lengthSq() === 0) {
    bridgeNormal = midpoint.clone().sub(modelCenter);
  }
  if (bridgeNormal.lengthSq() === 0) {
    bridgeNormal.copy(startNormal);
  }
  bridgeNormal.normalize();

  let fallbackPath = directPath;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const clearance = baseClearance * Math.pow(1.55, attempt);
    const liftedPath = [
      start,
      start.clone().addScaledVector(startNormal, clearance),
      midpoint.clone().addScaledVector(bridgeNormal, clearance * 1.6),
      end.clone().addScaledVector(endNormal, clearance),
      end,
    ];
    const testPoints =
      pathStyle === 'curved' ? getCurvedPathSamples(liftedPath) : liftedPath;

    fallbackPath = liftedPath;
    if (!pathIntersectsModel(testPoints, meshGroup, epsilon)) {
      return liftedPath;
    }
  }

  return fallbackPath;
};

export const Viewer3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const weldMarkersRef = useRef<THREE.Group | null>(null);
  const weldPathRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const mouseDownRef = useRef(new THREE.Vector2());
  const pointerDownClientRef = useRef(new THREE.Vector2());
  const dragStateRef = useRef<{
    weldId: string | null;
    pointerId: number | null;
    isDragging: boolean;
  }>({
    weldId: null,
    pointerId: null,
    isDragging: false,
  });
  const suppressNextClickRef = useRef(false);
  const highlightedRef = useRef<THREE.Mesh | null>(null);
  const originalMaterialsRef = useRef<Map<string, THREE.Material>>(new Map());

  const model = useAppStore((s) => s.model);
  const mode = useAppStore((s) => s.mode);
  const welds = useAppStore((s) => s.welds);
  const addWeld = useAppStore((s) => s.addWeld);
  const updateWeld = useAppStore((s) => s.updateWeld);
  const selectedWeldId = useAppStore((s) => s.selectedWeldId);
  const setSelectedWeldId = useAppStore((s) => s.setSelectedWeldId);
  const nextWeldNumber = useAppStore((s) => s.nextWeldNumber);
  const showWeldPath = useAppStore((s) => s.showWeldPath);
  const weldPathStyle = useAppStore((s) => s.weldPathStyle);

  const setMouseFromClient = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return false;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    return true;
  }, []);

  const findWeldHit = useCallback((clientX: number, clientY: number) => {
    if (
      !cameraRef.current ||
      !weldMarkersRef.current ||
      !setMouseFromClient(clientX, clientY)
    ) {
      return null;
    }

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const weldIntersects = raycasterRef.current.intersectObjects(
      weldMarkersRef.current.children,
      true
    );

    for (const hit of weldIntersects) {
      const weldId = getWeldIdFromObject(hit.object);
      if (weldId) {
        return weldId;
      }
    }

    return null;
  }, [setMouseFromClient]);

  const findSurfaceHit = useCallback((clientX: number, clientY: number) => {
    if (
      !cameraRef.current ||
      !meshGroupRef.current ||
      !setMouseFromClient(clientX, clientY)
    ) {
      return null;
    }

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(
      meshGroupRef.current.children,
      true
    );

    return intersects[0] ?? null;
  }, [setMouseFromClient]);

  const resetHighlightedMesh = useCallback(() => {
    if (!highlightedRef.current) return;

    const origMat = originalMaterialsRef.current.get(
      highlightedRef.current.uuid
    );
    if (origMat) {
      highlightedRef.current.material = origMat;
    }
    highlightedRef.current = null;
  }, []);

  // Build Three.js meshes from parsed model
  const threeMeshes = useMemo(() => {
    if (!model) return [];
    return model.meshes.map((parsedMesh: ParsedMesh, meshIdx: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(parsedMesh.positions, 3)
      );
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(parsedMesh.normals, 3)
      );
      geometry.setIndex(new THREE.BufferAttribute(parsedMesh.indices, 1));
      geometry.computeBoundingSphere();

      const material = new THREE.MeshPhongMaterial({
        color: 0x8899aa,
        side: THREE.DoubleSide,
        flatShading: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.meshIndex = meshIdx;
      mesh.userData.faceRanges = parsedMesh.faceRanges;
      mesh.userData.parsedMesh = parsedMesh;
      return mesh;
    });
  }, [model]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
    camera.position.set(200, 200, 200);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-1, -0.5, -1);
    scene.add(dirLight2);

    // Grid
    const gridHelper = new THREE.GridHelper(1000, 50, 0x444466, 0x333355);
    scene.add(gridHelper);

    // Mesh group
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Weld markers group
    const weldMarkers = new THREE.Group();
    scene.add(weldMarkers);
    weldMarkersRef.current = weldMarkers;

    // Weld path group
    const weldPath = new THREE.Group();
    scene.add(weldPath);
    weldPathRef.current = weldPath;

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Add meshes to scene when model changes
  useEffect(() => {
    const meshGroup = meshGroupRef.current;
    if (!meshGroup) return;

    // Clear old meshes
    while (meshGroup.children.length > 0) {
      meshGroup.remove(meshGroup.children[0]);
    }

    if (threeMeshes.length === 0) return;

    threeMeshes.forEach((mesh) => meshGroup.add(mesh));

    // Fit camera to model
    const box = new THREE.Box3().setFromObject(meshGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (cameraRef.current && controlsRef.current) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const distance = maxDim * 2;

      camera.position.set(
        center.x + distance * 0.7,
        center.y + distance * 0.5,
        center.z + distance * 0.7
      );
      camera.near = maxDim * 0.001;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();

      controls.target.copy(center);
      controls.update();
    }
  }, [threeMeshes]);

  // Update weld markers
  useEffect(() => {
    const markers = weldMarkersRef.current;
    if (!markers) return;

    while (markers.children.length > 0) {
      const marker = markers.children[0];
      markers.remove(marker);
      disposeObjectResources(marker);
    }

    const model3d = meshGroupRef.current;
    if (!model3d) return;
    const box = new THREE.Box3().setFromObject(model3d);
    const modelSize = box.getSize(new THREE.Vector3());
    const markerScale = Math.max(modelSize.x, modelSize.y, modelSize.z) * 0.015;

    welds.forEach((weld) => {
      const isSelected = weld.id === selectedWeldId;

      // Sphere marker
      const sphereGeo = new THREE.SphereGeometry(markerScale, 16, 16);
      const sphereMat = new THREE.MeshPhongMaterial({
        color: isSelected ? 0x00ffff : 0xff4444,
        emissive: isSelected ? 0x004444 : 0x440000,
        transparent: true,
        opacity: 0.85,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(...weld.position);
      sphere.userData.weldId = weld.id;
      markers.add(sphere);

      // Normal arrow
      const dir = new THREE.Vector3(...weld.normal).normalize();
      const arrowLen = markerScale * 4;
      const arrowHelper = new THREE.ArrowHelper(
        dir,
        new THREE.Vector3(...weld.position),
        arrowLen,
        isSelected ? 0x00ffff : 0xffff00,
        arrowLen * 0.3,
        arrowLen * 0.15
      );
      arrowHelper.userData.weldId = weld.id;
      markers.add(arrowHelper);

      // Sequence label (as a sprite)
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = isSelected ? '#00ffff' : '#ffffff';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(weld.sequence), 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(
        weld.position[0] + dir.x * arrowLen * 1.3,
        weld.position[1] + dir.y * arrowLen * 1.3,
        weld.position[2] + dir.z * arrowLen * 1.3
      );
      sprite.scale.set(markerScale * 2, markerScale * 2, 1);
      sprite.userData.weldId = weld.id;
      markers.add(sprite);
    });
  }, [welds, selectedWeldId]);

  // Update traced weld path
  useEffect(() => {
    const pathGroup = weldPathRef.current;
    const meshGroup = meshGroupRef.current;
    if (!pathGroup) return;

    while (pathGroup.children.length > 0) {
      const pathObject = pathGroup.children[0];
      pathGroup.remove(pathObject);
      disposeObjectResources(pathObject);
    }

    if (!showWeldPath || welds.length < 2 || !meshGroup) return;

    const box = new THREE.Box3().setFromObject(meshGroup);
    const modelCenter = box.getCenter(new THREE.Vector3());
    const modelSize = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
    if (!Number.isFinite(maxDim) || maxDim <= 0) return;

    const baseClearance = maxDim * 0.05;
    const epsilon = maxDim * 0.002;
    const tubeRadius = maxDim * 0.0035;
    const curvePath = new THREE.CurvePath<THREE.Vector3>();

    for (let i = 0; i < welds.length - 1; i += 1) {
      const segmentPoints = getAvoidingSegmentPoints(
        welds[i],
        welds[i + 1],
        meshGroup,
        modelCenter,
        baseClearance,
        epsilon,
        weldPathStyle
      );

      if (weldPathStyle === 'curved') {
        curvePath.add(
          new THREE.CatmullRomCurve3(segmentPoints, false, 'centripetal')
        );
      } else {
        for (let j = 0; j < segmentPoints.length - 1; j += 1) {
          curvePath.add(
            new THREE.LineCurve3(segmentPoints[j], segmentPoints[j + 1])
          );
        }
      }
    }

    if (curvePath.curves.length === 0) return;

    const tubularSegments = Math.max(
      32,
      curvePath.curves.length * (weldPathStyle === 'curved' ? 32 : 8)
    );
    const geometry = new THREE.TubeGeometry(
      curvePath,
      tubularSegments,
      tubeRadius,
      8,
      false
    );
    const material = new THREE.MeshBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
    });
    const pathMesh = new THREE.Mesh(geometry, material);
    pathGroup.add(pathMesh);
  }, [welds, showWeldPath, weldPathStyle, threeMeshes]);

  // Click handler for weld placement / selection
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;

      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const currentPos = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      // Check if this was a drag (mouse moved more than threshold)
      const dragThreshold = 0.05; // Normalized coords threshold (~5-10 pixels typically)
      const dragDistance = currentPos.distanceTo(mouseDownRef.current);
      const isDrag = dragDistance > dragThreshold;

      if (isDrag) {
        // This was a drag, not a click - don't place weld
        return;
      }

      mouseRef.current.copy(currentPos);
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      // First, check if a weld marker was clicked
      const weldId = findWeldHit(event.clientX, event.clientY);
      if (weldId) {
        setSelectedWeldId(weldId);
        return;
      }

      // If in select mode, place a weld on the clicked face
      if (mode === 'select') {
        const hit = findSurfaceHit(event.clientX, event.clientY);
        if (hit) {
          const point = hit.point;
          const face = hit.face;

          if (face) {
            const normal = face.normal.clone();
            // Transform normal to world space
            const mesh = hit.object as THREE.Mesh;
            normal.transformDirection(mesh.matrixWorld);

            const weldId = `W${String(nextWeldNumber).padStart(3, '0')}`;
            addWeld({
              id: weldId,
              position: [point.x, point.y, point.z],
              normal: [normal.x, normal.y, normal.z],
              sequence: welds.length + 1,
              approach_distance: 30,
              label: weldId,
              faceIndex: hit.faceIndex ?? undefined,
            });
          }
        }
      }
    },
    [
      mode,
      addWeld,
      nextWeldNumber,
      welds.length,
      setSelectedWeldId,
      findWeldHit,
      findSurfaceHit,
    ]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      mouseDownRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      pointerDownClientRef.current.set(event.clientX, event.clientY);

      const weldId = findWeldHit(event.clientX, event.clientY);
      if (!weldId) {
        dragStateRef.current = {
          weldId: null,
          pointerId: null,
          isDragging: false,
        };
        return;
      }

      stopPointerEvent(event);
      setSelectedWeldId(weldId);
      dragStateRef.current = {
        weldId,
        pointerId: event.pointerId,
        isDragging: false,
      };
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers may reject capture if another control already owns it.
      }
      event.currentTarget.style.cursor = 'grab';
    },
    [findWeldHit, setSelectedWeldId]
  );

  // Hover highlight
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (dragState.weldId && dragState.pointerId === event.pointerId) {
        stopPointerEvent(event);
        resetHighlightedMesh();

        const dragDistance = pointerDownClientRef.current.distanceTo(
          new THREE.Vector2(event.clientX, event.clientY)
        );

        if (!dragState.isDragging && dragDistance < 4) {
          event.currentTarget.style.cursor = 'grab';
          return;
        }

        dragState.isDragging = true;
        suppressNextClickRef.current = true;
        event.currentTarget.style.cursor = 'grabbing';

        const hit = findSurfaceHit(event.clientX, event.clientY);
        if (hit?.face) {
          const normal = hit.face.normal.clone();
          const mesh = hit.object as THREE.Mesh;
          normal.transformDirection(mesh.matrixWorld).normalize();

          updateWeld(dragState.weldId, {
            position: [hit.point.x, hit.point.y, hit.point.z],
            normal: [normal.x, normal.y, normal.z],
            faceIndex: hit.faceIndex ?? undefined,
          });
        }
        return;
      }

      if (
        !containerRef.current ||
        !cameraRef.current ||
        !meshGroupRef.current
      )
        return;

      if (findWeldHit(event.clientX, event.clientY)) {
        resetHighlightedMesh();
        containerRef.current.style.cursor = 'grab';
        return;
      }

      if (mode !== 'select') {
        resetHighlightedMesh();
        containerRef.current.style.cursor = 'default';
        return;
      }

      if (!setMouseFromClient(event.clientX, event.clientY)) return;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const intersects = raycasterRef.current.intersectObjects(
        meshGroupRef.current.children,
        true
      );

      // Reset previous highlight
      resetHighlightedMesh();

      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        if (!originalMaterialsRef.current.has(mesh.uuid)) {
          originalMaterialsRef.current.set(
            mesh.uuid,
            mesh.material as THREE.Material
          );
        }
        const highlightMat = (mesh.material as THREE.MeshPhongMaterial).clone();
        highlightMat.emissive = new THREE.Color(0x333355);
        mesh.material = highlightMat;
        highlightedRef.current = mesh;

        containerRef.current.style.cursor = 'crosshair';
      } else {
        containerRef.current.style.cursor = 'default';
      }
    },
    [
      mode,
      findSurfaceHit,
      findWeldHit,
      resetHighlightedMesh,
      setMouseFromClient,
      updateWeld,
    ]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState.pointerId !== event.pointerId) return;

    stopPointerEvent(event);

    if (dragState.isDragging) {
      suppressNextClickRef.current = true;
    }

    dragStateRef.current = {
      weldId: null,
      pointerId: null,
      isDragging: false,
    };
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.cursor = 'default';
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (dragStateRef.current.weldId) return;

    resetHighlightedMesh();
    if (containerRef.current) {
      containerRef.current.style.cursor = 'default';
    }
  }, [resetHighlightedMesh]);

  return (
    <div
      ref={containerRef}
      className="viewer-3d"
      onClick={handleClick}
      onPointerDownCapture={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    />
  );
};
