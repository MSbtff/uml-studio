# UML Studio V7 Professional

브라우저에서 UML·SysML·ERD를 작성하는 편집기입니다. Node.js에서 SQL 스키마를 ERD와
Mermaid로 변환하려면 [DDL → Mermaid npm 라이브러리](packages/ddl-to-mermaid/README.md)를
사용하세요. [샘플 SQL과 실행 예제](packages/ddl-to-mermaid/examples)도 제공됩니다.

## SQLite 자동저장으로 실행

```bash
python3 server.py
```

브라우저에서 `http://127.0.0.1:8000`을 엽니다. 프로젝트 변경 내용은 작업 폴더의
`uml-studio.db`에 자동 저장되며 서버를 종료했다가 다시 실행해도 복원됩니다.

다른 포트를 사용해도 같은 DB 파일을 사용합니다. 서버는 HTTP/1.1 keep-alive로 응답하고 listen
backlog를 128로 두어, 페이지 로드 시 몰리는 수십 개의 스크립트 요청이 macOS에서 연결 재설정으로
끊기지 않습니다.

```bash
python3 server.py --port 8080
```

DB 경로를 별도로 지정할 수도 있습니다.

```bash
python3 server.py --db /path/to/uml-studio.db
```

일반 정적 서버나 `index.html` 직접 열기도 지원하지만, 이 경우에는 IndexedDB와
브라우저 비상 복구본만 사용되므로 같은 주소(Origin)에서 실행해야 데이터가 복원됩니다.

파일 메뉴의 `Save`는 DB 자동저장과 별개로 이동·백업 가능한 `project.json`을 내려받습니다.

## 프로젝트와 복구 이력

- 툴바의 `Projects` 또는 `File > Project Manager…`에서 여러 프로젝트를 생성하고 전환할 수 있습니다.
- 프로젝트마다 최근 자동저장 스냅샷 10개를 보관합니다.
- `File > Recovery History…`에서 저장 시각과 revision을 확인하고 원하는 버전으로 복원할 수 있습니다.
- 복원하기 직전의 현재 상태도 먼저 저장되므로 잘못 복원해도 다시 돌아갈 수 있습니다.
- 여러 브라우저 탭이 같은 프로젝트를 동시에 수정하면 revision 충돌을 감지하여 자동 덮어쓰기를 중단합니다.
- 동작 중 잡히지 않은 오류가 나면 상태 표시줄에 `⚠ 동작 중 오류: …`로 알리고, 오른쪽에 `⚠ 오류 N건`을 새로고침 전까지 남깁니다. 콘솔 기록은 그대로입니다.

기존 버전의 단일 `autosave` 데이터는 처음 실행할 때 프로젝트 저장소로 자동 이전됩니다.

SQLite WAL-reset 동시성 수정이 포함된 버전(3.51.3+, 3.50.7+, 3.44.6+)에서는
WAL journal을 사용합니다. 그보다 오래된 SQLite에서는 다중 탭 동시 저장 시 안전성을
우선해 rollback journal로 자동 전환합니다. 현재 모드는 `/api/health` 응답에서 확인할 수
있습니다.

## ERD DDL 가져오기와 내보내기

