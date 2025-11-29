import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';

import {
    clampRoi,
    DEFAULT_CLAHE_CLIP_LIMIT,
    DEFAULT_CLAHE_TILE_GRID_SIZE,
    DEFAULT_ROI,
    RESOLUTION_OPTIONS,
    type ResolutionOption,
} from '@/constants/calibration';
import {
    DEFAULT_BLOB_PARAMS,
    type DetectionSettings,
    type DetectionSettingsProfile,
    loadDetectionSettings,
    loadLastDetectionProfileId,
    loadSavedDetectionSettingsProfiles,
    persistDetectionSettings,
    persistLastDetectionProfileId,
    saveDetectionSettingsProfile,
} from '@/services/detectionSettingsStorage';
import type { BlobDetectorParams } from '@/services/opencvWorkerClient';
import type { NormalizedRoi } from '@/types';

const getLocalStorage = (): Storage | undefined =>
    typeof window !== 'undefined' ? window.localStorage : undefined;

export interface DetectionSettingsController {
    detectionSettingsLoaded: boolean;
    selectedDeviceId: string;
    setSelectedDeviceId: (value: string) => void;
    selectedResolutionId: string;
    setSelectedResolutionId: (value: string) => void;
    brightness: number;
    setBrightness: (value: number) => void;
    contrast: number;
    setContrast: (value: number) => void;
    rotationDegrees: number;
    setRotationDegrees: (value: number) => void;
    claheClipLimit: number;
    setClaheClipLimit: (value: number) => void;
    claheTileGridSize: number;
    setClaheTileGridSize: (value: number) => void;
    roi: NormalizedRoi;
    setRoi: (roi: NormalizedRoi | ((prev: NormalizedRoi) => NormalizedRoi)) => void;
    blobParams: BlobDetectorParams;
    setBlobParams: Dispatch<SetStateAction<BlobDetectorParams>>;
    updateBlobParam: <K extends keyof BlobDetectorParams>(
        key: K,
        value: BlobDetectorParams[K],
    ) => void;
    useWasmDetector: boolean;
    setUseWasmDetector: (value: boolean) => void;
    savedProfiles: DetectionSettingsProfile[];
    selectedProfileId: string;
    selectProfileId: (value: string) => void;
    profileNameInput: string;
    setProfileNameInput: (value: string) => void;
    applyProfileById: (profileId: string) => void;
    saveProfile: () => DetectionSettingsProfile | null;
    resetProfileSelection: () => void;
    resolvedResolution: ResolutionOption;
    currentSettings: DetectionSettings;
    handleNativeDetectorAvailability: (hasNativeDetector: boolean) => void;
    setLastCaptureDimensions: (dimensions: { width: number | null; height: number | null }) => void;
}

