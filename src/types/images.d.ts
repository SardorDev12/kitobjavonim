// Metro resolves a PNG import to a string URL on web and a numeric asset id
// on native — this project has no local-image `import`s anywhere else (every
// existing image is a remote Supabase Storage URL), so nothing declared this
// yet. Needed for _layout.tsx's staging-favicon swap.
declare module '*.png' {
  const value: number;
  export default value;
}
