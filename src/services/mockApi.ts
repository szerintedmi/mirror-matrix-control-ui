import { getMockNodes } from './mockTransport';

import type { Node } from '../types';

export const discoverNodes = async (): Promise<Node[]> => Promise.resolve(getMockNodes());
