/**
 * `stylis` (the CSS compiler MUI/emotion's cache is built on) ships no type
 * declarations of its own, and `@types/stylis` is unmaintained/out of sync
 * with the v4 API used here. We only ever import the `prefixer` middleware
 * (alongside `stylis-plugin-rtl`, which does ship its own types) to rebuild
 * the emotion cache's default stylis plugin chain when overriding it for
 * RTL — see `src/app/[locale]/providers.tsx`.
 */
declare module 'stylis' {
  export type Middleware = (
    element: unknown,
    index: number,
    children: unknown[],
    callback: unknown
  ) => string | void;

  export const prefixer: Middleware;
}
