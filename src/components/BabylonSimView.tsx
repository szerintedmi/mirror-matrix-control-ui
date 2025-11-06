import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/core/Shaders/default.fragment';
import '@babylonjs/core/Shaders/default.vertex';
import React, { useEffect, useMemo, useRef } from 'react';

import { MIRROR_PITCH_M } from '../constants/projection';
import { computeProjectionFootprint, buildGridEmitters } from '../utils/projectionGeometry';

import type { Pattern, ProjectionSettings } from '../types';

interface BabylonSimViewProps {
    gridSize: { rows: number; cols: number };
    settings: ProjectionSettings;
    pattern: Pattern | null;
}

const BabylonSimView: React.FC<BabylonSimViewProps> = ({ gridSize, settings, pattern }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const mirrorRef = useRef<Mesh | null>(null);
    const wallRef = useRef<Mesh | null>(null);
    const raysRef = useRef<LinesMesh | null>(null);
    const debugRef = useRef<Mesh | null>(null);
    const spotRootRef = useRef<TransformNode | null>(null);
    const spotMeshesRef = useRef<Mesh[]>([]);
    const spotMaterialRef = useRef<StandardMaterial | null>(null);
    const rayMaterialRef = useRef<StandardMaterial | null>(null);
    const sunRef = useRef<Mesh | null>(null);
    const sunRayRef = useRef<Mesh | null>(null);
    const sunMaterialRef = useRef<StandardMaterial | null>(null);
    const sunRayMaterialRef = useRef<StandardMaterial | null>(null);
    const lightHitRef = useRef<Mesh | null>(null);
    const lightHitMaterialRef = useRef<StandardMaterial | null>(null);

    const clearColor = useMemo(() => new Color4(0.06, 0.07, 0.09, 1), []);
    const emitterLayout = useMemo(() => buildGridEmitters(gridSize), [gridSize]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return undefined;
        }

        const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        const scene = new Scene(engine);
        scene.clearColor = clearColor;

        const camera = new ArcRotateCamera(
            'simulation-camera',
            -Math.PI / 2,
            Math.PI / 3,
            Math.max(5, settings.wallDistance * 1.5),
            new Vector3(0, 0, settings.wallDistance * 0.5),
            scene,
        );
        camera.minZ = 0.01;
        camera.wheelPrecision = 50;
        camera.panningSensibility = 60;
        camera.attachControl(canvas, false, false);
        canvas.style.touchAction = 'none';

        const light = new HemisphericLight('simulation-hemi', new Vector3(0, 1, 0), scene);
        light.intensity = 0.95;

        debugRef.current = MeshBuilder.CreateBox('debug-cube', { size: 0.05 }, scene);
        const debugMat = new StandardMaterial('debug-mat', scene);
        debugMat.diffuseColor = new Color3(0.9, 0.4, 0.3);
        debugMat.emissiveColor = new Color3(0.8, 0.2, 0.15);
        debugRef.current.material = debugMat;

        engine.runRenderLoop(() => scene.render());
        engine.resize();

        const resize = () => engine.resize();
        window.addEventListener('resize', resize);
        let ro: ResizeObserver | null = null;
        if (containerRef.current && 'ResizeObserver' in window) {
            ro = new ResizeObserver(() => {
                engine.resize();
            });
            ro.observe(containerRef.current);
        }

        engineRef.current = engine;
        sceneRef.current = scene;

        return () => {
            window.removeEventListener('resize', resize);
            ro?.disconnect();
            spotMeshesRef.current.forEach((mesh) => mesh.dispose());
            spotMeshesRef.current = [];
            spotRootRef.current?.dispose();
            debugRef.current?.dispose();
            raysRef.current?.dispose();
            wallRef.current?.dispose();
            mirrorRef.current?.dispose();
            spotMaterialRef.current?.dispose();
            spotMaterialRef.current = null;
            rayMaterialRef.current?.dispose();
            rayMaterialRef.current = null;
            sunRef.current?.dispose();
            sunRef.current = null;
            sunRayRef.current?.dispose();
            sunRayRef.current = null;
            sunMaterialRef.current?.dispose();
            sunMaterialRef.current = null;
            sunRayMaterialRef.current?.dispose();
            sunRayMaterialRef.current = null;
            lightHitRef.current?.dispose();
            lightHitRef.current = null;
            lightHitMaterialRef.current?.dispose();
            lightHitMaterialRef.current = null;
            scene.dispose();
            engine.dispose();
            engineRef.current = null;
            sceneRef.current = null;
            debugRef.current = null;
            raysRef.current = null;
            wallRef.current = null;
            mirrorRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        const footprint = computeProjectionFootprint({ gridSize, pattern, settings });
        const emitters = emitterLayout.emitters.map(
            (emitter) => new Vector3(emitter.x, emitter.y, 0),
        );
        const width = emitterLayout.width;
        const height = emitterLayout.height;
        const wallDistance = settings.wallDistance;

        spotMeshesRef.current.forEach((mesh) => mesh.dispose());
        spotMeshesRef.current = [];
        spotRootRef.current?.dispose();
        spotRootRef.current = null;
        spotMaterialRef.current?.dispose();
        spotMaterialRef.current = null;

        mirrorRef.current?.dispose();
        const mirror = MeshBuilder.CreatePlane('mirror-plane', { width, height }, scene);
        const mirrorMat = new StandardMaterial('mirror-mat', scene);
        mirrorMat.specularColor = Color3.FromHexString('#22D3EE');
        mirrorMat.diffuseColor = new Color3(0.06, 0.07, 0.09);
        mirrorMat.emissiveColor = new Color3(0.0, 0.2, 0.25);
        mirrorMat.backFaceCulling = false;
        mirror.material = mirrorMat;
        mirror.position = Vector3.Zero();
        mirrorRef.current = mirror;

        wallRef.current?.dispose();
        const wallPadding = 1.15;
        const wallPhysicalWidth = width * wallPadding;
        const wallPhysicalHeight = height * wallPadding;
        const wall = MeshBuilder.CreatePlane(
            'wall-plane',
            { width: wallPhysicalWidth, height: wallPhysicalHeight },
            scene,
        );
        const wallMat = new StandardMaterial('wall-mat', scene);
        wallMat.diffuseColor = new Color3(0.9, 0.9, 0.9);
        wallMat.emissiveColor = new Color3(0.75, 0.75, 0.75);
        wallMat.alpha = 0.2;
        wallMat.backFaceCulling = false;
        wall.material = wallMat;
        wall.position = new Vector3(0, 0, wallDistance);
        wall.rotation = new Vector3(
            (settings.wallAngleVertical * Math.PI) / 180,
            (settings.wallAngleHorizontal * Math.PI) / 180,
            0,
        );
        wallRef.current = wall;

        const lines: Vector3[][] = [];
        const count = Math.min(emitters.length, footprint.spots.length);
        for (let i = 0; i < count; i += 1) {
            const from = emitters[i];
            const spot = footprint.spots[i];
            const worldPoint = new Vector3(spot.world.x, spot.world.y, spot.world.z);
            lines.push([from, worldPoint]);
        }

        raysRef.current?.dispose();
        rayMaterialRef.current?.dispose();
        rayMaterialRef.current = null;
        if (lines.length > 0) {
            const lineSystem = MeshBuilder.CreateLineSystem('projection-rays', { lines }, scene);
            lineSystem.color = Color3.FromHexString('#FFF7D6');
            lineSystem.alpha = 0.35;
            const rayMaterial = new StandardMaterial('projection-ray-mat', scene);
            rayMaterial.diffuseColor = Color3.FromHexString('#FFF7D6');
            rayMaterial.emissiveColor = Color3.FromHexString('#FFEEC0');
            rayMaterial.alpha = 0.35;
            lineSystem.material = rayMaterial;
            rayMaterialRef.current = rayMaterial;
            raysRef.current = lineSystem;
        }

        const spotRoot = new TransformNode('wall-spots-root', scene);
        spotRoot.parent = wall;
        spotRootRef.current = spotRoot;
        const spotMaterial = new StandardMaterial('wall-spot-mat', scene);
        spotMaterial.diffuseColor = Color3.FromHexString('#FFD966');
        spotMaterial.emissiveColor = Color3.FromHexString('#FFC94A');
        spotMaterial.alpha = 0.85;
        spotMaterial.backFaceCulling = false;
        spotMaterialRef.current = spotMaterial;
        const spotRadius = MIRROR_PITCH_M * 0.35;
        footprint.spots.forEach((spot, index) => {
            const disc = MeshBuilder.CreateDisc(
                `wall-spot-${index}`,
                { radius: spotRadius, tessellation: 24 },
                scene,
            );
            disc.material = spotMaterial;
            disc.parent = spotRoot;
            disc.position = new Vector3(spot.wallX ?? 0, spot.wallY ?? 0, 0.002);
            spotMeshesRef.current.push(disc);
        });

        sunRef.current?.dispose();
        sunRayRef.current?.dispose();
        sunMaterialRef.current?.dispose();
        sunMaterialRef.current = null;
        sunRayMaterialRef.current?.dispose();
        sunRayMaterialRef.current = null;
        lightHitRef.current?.dispose();
        lightHitRef.current = null;
        lightHitMaterialRef.current?.dispose();
        lightHitMaterialRef.current = null;

        const lightYaw = (settings.lightAngleHorizontal * Math.PI) / 180;
        const lightPitch = (settings.lightAngleVertical * Math.PI) / 180;
        const incomingDir = new Vector3(
            Math.sin(lightYaw) * Math.cos(lightPitch) * -1,
            Math.sin(lightPitch) * -1,
            Math.cos(lightYaw) * Math.cos(lightPitch) * -1,
        ).normalize();
        const sunDistance = Math.max(wallDistance * 0.8, 2);
        const sunPosition = incomingDir.scale(-sunDistance);
        const sun = MeshBuilder.CreateSphere('sun-indicator', { diameter: 0.25 }, scene);
        const sunMaterial = new StandardMaterial('sun-material', scene);
        sunMaterial.diffuseColor = new Color3(1, 0.88, 0.55);
        sunMaterial.emissiveColor = new Color3(1, 0.82, 0.4);
        sunMaterial.alpha = 0.6;
        sun.material = sunMaterial;
        sun.position = sunPosition;
        sunRef.current = sun;
        sunMaterialRef.current = sunMaterial;

        const rayTube = MeshBuilder.CreateTube(
            'incoming-light-ray',
            { path: [sunPosition, new Vector3(0, 0, 0)], radius: 0.01, tessellation: 12 },
            scene,
        );
        const rayMat = new StandardMaterial('incoming-light-ray-mat', scene);
        rayMat.diffuseColor = new Color3(1, 0.95, 0.75);
        rayMat.emissiveColor = new Color3(1, 0.92, 0.6);
        rayMat.alpha = 0.4;
        rayTube.material = rayMat;
        sunRayMaterialRef.current = rayMat;
        sunRayRef.current = rayTube;

        const lightHit = MeshBuilder.CreateDisc(
            'incoming-light-hit',
            { radius: MIRROR_PITCH_M * 0.4, tessellation: 48 },
            scene,
        );
        const lightHitMaterial = new StandardMaterial('incoming-light-hit-mat', scene);
        lightHitMaterial.diffuseColor = new Color3(1, 0.92, 0.65);
        lightHitMaterial.emissiveColor = new Color3(1, 0.87, 0.55);
        lightHitMaterial.alpha = 0.5;
        lightHit.material = lightHitMaterial;
        lightHit.position = new Vector3(0, 0, 0.002);
        lightHitMaterialRef.current = lightHitMaterial;
        lightHitRef.current = lightHit;
    }, [emitterLayout, pattern, settings]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        const camera = scene.activeCamera as ArcRotateCamera | null;
        if (!camera) {
            return;
        }

        const { width, height } = emitterLayout;
        const wallDistance = settings.wallDistance;
        const span = Math.max(width, height, wallDistance) + 1.5;
        const nextTarget = new Vector3(0, 0, wallDistance * 0.5);

        camera.radius = span * 1.6;
        camera.target = nextTarget;
    }, [emitterLayout, settings.wallDistance]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full min-h-[360px] bg-gray-900 rounded-lg overflow-hidden border border-gray-700"
        >
            <canvas ref={canvasRef} className="w-full h-full" />
        </div>
    );
};

export default BabylonSimView;