export const useDetectionSettingsController = (): DetectionSettingsController => {
    const storedSettings = useMemo(() => loadDetectionSettings(getLocalStorage()), []);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
        storedSettings?.camera.deviceId ?? 'default',
    );
    const [selectedResolutionId, setSelectedResolutionId] = useState<string>(
        storedSettings?.camera.resolutionId ?? 'auto',
    );
    const [brightness, setBrightness] = useState(storedSettings?.processing.brightness ?? 0);
    const [contrast, setContrast] = useState(storedSettings?.processing.contrast ?? 1);
    const [rotationDegrees, setRotationDegrees] = useState(
        storedSettings?.processing.rotationDegrees ?? 0,
    );
    const [claheClipLimit, setClaheClipLimit] = useState(
        storedSettings?.processing.claheClipLimit ?? DEFAULT_CLAHE_CLIP_LIMIT,
    );
    const [claheTileGridSize, setClaheTileGridSize] = useState(
        storedSettings?.processing.claheTileGridSize ?? DEFAULT_CLAHE_TILE_GRID_SIZE,
    );
    const [blobParams, setBlobParams] = useState<BlobDetectorParams>(
        () => storedSettings?.blobParams ?? { ...DEFAULT_BLOB_PARAMS },
    );
    const [roi, setRoiState] = useState<NormalizedRoi>(
        storedSettings
            ? {
                  enabled: storedSettings.roi.enabled,
                  x: storedSettings.roi.x,
                  y: storedSettings.roi.y,
                  width: storedSettings.roi.width,
                  height: storedSettings.roi.height,
              }
            : DEFAULT_ROI,
    );
    const [useWasmDetectorState, setUseWasmDetectorState] = useState(
        storedSettings?.useWasmDetector ?? false,
    );
    const [lastCaptureDimensions, setLastCaptureDimensionsState] = useState<{
        width: number | null;
        height: number | null;
    }>(
        storedSettings?.roi
            ? {
                  width: storedSettings.roi.lastCaptureWidth ?? null,
                  height: storedSettings.roi.lastCaptureHeight ?? null,
              }
            : { width: null, height: null },
    );
    const detectionSettingsLoaded = true;
    const [savedProfiles, setSavedProfiles] = useState<DetectionSettingsProfile[]>(() =>
        loadSavedDetectionSettingsProfiles(getLocalStorage()),
    );
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [profileNameInput, setProfileNameInput] = useState('');
    const userDetectorPreferenceRef = useRef(Boolean(storedSettings));

    const setUseWasmDetector = useCallback((next: boolean) => {
        userDetectorPreferenceRef.current = true;
        setUseWasmDetectorState(next);
    }, []);

    const handleNativeDetectorAvailability = useCallback(
        (hasNativeDetector: boolean) => {
            if (!hasNativeDetector && useWasmDetectorState) {
                setUseWasmDetectorState(false);
                return;
            }
            if (hasNativeDetector && !userDetectorPreferenceRef.current) {
                setUseWasmDetectorState(true);
            }
        },
        [useWasmDetectorState],
    );

    const selectProfileId = useCallback(
        (value: string) => {
            setSelectedProfileId(value);
            persistLastDetectionProfileId(getLocalStorage(), value || null);
            if (!value) {
                setProfileNameInput('');
                return;
            }
            const next = savedProfiles.find((profile) => profile.id === value);
            if (next) {
                setProfileNameInput(next.name);
            }
        },
        [savedProfiles],
    );

    const applyProfile = useCallback(
        (profile: DetectionSettingsProfile) => {
            setSelectedDeviceId(profile.settings.camera.deviceId);
            const resolutionOption = RESOLUTION_OPTIONS.find(
                (option) => option.id === profile.settings.camera.resolutionId,
            );
            setSelectedResolutionId(
                resolutionOption ? profile.settings.camera.resolutionId : 'auto',
            );
            setBrightness(profile.settings.processing.brightness);
            setContrast(profile.settings.processing.contrast);
            setClaheClipLimit(profile.settings.processing.claheClipLimit);
            setClaheTileGridSize(profile.settings.processing.claheTileGridSize);
            setRotationDegrees(profile.settings.processing.rotationDegrees);
            setBlobParams(profile.settings.blobParams);
            setRoiState({
                enabled: profile.settings.roi.enabled,
                x: profile.settings.roi.x,
                y: profile.settings.roi.y,
                width: profile.settings.roi.width,
                height: profile.settings.roi.height,
            });
            setUseWasmDetector(profile.settings.useWasmDetector);
        },
        [setUseWasmDetector],
    );

    const applyProfileById = useCallback(
        (profileId: string) => {
            const profile = savedProfiles.find((entry) => entry.id === profileId);
            if (profile) {
                applyProfile(profile);
                selectProfileId(profile.id);
            }
        },
        [applyProfile, savedProfiles, selectProfileId],
    );

    // Auto-load last used detection profile on mount
    const hasAutoLoadedProfileRef = useRef(false);
    useEffect(() => {
        if (hasAutoLoadedProfileRef.current || savedProfiles.length === 0) {
            return;
        }
        hasAutoLoadedProfileRef.current = true;
        const storage = getLocalStorage();
        const lastProfileId = loadLastDetectionProfileId(storage);
        if (lastProfileId) {
            const profile = savedProfiles.find((p) => p.id === lastProfileId);
            if (profile) {
                applyProfile(profile);
                setSelectedProfileId(profile.id);
                setProfileNameInput(profile.name);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedProfiles]);

    const saveProfile = useCallback(() => {
        const storage = getLocalStorage();
        const saved = saveDetectionSettingsProfile(storage, {
            id: selectedProfileId || undefined,
            name: profileNameInput,
            settings: {
                camera: {
                    deviceId: selectedDeviceId,
                    resolutionId: selectedResolutionId,
                },
                roi: {
                    ...roi,
                    lastCaptureWidth: lastCaptureDimensions.width,
                    lastCaptureHeight: lastCaptureDimensions.height,
                },
                processing: {
                    brightness,
                    contrast,
                    claheClipLimit,
                    claheTileGridSize,
                    rotationDegrees,
                },
                blobParams,
                useWasmDetector: useWasmDetectorState,
            },
        });
        if (saved) {
            selectProfileId(saved.id);
            setSavedProfiles(loadSavedDetectionSettingsProfiles(getLocalStorage()));
        }
        return saved;
    }, [
        blobParams,
        brightness,
        claheClipLimit,
        claheTileGridSize,
        contrast,
        lastCaptureDimensions.height,
        lastCaptureDimensions.width,
        profileNameInput,
        roi,
        rotationDegrees,
        selectProfileId,
        selectedDeviceId,
        selectedProfileId,
        selectedResolutionId,
        useWasmDetectorState,
    ]);

    const resetProfileSelection = useCallback(() => {
        selectProfileId('');
    }, [selectProfileId]);

    const updateBlobParam = useCallback(
        <K extends keyof BlobDetectorParams>(key: K, value: BlobDetectorParams[K]) => {
            setBlobParams((prev) => {
                if (prev[key] === value) {
                    return prev;
                }
                return {
                    ...prev,
                    [key]: value,
                };
            });
        },
        [],
    );

    const resolvedResolution = useMemo<ResolutionOption>(() => {
        return (
            RESOLUTION_OPTIONS.find((option) => option.id === selectedResolutionId) ??
            RESOLUTION_OPTIONS[0]
        );
    }, [selectedResolutionId]);

    const currentSettings = useMemo<DetectionSettings>(() => {
        return {
            camera: {
                deviceId: selectedDeviceId,
                resolutionId: selectedResolutionId,
            },
            roi: {
                ...roi,
                lastCaptureWidth: null,
                lastCaptureHeight: null,
            },
            processing: {
                brightness,
                contrast,
                claheClipLimit,
                claheTileGridSize,
                rotationDegrees,
            },
            blobParams,
            useWasmDetector: useWasmDetectorState,
        };
    }, [
        blobParams,
        brightness,
        claheClipLimit,
        claheTileGridSize,
        contrast,
        roi,
        rotationDegrees,
        selectedDeviceId,
        selectedResolutionId,
        useWasmDetectorState,
    ]);

    useEffect(() => {
        if (!detectionSettingsLoaded) {
            return;
        }
        const storage = getLocalStorage();
        persistDetectionSettings(storage, {
            ...currentSettings,
            roi: {
                ...currentSettings.roi,
                lastCaptureWidth: lastCaptureDimensions.width,
                lastCaptureHeight: lastCaptureDimensions.height,
            },
        });
    }, [
        currentSettings,
        detectionSettingsLoaded,
        lastCaptureDimensions.height,
        lastCaptureDimensions.width,
    ]);

    const setLastCaptureDimensions = useCallback(
        (dimensions: { width: number | null; height: number | null }) => {
            setLastCaptureDimensionsState((prev) => {
                if (prev.width === dimensions.width && prev.height === dimensions.height) {
                    return prev;
                }
                return dimensions;
            });
        },
        [],
    );

    return {
        detectionSettingsLoaded,
        selectedDeviceId,
        setSelectedDeviceId,
        selectedResolutionId,
        setSelectedResolutionId,
        brightness,
        setBrightness,
        contrast,
        setContrast,
        rotationDegrees,
        setRotationDegrees,
        claheClipLimit,
        setClaheClipLimit,
        claheTileGridSize,
        setClaheTileGridSize,
        roi,
        setRoi: (next) =>
            setRoiState((prev) => {
                const value =
                    typeof next === 'function'
                        ? (next as (current: NormalizedRoi) => NormalizedRoi)(prev)
                        : next;
                return clampRoi(value);
            }),
        blobParams,
        setBlobParams,
        updateBlobParam,
        useWasmDetector: useWasmDetectorState,
        setUseWasmDetector,
        savedProfiles,
        selectedProfileId,
        selectProfileId,
        profileNameInput,
        setProfileNameInput,
        applyProfileById,
        saveProfile,
        resetProfileSelection,
        resolvedResolution,
        currentSettings,
        handleNativeDetectorAvailability,
        setLastCaptureDimensions,
    };
};
