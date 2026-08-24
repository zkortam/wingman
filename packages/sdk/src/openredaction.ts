import { OpenRedaction } from 'openredaction'

export interface PiiScrubber {
  scrub(value: string): Promise<string>
}

export class LocalPiiScrubber implements PiiScrubber {
  readonly #redactor = new OpenRedaction({ redactionMode: 'placeholder' })

  async scrub(value: string): Promise<string> {
    return (await this.#redactor.detect(value)).redacted
  }
}