- ER Diagram에서 `DDL`을 누르면 PostgreSQL·MySQL·SQLite `CREATE TABLE` 파일을 내보냅니다.
- `Import DDL` 또는 `File > Import DDL…`에서 `.sql` 파일을 현재 프로젝트의 새 ER Diagram으로 추가합니다.
- 가져오기 전에 테이블·컬럼·FK·CHECK·인덱스 수와 현재 모델에 저장하지 않는 항목을 미리 보여줍니다.
- `PRIMARY KEY`, `NOT NULL`, 단일 컬럼 `FOREIGN KEY ... REFERENCES`, `UNIQUE`, `DEFAULT`, `CHECK`와 단순 컬럼 인덱스를 의미 모델로 복원합니다.
- 컬럼 편집기의 `UQ`에서 단일 UNIQUE와 DEFAULT를, Entity 속성 패널의 `DDL 제약조건과 인덱스`에서 CHECK·복합 UNIQUE·일반/고유 인덱스를 편집합니다.
- 컬럼 이름을 바꾸면 프로젝트 전체의 FK 관계선과 연결된 DEFAULT·CHECK·인덱스 참조도 함께 갱신합니다.
- FK 관계에서 사용하는 컬럼을 삭제하면 영향받는 관계를 먼저 보여주고 확인받습니다. 삭제 후 관계선은 유지하되 FK 컬럼과 `ON DELETE/UPDATE` 연결을 해제하며 Undo로 복구할 수 있습니다.
- 관계선 속성에서 `ON DELETE`·`ON UPDATE`를 편집하며 `NO ACTION`, `RESTRICT`, `CASCADE`, `SET NULL`, `SET DEFAULT`를 DDL·draw.io 왕복에 보존합니다.
- `SET NULL`은 nullable FK 컬럼에서만 허용하고, `SET DEFAULT`는 NOT NULL FK에 DEFAULT가 필요합니다. MySQL InnoDB는 `SET DEFAULT`를 거부하므로 MySQL 내보내기 전에 오류로 안내합니다.
- `MATCH`·`DEFERRABLE`, DB 전용 인덱스 옵션과 외부 테이블 참조는 경고하고 공통 모델로 표현 가능한 항목만 가져옵니다.
- 복합 FK, 함수·식 기반 인덱스, `ALTER TABLE`, `CREATE TABLE AS`는 아직 지원하지 않으며 오류와 함께 가져오기를 중단합니다.

DDL은 브라우저에서 토큰화·분석만 하며 데이터베이스에 실행하지 않습니다. 파일 크기는 10MB로 제한됩니다.

## ERD 논리명·물리명 검색과 일괄 변환

- Model Explorer 검색은 ERD 엔터티와 컬럼의 논리명·물리명을 모두 찾고, 일치한 컬럼 이름을 함께 보여줍니다.
- 검색창 옆 `ERD 이름`에서 프로젝트 전체의 논리명·물리명을 각각 또는 함께 일괄 변환할 수 있습니다.
- 포함 문자열·전체 이름 일치와 대소문자 구분을 선택할 수 있으며, 적용 전에 변경 모델·다이어그램 수와 이름별 결과를 미리 보여줍니다.
- 중복되거나 잘못된 물리명은 적용 전에 차단합니다. 컬럼 물리명 변경은 FK·CHECK·인덱스 참조까지 함께 갱신하며 전체 작업을 한 번의 Undo로 복원할 수 있습니다.

## 복사와 모델 공유

- Class·Interface·Enumeration 같은 추상 분류자 뷰를 복사하면 같은 의미 모델을 가리키는 두 번째 뷰가 됩니다. 한쪽 이름을 바꾸면 양쪽이 함께 바뀝니다.
- ERD 테이블, 시퀀스 라이프라인과 Combined Fragment(alt·opt·loop 등), 인스턴스(Object·Artifact·Component·Node Instance), 그리고 Node·Component·Artifact는 복사·`Ctrl+D` 복제하면 원본과 분리된 새 모델을 만들어 따로 편집하고 따로 삭제할 수 있습니다.
- 라이프라인이나 인스턴스가 가리키는 Classifier는 복제하지 않고 원래 Class·Node를 계속 참조합니다.
- 잘라내기(`Ctrl+X`) 후 붙여넣기는 이동이므로 어느 경우에나 같은 모델을 유지합니다.
- 여러 다이어그램에서 같은 모델을 공유하려면 툴바의 `Models`(프로젝트 모델 저장소)에서 기존 모델을 배치하세요.

## 키보드 조작

