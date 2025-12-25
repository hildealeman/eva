export class AudioInputManager {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onChunkCallback:
    | ((samples: Float32Array, time: number) => void)
    | null = null;
  private startTime = 0;
  private _isRecording = false;

  async start(
    onChunk: (samples: Float32Array, time: number) => void
  ): Promise<void> {
    try {
      this.onChunkCallback = onChunk;

      const AC =
        window.AudioContext ||
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AC();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      const bufferSize = 4096;

      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      this.processor.onaudioprocess = this.handleAudioProcess;

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.startTime = this.audioContext.currentTime;
      this._isRecording = true;
    } catch (error) {
      console.error('Error starting audio capture:', error);
      throw error;
    }
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }

    this._isRecording = false;
    this.onChunkCallback = null;
  }

  private handleAudioProcess = (event: AudioProcessingEvent) => {
    if (!this.onChunkCallback || !this.audioContext) return;

    const inputBuffer = event.inputBuffer;
    const samples = inputBuffer.getChannelData(0);
    const currentTime = this.audioContext.currentTime - this.startTime;

    const copy = new Float32Array(samples.length);
    copy.set(samples);

    this.onChunkCallback(copy, currentTime);
  };

  get isRecording(): boolean {
    return this._isRecording;
  }
}
