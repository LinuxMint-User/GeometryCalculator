// 注意：不能直接 `/// <reference types="vite/client" />`——
// pnpm 非 hoist 布局下顶层 node_modules 没有 vite 目录，TS 解析不到该引用。
// 这里显式声明 Vite 原生导入（?raw）和 import.meta.hot 的类型。
declare module '*?raw' {
  const content: string;
  export default content;
}

interface ImportMeta {
  readonly hot?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 与 Vite 的 HMR 回调签名保持一致
    readonly accept: (cb: (...args: any[]) => void) => void;
  };
}

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
  }
}