- 메뉴바는 `Tab`으로 한 번만 진입하고 `Left`·`Right`로 File~Help를 순환하며 `Home`·`End`로 처음·마지막 메뉴로 이동합니다.
- `Enter`·`Space`·`Down`으로 메뉴를 열면 첫 항목에, `Up`으로 열면 마지막 항목에 포커스합니다.
- 메뉴 안에서는 `Up`·`Down`으로 항목을 순환하고 비활성 항목은 건너뜁니다. 항목 이름의 첫 글자를 누르면 해당 항목으로 이동합니다.
- 메뉴가 열린 상태에서 `Left`·`Right`는 옆 메뉴로 넘어가고, `Escape` 또는 `Tab`은 메뉴를 닫고 메뉴바로 포커스를 되돌립니다.
- Model Explorer는 트리로 동작합니다. 검색창에서 `Down`으로 트리에 들어가고 `Up`·`Down`으로 항목을 이동합니다.
- `Right`는 접힌 다이어그램을 펼치거나 하위 항목으로 들어가고, `Left`는 상위 항목으로 이동합니다.
- `Home`·`End`로 처음·마지막 항목으로 가며 첫 글자를 누르면 그 글자로 시작하는 항목을 찾습니다. `Enter`·`Space`로 선택합니다.
- 캔버스에서 `Tab`·`Shift+Tab`으로 다이어그램 요소와 관계선을 차례로 선택합니다. 선택한 요소는 상태 표시줄에 `종류 "이름" · 3/12 선택`으로 안내되고 화면 밖이면 자동으로 스크롤됩니다.
- 마지막 항목을 지나면 선택이 풀리고 `Tab`이 캔버스를 빠져나가므로 키보드가 갇히지 않습니다. `Esc`로도 언제든 선택을 해제할 수 있습니다.
- 선택한 요소는 방향키로 1px씩, `Shift`+방향키로 그리드 단위로 옮깁니다.
- 시퀀스에서 `Edit > Select All` 또는 `Ctrl+A`(Mac `⌘A`)로 전체를 선택하고 요소나 메시지를 드래그하면 라이프라인, 메시지, 실행 막대, 프래그먼트가 함께 움직입니다.
- 중간 구간은 빈 캔버스에서 사각형으로 선택한 뒤 프래그먼트나 메시지를 잡아 위아래로 옮깁니다. 프래그먼트 내부의 점선을 위아래로 드래그하면 각 분기 높이를 조절할 수 있습니다.
- 툴바는 `Tab`으로 한 번만 들어가고 `Left`·`Right`로 버튼을 순환하며 `Home`·`End`로 처음·마지막 버튼으로 이동합니다. 마지막으로 사용한 버튼이 다음 `Tab` 진입점이 됩니다.
- 속성 패널의 관계 출발·도착 끝점은 각각 별도 그룹으로 나뉘어, 같은 이름의 입력이 어느 끝점인지 구분됩니다.
- QuickEdit 편집기의 입력은 화면에 보이는 항목 이름으로 읽히고, 아래 설명 문구는 별도 설명으로 전달됩니다.
- 속성 패널은 체크박스·선택기를 바꿔 패널을 다시 그려도 편집 중이던 컨트롤로 포커스를 되돌립니다.
- 도구 팔레트는 `Tab`으로 이동하고 `Enter` 또는 `Space`로 도구를 선택할 수 있습니다.
- 다이어그램 탭은 `Left`·`Right`로 순환하고 `Home`·`End`로 처음·마지막 탭으로 이동합니다.
- 탭에 포커스가 있을 때 `F2`로 이름을 변경하고 `Delete`로 닫을 수 있습니다.
- 새 다이어그램 버튼을 키보드로 열면 첫 다이어그램 종류로 포커스가 이동하며 `Escape`로 닫으면 버튼으로 돌아옵니다.
- `Models`·`Projects`·`Recovery History` 목록은 항목 수와 함께 목록으로 읽히고, 행마다 반복되는 `열기`·`복구`·`Add View` 같은 버튼은 보이는 라벨 뒤에 항목 이름이 붙어 어느 항목의 버튼인지 구분됩니다.

## 성능

- 캔버스는 한 번의 `render()`로 SVG 전체를 다시 그립니다. 요소 600개 기준 한 번이 약 30ms입니다.
- 드래그 중에는 `mousemove`마다 다시 그리지 않고 `requestAnimationFrame`으로 **프레임당 한 번**만 그립니다.
  모델 좌표는 이벤트마다 정확히 갱신되므로 포인터는 그대로 따라가고, 화면 갱신만 표시 주기에 맞춥니다.
