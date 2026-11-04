// Vehicle switcher: arrow keys move between tabs; without script every panel shows.
document.querySelectorAll('[role="tablist"]').forEach((list) => {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
});

// Booking form: checks the dates, then says plainly that nothing was sent until an endpoint is wired.
document.querySelectorAll('form[data-endpoint]').forEach((form) => {
  const pickup = form.querySelector('#pickup');
  const ret = form.querySelector('#return');
  const help = form.querySelector('[aria-live]');
  const today = new Date().toISOString().slice(0, 10);
  pickup.min = today;
  ret.min = today;
  pickup.addEventListener('change', () => { ret.min = pickup.value || today; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    [pickup, ret].forEach((f) => f.removeAttribute('aria-invalid'));
    let bad = null;
    if (!pickup.value) { bad = pickup; help.textContent = '받는 날을 골라 주세요.'; }
    else if (!ret.value) { bad = ret; help.textContent = '돌려주는 날을 골라 주세요.'; }
    else if (ret.value <= pickup.value) { bad = ret; help.textContent = '돌려주는 날은 받는 날보다 뒤여야 합니다.'; }
    if (bad) { bad.setAttribute('aria-invalid', ''); bad.focus(); return; }
    if (!form.dataset.endpoint) { help.textContent = '아직 예약 시스템이 연결되지 않아 아무것도 전송되지 않았습니다.'; return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.setAttribute('aria-busy', 'true');
    fetch(form.dataset.endpoint, { method: 'POST', body: new FormData(form) })
      .then((r) => { help.textContent = r.ok ? '요청을 받았습니다. 확인 후 연락드립니다.' : '전송되지 않았습니다. 잠시 뒤 다시 시도해 주세요.'; })
      .catch(() => { help.textContent = '전송되지 않았습니다. 잠시 뒤 다시 시도해 주세요.'; })
      .finally(() => btn.removeAttribute('aria-busy'));
  });
});
