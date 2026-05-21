# ECG Label Verification Site

업로드된 ECG PNG를 기반으로 만든 정적 검증 사이트입니다.

- AMI: 51 cases
- IMI: 58 cases
- LMI: 47 cases
- Total: 156 cases

## 파일 구조

```text
index.html                  # 메인 화면
review.html                 # ECG 검증 화면
style.css                   # 화면 스타일
app.js                      # 슬라이드 이동 / 로컬 저장 / Sheets 전송
config.js                   # 선택적 기본 설정
manifest.json               # ECG 이미지 목록
images/AMI/*.png
images/IMI/*.png
images/LMI/*.png
apps-script/Code.gs         # Google Sheets 저장용 Apps Script
```

## 로컬 테스트

그냥 `index.html`을 더블클릭해도 대체로 동작하지만, 브라우저 보안 정책 때문에 manifest 로딩이 막힐 수 있습니다. 그 경우 폴더에서 아래처럼 간단 서버를 띄우세요.

```bash
python -m http.server 8000
```

그 다음 브라우저에서 `http://localhost:8000`으로 접속합니다.

## GitHub Pages 배포

1. 이 폴더의 내용을 GitHub repository에 올립니다.
2. repository Settings에서 Pages를 활성화합니다.
3. 배포된 URL을 교수님께 공유합니다.

주의: 이 repository가 public이면 ECG 이미지도 사실상 공개 링크로 접근 가능해집니다. 민감 데이터라면 public GitHub Pages 대신 비공개 호스팅 또는 오프라인 HTML 전달 방식을 고려하세요.

## Google Sheets 연동

1. Google Sheet를 새로 만듭니다.
2. `Extensions > Apps Script`를 엽니다.
3. `apps-script/Code.gs` 내용을 붙여넣습니다.
4. 필요하면 `SECRET` 값을 설정합니다.
5. `Deploy > New deployment > Web app`으로 배포합니다.
   - Execute as: Me
   - Who has access: Anyone with the link
6. Web app URL을 복사해서 `index.html` 화면의 `Google Apps Script Web App URL` 입력칸에 붙여넣습니다.

## 저장 방식

- 입력 즉시 브라우저 `localStorage`에 저장됩니다.
- Apps Script URL이 설정되어 있으면 Google Sheets에 POST 전송을 시도합니다.
- 네트워크/권한 문제에 대비해 CSV 다운로드 버튼을 남겨두었습니다.

## 판정값

`verdict` 값은 다음 중 하나입니다.

- `match`: 해당 질병군 라벨이 맞아 보임
- `mismatch`: 해당 질병군 라벨이 아닌 것 같음
- `uncertain`: 판단 어려움

`observed_labels`와 `reasons`는 세미콜론으로 묶여 Google Sheets에 저장됩니다.
