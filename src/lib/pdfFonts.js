// Calligraphy fonts for the PDF, bundled with the app (both SIL Open Font Licence, see src/assets/fonts).
//   Pinyon Script       - formal copperplate script, for the title and the written-out values
//   IM Fell English It. - old-style italic, for labels and the description
// They are inlined as base64 so nothing has to be fetched from disk, which Electron blocks for file:// pages.
// This module is only loaded when a PDF is exported.
import pinyonUrl from "../assets/fonts/PinyonScript-Regular.ttf?inline";
import fellUrl from "../assets/fonts/IMFellEnglish-Italic.ttf?inline";

export const SCRIPT = "PinyonScript";
export const ITALIC = "IMFellItalic";

const base64Of = (dataUrl) => dataUrl.slice(dataUrl.indexOf(",") + 1);

export function registerFonts(doc) {
  doc.addFileToVFS("PinyonScript-Regular.ttf", base64Of(pinyonUrl));
  doc.addFont("PinyonScript-Regular.ttf", SCRIPT, "normal");
  doc.addFileToVFS("IMFellEnglish-Italic.ttf", base64Of(fellUrl));
  doc.addFont("IMFellEnglish-Italic.ttf", ITALIC, "normal");
}
