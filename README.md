# 유튜브 스크립트 & B-Roll 플래너 (ywriter)

1인 유튜버를 위한 대본 작성 + B-roll 촬영 계획 도구.
브라우저에서 바로 사용 가능 (별도 설치 불필요).

## 두 가지 모드

### 1. 원고 작성 모드 (`writing.html`)
벤치마킹 영상의 자막/대본을 좌측에 띄워두고, 우측에서 내 스타일로 원고를 작성합니다.
- 벤치마킹 원고 최대 2개 (탭 전환)
- 타임스탬프 자막(`.txt`) 자동 인식
- H1/H2/H3 계층 구조

### 2. B-Roll 모드 (`broll.html`)
완성된 대본의 각 섹션에 촬영할 B-roll 메모와 태그를 달아둡니다.
- 화면녹화 / 별도녹화 / 자료화면 + 커스텀 태그
- 촬영 체크리스트 자동 생성
- 텔레프롬프터 모드 (자동 스크롤)
- HTML 내보내기 (이어 편집 가능)

## 주요 기능
- **다크/라이트 모드** 토글
- **임시저장** (30초 자동, 브라우저 닫아도 복구 가능)
- **구조 되돌리기** (Ctrl+Z, 30단계)
- **마크다운 기반** 대본 작성
- **드래그 리사이즈** 컬럼 비율 조절
- **TOC 사이드바** 드래그 앤 드롭 순서 변경

## 사용법
1. `index.html`을 브라우저로 열기 (또는 GitHub Pages URL 접속)
2. 모드 선택 또는 파일 드롭
3. 작업 후 HTML/MD로 내보내기

## 단축키
- `Ctrl+S` 임시저장
- `Ctrl+Z` 되돌리기
- `Ctrl+E` 내보내기
- `Ctrl+P` 대본 모드 (텔레프롬프터)
- `Ctrl+1/2/3` 섹션 레벨 변경

## 파일 구조
```
ywriter/
├── index.html       — 모드 선택 진입 페이지
├── writing.html     — 원고 작성 모드
├── broll.html       — B-Roll 모드
├── css/style.css    — 공통 스타일
├── js/
│   ├── common.js    — 테마/저장/Undo 공통 로직
│   ├── writing.js   — 원고 작성 모드
│   └── broll.js     — B-Roll 모드
├── script-guide.md  — 대본 작성 가이드
└── README.md
```

## 기술
- 순수 HTML/CSS/JavaScript (빌드 불필요)
- marked.js (마크다운 파싱, CDN)
- Pretendard Variable (한글 폰트, CDN)
- localStorage 기반 임시저장
