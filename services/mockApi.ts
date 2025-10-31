import type { Node } from '../types';

const generateMacAddress = (): string => {
  return "XX:XX:XX:XX:XX:XX".replace(/X/g, () => {
    return "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16))
  });
};

export const discoverNodes = async (): Promise<Node[]> => {
  console.log("Starting node discovery...");
  return new Promise((resolve) => {
    setTimeout(() => {
      const nodes: Node[] = [];
      const nodeCount = Math.floor(Math.random() * 4) + 2; // 2 to 5 nodes
      for (let i = 0; i < nodeCount; i++) {
        const mac = generateMacAddress();
        const node: Node = {
          macAddress: mac,
          status: Math.random() > 0.2 ? 'ready' : 'offline', // 80% chance of being ready
          motors: Array.from({ length: 8 }, (_, motorIndex) => ({
            nodeMac: mac,
            motorIndex,
          })),
        };
        nodes.push(node);
      }
      console.log(`Discovery complete. Found ${nodeCount} nodes.`);
      resolve(nodes);
    }, 800);
  });
};
