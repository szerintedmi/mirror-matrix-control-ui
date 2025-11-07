import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import React, { useEffect, useMemo, useRef } from 'react';

import { MIRROR_DIMENSION_M, MIRROR_PITCH_M } from '../constants/projection';
import { dotVec3, normalizeVec3 } from '../utils/orientation';
import { buildGridEmitters } from '../utils/projectionGeometry';

import type { ProjectionSettings, ReflectionSolverResult, Vec3 } from '../types';

interface BabylonSimViewProps {
    gridSize: { rows: number; cols: number };
    settings: ProjectionSettings;
    solverResult: ReflectionSolverResult;
    selectedMirrorId: string | null;
    errorMirrorIds: Set<string>;
    debugOptions: {
        showRays: boolean;
        showNormals: boolean;
        showEllipses: boolean;
    };
    isPreviewStale: boolean;
    showIncomingPerMirror: boolean;
    activePatternId: string | null;
}

const EPSILON = 1e-4;

const toVector3 = (value: Vec3): Vector3 => new Vector3(value.x, value.y, value.z);

const crossVec = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});

const lengthVec = (value: Vec3): number => Math.hypot(value.x, value.y, value.z);

const disposeEntity = <T extends { dispose: () => void }>(entity: T | null | undefined): void => {
    if (entity) {
        entity.dispose();
    }
};

const deriveWallBasis = (
    settings: ProjectionSettings,
): {
    wallNormal: Vec3;
    uWall: Vec3;
    vWall: Vec3;
} => {
    const wall = normalizeVec3(settings.wallOrientation.vector);
    const up = normalizeVec3(settings.worldUpOrientation.vector);
    const projection = dotVec3(up, wall);
    const vCandidate = normalizeVec3({
        x: up.x - wall.x * projection,
        y: up.y - wall.y * projection,
        z: up.z - wall.z * projection,
    });
    const vLength = lengthVec(vCandidate);
    const vWall = vLength < EPSILON ? { x: 0, y: 1, z: 0 } : vCandidate;
    const uCandidate = crossVec(vWall, wall);
    const uLength = lengthVec(uCandidate);
    const uWall =
        uLength < EPSILON
            ? { x: 1, y: 0, z: 0 }
            : { x: uCandidate.x / uLength, y: uCandidate.y / uLength, z: uCandidate.z / uLength };
    return { wallNormal: wall, uWall, vWall };
};

const buildQuaternionFromAxes = (xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Quaternion => {
    const matrix = Matrix.Identity();
    Matrix.FromXYZAxesToRef(toVector3(xAxis), toVector3(yAxis), toVector3(zAxis), matrix);
    return Quaternion.FromRotationMatrix(matrix);
};

const createMaterial = (
    scene: Scene,
    name: string,
    options: { diffuse: string; emissive?: string; alpha?: number },
): StandardMaterial => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(options.diffuse);
    if (options.emissive) {
        material.emissiveColor = Color3.FromHexString(options.emissive);
    }
    if (typeof options.alpha === 'number') {
        material.alpha = options.alpha;
    }
    return material;
};

