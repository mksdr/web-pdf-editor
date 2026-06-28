import { PDFDocument, PDFName } from 'pdf-lib';
import JSZip from 'jszip';
import { showLoader, hideLoader, showAlert } from '../ui.js';
import { downloadFile, readFileAsArrayBuffer } from '../utils/helpers.js';
import { state } from '../state.js';

function getSanitizationOptions() {
    const removeMetadataCheckbox = document.getElementById('sanitize-remove-metadata') as HTMLInputElement | null;
    const removeAnnotationsCheckbox = document.getElementById('sanitize-remove-annotations') as HTMLInputElement | null;
    const flattenFormsCheckbox = document.getElementById('sanitize-flatten-forms') as HTMLInputElement | null;

    return {
        removeMetadata: removeMetadataCheckbox?.checked ?? true,
        removeAnnotations: removeAnnotationsCheckbox?.checked ?? true,
        flattenForms: flattenFormsCheckbox?.checked ?? false,
    };
}

function removeAllMetadata(pdfDoc: PDFDocument) {
    const infoDict = (pdfDoc as any).getInfoDict();
    const allKeys = infoDict.keys();
    allKeys.forEach((key: any) => {
        infoDict.delete(key);
    });

    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setCreator('');
    pdfDoc.setProducer('');
}

function removeAllAnnotations(pdfDoc: PDFDocument) {
    for (const page of pdfDoc.getPages()) {
        page.node.delete(PDFName.of('Annots'));
    }
}

function flattenAllForms(pdfDoc: PDFDocument) {
    const form = pdfDoc.getForm();
    form.flatten();
}

function buildSanitizedFilename(originalName: string) {
    const baseName = originalName.toLowerCase().endsWith('.pdf')
        ? originalName.slice(0, -4)
        : originalName;
    return `${baseName}-sanitized.pdf`;
}

async function sanitizeSingleFile(file: File, options: { removeMetadata: boolean; removeAnnotations: boolean; flattenForms: boolean; }) {
    const fileBuffer = await readFileAsArrayBuffer(file);
    const pdfDoc = await PDFDocument.load(fileBuffer as ArrayBuffer, {
        ignoreEncryption: true,
    });

    if (pdfDoc.isEncrypted) {
        throw new Error(`${file.name} is encrypted. Please decrypt it first.`);
    }

    if (options.removeMetadata) removeAllMetadata(pdfDoc);
    if (options.removeAnnotations) removeAllAnnotations(pdfDoc);
    if (options.flattenForms) flattenAllForms(pdfDoc);

    const bytes = await pdfDoc.save();
    return {
        fileName: buildSanitizedFilename(file.name),
        bytes,
    };
}

export async function sanitizePdf() {
    if (state.files.length === 0) {
        showAlert('No Files', 'Please select one or more PDF files.');
        return;
    }

    const options = getSanitizationOptions();
    if (!options.removeMetadata && !options.removeAnnotations && !options.flattenForms) {
        showAlert('No Options Selected', 'Please select at least one sanitization option.');
        return;
    }

    showLoader('Sanitizing PDF files...');
    try {
        const sanitizedResults = [];
        for (const file of state.files as File[]) {
            sanitizedResults.push(await sanitizeSingleFile(file, options));
        }

        if (sanitizedResults.length === 1) {
            const onlyResult = sanitizedResults[0];
            downloadFile(new Blob([onlyResult.bytes], { type: 'application/pdf' }), onlyResult.fileName);
            return;
        }

        const zip = new JSZip();
        sanitizedResults.forEach(result => {
            zip.file(result.fileName, result.bytes);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadFile(zipBlob, 'sanitized-pdfs.zip');
    } catch (e) {
        console.error(e);
        showAlert('Error', e.message || 'Failed to sanitize one or more PDF files.');
    } finally {
        hideLoader();
    }
}
