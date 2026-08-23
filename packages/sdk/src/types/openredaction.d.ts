declare module 'openredaction' {
  interface OpenRedactionOptions {
    redactionMode: 'placeholder'
  }

  interface RedactionResult {
    redacted: string
  }

  export class OpenRedaction {
    constructor(options: OpenRedactionOptions)
    detect(value: string): Promise<RedactionResult>
  }
}
