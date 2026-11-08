'use strict';

window.api.previewImage().then((dataUrl) => {
  document.getElementById('shot').src = dataUrl;
});

document.getElementById('save').addEventListener('click', () => window.api.savePreview());
document.getElementById('copy').addEventListener('click', () => window.api.copyPreview());
document.getElementById('edit').addEventListener('click', () => window.api.editPreview());
document.getElementById('close').addEventListener('click', () => window.api.closePreview());
