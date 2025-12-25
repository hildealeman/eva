export class AudioBufferRing {
  private buffer: Float32Array;
  private sampleRate: number;
  private maxSeconds: number;
  private writeIndex = 0;
  private isFull = false;

  constructor(sampleRate: number, maxSeconds: number = 30) {
    this.sampleRate = sampleRate;
    this.maxSeconds = maxSeconds;
    this.buffer = new Float32Array(sampleRate * maxSeconds);
  }

  push(samples: Float32Array): void {
    const total = this.buffer.length;
    const len = samples.length;

    if (len >= total) {
      // If the chunk is larger than our buffer, just keep the last part
      this.buffer.set(samples.subarray(len - total));
      this.writeIndex = 0;
      this.isFull = true;
      return;
    }

    const remaining = total - this.writeIndex;

    if (len <= remaining) {
      this.buffer.set(samples, this.writeIndex);
      this.writeIndex += len;
    } else {
      const first = samples.subarray(0, remaining);
      const second = samples.subarray(remaining);
      this.buffer.set(first, this.writeIndex);
      this.buffer.set(second, 0);
      this.writeIndex = second.length;
      this.isFull = true;
    }

    if (this.writeIndex >= total) {
      this.writeIndex = 0;
      this.isFull = true;
    }
  }

  getWindow(startTime: number, endTime: number): Float32Array | null {
    if (endTime <= startTime) return null;

    const startSample = Math.floor(startTime * this.sampleRate);
    const endSample = Math.ceil(endTime * this.sampleRate);
    const length = endSample - startSample;

    if (length <= 0) return null;

    const total = this.buffer.length;
    if (!this.isFull && endSample > this.writeIndex) {
      // We don't have enough history yet
      return null;
    }

    const result = new Float32Array(length);
    const readStart = ((startSample % total) + total) % total;
    const available = total - readStart;

    if (length <= available) {
      result.set(this.buffer.subarray(readStart, readStart + length));
    } else {
      const first = this.buffer.subarray(readStart, readStart + available);
      const second = this.buffer.subarray(0, length - available);
      result.set(first, 0);
      result.set(second, first.length);
    }

    return result;
  }

  clear(): void {
    this.buffer.fill(0);
    this.writeIndex = 0;
    this.isFull = false;
  }
}