- 실측(Chromium, 한 프레임 안에 mousemove 60개를 몰아넣은 경우):

  | 요소 수 | 합치기 전 | 합치기 후 |
  | --- | --- | --- |
  | 100 | 515ms | 12ms |
  | 300 | 1,613ms | 38ms |
  | 600 | 3,459ms | 76ms |

- 요소 수백 개 규모에서는 충분하지만, 수천 개 규모는 아직 검증하지 않았습니다. 필요해지면
  전체 다시 그리기 대신 변경된 요소만 갱신하는 방식을 먼저 검토하세요.

## 테스트

Node.js 24 이상과 Python 3.12 이상을 사용합니다. 최초 한 번 JavaScript·Python 개발
의존성과 Chromium을 설치합니다.

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
npx playwright install chromium
```

JavaScript 모듈, SQLite HTTP 통합, 실제 브라우저 E2E를 모두 실행합니다.

```bash
npm test
```

개별 테스트 명령은 다음과 같습니다.

```bash
npm run test:unit
npm run test:server
npm run test:e2e
```

간헐 실패 여부를 확인할 때는 전체 E2E를 3회 반복합니다.

```bash
npm run test:e2e:stability
```

커밋 전 품질 기준은 다음 한 명령으로 확인할 수 있습니다.

```bash
npm run check
```

이 명령은 JavaScript ESLint, Python Ruff, 포맷 검사, JavaScript 모듈 커버리지,
SQLite HTTP 통합 테스트를 순서대로 실행합니다. 커버리지 하한은 실측치 바로 아래인
line 85% · branch 80% · function 87%로 고정하여 커버리지가 떨어지면 CI가 실패합니다. 브라우저 전용 `app.js`는 Node 단위 테스트
커버리지에 포함되지 않으므로 실제 사용자 흐름은 별도 Playwright E2E로 보완합니다.

```bash
npm run lint
npm run format:check
npm run test:coverage
```

기존 브라우저 UMD 모듈은 변경 이력이 한꺼번에 커지지 않도록 ESLint만 전역 적용하고,
Prettier는 신규 설정과 E2E 코드부터 점진 적용합니다. 레거시 미사용 변수 경고는 모두 정리했으므로
`--max-warnings=0`으로 고정하여 경고가 하나라도 생기면 CI가 실패합니다. Python 파일은 Ruff 포맷을 적용합니다.

GitHub Actions의 `.github/workflows/ci.yml`은 Node 24 LTS·Python 3.12에서 품질 기준과
Chromium E2E를 분리 실행하며, 브라우저 실패 시 trace·화면·HTML 리포트를 7일 보관합니다.

SQLite HTTP 통합 테스트는 매 테스트마다 자동 삭제되는 임시 DB와 임의 포트를 사용하므로
작업 폴더의 `uml-studio.db`를 변경하지 않습니다.

브라우저 E2E도 테스트마다 별도 임시 SQLite DB와 임의 포트의 서버를 실행합니다. Playwright의
독립 브라우저 컨텍스트에서 저장·재접속 복원, Undo/Redo, 복사·붙여넣기, ERD 편집,
JSON·SVG·Mermaid·draw.io 내보내기, draw.io 충돌 병합, 다중 탭 revision 충돌과 복구 이력을
검증합니다. 첫 실행이 만드는 샘플 프로젝트로 지원하는 모든 다이어그램 종류가 실제로 그려지고
UML 검증을 통과하는지도 한 번에 확인합니다. 실패 시 `test-results/`에 화면과 trace가, 전체 HTML 결과는
`playwright-report/`에 생성됩니다.

## 라이선스와 참고 자료

UML Studio와 DDL 변환 라이브러리는 [MIT 라이선스](LICENSE)로 제공됩니다.

- QuickEdit 표현식 문법은 [StarUML Class Diagram 문서](https://docs.staruml.io/working-with-uml-diagrams/class-diagram/)를 참고할 수 있습니다.
- 스테레오타입 아이콘의 그리기 명령은 [StarUML Icon Script 문서](https://docs.staruml.io/working-with-uml-diagrams/profile-diagram/#icon-script)에 설명되어 있습니다. 내장 Entity·Service 예제는 이 저장소에서 정의한 도형을 사용합니다.
