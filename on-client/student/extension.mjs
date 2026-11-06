// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView({ api, onChange } = {}) {
  // ===== 내 PC 추이 비교 (최종전-2) =====
  // 값은 제공된 「내 PC 상태」(/api/pc/status)가 이 PC에서 잰 실측만 쓴다. 여기서 CPU·메모리·디스크를 새로 재지 않는다.
  // 버튼을 누를 때만 한 번 읽고, 받은 값을 이 화면에 최대 20건 쌓아 직전 값과 비교한다. 예시 값은 쓰지 않는다.
  const PC_PATH = '/api/pc/status';
  const PC_MAX = 20;
  const PC_STALE_MS = 60000;
  const PC_REASONS = {
    permission_denied: '읽기 권한이 없습니다 (관리자 권한으로 바꾸지 않습니다)',
    unsupported: '이 운영체제에서는 이 항목을 조회하지 않습니다',
    timeout: '조회 시간이 초과됐습니다',
    query_failed: '조회에 실패했습니다',
    invalid_response: '응답 값을 확인할 수 없습니다',
    invalid_sample: 'CPU 표본이 올바르지 않습니다',
    cancelled: '조회가 취소됐습니다',
  };
  const BARS = '▁▂▃▄▅▆▇█';
  const pcHistory = [];
  let pcBusy = false;
  let pcMessage = '';
  let pcRefocus = false;
  let pcFocus = 'trend';
  const pcEl = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== '') node.textContent = String(text);
    if (cls) node.className = cls;
    return node;
  };
  const pcNum = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const pcGb = (n) => (n / 1024 ** 3).toFixed(1);
  const pcTime = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString('ko-KR') : '확인 불가');
  const pcMissing = (reason) => ({ ok: false, reason });
  const pcReason = (metric) => PC_REASONS[metric?.reason] ?? '이번 조회에서 값을 확인하지 못했습니다';

  // ===== 최종전-4: 다시 조회 · 조회 중 표시 · 실패한 항목과 다음에 할 일 =====
  // 실패했을 때 예시 값으로 채우지 않는다. 어떤 항목이 왜 실패했는지와 다음에 할 일만 보여 준다.
  const PC_NEXT = {
    permission_denied: '일반 권한으로는 읽을 수 없는 항목입니다. 관리자 권한으로 바꾸지 말고 「확인 불가」로 두세요. 다른 항목은 그대로 볼 수 있습니다.',
    unsupported: '이 PC에서는 조회하지 않는 항목입니다. 다른 항목으로 확인하세요.',
    timeout: '잠시 뒤 「다시 조회」를 눌러 주세요.',
    query_failed: '잠시 뒤 「다시 조회」를 눌러 주세요.',
    invalid_response: '「다시 조회」를 눌러 주세요. 계속되면 이 항목은 「확인 불가」로 두세요.',
    invalid_sample: '「다시 조회」를 눌러 주세요. 계속되면 이 항목은 「확인 불가」로 두세요.',
    cancelled: '「다시 조회」를 눌러 주세요.',
  };
  const pcNext = (reason) => {
    const code = Object.keys(PC_REASONS).find((key) => PC_REASONS[key] === reason);
    if (code && PC_NEXT[code]) return PC_NEXT[code];
    if (String(reason).includes('60초')) return '「다시 조회」를 눌러 새로 읽어 주세요.';
    return '「다시 조회」를 눌러 주세요. 계속 실패하면 앱이 켜져 있고 연결돼 있는지 확인해 주세요.';
  };
  // 버튼 글자: 처음엔 「조회」, 한 번 읽은 뒤엔 「다시 조회」, 읽는 동안엔 「조회 중…」
  const pcButtonText = (suffix) => (pcBusy ? '조회 중…' : `${pcHistory.length > 0 ? '다시 조회' : '조회'}${suffix}`);
  // 읽는 동안 보이는 대기 표시(진행 막대). 조회 중이 아니면 없다.
  const pcWait = () => {
    if (!pcBusy) return null;
    const bar = pcEl('progress');
    bar.setAttribute('aria-label', '조회 중');
    return bar;
  };
  // 마지막 조회에서 못 읽은 항목과 다음에 할 일. 조회 중이거나 실패가 없으면 null.
  function pcFailBox(items) {
    const latest = pcHistory.at(-1);
    if (!latest || pcBusy) return null;
    const rows = [];
    if (latest.state !== 'ok') rows.push(['조회 전체', latest.reason]);
    else for (const [key, label] of items) if (!latest[key]?.ok) rows.push([label, latest[key]?.reason ?? '이번 조회에서 값을 확인하지 못했습니다']);
    if (rows.length === 0) return null;
    const box = pcEl('div', '', 'pc-fail');
    box.dataset.state = 'failed';
    box.appendChild(pcEl('h4', '실패한 항목과 다음에 할 일'));
    const list = pcEl('ul');
    for (const [label, reason] of rows) list.appendChild(pcEl('li', `${label} — 이유: ${reason} / 다음에 할 일: ${pcNext(reason)}`));
    box.appendChild(list);
    return box;
  }

  function pcReadMetrics(metrics) {
    const cpu = metrics?.cpu;
    const mem = metrics?.memory;
    const disk = metrics?.disk;
    const badValue = '응답의 값이나 단위를 확인할 수 없습니다';
    return {
      cpu: cpu?.state === 'ok' && pcNum(cpu.usagePercent) && cpu.usagePercent <= 100
        ? { ok: true, value: cpu.usagePercent, text: `${cpu.usagePercent.toFixed(1)} %`, ratio: cpu.usagePercent / 100 }
        : pcMissing(cpu?.state === 'ok' ? badValue : pcReason(cpu)),
      memory: mem?.state === 'ok' && pcNum(mem.usedBytes) && pcNum(mem.totalBytes) && mem.totalBytes > 0 && mem.usedBytes <= mem.totalBytes
        ? { ok: true, value: mem.usedBytes / 1024 ** 3, text: `${pcGb(mem.usedBytes)} GB / ${pcGb(mem.totalBytes)} GB`, ratio: mem.usedBytes / mem.totalBytes }
        : pcMissing(mem?.state === 'ok' ? badValue : pcReason(mem)),
      disk: disk?.state === 'ok' && pcNum(disk.freeBytes) && pcNum(disk.totalBytes) && disk.totalBytes > 0 && disk.freeBytes <= disk.totalBytes
        ? { ok: true, value: disk.freeBytes / 1024 ** 3, text: `${pcGb(disk.freeBytes)} GB 여유 / ${pcGb(disk.totalBytes)} GB`, ratio: disk.freeBytes / disk.totalBytes }
        : pcMissing(disk?.state === 'ok' ? badValue : pcReason(disk)),
    };
  }

  // 네트워크·방화벽·Windows 기록: 같은 응답(/api/pc/status)의 값을 읽기만 한다. 설정을 바꾸는 호출은 없다.
  function pcReadSecurity(metrics) {
    const net = metrics?.network;
    const fw = metrics?.firewall;
    const ev = metrics?.events;
    const count = (n) => Number.isSafeInteger(n) && n >= 0;
    const badValue = '응답의 값이나 단위를 확인할 수 없습니다';
    const names = ['Domain', 'Private', 'Public'];
    const profiles = Array.isArray(fw?.profiles) ? fw.profiles : [];
    const fwOk = fw?.state === 'ok' && profiles.length === 3
      && names.every((name) => profiles.some((p) => p?.name === name && typeof p.enabled === 'boolean'));
    return {
      network: net?.state === 'ok' && count(net.interfaceCount) && count(net.ipv4Count)
        ? { ok: true, text: `인터페이스 ${net.interfaceCount}개 · IPv4 구성 ${net.ipv4Count}개` }
        : pcMissing(net?.state === 'ok' ? badValue : pcReason(net)),
      firewall: fwOk
        ? {
          ok: true,
          offCount: names.filter((name) => !profiles.find((p) => p.name === name).enabled).length,
          text: names.map((name) => `${name} ${profiles.find((p) => p.name === name).enabled ? '켜짐' : '꺼짐'}`).join(' · '),
        }
        : pcMissing(fw?.state === 'ok' ? badValue : pcReason(fw)),
      events: ev?.state === 'ok' && count(ev.warningCount) && count(ev.errorCount) && ev.warningCount + ev.errorCount <= 5000 && ev.sampleLimit === 5000 && typeof ev.truncated === 'boolean'
        ? {
          ok: true,
          warning: ev.warningCount,
          error: ev.errorCount,
          truncated: ev.truncated,
          text: `경고 ${ev.warningCount}건 · 오류 ${ev.errorCount}건${ev.truncated ? ' (일부 집계)' : ''}`,
        }
        : pcMissing(ev?.state === 'ok' ? badValue : pcReason(ev)),
    };
  }

  function pcParse(result, now) {
    if (!result || result.ok !== true) {
      return { state: 'failed', at: now, reason: `조회 요청이 실패했습니다${result?.error?.code ? ` (${String(result.error.code)})` : ''}` };
    }
    const data = result.data;
    const measured = typeof data?.measuredAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(data.measuredAt) ? Date.parse(data.measuredAt) : NaN;
    if (data?.schema !== 'aleph.on.pc-status.v1' || data.source !== 'local-pc' || !Number.isFinite(measured)) {
      return { state: 'failed', at: now, reason: '응답 형식이나 측정 시각을 확인할 수 없습니다' };
    }
    if (Math.abs(now - measured) > PC_STALE_MS) {
      return { state: 'stale', at: measured, reason: '측정 시각이 60초보다 오래돼 현재 상태로 쓰지 않습니다' };
    }
    return { state: 'ok', at: measured, ...pcReadMetrics(data.metrics), ...pcReadSecurity(data.metrics) };
  }

  async function pcRead(target = 'trend') {
    if (pcBusy || !api || typeof api.get !== 'function') return;
    pcBusy = true;
    pcRefocus = true;
    pcFocus = target;
    pcMessage = '이 PC에서 읽는 중…';
    if (typeof onChange === 'function') onChange();
    let entry;
    try {
      entry = pcParse(await api.get(PC_PATH), Date.now());
    } catch {
      entry = { state: 'failed', at: Date.now(), reason: '조회 중 오류가 발생했습니다' };
    }
    pcHistory.push(entry);
    if (pcHistory.length > PC_MAX) pcHistory.shift();
    pcBusy = false;
    pcMessage = entry.state === 'ok' ? `마지막 실측 ${pcTime(entry.at)}` : `확인 불가: ${entry.reason}`;
    if (typeof onChange === 'function') onChange();
  }

  // 직전에 읽은 값(확인 불가였던 기록은 건너뛴다)
  function pcPrevious(key) {
    for (let i = pcHistory.length - 2; i >= 0; i -= 1) {
      const entry = pcHistory[i];
      if (entry.state === 'ok' && entry[key]?.ok) return entry;
    }
    return null;
  }

  function pcDelta(key, unit) {
    const latest = pcHistory.at(-1);
    if (!latest || latest.state !== 'ok' || !latest[key]?.ok) return '직전 대비: 확인 불가';
    const before = pcPrevious(key);
    if (!before) return '직전 대비: 비교할 직전 값이 없습니다';
    const diff = Math.round((latest[key].value - before[key].value) * 10) / 10;
    const base = `비교 기준 ${pcTime(before.at)}`;
    if (diff === 0) return `직전 대비: 변화 없음 (${base})`;
    return `직전 대비: ${diff > 0 ? '▲ +' : '▼ '}${diff.toFixed(1)} ${unit} (${base})`;
  }

  function pcBar(key) {
    return pcHistory.map((entry) => {
      const metric = entry.state === 'ok' ? entry[key] : null;
      if (!metric?.ok) return '·';
      return BARS[Math.min(BARS.length - 1, Math.floor(metric.ratio * BARS.length))];
    }).join('');
  }

  function buildPcTrend() {
    const el = (tag, text, cls) => {
      const node = document.createElement(tag);
      if (text !== undefined && text !== '') node.textContent = String(text);
      if (cls) node.className = cls;
      return node;
    };
    const root = el('section', '', 'pc-trend');
    const title = el('h3', '내 PC 추이 비교 ');
    title.appendChild(el('span', 'student/extension.mjs · 추이 비교', 'tag tag-student'));
    root.appendChild(title);
    root.appendChild(el('p', '값은 제공된 「내 PC 상태」(/api/pc/status)가 이 PC에서 실제로 잰 값입니다. 여기서 CPU·메모리·디스크를 다시 재지 않고, 버튼을 누를 때 받은 값을 쌓아 직전 값과 비교합니다. 예시 값은 쓰지 않습니다. 한 번 조회에서 받은 값은 서버가 시각을 하나만 주므로 같은 시각으로 표시합니다. 기록은 화면을 새로고침하면 사라집니다(최대 20건).', 'muted'));

    const canRead = Boolean(api) && typeof api.get === 'function';
    // 키보드로 계속 쓸 수 있게, 조회 중에도 버튼은 초점을 받는다(aria-disabled). 중복 실행은 pcRead 가 막는다.
    const button = el('button', pcButtonText(' (내 PC 값 비교)'), 'btn');
    button.type = 'button';
    button.disabled = !canRead;
    button.setAttribute('aria-disabled', String(pcBusy || !canRead));
    button.addEventListener('click', () => { void pcRead('trend'); });
    root.appendChild(button);
    const wait = pcWait();
    if (wait) root.appendChild(wait);
    const status = el('p', canRead ? (pcMessage || '아직 조회하지 않았습니다.') : '이 실행에서는 조회 연결(api)을 받지 못했습니다.', 'muted');
    if (pcFocus === 'trend') status.setAttribute('role', 'status');
    root.appendChild(status);
    const failBox = pcFailBox([['cpu', 'CPU 사용률'], ['memory', '메모리 사용량'], ['disk', '디스크 남은 공간']]);
    if (failBox) root.appendChild(failBox);

    const latest = pcHistory.at(-1);
    // 카드 4개는 표의 한 줄 4칸으로 만든다(별도 CSS 없이 가로로 나란히). 모양은 표 속성으로만 정한다.
    const cardTable = el('table', '', 'pc-trend-cards');
    cardTable.setAttribute('width', '100%');
    cardTable.setAttribute('border', '1');
    cardTable.setAttribute('cellpadding', '8');
    cardTable.setAttribute('cellspacing', '0');
    const cardBody = el('tbody');
    const cards = el('tr');
    cardBody.appendChild(cards);
    cardTable.appendChild(cardBody);
    const cardCell = () => {
      const cell = el('td', '', 'pc-trend-card');
      cell.setAttribute('width', '25%');
      cell.setAttribute('valign', 'top');
      return cell;
    };
    const metricCard = (label, key, unit) => {
      const card = cardCell();
      card.appendChild(el('h4', label));
      if (pcBusy) {
        card.dataset.state = 'busy';
        card.appendChild(el('p', '조회 중…', 'pc-trend-value'));
        card.appendChild(el('p', '이전 값은 새 조회가 끝날 때까지 가립니다.', 'muted'));
      } else if (!latest) {
        card.dataset.state = 'empty';
        card.appendChild(el('p', '아직 조회 전', 'pc-trend-value'));
      } else if (latest.state === 'ok' && latest[key].ok) {
        card.dataset.state = 'measured';
        card.appendChild(el('p', latest[key].text, 'pc-trend-value'));
        card.appendChild(el('p', `실측 · 잰 시각 ${pcTime(latest.at)}`, 'muted'));
        card.appendChild(el('p', pcDelta(key, unit), 'muted'));
      } else {
        card.dataset.state = 'unavailable';
        card.appendChild(el('p', '확인 불가', 'pc-trend-value'));
        card.appendChild(el('p', `이유: ${latest.state === 'ok' ? latest[key].reason : latest.reason}`, 'muted'));
        card.appendChild(el('p', `조회 시각 ${pcTime(latest.at)}`, 'muted'));
      }
      return card;
    };
    cards.appendChild(metricCard('CPU 사용률 (%)', 'cpu', '%p'));
    cards.appendChild(metricCard('메모리 사용량 (GB)', 'memory', 'GB'));
    cards.appendChild(metricCard('디스크 남은 공간 (GB)', 'disk', 'GB'));
    const stateCard = cardCell();
    stateCard.appendChild(el('h4', '조회 상태'));
    if (pcBusy) {
      stateCard.dataset.state = 'busy';
      stateCard.appendChild(el('p', '조회 중…', 'pc-trend-value'));
    } else if (!latest) {
      stateCard.dataset.state = 'empty';
      stateCard.appendChild(el('p', '아직 조회 전', 'pc-trend-value'));
    } else if (latest.state === 'ok') {
      const readable = ['cpu', 'memory', 'disk'].filter((key) => latest[key].ok).length;
      stateCard.dataset.state = readable === 3 ? 'measured' : 'unavailable';
      stateCard.appendChild(el('p', readable === 3 ? '실측 성공' : '일부 확인 불가', 'pc-trend-value'));
      stateCard.appendChild(el('p', `3개 중 ${readable}개 읽음 · ${pcTime(latest.at)}`, 'muted'));
    } else {
      stateCard.dataset.state = 'unavailable';
      stateCard.appendChild(el('p', '확인 불가', 'pc-trend-value'));
      stateCard.appendChild(el('p', `이유: ${latest.reason}`, 'muted'));
    }
    stateCard.appendChild(el('p', `쌓인 기록 ${pcHistory.length}건`, 'muted'));
    cards.appendChild(stateCard);
    root.appendChild(cardTable);

    root.appendChild(el('h4', '최근 추이 (왼쪽 오래됨 → 오른쪽 최근, · 은 확인 불가)'));
    if (pcHistory.length === 0) {
      root.appendChild(el('p', '아직 기록이 없습니다. 위 버튼을 눌러 주세요.', 'muted'));
    } else {
      const lines = [
        `CPU 사용률 (0~100 %)      ${pcBar('cpu')}`,
        `메모리 사용 비율          ${pcBar('memory')}`,
        `디스크 여유 비율          ${pcBar('disk')}`,
      ];
      root.appendChild(el('pre', lines.join('\n'), 'pc-trend-bars'));
    }

    root.appendChild(el('h4', '기록 (최근이 위)'));
    const scroll = el('div', '', 'pc-trend-scroll');
    const table = el('table', '', 'pc-trend-table');
    table.setAttribute('width', '100%');
    table.setAttribute('border', '1');
    table.setAttribute('cellpadding', '6');
    table.setAttribute('cellspacing', '0');
    const head = el('tr');
    for (const name of ['시각', 'CPU 사용률 (%)', '메모리 사용 (GB)', '디스크 여유 (GB)', '상태']) {
      const th = el('th', name);
      th.scope = 'col';
      head.appendChild(th);
    }
    const thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const entry of [...pcHistory].reverse()) {
      const row = el('tr');
      row.appendChild(el('td', pcTime(entry.at)));
      const reasons = [];
      for (const key of ['cpu', 'memory', 'disk']) {
        const ok = entry.state === 'ok' && entry[key].ok;
        row.appendChild(el('td', ok ? entry[key].text : '확인 불가'));
        if (!ok) reasons.push(entry.state === 'ok' ? entry[key].reason : entry.reason);
      }
      let statusText = '실측';
      if (reasons.length > 0) statusText = `확인 불가: ${[...new Set(reasons)].join(' / ')}`;
      row.appendChild(el('td', statusText));
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    root.appendChild(scroll);

    if (pcRefocus && canRead && pcFocus === 'trend') {
      if (!pcBusy) pcRefocus = false;
      setTimeout(() => { if (button.isConnected) button.focus(); }, 0);
    }
    return root;
  }

  // ===== ② 서비스 연결·사용량·비용 (연결 전 화면, 최종전-1) =====
  // 아직 어떤 서비스에도 연결하지 않았다. 조회·fetch·비밀값 입력은 없고, 모든 칸은 「연결 전 · 확인 불가」다.
  // 0원·정상·안전·예시 값은 쓰지 않는다. 실제 연결은 서버 쪽 읽기 전용 조회와 비밀값이 필요해 이 파일만으로는 하지 않는다.
  // 「조회」 버튼은 서버나 서비스에 요청을 보내지 않는다(연결된 서비스가 없다). 누른 시각과 「조회하지 못함」 결과만 보여 준다.
  let svcCheckedAt = null;
  let svcRefocus = false;
  function buildServiceBefore() {
    const el = pcEl;
    const root = el('section', '', 'service-before');
    const title = el('h3', '② 서비스 연결·사용량·비용 ');
    title.appendChild(el('span', 'student/extension.mjs · 연결 전', 'tag tag-student'));
    root.appendChild(title);
    root.appendChild(el('p', '상태: 연결 전 · 아직 연결하지 않음', 'service-before-state'));
    root.appendChild(el('p', '아직 어떤 서비스도 연결하지 않았고 아무것도 조회하지 않았습니다. 그래서 아래 칸은 모두 「연결 전 · 확인 불가」입니다. 값이 없다는 것이지 0원이거나 정상·안전하다는 뜻이 아닙니다. 예시 값도 쓰지 않습니다.', 'muted'));

    const button = el('button', svcCheckedAt === null ? '조회' : '다시 조회', 'btn');
    button.type = 'button';
    button.addEventListener('click', () => {
      svcCheckedAt = Date.now();
      svcRefocus = true;
      if (typeof onChange === 'function') onChange();
    });
    root.appendChild(button);
    const status = el('p', svcCheckedAt === null ? '아직 조회하지 않았습니다.' : `조회하지 못함: 연결된 서비스가 없습니다 (확인한 시각 ${pcTime(svcCheckedAt)})`, 'muted');
    status.setAttribute('role', 'status');
    root.appendChild(status);
    if (svcCheckedAt !== null) {
      const box = el('div', '', 'service-fail');
      box.dataset.state = 'failed';
      box.appendChild(el('h4', '실패한 항목과 다음에 할 일'));
      const list = el('ul');
      list.appendChild(el('li', '서비스 연결·사용량·비용 전체 — 이유: 연결된 서비스가 없어 조회하지 못했습니다. 값은 0원도 정상도 아니고 「확인 불가」입니다. / 다음에 할 일: 서비스 1개를 정하고, 서버 쪽에서 읽기 전용으로 연결한 뒤 「다시 조회」를 눌러 주세요.'));
      box.appendChild(list);
      root.appendChild(box);
    }

    const table = el('table', '', 'service-before-table');
    table.setAttribute('width', '100%');
    table.setAttribute('border', '1');
    table.setAttribute('cellpadding', '8');
    table.setAttribute('cellspacing', '0');
    const head = el('thead');
    const headRow = el('tr');
    for (const name of ['항목', '값', '왜 이렇게 보이나']) {
      const th = el('th', name);
      th.setAttribute('scope', 'col');
      th.setAttribute('align', 'left');
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    table.appendChild(head);
    const body = el('tbody');
    const rows = [
      ['서비스 이름', '선택 전', '연결할 서비스를 아직 정하지 않았습니다. 가이드는 서비스 1개부터 권장합니다.'],
      ['연결 상태', '연결 전 · 확인 불가', '연결하지 않았으므로 상태를 읽지 않았습니다.'],
      ['관측한 계정 보안 항목', '연결 전 · 확인 불가', '조회하지 않은 항목은 안전으로 판정하지 않습니다.'],
      ['사용량', '연결 전 · 확인 불가', '서비스가 알려 준 값이 없습니다.'],
      ['월 비용', '연결 전 · 확인 불가', '금액을 확인하지 못했습니다. 0원이 아닙니다. 청구월·통화·집계 기간·출처도 없습니다.'],
      ['취약점 근거', '연결 전 · 확인 불가', '조회하지 않았으므로 「발견 없음」이 아닙니다.'],
    ];
    for (const [name, value, why] of rows) {
      const tr = el('tr');
      tr.dataset.state = 'before';
      const th = el('th', name);
      th.setAttribute('scope', 'row');
      th.setAttribute('align', 'left');
      tr.appendChild(th);
      tr.appendChild(el('td', value));
      tr.appendChild(el('td', why, 'muted'));
      body.appendChild(tr);
    }
    table.appendChild(body);
    root.appendChild(table);

    const next = el('p', '', 'muted');
    next.appendChild(el('strong', '다음에 할 일: '));
    next.appendChild(document.createTextNode('서비스 1개를 정하고, 서버 쪽에서 읽기 전용으로 연결해야 값이 나옵니다. 비밀값(API 키 등)은 화면·브라우저·제출물에 넣지 않습니다. 이 화면은 연결 전까지만 만들었습니다.'));
    root.appendChild(next);
    if (svcRefocus) {
      svcRefocus = false;
      setTimeout(() => { if (button.isConnected) button.focus(); }, 0);
    }
    return root;
  }

  // 맨 위 카드 4개(네트워크·방화벽·Windows 기록·SDP 연결), 아래 추이와 기록. 읽기만 하며 설정을 바꾸지 않는다.
  function buildPcSecurity(mode) {
    const el = pcEl;
    const root = el('section', '', 'pc-security');
    const title = el('h3', '내 PC 네트워크·방화벽·Windows 기록 ');
    title.appendChild(el('span', 'student/extension.mjs · 보안 상태 보기', 'tag tag-student'));
    root.appendChild(title);
    root.appendChild(el('p', '이 화면의 경고·오류 건수는 침해나 공격을 탐지한 결과가 아닙니다. 최근 24시간 Windows 기록(System·Application)에 남은 경고·오류의 개수일 뿐이며 원인은 알려 주지 않습니다. 방화벽이 켜져 있다는 것도 안전하다는 판정이 아닙니다. 이 화면은 읽기만 하며 방화벽·보안 설정을 바꾸지 않습니다. 관리자 권한이 있어야 읽을 수 있는 항목은 바꾸려 하지 않고 「확인 불가」와 이유로 보여 줍니다. 아래 값은 모두 이 PC에서 잰 실측이며 예시 값은 쓰지 않습니다. SDP 연결 상태는 PC 조회와 별개로 따로 보여 줍니다.', 'muted'));

    const canRead = Boolean(api) && typeof api.get === 'function';
    const button = el('button', pcButtonText(' (읽기만)'), 'btn');
    button.type = 'button';
    button.disabled = !canRead;
    button.setAttribute('aria-disabled', String(pcBusy || !canRead));
    button.addEventListener('click', () => { void pcRead('security'); });
    root.appendChild(button);
    const wait = pcWait();
    if (wait) root.appendChild(wait);
    const status = el('p', canRead ? (pcMessage || '아직 조회하지 않았습니다.') : '이 실행에서는 조회 연결(api)을 받지 못했습니다.', 'muted');
    if (pcFocus === 'security') status.setAttribute('role', 'status');
    root.appendChild(status);
    const failBox = pcFailBox([['network', '네트워크 구성'], ['firewall', '방화벽 설정'], ['events', 'Windows 기록']]);
    if (failBox) root.appendChild(failBox);

    const latest = pcHistory.at(-1);
    const cardTable = el('table', '', 'pc-security-cards');
    cardTable.setAttribute('width', '100%');
    cardTable.setAttribute('border', '1');
    cardTable.setAttribute('cellpadding', '8');
    cardTable.setAttribute('cellspacing', '0');
    const cardBody = el('tbody');
    const cards = el('tr');
    cardBody.appendChild(cards);
    cardTable.appendChild(cardBody);
    const cell = () => {
      const td = el('td', '', 'pc-security-card');
      td.setAttribute('width', '25%');
      td.setAttribute('valign', 'top');
      return td;
    };
    const metricCard = (label, key, note) => {
      const card = cell();
      card.appendChild(el('h4', label));
      if (pcBusy) {
        card.dataset.state = 'busy';
        card.appendChild(el('p', '조회 중…', 'pc-security-value'));
        card.appendChild(el('p', '이전 값은 새 조회가 끝날 때까지 가립니다.', 'muted'));
      } else if (!latest) {
        card.dataset.state = 'empty';
        card.appendChild(el('p', '아직 조회 전', 'pc-security-value'));
      } else if (latest.state === 'ok' && latest[key]?.ok) {
        card.dataset.state = 'measured';
        card.appendChild(el('p', latest[key].text, 'pc-security-value'));
        card.appendChild(el('p', `실측 · 잰 시각 ${pcTime(latest.at)}`, 'muted'));
        card.appendChild(el('p', typeof note === 'function' ? note(latest[key]) : note, 'muted'));
      } else {
        card.dataset.state = 'unavailable';
        card.appendChild(el('p', '확인 불가', 'pc-security-value'));
        card.appendChild(el('p', `이유: ${latest.state === 'ok' ? latest[key].reason : latest.reason}`, 'muted'));
        card.appendChild(el('p', `조회 시각 ${pcTime(latest.at)}`, 'muted'));
      }
      return card;
    };
    cards.appendChild(metricCard('네트워크 구성', 'network', '로컬 구성 요약입니다. 인터넷 접속이나 ZTNA 허용을 확인한 결과는 아닙니다.'));
    cards.appendChild(metricCard('방화벽 설정 (읽기만)', 'firewall', (m) => `켜져 있다는 것이 안전하다는 판정은 아닙니다.${m.offCount > 0 ? ` 꺼진 프로필 ${m.offCount}개는 관찰 사실일 뿐 판정이 아닙니다.` : ''}`));
    cards.appendChild(metricCard('Windows 기록 (최근 24시간)', 'events', '건수만 센 값입니다(최대 5,000건). 침해나 공격 탐지 결과가 아닙니다.'));
    const sdp = cell();
    sdp.appendChild(el('h4', 'SDP 서버 연결 (PC 조회와 별개)'));
    if (mode === 'disconnected') {
      sdp.dataset.state = 'unavailable';
      sdp.appendChild(el('p', 'SDP 미연결', 'pc-security-value'));
      sdp.appendChild(el('p', 'SDP 서버에 실제로 연결되지 않았습니다. PC 조회가 성공해도 SDP 연결을 뜻하지 않으며, 둘을 섞어 보지 않습니다.', 'muted'));
    } else if (mode === 'demo') {
      sdp.dataset.state = 'unavailable';
      sdp.appendChild(el('p', '예시 · 실제 연결 아님', 'pc-security-value'));
      sdp.appendChild(el('p', '예제(demo) 자료입니다. SDP 서버에 실제로 연결된 것이 아닙니다.', 'muted'));
    } else if (mode === 'connected') {
      sdp.dataset.state = 'measured';
      sdp.appendChild(el('p', 'SDP 연결됨 (앱이 표시한 상태)', 'pc-security-value'));
      sdp.appendChild(el('p', '앱이 알려 준 상태이며 이 화면이 서버에 직접 확인한 것은 아닙니다. PC 조회 결과와는 별개입니다.', 'muted'));
    } else {
      sdp.dataset.state = 'unavailable';
      sdp.appendChild(el('p', '확인 불가', 'pc-security-value'));
      sdp.appendChild(el('p', '연결 상태가 아직 하나로 정해지지 않았습니다(불러오는 중이거나 자료마다 다릅니다). 미연결이라고 단정하지 않습니다.', 'muted'));
    }
    cards.appendChild(sdp);
    root.appendChild(cardTable);

    root.appendChild(el('h4', '최근 추이 (왼쪽 오래됨 → 오른쪽 최근, · 은 확인 불가)'));
    if (pcHistory.length === 0) {
      root.appendChild(el('p', '아직 기록이 없습니다. 위 버튼을 눌러 주세요.', 'muted'));
    } else {
      const eventOk = (entry) => entry.state === 'ok' && entry.events?.ok;
      const maxOf = (field) => Math.max(0, ...pcHistory.map((entry) => (eventOk(entry) ? entry.events[field] : 0)));
      const countBar = (field, max) => pcHistory.map((entry) => {
        if (!eventOk(entry)) return '·';
        return max === 0 ? BARS[0] : BARS[Math.round((entry.events[field] / max) * (BARS.length - 1))];
      }).join('');
      const maxWarning = maxOf('warning');
      const maxError = maxOf('error');
      const fwBar = pcHistory.map((entry) => {
        if (!(entry.state === 'ok' && entry.firewall?.ok)) return '·';
        return entry.firewall.offCount === 0 ? '●' : '○';
      }).join('');
      root.appendChild(el('pre', [
        `경고 건수 (이번 기록 중 최대 ${maxWarning}건 기준)  ${countBar('warning', maxWarning)}`,
        `오류 건수 (이번 기록 중 최대 ${maxError}건 기준)  ${countBar('error', maxError)}`,
        `방화벽 (● 모두 켜짐 / ○ 꺼진 프로필 있음)  ${fwBar}`,
      ].join('\n'), 'pc-security-bars'));
    }

    root.appendChild(el('h4', '기록 (최근이 위)'));
    const table = el('table', '', 'pc-security-table');
    table.setAttribute('width', '100%');
    table.setAttribute('border', '1');
    table.setAttribute('cellpadding', '6');
    table.setAttribute('cellspacing', '0');
    const head = el('tr');
    for (const name of ['시각', '네트워크 구성', '방화벽', '경고 (건)', '오류 (건)', '상태']) {
      const th = el('th', name);
      th.scope = 'col';
      head.appendChild(th);
    }
    const thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const entry of [...pcHistory].reverse()) {
      const row = el('tr');
      row.appendChild(el('td', pcTime(entry.at)));
      const reasons = [];
      const put = (key, text) => {
        const ok = entry.state === 'ok' && entry[key]?.ok;
        row.appendChild(el('td', ok ? text(entry[key]) : '확인 불가'));
        if (!ok) reasons.push(entry.state === 'ok' ? entry[key]?.reason : entry.reason);
      };
      put('network', (m) => m.text);
      put('firewall', (m) => m.text);
      const eventsOk = entry.state === 'ok' && entry.events?.ok;
      row.appendChild(el('td', eventsOk ? `${entry.events.warning}${entry.events.truncated ? ' (일부 집계)' : ''}` : '확인 불가'));
      row.appendChild(el('td', eventsOk ? `${entry.events.error}${entry.events.truncated ? ' (일부 집계)' : ''}` : '확인 불가'));
      if (!eventsOk) reasons.push(entry.state === 'ok' ? entry.events?.reason : entry.reason);
      row.appendChild(el('td', reasons.length > 0 ? `확인 불가: ${[...new Set(reasons)].join(' / ')}` : '실측'));
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    root.appendChild(table);

    if (pcRefocus && canRead && pcFocus === 'security') {
      if (!pcBusy) pcRefocus = false;
      setTimeout(() => { if (button.isConnected) button.focus(); }, 0);
    }
    return root;
  }

  return {
    renderIdentity({ me, devices, sessions } = {}) {
      const root = document.createElement('div');

      const addText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        parent.appendChild(node);
        return node;
      };

      const statusLabels = {
        device: {
          compliant: '보안 기준 충족 (compliant)',
          noncompliant: '보안 기준 미충족 (noncompliant)',
          unknown: '확인 불가 (unknown)',
        },
        session: {
          active: '활성 (active)',
          expired: '만료 (expired)',
          revoked: '철회됨 (revoked)',
          unknown: '확인 불가 (unknown)',
        },
      };
      const modeLabels = {
        connected: '연결됨 (connected)',
        demo: '예제 자료 (demo) · 실제 연결 아님',
        disconnected: '연결 없음 (disconnected)',
        unknown: '확인 불가 (unknown)',
      };
      const describeStatus = (kind, value) => statusLabels[kind][value] || `확인 불가 (${String(value ?? 'unknown')})`;

      const addResourceSection = (title, resource, renderOk) => {
        const section = document.createElement('section');
        addText(section, 'h3', title);

        const mode = resource?.mode ?? resource?.meta?.mode ?? 'unknown';
        addText(section, 'p', modeLabels[mode] || '확인 불가 (unknown)');

        if (resource?.status === 'loading') {
          addText(section, 'p', '불러오는 중');
        } else if (resource?.status === 'error') {
          const error = resource.error || {};
          const message = typeof error.message === 'string' && error.message
            ? error.message
            : '서버가 오류 내용을 제공하지 않았습니다.';
          const unverified = ['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED'].includes(error.code);
          addText(section, 'p', `${unverified ? '확인 불가' : '연결 실패'}: ${message}`);
        } else if (resource?.status === 'ok') {
          renderOk(section, resource.data);
        } else {
          addText(section, 'p', '확인 불가');
        }

        root.appendChild(section);
      };

      addResourceSection('현재 로그인', me, (section, data) => {
        const user = data?.user || {};
        const device = data?.device || {};
        const session = data?.session || {};
        const details = document.createElement('dl');
        addText(details, 'dt', '사용자');
        addText(details, 'dd', user.label || '확인 불가');
        addText(details, 'dt', '사용자 ID');
        addText(details, 'dd', user.id || '확인 불가');
        addText(details, 'dt', '현재 기기');
        addText(details, 'dd', device.label || '확인 불가');
        addText(details, 'dt', '기기 ID');
        addText(details, 'dd', device.id || '확인 불가');
        addText(details, 'dt', '기기 보안 상태');
        addText(details, 'dd', describeStatus('device', device.status));
        addText(details, 'dt', '세션 ID');
        addText(details, 'dd', session.id || '확인 불가');
        addText(details, 'dt', '세션 상태');
        addText(details, 'dd', describeStatus('session', session.status));
        section.appendChild(details);
      });

      addResourceSection('기기 목록', devices, (section, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          addText(section, 'p', '표시할 기기가 없습니다.');
          return;
        }
        const list = document.createElement('ul');
        for (const device of data) {
          addText(list, 'li', `${device.label} · ID: ${device.id} · ${describeStatus('device', device.status)}`);
        }
        section.appendChild(list);
      });

      addResourceSection('세션 목록', sessions, (section, data) => {
        if (!Array.isArray(data) || data.length === 0) {
          addText(section, 'p', '현재 표시할 세션이 없습니다.');
          return;
        }
        const list = document.createElement('ul');
        for (const session of data) {
          addText(list, 'li', `세션 ID: ${session.id} · ${describeStatus('session', session.status)}`);
        }
        section.appendChild(list);
      });

      return root;
    },
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('div');
      const addText = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        root.appendChild(node);
        return node;
      };
      const modeLabels = {
        connected: '연결됨 (connected)',
        demo: '예제 자료 (demo) · 실제 연결 아님',
        disconnected: '연결 없음 (disconnected)',
        unknown: '확인 불가 (unknown)',
      };

      addText('p', modeLabels[mode] || '확인 불가 (unknown)');

      if (status === 'idle') {
        addText('p', '앱을 골라 접속을 요청하세요.');
      } else if (status === 'loading') {
        addText('p', '판정 확인 중');
      } else if (status === 'error') {
        const message = typeof error?.message === 'string' && error.message
          ? error.message
          : '오류 내용을 확인할 수 없습니다.';
        addText('p', `요청 실패: ${message}`);
        addText('p', '접근 거부 판정이 아닙니다.');
      } else if (status === 'ok') {
        const decisionLabels = {
          allow: '접근 허용(allow)',
          deny: '접근 거부(deny)',
          challenge: '추가 인증 또는 확인 필요(challenge)',
          unknown: '판정 확인 불가(unknown)',
        };
        const decision = Object.hasOwn(decisionLabels, data?.decision) ? data.decision : 'unknown';
        const resultAppId = data?.appId ?? appId ?? '확인 불가';
        const reason = typeof data?.reason === 'string' && data.reason ? data.reason : '확인 불가';
        const checkedAt = typeof data?.checkedAt === 'string' && data.checkedAt ? data.checkedAt : '확인 불가';

        addText('p', `업무 앱 ID: ${resultAppId}`);
        addText('p', `판정: ${decisionLabels[decision]}`);
        if (decision === 'allow') {
          addText('p', '정책상 접근 허용이며 실제 앱 접속 성공을 보장하지 않습니다.');
        } else if (decision === 'challenge') {
          addText('p', '이 앱이 추가 인증 절차를 대신 수행하지 않습니다.');
        } else if (decision === 'unknown') {
          addText('p', '접근이 허용된 것으로 간주하지 마세요.');
        }
        addText('p', `판정 이유: ${reason}`);
        addText('p', `판정 시각: ${checkedAt}`);
      } else {
        addText('p', '판정 상태를 확인할 수 없습니다. 접근 허용으로 간주하지 마세요.');
      }

      return root;
    },
    renderEvents({ status, mode, data, error } = {}) {
      const root = document.createElement('div');
      const addText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        parent.appendChild(node);
        return node;
      };
      const modeLabels = {
        connected: '연결됨 (connected)',
        demo: '예제 자료 (demo) · 실제 연결 아님',
        disconnected: '연결 없음 (disconnected)',
        unknown: '확인 불가 (unknown)',
      };
      addText(root, 'p', modeLabels[mode] || '확인 불가 (unknown)');

      const message = typeof error?.message === 'string' && error.message
        ? error.message
        : '오류 내용을 확인할 수 없습니다.';
      if (status === 'loading') {
        addText(root, 'p', '기록 불러오는 중');
        return root;
      }
      if (status === 'error') {
        const unverified = ['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED'].includes(error?.code);
        addText(root, 'p', `${unverified ? '기록 확인 불가' : '기록을 불러오지 못했습니다'}: ${message}`);
        return root;
      }
      if (status !== 'ok') {
        addText(root, 'p', '기록 상태를 확인할 수 없습니다.');
        return root;
      }
      if (!Array.isArray(data)) {
        addText(root, 'p', '기록 확인 불가: 응답 형식이 올바르지 않습니다.');
        return root;
      }

      const parseTime = (value) => {
        const parsed = Date.parse(String(value ?? ''));
        return Number.isNaN(parsed) ? null : parsed;
      };
      // 받은 배열을 바꾸지 않도록 복사본만 정렬합니다.
      const events = data.slice().sort((left, right) => {
        const leftTime = parseTime(left?.at);
        const rightTime = parseTime(right?.at);
        if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return rightTime - leftTime;
        if (leftTime !== null && rightTime === null) return -1;
        if (leftTime === null && rightTime !== null) return 1;
        return String(right?.at ?? '').localeCompare(String(left?.at ?? ''));
      });

      const filterArea = document.createElement('div');
      const createFilter = (labelText, values) => {
        const label = document.createElement('label');
        addText(label, 'span', labelText);
        const select = document.createElement('select');
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = '전체';
        select.appendChild(allOption);
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        }
        label.appendChild(select);
        filterArea.appendChild(label);
        return select;
      };
      const uniqueValues = (readValue) => {
        const values = new Set();
        for (const event of events) {
          const value = readValue(event);
          if (value !== null && value !== undefined && String(value) !== '') values.add(String(value));
        }
        return [...values];
      };
      const kindFilter = createFilter('기록 종류', uniqueValues((event) => event?.kind));
      const appFilter = createFilter('업무 앱', uniqueValues((event) => event?.appId));
      const accessFilter = createFilter('접속 상태', uniqueValues((event) => event?.state?.access));
      root.appendChild(filterArea);

      const results = document.createElement('div');
      root.appendChild(results);
      let selectedEventId = null;

      const eventKindLabel = (kind) => {
        if (kind === 'access') return '접속 기록 (access)';
        if (kind === 'xdr') return 'XDR 경보 (xdr)';
        return `확인 불가 (${String(kind ?? 'unknown')})`;
      };
      const appLabel = (appId) => appId === null || appId === undefined || String(appId) === ''
        ? '앱을 확인할 수 없음 (appId 없음)'
        : String(appId);
      const accessLabel = (value) => ({
        allowed: '접근 허용(allowed)',
        denied: '접근 거부(denied)',
        unknown: '확인 불가(unknown)',
      })[value] || `확인 불가(${String(value ?? 'unknown')})`;
      const sessionLabel = (value) => ({
        active: '활성(active)',
        expired: '만료(expired)',
        revoked: '철회됨(revoked)',
        unknown: '확인 불가(unknown)',
      })[value] || `확인 불가(${String(value ?? 'unknown')})`;
      const deviceLabel = (value) => ({
        compliant: '보안 기준 충족(compliant)',
        noncompliant: '보안 기준 미충족(noncompliant)',
        unknown: '확인 불가(unknown)',
      })[value] || `확인 불가(${String(value ?? 'unknown')})`;

      const renderDetails = (parent, event, eventId) => {
        const detail = document.createElement('section');
        detail.setAttribute('data-student-event-detail', eventId);
        addText(detail, 'h4', `${eventId} 상세 정보`);
        addText(detail, 'p', `사건 ID: ${eventId}`);
        addText(detail, 'p', `업무 앱: ${appLabel(event.appId)}`);

        addText(detail, 'h5', '근거');
        const evidence = Array.isArray(event.evidence) ? event.evidence : [];
        if (evidence.length === 0) {
          addText(detail, 'p', '근거가 없습니다.');
        } else {
          const evidenceList = document.createElement('ul');
          for (const item of evidence) {
            addText(evidenceList, 'li', `근거 ID: ${String(item?.id ?? '확인 불가')} · ${String(item?.text ?? '')}`);
          }
          detail.appendChild(evidenceList);
        }

        addText(detail, 'h5', '규칙');
        const rules = Array.isArray(event.rules) ? event.rules : [];
        if (rules.length === 0) {
          addText(detail, 'p', '규칙이 없습니다.');
        } else {
          const rulesList = document.createElement('ul');
          for (const item of rules) {
            addText(rulesList, 'li', `규칙 ID: ${String(item?.id ?? '확인 불가')} · ${String(item?.text ?? '')}`);
          }
          detail.appendChild(rulesList);
        }

        addText(detail, 'h5', '상태');
        addText(detail, 'p', `접속 상태: ${accessLabel(event.state?.access)}`);
        addText(detail, 'p', `세션 상태: ${sessionLabel(event.state?.session)}`);
        addText(detail, 'p', `기기 상태: ${deviceLabel(event.state?.device)}`);

        // 연결되지 않은 조치가 입력된 경우에만 요청을 보내지 않는 비활성 안내를 둡니다.
        const actions = Array.isArray(event.supportedActions) ? event.supportedActions : [];
        if (actions.length > 0) {
          addText(detail, 'h5', '조치');
          addText(detail, 'p', '조치 실행 연결은 준비 중입니다. 아직 지원하지 않는 조치이며 요청을 보내지 않습니다.');
          for (const action of actions) {
            const actionButton = document.createElement('button');
            actionButton.type = 'button';
            actionButton.disabled = true;
            actionButton.textContent = `${String(action)} 미지원`;
            actionButton.setAttribute('aria-label', `${String(action)} 미지원`);
            detail.appendChild(actionButton);
          }
        }
        parent.appendChild(detail);
      };

      const renderRows = () => {
        while (results.firstChild) results.removeChild(results.firstChild);
        const visibleEvents = events.filter((event) => {
          const kindMatches = kindFilter.value === 'all' || String(event?.kind ?? '') === kindFilter.value;
          const appMatches = appFilter.value === 'all' || String(event?.appId ?? '') === appFilter.value;
          const accessMatches = accessFilter.value === 'all' || String(event?.state?.access ?? '') === accessFilter.value;
          return kindMatches && appMatches && accessMatches;
        });
        if (!visibleEvents.some((event) => String(event?.id ?? '') === selectedEventId)) selectedEventId = null;
        addText(results, 'p', `${visibleEvents.length}건 표시`);
        if (visibleEvents.length === 0) {
          addText(results, 'p', events.length === 0 ? '표시할 기록이 없습니다' : '조건에 맞는 기록이 없습니다.');
          return;
        }

        const list = document.createElement('ul');
        for (const event of visibleEvents) {
          const eventId = String(event?.id ?? '확인 불가');
          const row = document.createElement('li');
          row.setAttribute('data-student-event-id', eventId);
          addText(row, 'p', `사건 ID: ${eventId}`);
          addText(row, 'p', `시각: ${String(event?.at ?? '확인 불가')}`);
          addText(row, 'p', `종류: ${eventKindLabel(event?.kind)}`);
          addText(row, 'p', `업무 앱: ${appLabel(event?.appId)}`);
          addText(row, 'p', `요약: ${String(event?.summary ?? '')}`);

          const detailButton = document.createElement('button');
          detailButton.type = 'button';
          detailButton.textContent = `${eventId} 상세`;
          detailButton.setAttribute('aria-label', `${eventId} 상세`);
          const isSelected = selectedEventId === eventId;
          detailButton.setAttribute('aria-expanded', String(isSelected));
          detailButton.addEventListener('click', () => {
            selectedEventId = selectedEventId === eventId ? null : eventId;
            renderRows();
          });
          row.appendChild(detailButton);
          if (isSelected) renderDetails(row, event, eventId);
          list.appendChild(row);
        }
        results.appendChild(list);
      };

      for (const select of [kindFilter, appFilter, accessFilter]) {
        select.addEventListener('change', () => {
          selectedEventId = null;
          renderRows();
        });
      }
      renderRows();
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const root = document.createElement('div');
      root.appendChild(buildPcTrend());
      root.appendChild(buildPcSecurity(mode));
      root.appendChild(buildServiceBefore());
      const addText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        parent.appendChild(node);
        return node;
      };
      const modeLabels = {
        connected: '연결됨 (connected)',
        demo: '예제 자료 (demo) · 실제 연결 아님',
        disconnected: '연결 없음 (disconnected)',
        unknown: '확인 불가 (unknown)',
      };
      const deviceLabels = {
        compliant: '보안 기준 충족(compliant)',
        noncompliant: '보안 기준 미충족(noncompliant)',
        unknown: '확인 불가(unknown)',
      };
      const sessionLabels = {
        active: '활성(active)',
        expired: '만료(expired)',
        revoked: '철회됨(revoked)',
        unknown: '확인 불가(unknown)',
      };
      const describe = (labels, value) => (
        Object.hasOwn(labels, value) ? labels[value] : `확인 불가(${String(value ?? 'unknown')})`
      );
      addText(root, 'p', modeLabels[mode] || '확인 불가 (unknown)');

      // 기기·세션 공통: 불러오는 중 / 빈 목록 / 실패(다시 시도는 사용자가 직접) / 정상 목록을 서로 다른 문장으로 구분합니다.
      const addResourceSection = (title, resource, emptyText, renderItem, note) => {
        const section = document.createElement('section');
        addText(section, 'h3', title);
        if (note) addText(section, 'p', note);
        if (resource?.status === 'loading') {
          addText(section, 'p', '불러오는 중');
        } else if (resource?.status === 'error') {
          const code = resource.error?.code;
          const message = typeof resource.error?.message === 'string' && resource.error.message
            ? resource.error.message
            : '오류 내용을 확인할 수 없습니다.';
          const timedOut = ['TIMEOUT', 'ENGINE_TIMEOUT', 'REQUEST_TIMEOUT'].includes(code);
          const unverified = ['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED'].includes(code);
          const prefix = timedOut ? '시간 초과' : unverified ? '확인 불가' : '불러오지 못했습니다';
          addText(section, 'p', `${title} ${prefix}: ${message}`);
          addText(section, 'p', '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.');
        } else if (resource?.status === 'ok') {
          if (!Array.isArray(resource.data)) {
            addText(section, 'p', `${title} 확인 불가: 응답 형식이 올바르지 않습니다.`);
          } else if (resource.data.length === 0) {
            addText(section, 'p', emptyText);
          } else {
            const list = document.createElement('ul');
            for (const item of resource.data) addText(list, 'li', renderItem(item));
            section.appendChild(list);
          }
        } else {
          addText(section, 'p', `${title} 상태를 확인할 수 없습니다.`);
        }
        root.appendChild(section);
      };

      addResourceSection(
        '등록 기기',
        devices,
        '등록된 기기가 없음',
        (device) => `${String(device?.label ?? '확인 불가')} · 상태: ${describe(deviceLabels, device?.status)}`,
      );
      addResourceSection(
        '세션',
        sessions,
        '현재 연결 없음',
        (session) => `세션 ID: ${String(session?.id ?? '확인 불가')} · 상태: ${describe(sessionLabels, session?.status)}`,
        '지금 검증된 연결 1건만 표시합니다. 지난 세션 목록이 아닙니다.',
      );

      const notificationSection = document.createElement('section');
      addText(notificationSection, 'h3', '알림');
      const items = Array.isArray(notifications) ? notifications : [];
      if (items.length === 0) {
        addText(notificationSection, 'p', '주의할 알림이 없습니다');
      } else {
        const list = document.createElement('ul');
        for (const item of items) {
          addText(list, 'li', `자료: ${String(item?.resource ?? '확인 불가')} · 코드: ${String(item?.code ?? '확인 불가')} · ${String(item?.message ?? '')}`);
        }
        notificationSection.appendChild(list);
      }
      root.appendChild(notificationSection);

      // 도움정보: 제공 화면이 전달한 diagnostics 의 안전한 여섯 값만 사용합니다. 직접 호출하지 않습니다.
      const helpSection = document.createElement('section');
      addText(helpSection, 'h3', '도움정보');
      const helpStatus = addText(helpSection, 'p', '');
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = '도움정보 복사';
      copyButton.setAttribute('aria-label', '도움정보 복사');

      let helpText = '';
      if (diagnostics?.status === 'loading') {
        helpStatus.textContent = '도움정보 불러오는 중';
      } else if (diagnostics?.status === 'error') {
        const message = typeof diagnostics.error?.message === 'string' && diagnostics.error.message
          ? diagnostics.error.message
          : '오류 내용을 확인할 수 없습니다.';
        helpStatus.textContent = `도움정보를 불러오지 못했습니다: ${message}`;
      } else if (diagnostics?.status === 'ok' && diagnostics.data && typeof diagnostics.data === 'object') {
        const data = diagnostics.data;
        const safe = {
          requestId: String(data.requestId ?? '확인 불가'),
          component: String(data.component ?? '확인 불가'),
          version: String(data.version ?? '확인 불가'),
          checkedAt: String(data.checkedAt ?? '확인 불가'),
          'engine.mode': String(data.engine?.mode ?? '확인 불가'),
          'engine.code': String(data.engine?.code ?? '확인 불가'),
        };
        const details = document.createElement('dl');
        for (const [key, value] of Object.entries(safe)) {
          addText(details, 'dt', key);
          addText(details, 'dd', value);
        }
        helpSection.appendChild(details);
        helpText = Object.entries(safe).map(([key, value]) => `${key}: ${value}`).join('\n');
        helpStatus.textContent = '이 정보는 도움 요청에 쓰도록 복사하는 것입니다. 버튼을 누를 때만 복사됩니다.';
      } else {
        helpStatus.textContent = '도움정보 확인 불가';
      }

      copyButton.disabled = helpText === '';
      copyButton.addEventListener('click', async () => {
        if (!helpText) return;
        try {
          await navigator.clipboard.writeText(helpText);
          helpStatus.textContent = '도움정보를 복사했습니다. 복사한 값에는 비밀번호·토큰·API 키가 들어 있지 않습니다.';
        } catch {
          helpStatus.textContent = '자동 복사를 사용할 수 없습니다. 위에 표시된 값을 직접 선택해 복사하세요.';
        }
      });
      helpSection.appendChild(copyButton);
      root.appendChild(helpSection);

      return root;
    },
    renderVulnerabilities({ status, mode, data, error } = {}) {
      // 매번 새로 그리므로 조회 중·오류·새 결과가 오면 이전 표가 남지 않습니다.
      const root = document.createElement('div');
      const addText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        parent.appendChild(node);
        return node;
      };
      const isText = (value) => typeof value === 'string' && value !== '';
      const modeLabels = {
        connected: '연결됨 (connected)',
        demo: '예제 자료 (demo) · 실제 연결 아님',
        disconnected: '연결 없음 (disconnected)',
        unknown: '확인 불가 (unknown)',
      };
      addText(root, 'p', modeLabels[mode] || '확인 불가 (unknown)');

      if (status === 'idle') {
        addText(root, 'p', '조회 전');
        addText(root, 'p', '조회는 제공 화면의 「설치 패키지 조회」 버튼을 직접 누를 때만 실행됩니다.');
        return root;
      }
      if (status === 'loading') {
        addText(root, 'p', '조회 중');
        return root;
      }
      if (status === 'error') {
        const code = isText(error?.code) ? error.code : 'UNVERIFIED';
        const message = isText(error?.message) ? error.message : '오류 내용을 확인할 수 없습니다.';
        addText(root, 'p', `조회 실패: ${message}`);
        addText(root, 'p', `오류 코드: ${code}`);
        if (['CANCELLED', 'REQUEST_CANCELLED'].includes(code)) {
          addText(root, 'p', '조회가 취소되었습니다. 이전 결과는 현재 확인 결과가 아닙니다.');
        } else if (['TIMEOUT', 'REQUEST_TIMEOUT'].includes(code)) {
          addText(root, 'p', '시간 초과로 중단되었습니다. 잠시 뒤 직접 다시 조회하세요. 자동으로 다시 조회하지 않습니다.');
        } else {
          addText(root, 'p', '조회를 확인할 수 없습니다. 직접 다시 조회하세요. 이전 결과를 현재 결과로 쓰지 않습니다.');
        }
        addText(root, 'p', '조회 실패는 취약점이 없다는 뜻이 아닙니다.');
        return root;
      }
      if (status !== 'ok') {
        addText(root, 'p', '조회 상태를 확인할 수 없습니다. 취약점이 없다는 뜻이 아닙니다.');
        return root;
      }

      const scanLabels = {
        complete: '모두 조회(complete)',
        partial: '일부 조회 실패(partial)',
        not_checked: '아직 조회 안 함(not_checked)',
        not_configured: '조회 준비 미완료(not_configured)',
        unverifiable: 'lock 파일 확인 불가(unverifiable)',
      };
      if (!data || typeof data !== 'object' || !Object.hasOwn(scanLabels, data.status)) {
        addText(root, 'p', '조회 결과 확인 불가: 응답 형식이 올바르지 않습니다. 취약점이 없다는 뜻이 아닙니다.');
        return root;
      }

      addText(root, 'h4', `조회 상태: ${scanLabels[data.status]}`);
      const notices = {
        complete: '이 결과는 알려진 취약점 데이터베이스(OSV)의 조회 범위 기준이며, 안전을 보장하지 않습니다.',
        partial: '일부 패키지의 조회가 실패했습니다. 조회 실패는 취약점이 없다는 뜻이 아닙니다. 이미 받은 취약점 ID는 아래에 그대로 둡니다.',
        not_checked: '승인된 공개 조회 대상이 없어 아직 조회하지 않았습니다. 이것은 취약점이 없다는 뜻이 아닙니다.',
        not_configured: '조회 대상 프로젝트 설정이 필요합니다. 설정은 운영자가 준비하며, 이것은 취약점이 없다는 뜻이 아닙니다.',
        unverifiable: 'package-lock.json을 확인할 수 없어 조회하지 못했습니다. 이것은 취약점이 없다는 뜻이 아닙니다.',
      };
      addText(root, 'p', notices[data.status]);

      // 전달된 값만 보여 줍니다. 없는 값을 만들거나 채우지 않습니다.
      const meta = document.createElement('dl');
      if (data.lockfileVersion !== undefined && data.lockfileVersion !== null) {
        addText(meta, 'dt', 'lockfileVersion');
        addText(meta, 'dd', data.lockfileVersion);
      }
      if (isText(data.lockfileHash)) {
        addText(meta, 'dt', 'lockfileHash');
        addText(meta, 'dd', data.lockfileHash);
      }
      if (isText(data.checkedAt)) {
        addText(meta, 'dt', '전체 조회 시각(checkedAt)');
        addText(meta, 'dd', data.checkedAt);
      }
      if (Number.isInteger(data.excluded?.count)) {
        addText(meta, 'dt', '조회 대상에서 제외된 패키지 수');
        addText(meta, 'dd', data.excluded.count);
      }
      if (meta.children.length > 0) root.appendChild(meta);

      const packages = Array.isArray(data.packages) ? data.packages : [];
      if (packages.length === 0) {
        addText(root, 'p', '표시할 패키지가 없습니다.');
        return root;
      }

      const packageStatusText = (pkg, findings) => {
        if (pkg.status === 'unverifiable' && findings.length > 0) return '일부 확인·전체 조회 확인 불가(unverifiable)';
        if (pkg.status === 'unverifiable') return '조회 확인 불가(unverifiable)';
        if (pkg.status === 'known_vulnerabilities') return '알려진 항목 있음(known_vulnerabilities)';
        if (pkg.status === 'none_found') return '조회 범위에서 알려진 항목 없음(none_found) · 안전 보장 아님';
        return `확인 불가(${String(pkg.status ?? 'unknown')})`;
      };
      // 버전 범위(^1.2.0 등)는 설치 버전으로 표시하지 않습니다.
      const exactVersion = (value) => typeof value === 'string'
        && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(value);

      const table = document.createElement('table');
      addText(table, 'caption', '설치 패키지 조회 결과');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const label of ['패키지', '설치 버전', '조회 상태', '취약점 ID · 수정 시각', '출처', '패키지 조회 시각']) {
        const cell = addText(headRow, 'th', label);
        cell.setAttribute('scope', 'col');
      }
      head.appendChild(headRow);
      table.appendChild(head);
      const body = document.createElement('tbody');
      for (const pkg of packages) {
        const name = isText(pkg?.name) ? pkg.name : null;
        const versionOk = exactVersion(pkg?.version);
        const findings = Array.isArray(pkg?.vulnerabilities) ? pkg.vulnerabilities : [];
        const row = document.createElement('tr');
        if (name !== null) row.setAttribute('data-student-package-name', name);
        if (versionOk) row.setAttribute('data-student-package-version', pkg.version);
        addText(row, 'td', name ?? '확인 불가');
        addText(row, 'td', versionOk ? pkg.version : '버전 확인 불가');
        addText(row, 'td', packageStatusText(pkg ?? {}, findings));
        const findingCell = document.createElement('td');
        if (findings.length === 0) {
          addText(findingCell, 'p', pkg?.status === 'none_found' ? '알려진 항목 없음' : '받은 취약점 ID 없음');
        } else {
          for (const finding of findings) {
            addText(findingCell, 'p', `${String(finding?.id ?? '확인 불가')} · 수정 시각: ${String(finding?.modified ?? '확인 불가')}`);
          }
        }
        row.appendChild(findingCell);
        addText(row, 'td', isText(pkg?.source) ? pkg.source : '확인 불가');
        addText(row, 'td', isText(pkg?.checkedAt) ? pkg.checkedAt : '확인 불가');
        body.appendChild(row);
      }
      table.appendChild(body);
      root.appendChild(table);
      addText(root, 'p', 'OSV는 알려진 취약점 데이터베이스입니다. 조회 결과가 없다는 사실만으로 패키지나 앱 전체가 안전하다고 보장할 수 없습니다.');
      return root;
    },
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
      // 매번 새로 그리므로 다시 점검·idle 복귀 때 이전 오류나 결과가 남지 않습니다.
      const root = document.createElement('div');
      const addText = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        root.appendChild(node);
        return node;
      };
      const modeLabels = {
        connected: '연결됨 (connected)',
        demo: '예제 자료 (demo) · 실제 연결 아님',
        disconnected: '연결 없음 (disconnected)',
        unknown: '확인 불가 (unknown)',
      };
      addText('p', modeLabels[mode] || '확인 불가 (unknown)');

      if (status === 'idle') {
        addText('p', 'AI 연결 점검 전');
        addText('p', '점검은 「현재 API 연결 점검」 버튼을 직접 누를 때만 실행됩니다. 자동으로 다시 점검하지 않습니다.');
        return root;
      }
      if (status === 'loading') {
        addText('p', 'AI 연결 점검 중');
        return root;
      }

      if (status === 'ok') {
        const authLabels = {
          test: '시험 연결 점검(test)',
          verified: '앱 권한 확인 후 점검(verified)',
        };
        if (!data || typeof data !== 'object' || !Object.hasOwn(authLabels, data.audienceAuthorization)) {
          addText('p', 'AI 연결 점검 결과 확인 불가: 응답 형식이 올바르지 않습니다.');
          addText('p', '연결 성공으로 간주하지 마세요. 사건 설명은 아직 실행하지 않았습니다.');
          return root;
        }
        addText('p', `AI 연결 점검 결과: ${authLabels[data.audienceAuthorization]}`);
        if (data.audienceAuthorization === 'test') {
          addText('p', '시험 연결의 모델 응답 점검입니다. 실제 앱 권한 확인이 아닙니다.');
        }
        addText('p', `응답 모델 수: ${Number.isInteger(data.modelCount) ? data.modelCount : '확인 불가'}`);
        addText('p', `점검 시각: ${typeof checkedAt === 'string' && checkedAt ? checkedAt : '확인 불가'}`);
        addText('p', '연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다.');
        addText('p', '모델 목록 응답은 사건 설명이 아닙니다. 사건 설명은 보안 기록에서 따로 요청해 확인합니다.');
        if (explanationAccepted === true) {
          addText('p', '사건 설명 수용 상태: 확인 필요(이 화면의 점검 결과만으로 확정하지 않습니다)');
        }
        addText('p', '다시 점검은 「현재 API 연결 점검」 버튼을 직접 누르세요. 자동으로 다시 점검하지 않습니다.');
        return root;
      }

      if (status === 'error') {
        const code = typeof error?.code === 'string' && error.code ? error.code : 'AI_REQUEST_UNVERIFIED';
        const message = typeof error?.message === 'string' && error.message
          ? error.message
          : '오류 내용을 확인할 수 없습니다.';
        const groups = [
          {
            codes: ['ON_AI_PROVISIONING_PENDING', 'AI_REQUEST_UNVERIFIED', 'SUBJECT_SCOPE_UNVERIFIED'],
            title: '권한 준비 중 또는 확인 불가',
            guide: '담당자에게 계정 연결과 앱 권한 확인을 요청하세요. 학생 잘못이 아닙니다.',
          },
          {
            codes: ['WB_CLCO_AUTH_REQUIRED'],
            title: '인증 실패',
            guide: '계정 연결을 다시 확인하고, 계속되면 담당자에게 확인하세요.',
          },
          {
            codes: ['WB_CLCO_ACCESS_BLOCKED', 'ON_AI_AUTHORIZATION_CHANGED'],
            title: '접근 제한',
            guide: '계정 연결을 다시 확인하고, 담당자에게 현재 앱 권한을 확인하세요.',
          },
          {
            codes: ['WB_CLCO_COHORT_BUDGET_EXHAUSTED', 'WB_CLCO_LIMIT_REACHED'],
            title: '사용량·이용 한도',
            guide: '담당자에게 확인하세요.',
          },
          {
            codes: ['WB_CLCO_SESSION_CLOSED'],
            title: '이용 시간 아님',
            guide: '현재 AI 이용 시간인지 확인하세요.',
          },
          {
            codes: [
              'WB_CLCO_RATE_LIMITED', 'WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT',
              'WB_CLCO_NETWORK_ERROR', 'WB_CLCO_SERVER_UNAVAILABLE', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE',
            ],
            title: '요청 제한·시간 초과·네트워크·서버 연결 실패',
            guide: '네트워크나 서버 연결 상태를 확인하고, 잠시 뒤 「현재 API 연결 점검」 버튼을 직접 눌러 다시 점검하세요. 자동으로 다시 요청하지 않습니다.',
          },
          {
            codes: ['WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED'],
            title: '취소됨',
            guide: '점검이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.',
          },
          {
            codes: ['ON_AI_MODEL_LIST_EMPTY', 'MODEL_NOT_CONFIGURED'],
            title: '쓸 수 있는 모델 없음',
            guide: '담당자에게 모델 허용 설정 확인을 요청하세요.',
          },
        ];
        const group = groups.find((item) => item.codes.includes(code));
        addText('p', `AI 연결 점검 실패 · ${group ? group.title : '확인 불가'}`);
        addText('p', `오류 코드: ${code}`);
        addText('p', `안내 메시지: ${message}`);
        addText('p', group ? group.guide : '원인을 확인할 수 없습니다. 연결 성공으로 간주하지 마세요. 담당자에게 확인하세요.');
        addText('p', '사건 설명은 실행되지 않았습니다. 기존 기록은 그대로입니다.');
        return root;
      }

      addText('p', 'AI 연결 점검 상태를 확인할 수 없습니다. 연결 성공으로 간주하지 마세요.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const addText = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        parent.appendChild(node);
        return node;
      };
      const eventId = typeof event?.id === 'string' && event.id ? event.id : null;

      // 실패·자료 없음·근거 불일치 화면: data-student-explanation-event 를 붙이지 않습니다.
      const failureView = (title, lines) => {
        const view = document.createElement('div');
        addText(view, 'p', title);
        for (const line of lines) addText(view, 'p', line);
        addText(view, 'p', '기록은 그대로입니다. AI 설명 문제는 업무 앱 판정과 보안 기록에 영향을 주지 않습니다.');
        return view;
      };

      // 1) 오류가 있으면 event 가 null 이어도 오류를 먼저 보여 줍니다.
      if (explanation?.status === 'error') {
        const code = typeof explanation.error?.code === 'string' && explanation.error.code
          ? explanation.error.code
          : 'AI_REQUEST_UNVERIFIED';
        const message = typeof explanation.error?.message === 'string' && explanation.error.message
          ? explanation.error.message
          : '오류 내용을 확인할 수 없습니다.';
        const lines = [`오류 코드: ${code}`, `안내 메시지: ${message}`];
        if (code === 'ON_AI_INVALID_OUTPUT') {
          lines.push('근거 부족: 응답 형식이나 근거 ID가 이 기록과 맞지 않아 이 설명을 쓸 수 없습니다. 이미 실행했다고 답한 설명도 쓸 수 없습니다.');
        } else if (code === 'ON_AI_INVALID_INPUT') {
          lines.push('근거 부족: 설명에 필요한 사건 근거·규칙을 확인할 수 없습니다.');
        }
        return failureView('AI 설명 실패', lines);
      }

      // 2) 오류 없이 event 만 없으면 기록을 먼저 고르게 안내합니다.
      if (!event || !eventId) {
        const view = document.createElement('div');
        addText(view, 'p', '보안 기록에서 기록을 먼저 고르세요');
        return view;
      }

      if (explanation?.status === 'loading') {
        const view = document.createElement('div');
        addText(view, 'p', `설명 요청 중 · 사건 ID: ${eventId}`);
        return view;
      }

      if (explanation?.status !== 'ok') {
        const view = document.createElement('div');
        addText(view, 'p', `사건 ID: ${eventId}`);
        addText(view, 'p', '이 기록의 AI 설명을 아직 요청하지 않았습니다.');
        return view;
      }

      // 3) 성공한 설명도 현재 event 의 근거와 대조해 맞을 때만 보여 줍니다. 없는 근거 ID 를 만들어 맞추지 않습니다.
      const data = explanation.data;
      const evidenceList = Array.isArray(event.evidence) ? event.evidence : [];
      const evidenceById = new Map();
      for (const item of evidenceList) {
        if (typeof item?.id === 'string' && !evidenceById.has(item.id)) evidenceById.set(item.id, item);
      }
      const proposals = Array.isArray(data?.proposals) ? data.proposals : null;
      const citedIds = Array.isArray(data?.evidenceIds) ? data.evidenceIds : null;
      const formatOk = typeof data?.summary === 'string' && data.summary !== ''
        && citedIds !== null && citedIds.length > 0 && new Set(citedIds).size === citedIds.length
        && proposals !== null
        && data.requiresHumanConfirmation === true;
      const executed = data?.executed !== false;
      if (!formatOk || executed) {
        return failureView('AI 설명 확인 불가', [
          executed && data?.executed === true
            ? '이미 실행했다고 답한 설명은 쓸 수 없습니다.'
            : '근거 부족: 설명 응답의 형식을 확인할 수 없어 쓸 수 없습니다.',
        ]);
      }
      const unknownEvidence = citedIds.filter((id) => !evidenceById.has(id));
      const proposalUnknownEvidence = proposals.some((proposal) => (
        !Array.isArray(proposal?.evidenceIds)
        || proposal.evidenceIds.length === 0
        || proposal.evidenceIds.some((id) => !evidenceById.has(id))
      ));
      if (unknownEvidence.length > 0 || proposalUnknownEvidence) {
        return failureView('AI 설명 확인 불가', [
          '근거가 맞지 않습니다: 설명이 인용한 근거 ID가 선택한 기록의 근거에 없습니다. 이 설명은 쓸 수 없습니다.',
        ]);
      }

      const view = document.createElement('div');
      view.setAttribute('data-student-explanation-event', eventId);
      addText(view, 'h4', 'AI 설명(참고용)');
      addText(view, 'p', `사건 ID: ${eventId}`);
      addText(view, 'p', `AI 요약: ${data.summary}`);
      if (typeof checkedAt === 'string' && checkedAt) addText(view, 'p', `확인 시각: ${checkedAt}`);
      addText(view, 'p', 'AI 설명은 해석입니다. 사실 판단은 아래 근거 글과 연동 시스템이 알려 준 상태로 합니다.');

      addText(view, 'h5', '인용한 근거');
      const evidenceOut = document.createElement('ul');
      for (const id of citedIds) {
        addText(evidenceOut, 'li', `${id} — ${String(evidenceById.get(id)?.text ?? '')}`);
      }
      view.appendChild(evidenceOut);

      addText(view, 'h5', '규칙');
      const rules = Array.isArray(event.rules) ? event.rules : [];
      if (rules.length === 0) {
        addText(view, 'p', '규칙이 없습니다.');
      } else {
        const rulesOut = document.createElement('ul');
        for (const rule of rules) {
          addText(rulesOut, 'li', `${String(rule?.id ?? '확인 불가')} — ${String(rule?.text ?? '')}`);
        }
        view.appendChild(rulesOut);
      }

      addText(view, 'h5', '확인 불가 상태');
      const knownStates = {
        access: ['allowed', 'denied'],
        session: ['active', 'expired', 'revoked'],
        device: ['compliant', 'noncompliant'],
      };
      const stateLabels = { access: '접속', session: '세션', device: '기기' };
      const unknownStates = Object.keys(knownStates).filter((key) => !knownStates[key].includes(event.state?.[key]));
      if (unknownStates.length === 0) {
        addText(view, 'p', '없음');
      } else {
        const stateOut = document.createElement('ul');
        for (const key of unknownStates) {
          addText(stateOut, 'li', `${stateLabels[key]}: 확인 불가(${String(event.state?.[key] ?? 'unknown')})`);
        }
        view.appendChild(stateOut);
        addText(view, 'p', '확인 불가는 정상이나 안전이라는 뜻이 아닙니다.');
      }

      addText(view, 'h5', '조치 제안');
      if (proposals.length === 0) {
        const supported = Array.isArray(event.supportedActions) ? event.supportedActions : [];
        addText(view, 'p', supported.length === 0
          ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상)'
          : 'AI가 제안한 조치가 없습니다.');
      } else {
        const proposalsOut = document.createElement('ul');
        for (const proposal of proposals) {
          addText(proposalsOut, 'li', `조치: ${String(proposal?.action ?? '확인 불가')} · 이유: ${String(proposal?.reason ?? '')}`);
        }
        view.appendChild(proposalsOut);
        addText(view, 'p', '사람 확인이 필요하며 실행되지 않았습니다.');
      }
      return view;
    },
    renderAction({ status, event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = {}) {
      // 매번 새로 그리므로 새 값이 오면 이전 대상·요청·결과가 남지 않습니다. 버튼·요청·티켓은 만들지 않습니다.
      const root = document.createElement('div');
      const addText = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        root.appendChild(node);
        return node;
      };
      const isText = (value) => typeof value === 'string' && value !== '';
      const eventId = isText(event?.id) ? event.id : null;
      const requestId = isText(receipt?.requestId) ? receipt.requestId : null;

      // 현재 사건·조치와 맞지 않는 요청 정보는 현재 결과로 쓰지 않습니다.
      const receiptEventMismatch = isText(receipt?.eventId) && eventId !== null && receipt.eventId !== eventId;
      const receiptActionMismatch = isText(receipt?.actionId) && isText(actionId) && receipt.actionId !== actionId;
      if (receiptEventMismatch || receiptActionMismatch) {
        addText('p', '결과 불명(unknown) · 현재 사건·조치와 맞지 않는 요청 정보입니다.');
        addText('p', '이 요청 정보를 현재 조치의 결과로 쓰지 않습니다. 효과 없음으로도 성공으로도 판단하지 말고, 제공 화면의 「연동 시스템 결과만 재조회」로 확인하세요.');
        return root;
      }

      const confirmed = status === 'succeeded' && observation?.effectApplied === true;
      const knownStatuses = [
        'idle', 'loading', 'executing', 'prepared', 'pending', 'succeeded',
        'denied', 'failed', 'unknown', 'error', 'expired',
      ];
      // succeeded 이지만 효과 관측이 없거나 알 수 없는 status 는 결과 불명으로 처리합니다.
      const shown = status === 'succeeded' && !confirmed
        ? 'unknown'
        : knownStatuses.includes(status) ? status : 'unknown';

      const headlines = {
        idle: '아직 미실행(idle)',
        loading: '조치 준비 또는 결과 조회 중(loading) · 결과가 아직 확인되지 않았습니다',
        executing: '서버에 전달 중(executing) · 결과가 아직 확인되지 않았습니다',
        prepared: '준비됨·미실행(prepared) · 아직 서버에 전달하지 않았습니다',
        pending: '서버 접수·처리 중(pending) · 효과가 아직 확인되지 않았습니다',
        succeeded: '효과 확인(succeeded)',
        denied: '거절(denied)',
        failed: '실패(failed)',
        unknown: '결과 불명(unknown) · 효과 없음으로도 성공으로도 판단하지 마세요',
        expired: '확인 기한 지남(expired) · 이번 준비로는 집행할 수 없습니다. 다시 준비하세요',
        error: '요청 처리 안 됨(error)',
      };
      addText('p', headlines[shown]);

      if (shown === 'pending') {
        addText('p', '서버가 요청을 받았다는 확인(ACK)일 뿐이며, 실제 효과가 확인된 것이 아닙니다.');
      }
      if (shown === 'unknown') {
        if (status === 'succeeded') {
          addText('p', '상태는 succeeded 이지만 effectApplied: true 인 효과 관측이 없어 효과 확인으로 표시하지 않습니다.');
        }
        addText('p', '제공 화면의 「연동 시스템 결과만 재조회」로 결과를 다시 확인하세요.');
      }
      if (shown === 'expired') {
        addText('p', '확인 기한이 지났습니다. 제공 화면에서 조치를 다시 준비하세요.');
      }
      if (shown === 'error') {
        const code = isText(error?.code) ? error.code : 'AI_REQUEST_UNVERIFIED';
        const text = isText(error?.message) ? error.message : '오류 내용을 확인할 수 없습니다.';
        addText('p', `오류 코드: ${code}`);
        addText('p', `안내 메시지: ${text}`);
      }
      if ((shown === 'denied' || shown === 'failed') && isText(message)) {
        addText('p', `안내: ${message}`);
      } else if (shown !== 'idle' && shown !== 'error' && isText(message)) {
        addText('p', `안내: ${message}`);
      }

      // 받은 범위에서만 현재 사건·조치·대상·요청 정보를 글자로 보여 줍니다.
      if (eventId !== null) addText('p', `사건 ID: ${eventId}`);
      const evidenceIds = Array.isArray(event?.evidence)
        ? event.evidence.map((item) => item?.id).filter(isText)
        : [];
      if (evidenceIds.length > 0) addText('p', `근거 ID: ${evidenceIds.join(', ')}`);
      if (isText(actionId)) addText('p', `조치 ID: ${actionId}`);
      if (target && isText(String(target.id ?? ''))) {
        addText('p', `대상 ID: ${String(target.id)} · 세대(generation): ${String(target.generation ?? '확인 불가')}`);
      }
      if (requestId !== null) addText('p', `요청 ID: ${requestId}`);
      if (isText(receipt?.receiptId)) addText('p', `접수 영수증 ID(receiptId): ${receipt.receiptId}`);
      if (receipt?.version !== undefined && receipt?.version !== null) addText('p', `버전: ${String(receipt.version)}`);
      if (shown === 'prepared' && isText(confirmationExpiresAt)) addText('p', `사람 확인 기한: ${confirmationExpiresAt}`);
      if (receipt?.superseded === true) addText('p', '이전 조회는 최신 결과를 대신하지 않습니다(superseded).');

      if (confirmed) {
        addText('p', `관측 시각: ${String(observation.observedAt ?? '확인 불가')}`);
        addText('p', 'effectApplied: true');
      }

      if (shown === 'idle') {
        const supported = Array.isArray(event?.supportedActions) ? event.supportedActions : null;
        if (supported !== null && supported.length === 0) {
          addText('p', '이 기록에는 연동 시스템이 지원하는 조치가 없어 조치 준비 버튼이 나오지 않습니다(정상).');
        }
      }
      if (['loading', 'executing', 'prepared', 'pending', 'unknown'].includes(shown)) {
        addText('p', '조치 준비·집행·결과 재조회는 제공 화면의 버튼으로 합니다. 「조치 화면 취소」는 이미 서버에 전달된 조치 효과를 되돌리지 않습니다.');
      }

      // 성공적으로 그린 화면에만 현재 사건·요청 표식을 붙입니다.
      if (shown !== 'idle' && shown !== 'error' && eventId !== null && requestId !== null) {
        root.setAttribute('data-student-action-event', eventId);
        root.setAttribute('data-student-action-request', requestId);
      }
      return root;
    },
  };
}
