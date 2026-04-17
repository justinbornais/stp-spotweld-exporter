import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useAppStore } from '../store';
import type { ParsedMesh } from '../types';

export const Viewer3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const weldMarkersRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const mouseDownRef = useRef(new THREE.Vector2());
  const highlightedRef = useRef<THREE.Mesh | null>(null);
  const originalMaterialsRef = useRef<Map<string, THREE.Material>>(new Map());

  const model = useAppStore((s) => s.model);
  const mode = useAppStore((s) => s.mode);
  const welds = useAppStore((s) => s.welds);
  const addWeld = useAppStore((s) => s.addWeld);
  const selectedWeldId = useAppStore((s) => s.selectedWeldId);
  const setSelectedWeldId = useAppStore((s) => s.setSelectedWeldId);
  const nextWeldNumber = useAppStore((s) => s.nextWeldNumber);

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
      markers.remove(markers.children[0]);
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
      markers.add(sprite);
    });
  }, [welds, selectedWeldId]);

  // Click handler for weld placement / selection
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;

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
      if (weldMarkersRef.current) {
        const weldIntersects = raycasterRef.current.intersectObjects(
          weldMarkersRef.current.children,
          true
        );
        for (const hit of weldIntersects) {
          let obj: THREE.Object3D | null = hit.object;
          while (obj) {
            if (obj.userData.weldId) {
              setSelectedWeldId(obj.userData.weldId);
              return;
            }
            obj = obj.parent;
          }
        }
      }

      // If in select mode, place a weld on the clicked face
      if (mode === 'select' && meshGroupRef.current) {
        const intersects = raycasterRef.current.intersectObjects(
          meshGroupRef.current.children,
          true
        );

        if (intersects.length > 0) {
          const hit = intersects[0];
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
    [mode, addWeld, nextWeldNumber, welds.length, setSelectedWeldId]
  );

  // Track mouse down position to distinguish clicks from drags
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseDownRef.current.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }, []);

  // Hover highlight
  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (
        !containerRef.current ||
        !cameraRef.current ||
        mode !== 'select' ||
        !meshGroupRef.current
      )
        return;

      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const intersects = raycasterRef.current.intersectObjects(
        meshGroupRef.current.children,
        true
      );

      // Reset previous highlight
      if (highlightedRef.current) {
        const origMat = originalMaterialsRef.current.get(
          highlightedRef.current.uuid
        );
        if (origMat) {
          highlightedRef.current.material = origMat;
        }
        highlightedRef.current = null;
      }

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
    [mode]
  );

  return (
    <div
      ref={containerRef}
      className="viewer-3d"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    />
  );
};
