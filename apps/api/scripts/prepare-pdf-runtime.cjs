const fs = require('node:fs');
const path = require('node:path');

// Resolve from this workspace so npm hoisting does not change which version is copied.
const packagePath = require.resolve('pdfkit/package.json');
const packageDirectory = path.dirname(packagePath);
const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (metadata.version !== '0.17.2') {
  throw new Error(`Expected PDFKit 0.17.2, received ${metadata.version}. Run npm ci.`);
}
const outputDirectory = path.join(__dirname, '../src/generated');
fs.mkdirSync(outputDirectory, { recursive: true });
// The standalone distribution embeds fonts and all dependencies. Fail the build
// if unavailable rather than allowing a deployment with broken PDF downloads.
fs.copyFileSync(path.join(packageDirectory, 'js/pdfkit.standalone.js'), path.join(outputDirectory, 'pdfkit-runtime.cjs'));
fs.copyFileSync(path.join(packageDirectory, 'LICENSE'), path.join(outputDirectory, 'pdfkit-LICENSE'));
