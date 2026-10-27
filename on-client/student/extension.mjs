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
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
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
            codes: ['WB_CLCO_RATE_LIMITED', 'WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT'],
            title: '요청 제한·시간 초과·네트워크',
            guide: '잠시 뒤 「현재 API 연결 점검」 버튼을 직접 눌러 다시 점검하세요. 자동으로 다시 요청하지 않습니다.',
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
      const root = document.createElement('div');
      const addText = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = String(text);
        root.appendChild(node);
        return node;
      };
      const eventId = typeof event?.id === 'string' && event.id ? event.id : null;

      if (explanation?.status === 'loading') {
        addText('p', '사건 설명 요청 중');
        return root;
      }
      if (explanation?.status === 'error') {
        const code = typeof explanation.error?.code === 'string' && explanation.error.code
          ? explanation.error.code
          : 'AI_REQUEST_UNVERIFIED';
        const message = typeof explanation.error?.message === 'string' && explanation.error.message
          ? explanation.error.message
          : '오류 내용을 확인할 수 없습니다.';
        // 실패 화면에는 data-student-explanation-event 를 붙이지 않습니다.
        addText('p', `사건 설명 실패: ${code}`);
        addText('p', message);
        addText('p', '기록은 그대로 유지됩니다.');
        return root;
      }
      if (explanation?.status === 'ok') {
        const summary = explanation.data?.summary;
        if (eventId && typeof summary === 'string' && summary) {
          root.setAttribute('data-student-explanation-event', eventId);
          addText('p', `사건 ID: ${eventId}`);
          addText('p', `설명 요약: ${summary}`);
          if (typeof checkedAt === 'string' && checkedAt) addText('p', `확인 시각: ${checkedAt}`);
          return root;
        }
        addText('p', '사건 설명 확인 불가: 응답 형식이 올바르지 않습니다.');
        addText('p', '기록은 그대로 유지됩니다.');
        return root;
      }
      addText('p', '사건 설명을 아직 요청하지 않았습니다.');
      return root;
    },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
