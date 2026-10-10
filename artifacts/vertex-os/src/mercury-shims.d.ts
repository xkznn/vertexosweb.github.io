declare module "@mercuryworkshop/epoxy-transport" {
  const EpoxyTransport: new (options: { wisp: string } & Record<string, unknown>) => {
    ready: boolean;
    init: () => Promise<void>;
  };
  export default EpoxyTransport;
}
