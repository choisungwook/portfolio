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
      const form = document.createElement('form');
      form.method = 'POST'; form.action = callback;
      for (const [name, value] of Object.entries({ state, token: result.token })) {
        const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
      }
      document.body.append(form);
      status.textContent = '토큰을 전달합니다. 실패하면 설정 화면에서 Rust CLI 토큰을 폐기하고 다시 로그인하세요.';
      form.submit();
    } catch (error) {
      status.textContent = error.message; button.disabled = false;
    }
  });
}
