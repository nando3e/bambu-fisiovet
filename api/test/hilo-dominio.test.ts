// Adjuntos: tipo por contenido, nunca por la extensión. Puro.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nombreSeguro, tipoDeAdjunto } from '../src/ficheros/adjuntos.ts';

const b = (...bytes: number[]) => Buffer.from([...bytes, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.7\n...');
const JPG = b(0xff, 0xd8, 0xff, 0xe0);
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]);
const OLE = b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const ZIP = b(0x50, 0x4b, 0x03, 0x04);
const EXE = b(0x4d, 0x5a, 0x90, 0x00);

test('adjuntos: se reconocen por el contenido', () => {
  assert.equal(tipoDeAdjunto(PDF, 'informe.pdf'), 'pdf');
  assert.equal(tipoDeAdjunto(PDF, 'sense-extensio'), 'pdf');
  assert.equal(tipoDeAdjunto(JPG, 'foto.png'), 'jpg');
  assert.equal(tipoDeAdjunto(PNG, 'rx.png'), 'png');
  assert.equal(tipoDeAdjunto(WEBP, 'x.webp'), 'webp');
  assert.equal(tipoDeAdjunto(OLE, 'analitica.DOC'), 'doc');
  assert.equal(tipoDeAdjunto(ZIP, 'pla.docx'), 'docx');
  assert.equal(tipoDeAdjunto(ZIP, 'pesos.xlsx'), 'xlsx');
  assert.equal(tipoDeAdjunto(ZIP, 'proves.zip'), 'zip');
});

test('adjuntos: un ejecutable disfrazado, un ZIP con otra extensión o texto plano no pasan', () => {
  assert.equal(tipoDeAdjunto(EXE, 'radiografia.pdf'), null);
  assert.equal(tipoDeAdjunto(ZIP, 'informe.pdf'), null);
  assert.equal(tipoDeAdjunto(OLE, 'x.xls'), null);
  assert.equal(tipoDeAdjunto(Buffer.from('hola, soc un text'), 'nota.txt'), null);
  assert.equal(tipoDeAdjunto(Buffer.alloc(0), 'buit.pdf'), null);
});

test('adjuntos: el nombre original se sanea para la cabecera', () => {
  assert.equal(nombreSeguro(String.raw`C:\fotos\rx "dreta".jpg`), 'rx dreta.jpg');
  assert.equal(nombreSeguro('../../etc/passwd'), 'passwd');
  assert.equal(nombreSeguro(''), 'fitxer');
});
