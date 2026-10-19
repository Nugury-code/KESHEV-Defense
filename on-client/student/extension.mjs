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
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
