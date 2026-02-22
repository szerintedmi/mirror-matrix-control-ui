/**
 * Maximum bipartite matching using augmenting-path (Hopcroft-Karp style DFS).
 *
 * Given an adjacency map from left-side nodes to their valid right-side nodes,
 * returns a maximum-cardinality matching as a Map<leftId, rightId>.
 */
export function maxBipartiteMatching(adjacency: Map<string, string[]>): Map<string, string> {
    // matchL[left] = right node matched to left, or undefined
    const matchL = new Map<string, string>();
    // matchR[right] = left node matched to right, or undefined
    const matchR = new Map<string, string>();

    function dfs(u: string, visited: Set<string>): boolean {
        const neighbors = adjacency.get(u);
        if (!neighbors) return false;

        for (const v of neighbors) {
            if (visited.has(v)) continue;
            visited.add(v);

            const currentMatch = matchR.get(v);
            // If v is free or we can augment through its current match
            if (currentMatch === undefined || dfs(currentMatch, visited)) {
                matchL.set(u, v);
                matchR.set(v, u);
                return true;
            }
        }
        return false;
    }

    // Repeatedly try to augment until no more augmenting paths exist.
    // A single pass can miss optimal assignments due to iteration order;
    // multiple rounds allow previously-matched nodes to be rematched.
    let changed = true;
    while (changed) {
        changed = false;
        for (const u of adjacency.keys()) {
            if (!matchL.has(u)) {
                const visited = new Set<string>();
                if (dfs(u, visited)) {
                    changed = true;
                }
            }
        }
    }

    return matchL;
}
