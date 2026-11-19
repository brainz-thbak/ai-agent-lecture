# Evidence API

운영 이벤트와 증빙 첨부, 감사 보고서를 관리하는 백엔드다. Console 화면(`fe`)이 이 API 를 사용한다.

## 실행

저장소 루트에서 실행한다.

```sh
pnpm install
pnpm dev        # app, fe, file-store 를 함께 실행
```

API 는 `http://localhost:8080` 에서 받는다. 첨부 파일 내용은 `file-store`(`http://localhost:6006`)에 저장하고, 메타데이터는 `.data/evidence/metadata.sqlite` 에 둔다.

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `PORT` | `8080` | API 포트 |
| `DEMO_DATA_DIR` | `.data/evidence` | 메타데이터 SQLite 위치 |
| `FILE_STORE_URL` | `http://localhost:6006` | 파일 저장소 주소 |
| `FILE_STORE_SPACE` | 앱 폴더 이름 | 파일 저장소 space |

변경 후에는 `pnpm build` 로 타입 검사와 빌드를 확인한다.

## 구조

```text
server/
  index.ts            서버 시작
  api.ts              라우트 등록
  core/               HTTP 도우미, 이벤트 버스, 공용 컨텍스트
  modules/            기능별 모듈
  services/           공용 서비스
config/handlers.json  이벤트 핸들러 등록
```

### 첨부

- 첨부는 `attachments` 모듈이 관리한다. 이벤트 하나에 첨부 하나다.
- 첨부 파일 ID 는 업로드마다 새로 만들어진다. 서로 다른 이벤트가 같은 파일을 공유하지 않는다.
- 첨부 API 는 v2(`/incidents/:id/attachment`) 하나다. v1 증빙 API 는 2025년 하반기에 제거되었다.
- `evidence` 모듈은 v1 시절의 저장소로, 더 이상 쓰지 않는다.

### 감사 보고서

보고서는 이벤트 첨부를 증빙으로 연결한다. 보고서를 만든 뒤에도 같은 증빙을 계속 내려받을 수 있어야 한다.

### 검색·미리보기

- 첨부를 저장하면 `attachments` 모듈이 검색 색인과 미리보기를 함께 갱신한다.
- 검색: `GET /search?q=`
- 미리보기: `GET /incidents/:id/preview`

### 내보내기

`POST /exports` 로 내보낼 이벤트를 고르면 작업이 대기 상태로 만들어지고, `POST /exports/:id/run` 으로 실행한다. 실행할 때 각 이벤트의 현재 첨부를 모은다.

### 대시보드·감사 로그·알림

- `GET /stats` — 첨부 수, 첨부 용량, 처리 완료 수
- `GET /audit-log` — 증빙 관련 작업 기록
- `GET /notifications/outbox` — 외부 알림 발송 대기열

### 운영 점검

`/system` 아래에 핸들러 목록, 진단, 일일 요약, 재색인·카운터 재계산 같은 점검용 API 가 있다.
