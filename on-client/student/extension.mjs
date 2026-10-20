// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
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
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
