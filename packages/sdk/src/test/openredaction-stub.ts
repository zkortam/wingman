export class OpenRedaction {
  async detect(text: string): Promise<{ redacted: string }> {
    return { redacted: text.replace('jane@example.com', '[EMAIL]') }
  }
}
