import { limits } from '../config/limits';
import {
  ACCEPTED_EXTENSIONS,
  RASTERIZABLE_EXTENSIONS,
  type IntakeFile,
  type IntakePage,
} from './types';

/**
 * S0 접수 — 파일 묶음을 페이지 이미지로 만든다.
 * 원본 이미지는 브라우저 메모리에만 있고 서버로 가지 않는다(H-1).
 * PDF 는 pdf.js 로 브라우저에서 래스터화한다.
 * hwp/hwpx 는 이번 국면 미지원(자리) — 파일만 제외 표시하고 묶음은 계속 간다.
 */

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx < 0 ? '' : name.slice(idx + 1).toLowerCase();
}

export function classifyFile(file: { name: string; size: number }): IntakeFile {
  const extension = extensionOf(file.name);
  const base = { name: file.name, extension, sizeBytes: file.size };
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ...base, accepted: false, reason: '받지 않는 형식입니다.' };
  }
  if (extension === 'hwp' || extension === 'hwpx') {
    return {
      ...base,
      accepted: false,
      reason: '텍스트 추출 미지원 — PDF로 저장해 주세요.',
    };
  }
  if (!(RASTERIZABLE_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ...base,
      accepted: false,
      reason: '이번 국면은 사진과 PDF만 전사합니다.',
    };
  }
  return { ...base, accepted: true, reason: null };
}

function toBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma < 0 ? dataUrl : dataUrl.slice(comma + 1);
}

async function imageToPage(file: File, pageNumber: number): Promise<IntakePage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} 을 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
  const mediaType =
    file.type === 'image/png'
      ? 'image/png'
      : file.type === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';
  return {
    pageNumber,
    fileName: file.name,
    base64: toBase64(dataUrl),
    mediaType,
    dataUrl,
  };
}

async function pdfToPages(file: File, startPage: number): Promise<IntakePage[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: IntakePage[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: limits.pdfRasterScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('캔버스를 만들지 못했습니다.');
    await page.render({ canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    pages.push({
      pageNumber: startPage + i - 1,
      fileName: file.name,
      base64: toBase64(dataUrl),
      mediaType: 'image/jpeg',
      dataUrl,
    });
  }
  return pages;
}

export interface PreparedIntake {
  files: IntakeFile[];
  pages: IntakePage[];
  /** 예상 호출 수 = 이미지 페이지 수(토큰이 아니다 — 코너 가 §4-1) */
  expectedCalls: number;
}

export async function prepareIntake(fileList: readonly File[]): Promise<PreparedIntake> {
  const files: IntakeFile[] = [];
  const pages: IntakePage[] = [];
  for (const file of fileList.slice(0, limits.intakeMaxFiles)) {
    const classified = classifyFile(file);
    files.push(classified);
    if (!classified.accepted) continue;
    if (pages.length >= limits.intakeMaxPages) continue;
    if (classified.extension === 'pdf') {
      pages.push(...(await pdfToPages(file, pages.length + 1)));
    } else {
      pages.push(await imageToPage(file, pages.length + 1));
    }
  }
  const capped = pages.slice(0, limits.intakeMaxPages);
  return { files, pages: capped, expectedCalls: capped.length };
}
