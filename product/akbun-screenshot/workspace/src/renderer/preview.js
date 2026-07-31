'use strict';

const file = new URLSearchParams(location.search).get('file');
document.getElementById('shot').src = `file://${encodeURI(file)}`;

document.getElementById('save').addEventListener('click', () => window.api.savePreview());
document.getElementById('copy').addEventListener('click', () => window.api.copyPreview());
document.getElementById('close').addEventListener('click', () => window.api.closePreview());
