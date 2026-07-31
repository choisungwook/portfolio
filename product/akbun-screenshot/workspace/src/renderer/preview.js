'use strict';

const file = new URLSearchParams(location.search).get('file');
document.getElementById('shot').src = `file://${encodeURI(file)}`;

document.getElementById('save').addEventListener('click', () => window.api.savePreview());
document.getElementById('delete').addEventListener('click', () => window.api.deletePreview());
