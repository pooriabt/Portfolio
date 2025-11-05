declare module '@mapbox/mapbox-gl-rtl-text' {
  const rtlTextPlugin: {
    default?: (() => Promise<any>) | Promise<any> | any;
    [key: string]: any;
  };
  export default rtlTextPlugin;
}

