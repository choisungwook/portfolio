const button = document.querySelector('#login');
const status = document.querySelector('#status');
const params = new URLSearchParams(location.search);
const port = params.get('port');
const state = params.get('state');
if (!/^\d{1,5}$/.test(port || '') || Number(port) < 1024 || Number(port) > 65535 || !/^[a-f0-9]{64}$/.test(state || '')) {
  status.textContent = '잘못된 로그인 주소입니다. CLI에서 다시 시작하세요.';
} else {
  const callback = `http://127.0.0.1:${port}/callback`;
  document.querySelector('#destination').textContent = `토큰 전달 위치: ${callback}`;
  button.disabled = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const response = await fetch('/api/tokens', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Rust CLI' }) });
      if (!response.ok) throw new Error('Access 로그인과 토큰 발급 권한을 확인하세요.');
      const result = await response.json();
      const delivered = await fetch(callback, {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        body: new URLSearchParams({ state, token: result.token }),
      });
      if (!delivered.ok) throw new Error('CLI 전달 실패. 설정에서 Rust CLI 토큰을 폐기하고 다시 로그인하세요.');
      status.textContent = 'CLI 로그인을 완료했습니다. 이 창을 닫아도 됩니다.';
    } catch (error) {
      status.textContent = error.message + ' 토큰이 발급됐다면 설정에서 폐기 후 다시 시작하세요.';
    }
  });
}
