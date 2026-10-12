import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as QRCode from 'qrcode';

test('packaged PDF renderer produces fonts and QR image without external modules or font files', async () => {
  const filename = process.env.PDF_RUNTIME_PATH
    ? resolve(process.env.PDF_RUNTIME_PATH)
    : resolve(__dirname, '../src/generated/pdfkit-runtime.cjs');
  const runtime: { exports: any } = { exports: {} };
  runInNewContext(readFileSync(filename, 'utf8'), {
    module: runtime,
    exports: runtime.exports,
    setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, TextDecoder,
    require: (name: string) => { throw new Error(`External module unavailable: ${name}`); },
  }, { filename });

  const document = new runtime.exports({ size: 'A4', margin: 42 });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolvePdf, reject) => {
    document.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolvePdf(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.font('Helvetica-Bold').text('Dispatch CN-PACKAGING-TEST');
  document.font('Helvetica').text('Sender and receiver details');
  const qr = await QRCode.toBuffer('https://courier.example/track/CN-PACKAGING-TEST');
  document.image(`data:image/png;base64,${qr.toString('base64')}`, { width: 112 });
  document.end();
  const pdf = await result;
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
  assert.match(pdf.toString('latin1'), /\/Subtype \/Image/);
});
