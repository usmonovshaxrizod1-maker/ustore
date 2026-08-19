// Browser/WebView-safe local image byte handling.
//
// Image Pipeline V2 (2026-08 real-Telegram bug-fix round): bu moduldagi
// readBlobAsArrayBuffer/makeDetachedImageFile FileReader/ArrayBuffer zanjiri
// endi PRIMARY emas — ustore-shop-app.js'dagi captureAndPrepareImageV2() birinchi
// navbatda createImageBitmap(file)'ni TO'G'RIDAN-TO'G'RI original File'dan
// chaqiradi (bu yerga umuman kirmasdan). Bu funksiyalar faqat ikkinchi
// darajali FALLBACK sifatida chaqiriladi — createImageBitmap ISHLAMASA yoki
// mavjud bo'lmasa. O'chirilmagan, faqat rol o'zgargan.
(function attachUstoreImageIO(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.UstoreImageIO = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function buildUstoreImageIO() {
  'use strict';

  const LOG_PREFIX = '[IMAGE_PIPELINE]';

  function nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
  }

  // 6-bo'lim (spec): faqat tashxis uchun kerakli, XAVFSIZ maydonlar log
  // qilinadi — stage, mime, size, duration, error.name, error.message,
  // qaysi read method ishlagani. HECH QACHON: base64, rasm baytlari,
  // secret, to'liq Telegram initData bu yerga uzatilmaydi/log qilinmaydi.
  function logStage(stage, meta) {
    try {
      const m = meta || {};
      const parts = [LOG_PREFIX, stage];
      if (m.mime) parts.push(`mime=${m.mime}`);
      if (Number.isFinite(m.size)) parts.push(`size=${m.size}`);
      if (Number.isFinite(m.duration)) parts.push(`duration=${Math.round(m.duration)}ms`);
      if (m.width) parts.push(`width=${m.width}`);
      if (m.height) parts.push(`height=${m.height}`);
      if (m.method) parts.push(`method=${m.method}`);
      if (m.name) parts.push(`name=${m.name}`);
      if (m.message) parts.push(`message=${String(m.message).slice(0, 200)}`);
      const line = parts.join(' ');
      const level = m.level || 'info';
      if (level === 'error' && typeof console.error === 'function') console.error(line);
      else if (level === 'warn' && typeof console.warn === 'function') console.warn(line);
      else if (typeof console.info === 'function') console.info(line);
    } catch (_) { /* logging never breaks the pipeline */ }
  }

  function stageError(stage, message, cause) {
    const err = new Error(message);
    err.stage = stage;
    err.code = stage;
    if (cause !== undefined) err.cause = cause;
    return err;
  }

  // FILEREADER_STARTED / FILEREADER_OK / FILEREADER_FAILED
  function readWithFileReader(blob, timeoutMs, onStage) {
    const stage = onStage || logStage;
    if (typeof FileReader === 'undefined') {
      return Promise.reject(stageError('FILEREADER_FAILED', 'filereader_unavailable'));
    }
    const started = nowMs();
    stage('FILEREADER_STARTED', { mime: blob?.type, size: blob?.size });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(() => {
        try { reader.abort(); } catch (_) {}
        stage('FILEREADER_FAILED', { duration: nowMs() - started, name: 'TimeoutError', message: 'blob_read_timeout', level: 'warn' });
        finish(reject, stageError('FILEREADER_FAILED', 'blob_read_timeout'));
      }, timeoutMs);
      reader.onload = () => {
        stage('FILEREADER_OK', { duration: nowMs() - started, mime: blob?.type, size: blob?.size });
        finish(resolve, reader.result);
      };
      reader.onerror = () => {
        const e = reader.error;
        stage('FILEREADER_FAILED', { duration: nowMs() - started, name: e?.name, message: e?.message || 'blob_read_failed', level: 'warn' });
        finish(reject, stageError('FILEREADER_FAILED', 'blob_read_failed', e));
      };
      reader.onabort = () => {
        stage('FILEREADER_FAILED', { duration: nowMs() - started, name: 'AbortError', message: 'blob_read_aborted', level: 'warn' });
        finish(reject, stageError('FILEREADER_FAILED', 'blob_read_aborted'));
      };
      try { reader.readAsArrayBuffer(blob); }
      catch (e) {
        stage('FILEREADER_FAILED', { duration: nowMs() - started, name: e?.name, message: e?.message, level: 'warn' });
        finish(reject, stageError('FILEREADER_FAILED', 'blob_read_failed', e));
      }
    });
  }

  // ARRAYBUFFER_FALLBACK_STARTED / ARRAYBUFFER_FALLBACK_OK / ARRAYBUFFER_FALLBACK_FAILED
  //
  // MUHIM TUZATISH: oldingi versiyada bu fallback HECH QANDAY timeout'siz
  // edi. Telegram WebView (ayniqsa Android'da content:// orqali tanlangan
  // rasmlarda) `blob.arrayBuffer()` ba'zida na resolve, na reject bo'lib,
  // abadiy osilib qolishi mumkin — bu paytda hech qanday xato ko'rsatilmaydi
  // VA hech qanday tarmoq so'rovi ham yuborilmaydi (chunki kod hali upload
  // bosqichigacha yetib bormagan bo'ladi). Bu ayni production'da kuzatilgan
  // "hech qanday request app-api Invocations'ga kelmagan" holatiga aynan mos
  // keladi. Endi bu yo'l ham FileReader kabi timeout bilan himoyalangan.
  function readWithArrayBufferFallback(blob, timeoutMs, onStage) {
    const stage = onStage || logStage;
    if (!blob || typeof blob.arrayBuffer !== 'function') {
      return Promise.reject(stageError('ARRAYBUFFER_FALLBACK_FAILED', 'blob_array_buffer_unavailable'));
    }
    const started = nowMs();
    stage('ARRAYBUFFER_FALLBACK_STARTED', { mime: blob?.type, size: blob?.size });
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        stage('ARRAYBUFFER_FALLBACK_FAILED', { duration: nowMs() - started, name: 'TimeoutError', message: 'blob_array_buffer_timeout', level: 'warn' });
        reject(stageError('ARRAYBUFFER_FALLBACK_FAILED', 'blob_array_buffer_timeout'));
      }, timeoutMs);
    });
    const attempt = Promise.resolve().then(() => blob.arrayBuffer()).then(
      (result) => {
        clearTimeout(timer);
        stage('ARRAYBUFFER_FALLBACK_OK', { duration: nowMs() - started, mime: blob?.type, size: blob?.size });
        return result;
      },
      (e) => {
        clearTimeout(timer);
        stage('ARRAYBUFFER_FALLBACK_FAILED', { duration: nowMs() - started, name: e?.name, message: e?.message, level: 'warn' });
        throw stageError('ARRAYBUFFER_FALLBACK_FAILED', 'blob_array_buffer_failed', e);
      }
    );
    return Promise.race([attempt, timeout]);
  }

  // Ikki HAQIQIY mustaqil urinish: (1) FileReader.readAsArrayBuffer PRIMARY,
  // (2) blob.arrayBuffer() mustaqil fallback — birinchisi yiqilgandan
  // (yoki timeout bo'lgandan) keyingina ishga tushadi, bir xil promise yoki
  // helper'ga bog'lanib qolmaydi. Ikkalasi ham yiqilsa/osilib qolsa
  // READ_BOTH_FAILED bilan aniq rad etiladi — chaqiruvchi tomon buni boshqa
  // bosqich (masalan compression) xatosi bilan aralashtirmaydi.
  async function readBlobAsArrayBuffer(blob, options) {
    const opts = options || {};
    const onStage = typeof opts.onStage === 'function' ? opts.onStage : logStage;
    const fileReaderTimeoutMs = Number.isFinite(opts.fileReaderTimeoutMs) ? opts.fileReaderTimeoutMs : 12000;
    const arrayBufferTimeoutMs = Number.isFinite(opts.arrayBufferTimeoutMs) ? opts.arrayBufferTimeoutMs : 15000;
    if (!blob) throw stageError('READ_BOTH_FAILED', 'blob_required');

    let firstError = null;
    try {
      return await readWithFileReader(blob, fileReaderTimeoutMs, onStage);
    } catch (e) { firstError = e; }

    try {
      return await readWithArrayBufferFallback(blob, arrayBufferTimeoutMs, onStage);
    } catch (secondError) {
      const err = stageError('READ_BOTH_FAILED', 'blob_read_failed_all_methods', secondError);
      err.firstError = firstError;
      onStage('READ_BOTH_FAILED', { name: secondError?.name, message: secondError?.message, level: 'error' });
      throw err;
    }
  }

  function makeDetachedImageFile(bytes, source) {
    const mimeType = String(source?.type || '').toLowerCase();
    const blob = new Blob([bytes], { type: mimeType });
    const name = String(source?.name || 'product-image').slice(0, 180);
    if (typeof File === 'function') {
      try { return new File([blob], name, { type: mimeType, lastModified: Date.now() }); } catch (_) {}
    }
    try { Object.defineProperty(blob, 'name', { value: name }); } catch (_) {}
    return blob;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize)));
    }
    const binary = chunks.join('');
    if (typeof btoa === 'function') return btoa(binary);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    throw new Error('base64_encoder_unavailable');
  }

  async function blobToBase64(blob) {
    return arrayBufferToBase64(await readBlobAsArrayBuffer(blob));
  }

  return Object.freeze({
    readBlobAsArrayBuffer,
    makeDetachedImageFile,
    arrayBufferToBase64,
    blobToBase64,
    logStage,
    stageError,
  });
});
