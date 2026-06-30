declare namespace PDFKit {
  interface PDFDocument {
    [key: string]: any;
  }
}

declare module "pdfkit" {
  class PDFDocument {
    [key: string]: any;
    constructor(options?: any);
  }

  export = PDFDocument;
}