const BabylonSimView: React.FC<BabylonSimViewProps> = ({
    gridSize,
    settings,
    solverResult,
    selectedMirrorId,
    errorMirrorIds,
    debugOptions,
    isPreviewStale,
    showIncomingPerMirror,
    activePatternId,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<Engine | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const mirrorRootRef = useRef<TransformNode | null>(null);
    const ellipseRootRef = useRef<TransformNode | null>(null);
    const rayRootRef = useRef<TransformNode | null>(null);
    const incomingRayRootRef = useRef<TransformNode | null>(null);
    const mirrorMaterialsRef = useRef<{
        base: StandardMaterial;
        selected: StandardMaterial;
        error: StandardMaterial;
    } | null>(null);
    const ellipseMaterialsRef = useRef<{
        base: StandardMaterial;
        selected: StandardMaterial;
        error: StandardMaterial;
    } | null>(null);
    const normalLinesRef = useRef<LinesMesh | null>(null);
    const wallRef = useRef<Mesh | null>(null);
    const sunRef = useRef<Mesh | null>(null);
    const sunRayRef = useRef<Mesh | null>(null);
    const sunMaterialRef = useRef<StandardMaterial | null>(null);
    const sunRayMaterialRef = useRef<StandardMaterial | null>(null);
    const lightHitRef = useRef<Mesh | null>(null);
    const lightHitMaterialRef = useRef<StandardMaterial | null>(null);
    const rayMaterialRef = useRef<StandardMaterial | null>(null);
    const incomingRayMaterialRef = useRef<StandardMaterial | null>(null);
    const wallBasis = useMemo(() => deriveWallBasis(settings), [settings]);

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
            disposeEntity(mirrorRootRef.current);
            disposeEntity(ellipseRootRef.current);
            disposeEntity(rayRootRef.current);
            disposeEntity(incomingRayRootRef.current);
            disposeEntity(normalLinesRef.current);
            disposeEntity(wallRef.current);
            disposeEntity(sunRef.current);
            disposeEntity(sunRayRef.current);
            disposeEntity(lightHitRef.current);
            disposeEntity(mirrorMaterialsRef.current?.base);
            disposeEntity(mirrorMaterialsRef.current?.selected);
            disposeEntity(mirrorMaterialsRef.current?.error);
            disposeEntity(ellipseMaterialsRef.current?.base);
            disposeEntity(ellipseMaterialsRef.current?.selected);
            disposeEntity(ellipseMaterialsRef.current?.error);
            disposeEntity(sunMaterialRef.current);
            disposeEntity(sunRayMaterialRef.current);
            disposeEntity(lightHitMaterialRef.current);
            disposeEntity(rayMaterialRef.current);
            disposeEntity(incomingRayMaterialRef.current);
            scene.dispose();
            engine.dispose();
            engineRef.current = null;
            sceneRef.current = null;
            mirrorMaterialsRef.current = null;
            ellipseMaterialsRef.current = null;
            mirrorRootRef.current = null;
            ellipseRootRef.current = null;
            rayRootRef.current = null;
            incomingRayRootRef.current = null;
            normalLinesRef.current = null;
            wallRef.current = null;
            sunRef.current = null;
            sunRayRef.current = null;
            lightHitRef.current = null;
            sunMaterialRef.current = null;
            sunRayMaterialRef.current = null;
            lightHitMaterialRef.current = null;
            rayMaterialRef.current = null;
            incomingRayMaterialRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }

        const { wallNormal, uWall, vWall } = wallBasis;
        const wallDistance = settings.wallDistance;
        const wallNormalVec = toVector3(wallNormal);
        const uWallVec = toVector3(uWall);
        const vWallVec = toVector3(vWall);
        const wallOrigin = wallNormalVec.scale(wallDistance);

        const lightYaw = (settings.sunOrientation.yaw * Math.PI) / 180;
        const lightPitch = (settings.sunOrientation.pitch * Math.PI) / 180;
        const incomingDir = new Vector3(
            Math.sin(lightYaw) * Math.cos(lightPitch) * -1,
            Math.sin(lightPitch) * -1,
            Math.cos(lightYaw) * Math.cos(lightPitch) * -1,
        ).normalize();
        const sunDistance = Math.max(wallDistance * 0.8, 2);
        const sunPosition = incomingDir.scale(sunDistance);

        const toWallLocal = (point: Vec3): Vector3 => {
            const worldPoint = toVector3(point);
            const delta = worldPoint.subtract(wallOrigin);
            return new Vector3(
                Vector3.Dot(delta, uWallVec),
                Vector3.Dot(delta, vWallVec),
                Vector3.Dot(delta, wallNormalVec),
            );
        };

        const axisToLocalAngle = (axis: Vec3): number => {
            const axisVec = toVector3(axis);
            const localX = Vector3.Dot(axisVec, uWallVec);
            const localY = Vector3.Dot(axisVec, vWallVec);
            return Math.atan2(localY, localX);
        };

        disposeEntity(wallRef.current);
        const wall = MeshBuilder.CreatePlane(
            'wall-plane',
            {
                width: emitterLayout.width * 1.2,
                height: Math.max(emitterLayout.height * 1.2, MIRROR_PITCH_M * 2),
            },
            scene,
        );
        const wallMat = createMaterial(scene, 'wall-mat', {
            diffuse: '#E5E7EB',
            emissive: '#CBD5F5',
            alpha: 0.22,
        });
        wallMat.backFaceCulling = false;
        wall.material = wallMat;
        wall.position = wallOrigin;
        wall.rotationQuaternion = buildQuaternionFromAxes(uWall, vWall, wallNormal);
        wallRef.current = wall;

        disposeEntity(mirrorRootRef.current);
        disposeEntity(ellipseRootRef.current);
        disposeEntity(rayRootRef.current);
        disposeEntity(incomingRayRootRef.current);
        disposeEntity(normalLinesRef.current);
        mirrorRootRef.current = null;
        ellipseRootRef.current = null;
        rayRootRef.current = null;
        incomingRayRootRef.current = null;
        normalLinesRef.current = null;
        disposeEntity(mirrorMaterialsRef.current?.base);
        disposeEntity(mirrorMaterialsRef.current?.selected);
        disposeEntity(mirrorMaterialsRef.current?.error);
        disposeEntity(ellipseMaterialsRef.current?.base);
        disposeEntity(ellipseMaterialsRef.current?.selected);
        disposeEntity(ellipseMaterialsRef.current?.error);
        disposeEntity(rayMaterialRef.current);
        disposeEntity(incomingRayMaterialRef.current);
        mirrorMaterialsRef.current = null;
        ellipseMaterialsRef.current = null;
        rayMaterialRef.current = null;
        incomingRayMaterialRef.current = null;

        const mirrorMaterials = {
            base: createMaterial(scene, 'mirror-base', {
                diffuse: '#1F2933',
                emissive: '#0EA5E9',
            }),
            selected: createMaterial(scene, 'mirror-selected', {
                diffuse: '#F97316',
                emissive: '#FDBA74',
            }),
            error: createMaterial(scene, 'mirror-error', {
                diffuse: '#B91C1C',
                emissive: '#F87171',
            }),
        };
        mirrorMaterials.base.backFaceCulling = false;
        mirrorMaterials.base.disableLighting = true;
        mirrorMaterials.selected.backFaceCulling = false;
        mirrorMaterials.selected.disableLighting = true;
        mirrorMaterials.error.backFaceCulling = false;
        mirrorMaterials.error.disableLighting = true;
        mirrorMaterialsRef.current = mirrorMaterials;

        const ellipseMaterials = {
            base: createMaterial(scene, 'ellipse-base', {
                diffuse: '#FCD34D',
                emissive: '#FBBF24',
                alpha: 0.65,
            }),
            selected: createMaterial(scene, 'ellipse-selected', {
                diffuse: '#34D399',
                emissive: '#6EE7B7',
                alpha: 0.75,
            }),
            error: createMaterial(scene, 'ellipse-error', {
                diffuse: '#F87171',
                emissive: '#FCA5A5',
                alpha: 0.7,
            }),
        };
        ellipseMaterials.base.backFaceCulling = false;
        ellipseMaterials.selected.backFaceCulling = false;
        ellipseMaterials.error.backFaceCulling = false;
        ellipseMaterialsRef.current = ellipseMaterials;

        const mirrorRoot = new TransformNode('mirrors-root', scene);
        mirrorRootRef.current = mirrorRoot;

        solverResult.mirrors.forEach((mirror) => {
            const panel = MeshBuilder.CreatePlane(
                `mirror-${mirror.mirrorId}`,
                { width: MIRROR_DIMENSION_M, height: MIRROR_DIMENSION_M },
                scene,
            );
            panel.parent = mirrorRoot;
            panel.position = toVector3(mirror.center);
            const normal = mirror.normal ? toVector3(mirror.normal) : new Vector3(0, 0, 1);
            panel.setDirection(normal);
            const hasError = errorMirrorIds.has(mirror.mirrorId);
            panel.material =
                selectedMirrorId === mirror.mirrorId
                    ? mirrorMaterials.selected
                    : hasError
                      ? mirrorMaterials.error
                      : mirrorMaterials.base;
        });

        disposeEntity(normalLinesRef.current);
        normalLinesRef.current = null;
        if (debugOptions.showNormals) {
            const normalLines = solverResult.mirrors
                .filter((mirror) => mirror.normal)
                .map((mirror) => {
                    const start = toVector3(mirror.center);
                    const dir = toVector3(mirror.normal ?? wallNormal).normalize();
                    return [start, start.add(dir.scale(0.3))];
                });
            if (normalLines.length > 0) {
                const linesMesh = MeshBuilder.CreateLineSystem(
                    'mirror-normals',
                    { lines: normalLines },
                    scene,
                );
                linesMesh.color = Color3.FromHexString('#FB923C');
                linesMesh.alpha = 0.9;
                linesMesh.isPickable = false;
                normalLinesRef.current = linesMesh;
            }
        }

        disposeEntity(rayRootRef.current);
        disposeEntity(rayMaterialRef.current);
        rayMaterialRef.current = null;
        rayRootRef.current = null;
        if (debugOptions.showRays) {
            const mirrorsWithHits = solverResult.mirrors.filter((mirror) => mirror.wallHit);
            if (mirrorsWithHits.length > 0) {
                const rayRoot = new TransformNode('reflection-rays-root', scene);
                rayRootRef.current = rayRoot;
                const rayMaterial = createMaterial(scene, 'reflection-ray-material', {
                    diffuse: '#FFF7D6',
                    emissive: '#FFEEC0',
                    alpha: 0.25,
                });
                rayMaterial.disableLighting = true;
                rayMaterial.backFaceCulling = false;
                rayMaterialRef.current = rayMaterial;

                mirrorsWithHits.forEach((mirror) => {
                    const path = [toVector3(mirror.center), toVector3(mirror.wallHit as Vec3)];
                    const tube = MeshBuilder.CreateTube(
                        `reflection-ray-${mirror.mirrorId}`,
                        { path, radius: 0.0025, tessellation: 10 },
                        scene,
                    );
                    tube.parent = rayRoot;
                    tube.material = rayMaterial;
                    tube.isPickable = false;
                });
            }
        }

        disposeEntity(incomingRayRootRef.current);
        disposeEntity(incomingRayMaterialRef.current);
        incomingRayRootRef.current = null;
        incomingRayMaterialRef.current = null;
        if (showIncomingPerMirror) {
            const incomingRoot = new TransformNode('incoming-rays-root', scene);
            incomingRayRootRef.current = incomingRoot;
            const incomingMaterial = createMaterial(scene, 'incoming-ray-material', {
                diffuse: '#A9CBFF',
                emissive: '#C8DFFF',
                alpha: 0.18,
            });
            incomingMaterial.disableLighting = true;
            incomingMaterial.backFaceCulling = false;
            incomingRayMaterialRef.current = incomingMaterial;

            solverResult.mirrors.forEach((mirror) => {
                if (activePatternId && mirror.patternId === null) {
                    return;
                }
                const end = toVector3(mirror.center);
                const path = [sunPosition, end];
                const tube = MeshBuilder.CreateTube(
                    `incoming-ray-${mirror.mirrorId}`,
                    { path, radius: 0.0015, tessellation: 8 },
                    scene,
                );
                tube.parent = incomingRoot;
                tube.material = incomingMaterial;
                tube.isPickable = false;
            });
        }

        if (debugOptions.showEllipses) {
            const ellipseRoot = new TransformNode('ellipse-root', scene);
            ellipseRoot.parent = wall;
            solverResult.mirrors.forEach((mirror) => {
                if (!mirror.ellipse || !mirror.wallHit) {
                    return;
                }
                const disc = MeshBuilder.CreateDisc(
                    `ellipse-${mirror.mirrorId}`,
                    { radius: 0.5, tessellation: 48 },
                    scene,
                );
                disc.parent = ellipseRoot;
                const localHit = toWallLocal(mirror.wallHit);
                disc.position = new Vector3(localHit.x, localHit.y, 0.002 + localHit.z);
                disc.scaling = new Vector3(
                    Math.max(mirror.ellipse.majorDiameter, 0.01),
                    Math.max(mirror.ellipse.minorDiameter, 0.01),
                    1,
                );
                const majorAngle = axisToLocalAngle(mirror.ellipse.majorAxis);
                disc.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, majorAngle);
                const hasError = errorMirrorIds.has(mirror.mirrorId);
                disc.material =
                    selectedMirrorId === mirror.mirrorId
                        ? ellipseMaterials.selected
                        : hasError
                          ? ellipseMaterials.error
                          : ellipseMaterials.base;
            });
            ellipseRootRef.current = ellipseRoot;
        }

        disposeEntity(sunRef.current);
        disposeEntity(sunRayRef.current);
        disposeEntity(sunMaterialRef.current);
        disposeEntity(sunRayMaterialRef.current);
        disposeEntity(lightHitRef.current);
        disposeEntity(lightHitMaterialRef.current);

        const sun = MeshBuilder.CreateSphere('sun-indicator', { diameter: 0.25 }, scene);
        const sunMaterial = createMaterial(scene, 'sun-material', {
            diffuse: '#FDE68A',
            emissive: '#FBBF24',
            alpha: 0.7,
        });
        sun.material = sunMaterial;
        sun.position = sunPosition;
        sunRef.current = sun;
        sunMaterialRef.current = sunMaterial;

        if (!showIncomingPerMirror) {
            const rayTube = MeshBuilder.CreateTube(
                'incoming-light-ray',
                { path: [sunPosition, new Vector3(0, 0, 0)], radius: 0.01, tessellation: 12 },
                scene,
            );
            const rayMat = createMaterial(scene, 'incoming-light-ray-mat', {
                diffuse: '#FFF7D6',
                emissive: '#FDE68A',
                alpha: 0.45,
            });
            rayTube.material = rayMat;
            sunRayRef.current = rayTube;
            sunRayMaterialRef.current = rayMat;

            const lightHit = MeshBuilder.CreateDisc(
                'incoming-light-hit',
                { radius: MIRROR_PITCH_M * 0.4, tessellation: 48 },
                scene,
            );
            const lightHitMaterial = createMaterial(scene, 'incoming-light-hit-mat', {
                diffuse: '#FDE68A',
                emissive: '#FCD34D',
                alpha: 0.5,
            });
            lightHit.material = lightHitMaterial;
            lightHit.position = new Vector3(0, 0, 0.002);
            lightHitRef.current = lightHit;
            lightHitMaterialRef.current = lightHitMaterial;
        } else {
            sunRayRef.current = null;
            sunRayMaterialRef.current = null;
            lightHitRef.current = null;
            lightHitMaterialRef.current = null;
        }
    }, [
        debugOptions,
        emitterLayout.height,
        emitterLayout.width,
        errorMirrorIds,
        selectedMirrorId,
        settings,
        showIncomingPerMirror,
        solverResult,
        wallBasis,
    ]);

    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }
        const camera = scene.activeCamera as ArcRotateCamera | null;
        if (!camera) {
            return;
        }
        const { wallNormal } = wallBasis;
        const wallOrigin = toVector3(wallNormal).scale(settings.wallDistance);
        const span =
            Math.max(emitterLayout.width, emitterLayout.height, settings.wallDistance) + 1.5;
        const nextTarget = wallOrigin.scale(0.5);
        camera.radius = span * 1.6;
        camera.target = nextTarget;
    }, [emitterLayout.height, emitterLayout.width, settings.wallDistance, wallBasis]);

    return (
        <div
            ref={containerRef}
            className="relative w-full min-h-[360px] rounded-lg border border-gray-700 bg-gray-900"
        >
            <canvas ref={canvasRef} className="h-full w-full" />
            {isPreviewStale && (
                <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-4">
                    <div className="rounded-md border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                        Preview frozen — resolve solver errors to update.
                    </div>
                </div>
            )}
        </div>
    );
};

export default BabylonSimView;
