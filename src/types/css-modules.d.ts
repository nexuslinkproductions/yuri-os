declare module '*.css';
declare module '*.css?inline';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
