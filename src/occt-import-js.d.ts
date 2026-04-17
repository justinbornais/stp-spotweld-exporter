declare module 'occt-import-js' {
  interface OcctImportJsModule {
    ReadStepFile(content: Uint8Array, params: any): any;
    ReadIgesFile(content: Uint8Array, params: any): any;
    ReadBrepFile(content: Uint8Array, params: any): any;
  }

  function occtimportjs(options?: {
    locateFile?: (name: string) => string;
  }): Promise<OcctImportJsModule>;

  export default occtimportjs;
}
