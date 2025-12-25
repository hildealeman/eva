export function createWavBlobFromFloat32(
  samples: Float32Array,
  sampleRate: number
): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  let offset = 0;

  writeString(offset, 'RIFF');
  offset += 4;

  view.setUint32(offset, 36 + samples.length * bytesPerSample, true);
  offset += 4;

  writeString(offset, 'WAVE');
  offset += 4;

  writeString(offset, 'fmt ');
  offset += 4;

  view.setUint32(offset, 16, true);
  offset += 4;

  view.setUint16(offset, 1, true);
  offset += 2;

  view.setUint16(offset, numChannels, true);
  offset += 2;

  view.setUint32(offset, sampleRate, true);
  offset += 4;

  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;

  view.setUint16(offset, blockAlign, true);
  offset += 2;

  view.setUint16(offset, 8 * bytesPerSample, true);
  offset += 2;

  writeString(offset, 'data');
  offset += 4;

  view.setUint32(offset, samples.length * bytesPerSample, true);
  offset += 4;

  let idx = 0;
  for (let i = 0; i < samples.length; i++, idx += 2) {
    let s = samples[i];
    s = Math.max(-1, Math.min(1, s));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset + idx, val, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
