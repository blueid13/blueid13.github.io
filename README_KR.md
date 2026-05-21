# ECG Label Verification Site - Simple Version

업로드된 ECG PNG를 기반으로 만든 정적 검증 사이트입니다.

- AMI: 51 cases
- IMI: 58 cases
- LMI: 47 cases
- Total: 156 cases

## 바뀐 점

- 메인 화면에서 Reviewer ID, Apps Script URL 입력칸, 저장 토큰, CSV 다운로드, 로컬 초기화 버튼을 제거했습니다.
- 질병군 선택에서 ALL을 제거했습니다.
- 판정 화면에서 이유 체크박스를 제거했습니다.
- Google Apps Script Web App URL은 `config.js`에 하드코딩합니다.

## Google Sheets 연동

1. Google Sheet를 새로 만듭니다.
2. `Extensions > Apps Script`를 엽니다.
3. `apps-script/Code.gs` 내용을 붙여넣습니다.
4. `Deploy > New deployment > Web app`으로 배포합니다.
   - Execute as: Me
   - Who has access: Anyone with the link
5. Web app URL을 복사합니다.
6. `config.js`에서 아래 값을 실제 URL로 바꿉니다.

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb.../exec"
```

## 저장 방식

- 입력하면 브라우저 내부에 임시 저장됩니다.
- 동시에 `config.js`에 설정된 Apps Script URL로 Google Sheets 전송을 시도합니다.
- Apps Script는 같은 `disease_group + case_id` 조합이 이미 있으면 행을 덮어씁니다.
  - 즉, Google Sheets에는 기본적으로 케이스당 최신 응답 1행만 남습니다.

## GitHub Pages 배포

이 폴더의 내용을 repository 루트에 올리고, repository Settings > Pages에서 `main / root`를 선택하면 됩니다.

주의: public repository에 올리면 ECG 이미지와 `config.js`에 들어간 Apps Script URL도 공개될 수 있습니다.
