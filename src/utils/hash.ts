const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const fnv1aHash = (input: string, prefix = 'fnv1a'): string => {
    let hash = FNV_OFFSET_BASIS;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return `${prefix}-${hash.toString(16).padStart(8, '0')}`;
};
