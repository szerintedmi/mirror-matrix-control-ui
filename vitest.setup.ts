// Global React 18 act() configuration for Vitest.
// React DOM checks this flag to decide whether to enforce act() usage.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
