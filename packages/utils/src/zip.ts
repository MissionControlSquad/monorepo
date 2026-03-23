/** CRC-32 implementation for ZIP */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create a ZIP file from an array of text files (STORE method, no compression).
 * Returns a Blob that can be downloaded directly.
 * Works in browser, Electron, and React Native (all support TextEncoder, ArrayBuffer, Blob).
 */
export function createZipBlob(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const entries = files.map((f) => ({
    name: encoder.encode(f.name),
    data: encoder.encode(f.content),
  }));

  // Calculate sizes
  let localHeadersSize = 0;
  let centralDirSize = 0;
  for (const e of entries) {
    localHeadersSize += 30 + e.name.length + e.data.length;
    centralDirSize += 46 + e.name.length;
  }
  const totalSize = localHeadersSize + centralDirSize + 22;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  let localOffset = 0;
  const offsets: number[] = [];

  // Write local file headers + data
  for (const e of entries) {
    offsets.push(localOffset);
    view.setUint32(localOffset, 0x04034b50, true); // local file header sig
    view.setUint16(localOffset + 4, 20, true); // version needed
    view.setUint16(localOffset + 6, 0, true); // flags
    view.setUint16(localOffset + 8, 0, true); // compression: store
    view.setUint16(localOffset + 10, 0, true); // mod time
    view.setUint16(localOffset + 12, 0, true); // mod date
    view.setUint32(localOffset + 14, crc32(e.data), true);
    view.setUint32(localOffset + 18, e.data.length, true); // compressed
    view.setUint32(localOffset + 22, e.data.length, true); // uncompressed
    view.setUint16(localOffset + 26, e.name.length, true);
    view.setUint16(localOffset + 28, 0, true); // extra field length
    bytes.set(e.name, localOffset + 30);
    bytes.set(e.data, localOffset + 30 + e.name.length);
    localOffset += 30 + e.name.length + e.data.length;
  }

  // Write central directory
  const centralStart = localOffset;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    view.setUint32(localOffset, 0x02014b50, true); // central dir sig
    view.setUint16(localOffset + 4, 20, true); // version made by
    view.setUint16(localOffset + 6, 20, true); // version needed
    view.setUint16(localOffset + 8, 0, true); // flags
    view.setUint16(localOffset + 10, 0, true); // compression: store
    view.setUint16(localOffset + 12, 0, true); // mod time
    view.setUint16(localOffset + 14, 0, true); // mod date
    view.setUint32(localOffset + 16, crc32(e.data), true);
    view.setUint32(localOffset + 20, e.data.length, true);
    view.setUint32(localOffset + 24, e.data.length, true);
    view.setUint16(localOffset + 28, e.name.length, true);
    view.setUint16(localOffset + 30, 0, true); // extra
    view.setUint16(localOffset + 32, 0, true); // comment
    view.setUint16(localOffset + 34, 0, true); // disk
    view.setUint16(localOffset + 36, 0, true); // internal attrs
    view.setUint32(localOffset + 38, 0, true); // external attrs
    view.setUint32(localOffset + 42, offsets[i], true); // local header offset
    bytes.set(e.name, localOffset + 46);
    localOffset += 46 + e.name.length;
  }

  // End of central directory
  view.setUint32(localOffset, 0x06054b50, true);
  view.setUint16(localOffset + 4, 0, true); // disk
  view.setUint16(localOffset + 6, 0, true); // central dir disk
  view.setUint16(localOffset + 8, entries.length, true);
  view.setUint16(localOffset + 10, entries.length, true);
  view.setUint32(localOffset + 12, localOffset - centralStart, true);
  view.setUint32(localOffset + 16, centralStart, true);
  view.setUint16(localOffset + 20, 0, true); // comment

  return new Blob([buf], { type: "application/zip" });
}
