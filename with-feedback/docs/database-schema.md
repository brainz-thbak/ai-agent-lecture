# 메타데이터 DB 스키마와 버전

이벤트·첨부·감사 보고서의 메타데이터는 SQLite 에 저장한다. 첨부 파일의 내용은 file-store 에 있고, DB 에는 그 파일 ID(`file_id`)만 저장한다.

- 위치: 서버를 실행한 디렉터리 기준 `.data/evidence/metadata.sqlite`. `DEMO_DATA_DIR` 로 디렉터리를 바꿀 수 있다.
- 초기화: 서버가 시작할 때 `server/database.ts` 의 `initializeDatabase` 를 실행한다.

## 현재 스키마 — 버전 3

| 테이블 | 컬럼 |
| --- | --- |
| `incidents` | `id` (PK), `title`, `closed_at`, `created_at`, `legal_hold` (0 또는 1, 기본값 0) |
| `incident_attachments` | `incident_id` (PK, `incidents.id` 참조), `name`, `file_id` |
| `reports` | `id` (PK), `name`, `file_id`, `source_incident_id` |

시각 컬럼은 UTC ISO 8601 문자열이다.

## 버전 관리 방식

DB 가 어느 단계까지 만들어졌는지는 `PRAGMA user_version` 에 기록한다. `initializeDatabase` 는 아직 적용하지 않은 단계만 한 트랜잭션 안에서 순서대로 적용한 뒤 버전을 올린다.

| 시작 버전 | 적용 내용 |
| --- | --- |
| 0 | `createTables` 로 테이블 생성 |
| 1 | `incidents.created_at` 추가 |
| 0, 1, 2 | `incidents.legal_hold` 추가 후 버전 3 기록 |
| 3 | 적용할 단계 없음 — 바로 반환 |

지원하지 않는 버전이면 서버가 시작하지 않는다.

## 스키마를 바꿀 때

**이미 데이터가 들어 있는 DB 가 있다고 전제한다.** 서버는 기존 DB 를 지우지 않고 이어서 쓴다.

1. 지원 버전에 새 번호(예: 4)를 추가한다.
2. 이전 버전 DB 에 변경을 적용하는 단계를 추가한다. 컬럼은 `ALTER TABLE … ADD COLUMN`, 테이블은 `CREATE TABLE` 로 만든다.
3. 마지막에 `PRAGMA user_version` 을 새 번호로 기록한다.

`createTables` 만 고치면 새 DB 에만 반영된다. 버전 3 DB 는 바로 반환하므로 새 컬럼이 생기지 않고, 해당 컬럼을 쓰는 쿼리가 `no such column` 으로 실패한다.

`STRICT` 테이블에 `NOT NULL` 컬럼을 추가할 때는 기본값을 함께 지정해야 기존 행이 있는 DB 에서도 적용된다.
