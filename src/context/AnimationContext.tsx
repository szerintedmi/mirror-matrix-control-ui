import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
    loadAnimations,
    saveAnimation as saveAnimationToStorage,
    deleteAnimation as deleteAnimationFromStorage,
    createEmptyAnimation,
    createEmptyPath,
} from '@/services/animationStorage';
import type { Animation, AnimationMode, AnimationPath } from '@/types/animation';

// ============================================================================
// Context Types
// ============================================================================

interface AnimationContextValue {
    /** All animations in library */
    animations: Animation[];
    /** Currently selected animation ID */
    selectedAnimationId: string | null;
    /** Currently selected animation object (derived) */
    selectedAnimation: Animation | null;

    /** Select an animation by ID */
    selectAnimation: (id: string | null) => void;
    /** Create a new animation */
    createAnimation: (name: string, mode: AnimationMode) => Animation;
    /** Save/update an animation */
    saveAnimation: (animation: Animation) => void;
    /** Delete an animation by ID */
    deleteAnimation: (id: string) => void;
    /** Rename an animation */
    renameAnimation: (id: string, name: string) => void;

    /** Create a new path for an animation */
    createPath: (animationId: string, pathName: string) => AnimationPath | null;
    /** Update a path within an animation */
    updatePath: (animationId: string, path: AnimationPath) => void;
    /** Delete a path from an animation */
    deletePath: (animationId: string, pathId: string) => void;
}

// ============================================================================
// Context
// ============================================================================

const AnimationContext = createContext<AnimationContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface AnimationProviderProps {
    children: React.ReactNode;
}

export const AnimationProvider: React.FC<AnimationProviderProps> = ({ children }) => {
    const storage = useMemo(
        () => (typeof window !== 'undefined' ? window.localStorage : undefined),
        [],
    );

    const [animations, setAnimations] = useState<Animation[]>(() => loadAnimations(storage));
    const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(null);

    // Sync with storage on external changes (e.g., other tabs)
    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === 'mirror:animations') {
                setAnimations(loadAnimations(storage));
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [storage]);

    // Derived: selected animation
    const selectedAnimation = useMemo(
        () => animations.find((a) => a.id === selectedAnimationId) ?? null,
        [animations, selectedAnimationId],
    );

    // Select animation
    const selectAnimation = useCallback((id: string | null) => {
        setSelectedAnimationId(id);
    }, []);

    // Create animation
    const createAnimation = useCallback(
        (name: string, mode: AnimationMode): Animation => {
            const animation = createEmptyAnimation(name, mode);
            const updated = saveAnimationToStorage(storage, animation);
            setAnimations(updated);
            setSelectedAnimationId(animation.id);
            return animation;
        },
        [storage],
    );

    // Save animation
    const saveAnimation = useCallback(
        (animation: Animation): void => {
            const updatedAnimation = {
                ...animation,
                updatedAt: new Date().toISOString(),
            };
            const updated = saveAnimationToStorage(storage, updatedAnimation);
            setAnimations(updated);
        },
        [storage],
    );

    // Delete animation
    const deleteAnimation = useCallback(
        (id: string): void => {
            const updated = deleteAnimationFromStorage(storage, id);
            setAnimations(updated);
            if (selectedAnimationId === id) {
                setSelectedAnimationId(null);
            }
        },
        [storage, selectedAnimationId],
    );

    // Rename animation
    const renameAnimation = useCallback(
        (id: string, name: string): void => {
            const animation = animations.find((a) => a.id === id);
            if (!animation) return;

            const updatedAnimation = {
                ...animation,
                name: name.trim() || animation.name,
                updatedAt: new Date().toISOString(),
            };
            const updated = saveAnimationToStorage(storage, updatedAnimation);
            setAnimations(updated);
        },
        [animations, storage],
    );

    // Create path
    const createPath = useCallback(
        (animationId: string, pathName: string): AnimationPath | null => {
            const animation = animations.find((a) => a.id === animationId);
            if (!animation) return null;

            const path = createEmptyPath(pathName);
            const updatedAnimation = {
                ...animation,
                paths: [...animation.paths, path],
                updatedAt: new Date().toISOString(),
            };

            const updated = saveAnimationToStorage(storage, updatedAnimation);
            setAnimations(updated);
            return path;
        },
        [animations, storage],
    );

    // Update path
    const updatePath = useCallback(
        (animationId: string, path: AnimationPath): void => {
            const animation = animations.find((a) => a.id === animationId);
            if (!animation) return;

            const pathIndex = animation.paths.findIndex((p) => p.id === path.id);
            if (pathIndex === -1) return;

            const updatedPaths = [...animation.paths];
            updatedPaths[pathIndex] = path;

            const updatedAnimation = {
                ...animation,
                paths: updatedPaths,
                updatedAt: new Date().toISOString(),
            };

            const updated = saveAnimationToStorage(storage, updatedAnimation);
            setAnimations(updated);
        },
        [animations, storage],
    );

    // Delete path
    const deletePath = useCallback(
        (animationId: string, pathId: string): void => {
            const animation = animations.find((a) => a.id === animationId);
            if (!animation) return;

            const updatedPaths = animation.paths.filter((p) => p.id !== pathId);

            // Also remove any assignments referencing this path
            let updatedAnimation: Animation = {
                ...animation,
                paths: updatedPaths,
                updatedAt: new Date().toISOString(),
            };

            if (animation.independentConfig) {
                updatedAnimation.independentConfig = {
                    assignments: animation.independentConfig.assignments.filter(
                        (a) => a.pathId !== pathId,
                    ),
                };
            }

            if (animation.sequentialConfig?.pathId === pathId) {
                updatedAnimation.sequentialConfig = {
                    ...animation.sequentialConfig,
                    pathId: '',
                };
            }

            const updated = saveAnimationToStorage(storage, updatedAnimation);
            setAnimations(updated);
        },
        [animations, storage],
    );

    // Context value
    const value = useMemo<AnimationContextValue>(
        () => ({
            animations,
            selectedAnimationId,
            selectedAnimation,
            selectAnimation,
            createAnimation,
            saveAnimation,
            deleteAnimation,
            renameAnimation,
            createPath,
            updatePath,
            deletePath,
        }),
        [
            animations,
            selectedAnimationId,
            selectedAnimation,
            selectAnimation,
            createAnimation,
            saveAnimation,
            deleteAnimation,
            renameAnimation,
            createPath,
            updatePath,
            deletePath,
        ],
    );

    return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>;
};

// ============================================================================
// Hook
// ============================================================================

export const useAnimationContext = (): AnimationContextValue => {
    const context = useContext(AnimationContext);
    if (!context) {
        throw new Error('useAnimationContext must be used within an AnimationProvider');
    }
    return context;
};
