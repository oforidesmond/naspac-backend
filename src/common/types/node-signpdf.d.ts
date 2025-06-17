declare module 'node-signpdf' {
  class SignPdf {
    constructor();
    sign(
      pdfBuffer: Buffer,
      p12Buffer: Buffer,
      options?: { passphrase?: string }
    ): Buffer;
  }
  export = SignPdf;
}