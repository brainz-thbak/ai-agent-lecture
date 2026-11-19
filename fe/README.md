# Console

React 19와 Vite로 실행하는 CSR 시연 화면입니다. 예제 이벤트를 처리하고 첨부 로그를 확인한 뒤 감사 보고서에 연결할 수 있습니다.

## 실행

저장소 루트에서 Node.js 24 이상과 pnpm으로 실행합니다.

```sh
pnpm install
pnpm dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

대시보드는 `/`, 운영 이벤트는 `/incidents`, 감사 보고서는 `/audit-reports`에 있습니다. 상세 항목을 열면 마지막 경로에 항목 ID가 붙습니다.

## SSH에서 열기

SSH 서버에서 `pnpm dev`를 실행합니다. 로컬 터미널에서 FE 포트를 포워딩한 뒤 로컬 브라우저에서 `http://localhost:3000`을 엽니다.

```sh
ssh -N -L 3000:127.0.0.1:3000 user@server
```

서버의 IP로 직접 접속할 수 있는 네트워크에서는 `http://<서버 IP>:3000`을 엽니다. 서버 이름이나 도메인으로 접속할 경우 호스트 이름을 Vite에 등록합니다.

```sh
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=demo.example.com pnpm dev
```

## API 연결

Vite는 `/api` 요청을 `http://localhost:8080`으로 전달합니다. 백엔드는 `http://localhost:6006`의 `file-store`에 첨부파일을 저장합니다.

`pnpm dev`는 `basic`을 시작합니다. `with-feedback`을 시연하려면 실행 중인 스택을 종료한 뒤 저장소 루트에서 아래 명령을 실행합니다. 두 백엔드는 같은 `8080` 포트를 사용합니다.

```sh
pnpm dev:feedback
```

`pnpm --filter fe build`는 `fe/dist`에 정적 파일을 만듭니다. 개발용 FE를 종료한 뒤 `pnpm --filter fe preview`를 실행하면 `3000`에서 같은 API 프록시로 빌드 결과를 확인할 수 있습니다.
