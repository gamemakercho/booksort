# 반납 도서 분류하기 · 기록 측정 버전

게임이 끝나면 이번 기록과 이 브라우저의 최고 기록을 보여줍니다. GitHub Pages에 올려 사용할 수 있으며, 추가 서비스 가입이나 키 설정이 필요 없습니다.

## 이번 수정 (2.2.0)

- 오답을 누르면 420ms 동안 고양이의 표정만 같은 프레임으로 교체합니다. 공급 동작과 책 방출 시점은 유지하며, 일시정지 동안에는 표정 시간도 멈춥니다.
- 반납함 내부에는 기존 책 에셋 7권을 한 번 합성해 캐시합니다. 실제 분류 큐나 점수에는 연결하지 않습니다.
- 하단 버튼의 보이는 문구는 모두 “분류”이며 상자 이름과 숫자 키 조작은 유지합니다.
- 추가한 에셋은 cat-oops-sheet.webp, 같은 PNG 대체본, cat-oops.json입니다. 단독 대기 이미지는 추가하지 않았습니다.

## 게임과 기록

- 30초 동안 같은 색 책을 일반·어린이·유아 상자로 분류합니다.
- 처음 3권은 시간제한 없는 연습이며 본 게임 기록에 합산하지 않습니다.
- 정리 권수·실수 횟수·최고 콤보를 결과에 표시합니다.
- 이 브라우저에서 낸 최고 정리 권수를 자동 저장합니다. 이전 버전의 기기 최고 기록도 이어서 사용합니다.
- 오답은 −0.5초, 첫 10콤보는 +3초를 한 번 제공합니다.
- 25권 이상이면 성공하며 시간 종료까지 계속 기록에 도전할 수 있습니다.
- 숫자 1·2·3 또는 아래 색상 버튼으로 조작합니다.
- 화면을 벗어나면 시간이 멈추고, 돌아온 뒤 “이어서 하기”로 재개합니다.

최고 기록은 **같은 기기·같은 브라우저**에서 유지됩니다. 브라우저 데이터를 지우면 초기화됩니다. 저장이 차단된 환경에서는 창이 열려 있는 동안만 최고 기록을 유지하고 결과 화면에 알려줍니다.

## GitHub에 올리기

1. 이 폴더의 파일을 GitHub 저장소 루트에 넣습니다. assets와 shared 폴더를 함께 포함하세요.
2. GitHub 저장소 Settings → Pages → Source에서 **GitHub Actions**를 선택합니다.
3. main 브랜치에 올리면 포함된 배포 작업이 실행됩니다.
4. Pages에 표시된 주소로 게임에 접속합니다.

포함한 워크플로는 검사 후 게임 파일만 배포합니다. 기본 브랜치가 main이 아니면 .github/workflows/pages.yml의 branches를 바꾸세요. 모든 에셋 경로는 상대 경로여서 /저장소명/ 아래에서도 동작합니다.

이 저장소는 GitHub Desktop에서 관리합니다. GitHub Pages 설정을 활성화하면 포함된 워크플로로 게임을 배포할 수 있습니다.

## 내 컴퓨터에서 실행

Node.js 22 이상이 설치되어 있으면 이 폴더에서 다음 명령을 실행합니다. 게임 실행을 위한 패키지 설치는 필요 없습니다.

~~~sh
node scripts/serve.mjs
~~~

브라우저에서 http://127.0.0.1:4173을 여세요. 터미널에서 Ctrl+C를 누르면 미리보기가 종료됩니다. index.html을 더블클릭해서 여는 방식은 ES 모듈 보안 정책 때문에 지원하지 않습니다. GitHub Pages에서 실행할 때는 이 로컬 명령이 필요 없습니다.

## 파일 구성

| 파일·폴더 | 내용 |
|---|---|
| index.html / style.css / game.js | 게임 화면·모션·결과·최고 기록 저장 |
| assets/ | 실제 사용 WebP와 PNG 대체본, 고양이 좌표 JSON |
| shared/rules.js | 제한 시간·목표·페널티·보너스·책 순서·좌표 설정 |
| .github/workflows/pages.yml | GitHub Pages 배포 |
| scripts/serve.mjs | 로컬 미리보기 |
| tests/ | 게임 규칙과 브라우저 검사 |
| verification/ | 현재 버전의 스크린샷과 검사 결과 |
| docs/VERIFICATION.md | 실제 확인 내용 |

순위표 화면·별명 등록·참가자 ID·외부 API 호출·서버 코드·DB SQL·연결 설정은 이 버전에서 제거했습니다. 초기 화면의 코드·WebP 에셋 합계는 **343,868바이트(약 344KB)**입니다. WebP가 실패할 때만 PNG를 내려받고, 효과음은 Web Audio로 합성합니다.

## 방탈출 다음 단계 연결

성공한 판이 종료될 때 콜백을 지정했으면 콜백을 한 번, 없으면 이벤트를 한 번 발행합니다.

~~~js
window.addEventListener('library:book-sort-complete', ({ detail }) => {
  // detail: runId, score, mistakes, maxCombo, bonus, success, endAt
  // 다음 단서를 여는 코드를 여기에 넣으세요.
});
~~~

이벤트 대신 window.onGameComplete = detail => { ... } 콜백을 사용할 수도 있습니다. 결과 닫기나 다시 하기로 완료 신호가 반복되지 않습니다.

## 개발자 검증

~~~sh
npm test
npm run check
~~~

위 검사는 설치 없이 Node만으로 실행됩니다. 브라우저 검증을 실행할 때만 다음 테스트 도구가 필요합니다.

~~~sh
npm install
npx playwright install chromium --only-shell
npm run test:browser
npm run test:feedback
~~~

확인 환경: Node 24.22.1, Playwright 1.62.1, Chromium 151. 현재 버전에서 규칙 검사 5개와 브라우저 시나리오 16개를 통과했습니다. [자세한 검증 결과](docs/VERIFICATION.md)를 참고하세요.


