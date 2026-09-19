const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';

function partialTagSuffixLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (text.endsWith(tag.slice(0, length))) {
      return length;
    }
  }
  return 0;
}

export class ThinkStripper {
  private inThink = false;
  private pending = '';

  push(delta: string): string {
    let buffer = this.pending + delta;
    this.pending = '';
    let output = '';

    for (;;) {
      if (!this.inThink) {
        const openIndex = buffer.indexOf(OPEN_TAG);
        if (openIndex >= 0) {
          output += buffer.slice(0, openIndex);
          this.inThink = true;
          buffer = buffer.slice(openIndex + OPEN_TAG.length);
          continue;
        }
        const keep = partialTagSuffixLength(buffer, OPEN_TAG);
        output += buffer.slice(0, buffer.length - keep);
        this.pending = buffer.slice(buffer.length - keep);
        break;
      }

      const closeIndex = buffer.indexOf(CLOSE_TAG);
      if (closeIndex >= 0) {
        this.inThink = false;
        buffer = buffer.slice(closeIndex + CLOSE_TAG.length);
        continue;
      }
      const keep = partialTagSuffixLength(buffer, CLOSE_TAG);
      this.pending = buffer.slice(buffer.length - keep);
      break;
    }

    return output;
  }

  flush(): string {
    const rest = this.inThink ? '' : this.pending;
    this.pending = '';
    return rest;
  }
}
