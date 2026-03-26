# 특허 명세서
## 뜨개질 도안 진행 관리 시스템 및 방법

---

## 【발명의 명칭】

뜨개질 도안 진행 관리를 위한 콘텐츠 좌표 기반 인터랙티브 패턴 뷰어 시스템 및 방법

---

## 【기술분야】

본 발명은 뜨개질(편물) 도안 파일(이미지 또는 PDF)을 웹 브라우저 환경에서 열람하면서 진행 상황을 실시간으로 추적·저장하는 시스템 및 방법에 관한 것이다. 구체적으로는 콘텐츠 상대 좌표(Content-Relative Coordinate) 체계, 다중 서브패턴(Sub-Pattern) 독립 관리, 진행선(Row Ruler)의 양방향 미리보기 렌더링, 조합형 포인터 이벤트 기반 드래그 제어, 뷰포트 변환 보존 저장, PDF 다중 페이지 좌표 정규화 등 복수의 핵심 알고리즘을 통합하는 인터랙티브 뷰어에 관한 것이다.

---

## 【배경기술】

종래 뜨개질 도안 관리 방법으로는 종이 출력 도안에 직접 표시하거나, 일반 이미지 뷰어로 파일을 열람하면서 별도 수기 메모를 작성하는 방식이 주로 사용되었다. 이러한 방식은 다음과 같은 문제점을 가진다.

(1) **좌표 비영속성 문제**: 일반 이미지 뷰어에서 마커나 진행 위치를 표시하더라도 화면 해상도, 디바이스 방향(세로/가로), 줌 상태가 바뀌면 좌표가 어긋나거나 소실된다.

(2) **단수(Row) 추적 부재**: 현재 작업 중인 단수를 파일 뷰어와 연동하여 표시하는 기능이 없으며, 여러 서브패턴(앞판, 뒷판, 소매 등)을 독립적으로 관리하는 수단이 없다.

(3) **PDF 다중 페이지 좌표 왜곡**: PDF 뷰어에서 여러 페이지에 걸친 도안 파일에 마커를 배치할 경우, 페이지 전환 시 마커 위치가 전체 문서 높이 기준으로 재계산되지 않아 오차가 발생한다.

(4) **터치 인터페이스 충돌**: 모바일 환경에서 마커 이동(드래그)과 도안 스크롤(패닝) 동작이 충돌하여 의도치 않은 마커 이동이 자주 발생한다.

(5) **진행 방향 모호성**: 뜨개질 방식에 따라 도안을 위에서 아래로 또는 아래에서 위로 진행하므로, 단일 방향 진행선만으로는 다음 단(Row)의 위치 예측이 불가능하다.

(6) **문서 뷰포트 비복원**: 뷰어를 닫고 재진입 시 이전 줌·패닝 상태가 복원되지 않아 작업 연속성이 떨어진다.

본 발명은 위 문제점들을 해결하기 위해 고안되었다.

---

## 【발명의 내용】

### 해결하려는 과제

본 발명이 해결하고자 하는 과제는 다음과 같다.

1. 디바이스 해상도, 방향, 줌·패닝 상태에 무관하게 영속적으로 유효한 좌표 체계를 확립하는 것.
2. PDF 다중 페이지 도안에서 발생하는 좌표 왜곡 문제를 해소하는 것.
3. 하나의 도안 파일 안에서 복수의 작업 구간(서브패턴)을 독립적인 단수·메모와 함께 관리하는 것.
4. 터치 드래그와 화면 스크롤 간의 입력 충돌을 제거하면서도 마커 이동 기능을 제공하는 것.
5. 진행선의 상하 양방향 다음 단 미리보기를 제공하여 다양한 뜨개질 방향을 지원하는 것.
6. 작업 상태(줌·패닝·진행선·단수·마커·메모 등)를 자동 저장하고, 재진입 시 진행선 위치로 자동 이동하는 것.

### 과제의 해결 수단

본 발명은 다음의 기술적 수단을 통해 위 과제를 해결한다.

**[수단 1]** 콘텐츠 상대 좌표(Content-Relative Percentage Coordinate) 체계를 채택하여 모든 인터랙티브 요소(진행선, 마커, 완료 표시 영역, 메모 위치)의 좌표를 이미지 전체 높이 대비 백분율(0–100%)로 저장한다.

**[수단 2]** PDF 다중 페이지 처리 시, 페이지별 높이가 아닌 전체 렌더링 높이(totalHeight)를 기준으로 좌표를 정규화하여 PDF 전 페이지에 걸쳐 일관된 마커 위치를 보장한다.

**[수단 3]** 진행선 표시 방향(direction: 'up' | 'down')을 사용자가 전환할 수 있도록 하고, 현재 진행선 위치로부터 상하 방향으로 최대 10개의 다음 단 위치를 반투명 점감 방식으로 미리보기 렌더링한다.

**[수단 4]** 하나의 도안 파일에 독립적인 복수의 서브패턴 구간을 생성하고, 각 구간마다 독립적인 단수 카운터, 총 단수 설정, 메모 저장소를 부여한다. 메모 키를 `${서브패턴ID}:${단수}` 형식으로 정의하여 서브패턴 전환 시에도 메모가 손실되지 않도록 한다.

**[수단 5]** 마커 이동 인터랙션에 롱프레스(long-press, 400ms) + 이동 거리 임계값(8px) 조합 방식을 적용하여, 단순 탭(마커 선택)과 드래그(마커 이동)를 명확히 구분하며, 롱프레스 대기 중 8px 초과 이동 시 포인터 캡처를 해제하여 도안 패닝이 재개되도록 한다.

**[수단 6]** 뷰포트 변환(scale, x, y)을 데이터베이스에 저장하고, 패턴 뷰어 재진입 시 저장된 뷰포트 복원 여부와 무관하게 항상 진행선 위치로 자동 스크롤하는 초기화 로직을 수행한다.

**[수단 7]** 500ms 디바운스 자동 저장 메커니즘을 통해 모든 작업 상태(단수, 진행선 위치·높이·방향, 완료 표시, 마커, 메모, 서브패턴, 뷰포트)를 단일 레코드에 upsert 방식으로 클라우드 데이터베이스에 저장한다.

**[수단 8]** 실행 취소(Undo)/다시 실행(Redo) 이력 스택(최대 20개 스냅샷)을 유지하여 단수·진행선·마커 변경 사항을 되돌릴 수 있도록 한다.

### 발명의 효과

본 발명에 의하면 다음의 효과가 얻어진다.

- 뜨개질 도안 파일을 디지털 환경에서 열람하면서 진행 상황을 정밀하게 추적·저장할 수 있다.
- 콘텐츠 상대 좌표 체계로 인해 디바이스 회전, 줌 변경, 창 크기 조정 후에도 마커·진행선 위치가 항상 정확히 유지된다.
- PDF 도안의 경우 다중 페이지 전 구간에 걸쳐 오차 없는 좌표 매핑이 실현된다.
- 서브패턴 독립 관리로 복잡한 구성 도안(앞판+뒷판+소매 등)을 단일 파일에서 효율적으로 추적할 수 있다.
- 롱프레스 기반 드래그 방식으로 모바일 환경에서의 입력 충돌이 해소된다.
- 재진입 시 자동 진행선 복원으로 작업 연속성이 향상된다.

---

## 【발명을 실시하기 위한 구체적인 내용】

### 제1 실시예: 콘텐츠 상대 좌표 체계 및 뷰포트 변환 파이프라인

#### 1.1 좌표 체계 정의

본 실시예에서 모든 인터랙티브 요소의 위치는 **콘텐츠 상대 좌표(Content-Relative Percentage, 이하 CRP)**로 저장된다. CRP는 대상 이미지(또는 PDF 전체 렌더링 영역)의 전체 높이(imgH)를 기준으로 한 백분율 값이다.

```
CRP_y = (pixel_y_from_image_top / imgH) × 100  (단위: %)
```

이미지가 뷰어 컨테이너 중앙에 레터박스(letterbox) 방식으로 배치될 때, 이미지 상단의 컨테이너 내 픽셀 오프셋은 다음과 같이 계산된다.

```
imgTop_px = (containerH - imgH) / 2
```

#### 1.2 CRP → 화면 Y좌표 변환 (contentToScreenY)

뷰어에 적용된 뷰포트 변환(viewTransform = {scale, x, y})과 컨테이너 크기를 고려하여 CRP를 화면 Y좌표 백분율로 변환한다.

```
[입력]
  imagePct  : CRP 좌표 (0–100, %)
  containerH: 뷰어 컨테이너 픽셀 높이
  imgH      : 렌더링된 이미지 픽셀 높이
  scale     : 현재 줌 배율
  ty        : 현재 수직 패닝 오프셋 (px)

[계산]
  imgTop    = (containerH - imgH) / 2
  contentY  = imgTop + (imagePct / 100) × imgH        // 이미지 내 픽셀 위치
  screenY   = (contentY - containerH/2) × scale
               + containerH/2 + ty                    // 뷰포트 변환 적용
  결과      = (screenY / containerH) × 100            // 화면 백분율로 정규화
```

#### 1.3 화면 Y좌표 → CRP 역변환 (screenToContentY)

사용자 터치/클릭 이벤트로부터 화면 좌표를 CRP로 변환하는 역함수이다.

```
[입력]
  screenPct : 화면 Y좌표 백분율 (0–100, %)

[계산]
  screenY   = (screenPct / 100) × containerH
  contentY  = (screenY - containerH/2 - ty) / scale
               + containerH/2                         // 뷰포트 역변환
  imageY    = contentY - imgTop                       // 이미지 기준 픽셀 위치
  결과      = (imageY / imgH) × 100                  // CRP
```

#### 1.4 PDF 다중 페이지 좌표 정규화

PDF 도안이 N개 페이지로 구성될 경우, 렌더링 컴포넌트는 각 페이지를 수직으로 연결하여 단일 스크롤 가능 영역으로 표시한다. 이때 이미지 크기 보고 함수(reportImageSize)는 다음을 준수한다.

```
reportImageSize() {
  totalH = element.offsetHeight  // 전체 PDF 렌더링 높이 (N페이지 합산)
  totalW = element.offsetWidth
  onImageSizeCallback(totalW, totalH)
}
```

이를 통해 진행선 위치 50%는 항상 전체 PDF 중간 지점을 가리키며, 1페이지만 표시하는 일반 이미지와 동일한 좌표 의미론을 유지한다. (종래 방식: `totalH / pdfPages`를 사용하여 단일 페이지 높이 기준으로 보고함으로써 N페이지 PDF에서 N배 오차가 발생하는 문제가 있었다.)

---

### 제2 실시예: 진행선(Row Ruler) 양방향 미리보기 렌더링

#### 2.1 진행선 구성 요소

진행선은 다음 요소로 구성된다.

- **메인 밴드(Main Band)**: 사용자가 설정한 현재 단 위치(rulerY)와 높이(rulerHeight)를 갖는 수평 투명 오버레이 영역. 색상: `rgba(180,100,50,0.15)`.
- **상단 그림자(Top Shadow)**: 메인 밴드 위쪽 전체 영역에 25% 불투명도 검정 오버레이.
- **하단 그림자(Bottom Shadow)**: 메인 밴드 아래쪽 전체 영역에 25% 불투명도 검정 오버레이.
- **미리보기 라인(Preview Lines)**: 다음 단 위치를 예측하여 표시하는 반투명 수평 라인.

#### 2.2 미리보기 라인 계산 알고리즘

```
[입력]
  positionY  : 현재 진행선 위치 (CRP %)
  height     : 진행선 높이 (CRP %)
  direction  : 'up' | 'down'
  count      : 표시할 미리보기 라인 수 (기본값 10)

[계산 - direction = 'up']
  for i in 1..count:
    lineY[i] = positionY - height × i        // 위 방향으로 한 단씩 이동
    opacity[i] = max(0.10, 0.85 - i × 0.08)  // 멀수록 투명

[계산 - direction = 'down']
  for i in 1..count:
    lineY[i] = positionY + height × i        // 아래 방향으로 한 단씩 이동
    opacity[i] = max(0.10, 0.85 - i × 0.08)
```

각 미리보기 라인은 `top: lineY[i]%`, `height: height%`의 CSS 속성을 갖는 수평 밴드로 렌더링된다.

#### 2.3 진행선 이동 인터랙션

진행선 본체에 포인터다운(pointerdown) 이벤트가 발생하면 즉시 드래그 모드로 진입한다.

```
handleBodyPointerDown(e) {
  el.setPointerCapture(e.pointerId)   // 포인터 캡처로 이동 중 손실 방지
  dragStartY = toPercent(e.clientY)
  dragStartRulerY = rulerY
  isDragging = true
}

handlePointerMove(e) {
  if (!isDragging) return
  delta = toPercent(e.clientY) - dragStartY
  newY  = clamp(dragStartRulerY + delta, 0, 100 - rulerHeight)
  onMove(newY)                        // 부모 컴포넌트에 위치 변경 통지
}
```

높이 조정은 진행선 하단 영역에서 롱프레스(300ms) 후 포인터 이동으로 수행된다.

---

### 제3 실시예: 다중 서브패턴(Sub-Pattern) 독립 관리

#### 3.1 서브패턴 데이터 구조

```typescript
interface SubPattern {
  id          : string   // UUID v4
  name        : string   // 사용자 지정 이름 (기본값: "${언어별 접두어} ${순번}")
  total_rows  : number   // 총 단수
  current_row : number   // 현재 작업 단수
}
```

여러 서브패턴이 단일 패턴에 종속되며, 독립적인 단수 카운터를 가진다. 활성 서브패턴은 `activeSubId` 상태로 관리된다.

#### 3.2 서브패턴 독립 메모 키 체계

메모(Notes)는 다음 키 형식으로 저장된다.

```
메모 키 = "${서브패턴 UUID}:${단수 정수}"
```

예시:
```
"a1b2c3d4:15"  → 서브패턴 a1b2c3d4의 15단 메모
"e5f6g7h8:3"   → 서브패턴 e5f6g7h8의 3단 메모
```

이 체계에 의해 동일한 단수 번호라도 서브패턴이 다르면 별개의 메모로 저장되며, 서브패턴 전환 시에도 메모 데이터가 유실되지 않는다.

#### 3.3 서브패턴 진행 합산

대시보드 카드 표시용 진행률은 모든 서브패턴의 단수를 합산하여 계산된다.

```
totalRows   = Σ subPatterns[i].total_rows
currentRows = Σ subPatterns[i].current_row
progress    = min(100, currentRows / totalRows × 100)  // %
```

---

### 제4 실시예: 조합형 롱프레스 드래그 마커 인터랙션

#### 4.1 마커 상태 머신

마커 요소는 다음 4가지 상태를 갖는다.

| 상태 | 조건 | 시각 표현 |
|------|------|-----------|
| `normal` | 기본 상태 | 스케일 1.0, 낮은 채도 |
| `selected` | 탭 후 선택 | 스케일 1.0, 높은 채도, 삭제 버튼 표시 |
| `longPressing` | pointerDown ~ 400ms | 스케일 1.1, 진동 피드백 |
| `dragging` | 400ms 경과 후 이동 | 스케일 1.2, 드래그 섀도우 |

#### 4.2 롱프레스 드래그 인식 알고리즘

```
handleMarkerPointerDown(mark, e) {
  el = e.currentTarget
  el.setPointerCapture(e.pointerId)       // 즉시 포인터 캡처
  selectedId    = mark.id
  longPressingId = mark.id
  captureRef    = { el, pointerId, startX: e.clientX, startY: e.clientY }

  // 400ms 타이머 시작 (롱프레스 임계값)
  longPressTimer = setTimeout(() => {
    draggingId   = mark.id
    longPressingId = null
    dragStartRef = { x: startX, y: startY, markX: mark.x, markY: mark.y }
  }, 400)
}

handlePointerMove(e) {
  if (draggingId !== null) {
    // 드래그 모드: 마커 위치 갱신
    dx = ((e.clientX - dragStartRef.x) / containerW) × 100
    dy = ((e.clientY - dragStartRef.y) / containerH) × 100
    onMove(draggingId, dragStartRef.markX + dx, dragStartRef.markY + dy)
    return
  }

  if (longPressTimer !== null) {
    // 롱프레스 대기 중: 이동 거리 임계값 체크
    dist = hypot(e.clientX - captureRef.startX, e.clientY - captureRef.startY)
    if (dist > 8) {
      // 8px 초과 이동 → 롱프레스 취소, 포인터 캡처 해제 → 도안 패닝 재개
      clearTimeout(longPressTimer)
      longPressingId = null
      el.releasePointerCapture(pointerId)
      captureRef = null
    }
  }
}
```

#### 4.3 마커 좌표 저장 형식

```typescript
interface KnittingMark {
  id    : string   // UUID
  x     : number   // 컨테이너 너비 대비 % (0–100)
  y     : number   // 컨테이너 높이 대비 % (0–100)
  label : string   // 표시 레이블 (최대 3자)
}
```

대바늘(Knitting) 마커는 보라색(violet) 계열, 코바늘(Crochet) 마커는 장미색(rose) 계열 핀 아이콘으로 구별된다.

---

### 제5 실시예: 완료 표시 오버레이(Completed Mark) 및 좌표 변환

#### 5.1 완료 표시 데이터 구조

```typescript
interface CompletedMark {
  y      : number   // CRP 기준 상단 위치 (%)
  height : number   // CRP 기준 높이 (%)
}
```

완료 표시는 이미지 상대 좌표(CRP)로 저장되므로 줌·패닝 상태 변화에 무관하게 항상 동일한 도안 위치에 표시된다.

#### 5.2 완료 표시 화면 렌더링 변환

저장된 CRP 좌표를 현재 뷰포트 기준 화면 좌표로 변환하여 렌더링한다.

```
screenMark.y      = contentToScreenY(mark.y)
screenMark.height = contentToScreenY(mark.y + mark.height) - screenMark.y
```

#### 5.3 완료 표시 수정 역변환

사용자가 화면에서 완료 표시를 이동/크기 조정하면 화면 좌표를 다시 CRP로 역변환하여 저장한다.

```
toImagePct(screenPct) {
  screenY  = (screenPct / 100) × containerH
  contentY = (screenY - containerH/2 - ty) / scale + containerH/2
  imageY   = contentY - (containerH - imgH) / 2   // 레터박스 오프셋 제거
  return imgH > 0 ? (imageY / imgH) × 100 : (contentY / containerH) × 100
}
```

#### 5.4 완료 표시 리사이즈 모드

완료 표시 선택 시 상단/하단 핸들(8px 높이)이 표시된다.

```
resize-top    : y += delta, height -= delta  // 상단 핸들 이동
resize-bottom : height += delta              // 하단 핸들 이동
최소 높이     : height >= 0.5%              // 최소 높이 제한
```

---

### 제6 실시예: 피벗 포인트 줌(Pivot-Point Zoom) 알고리즘

#### 6.1 수식 정의

줌 수행 시 화면상의 특정 피벗 지점(pivot)이 줌 전후에 동일한 화면 위치를 유지해야 한다. 이를 위해 다음 변환이 적용된다.

```
applyZoom(prevTransform, newScale, pivotX, pivotY) {
  ratio = newScale / prevTransform.scale
  return {
    scale : newScale,
    x     : prevTransform.x × ratio + pivotX × (1 - ratio),
    y     : prevTransform.y × ratio + pivotY × (1 - ratio),
  }
}
```

여기서 `pivotX`, `pivotY`는 컨테이너 중심을 원점으로 하는 픽셀 오프셋이다.

#### 6.2 입력별 피벗 선택

| 입력 유형 | 피벗 위치 |
|-----------|-----------|
| 마우스 휠 줌 | 컨테이너 중심 (0, 0) |
| 터치 핀치 줌 | 두 터치 포인트 중점 |
| 더블탭 줌 | 탭 위치 |
| 버튼 줌 (+/-) | 컨테이너 중심 (0, 0) |

#### 6.3 터치 핀치 제스처 처리

```
onTouchMove(e) {
  if (e.touches.length < 2) return
  t1 = e.touches[0], t2 = e.touches[1]

  midX    = (t1.clientX + t2.clientX) / 2
  midY    = (t1.clientY + t2.clientY) / 2
  dist    = hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)

  ratio   = dist / lastDist
  newScale = clamp(prevScale × ratio, 0.5, 5.0)
  pivotX  = midX - containerW/2
  pivotY  = midY - containerH/2

  newTransform = applyZoom(prevTransform, newScale, pivotX, pivotY)

  // 패닝: 두 손가락 중점 이동량
  panDx = midX - lastMidX
  panDy = midY - lastMidY
  newTransform.x += panDx
  newTransform.y += panDy
}
```

#### 6.4 패닝 경계 클램핑

이미지가 화면 밖으로 완전히 벗어나지 않도록 패닝 오프셋을 제한한다.

```
clampOffset(imgSize, containerSize, scale, offset) {
  scaledImg = imgSize × scale
  if (scaledImg <= containerSize) return 0   // 이미지가 컨테이너보다 작으면 중앙 고정
  maxT = (scaledImg - containerSize) / 2
  return clamp(offset, -maxT, maxT)
}
```

---

### 제7 실시예: 자동 저장 및 뷰포트 복원 시스템

#### 7.1 디바운스 자동 저장

```
useAutoSave(saveFn, data, delay = 500) {
  useEffect(() => {
    const timer = setTimeout(async () => {
      setStatus('saving')
      try {
        await saveFn(data)
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } catch {
        setStatus('error')
      }
    }, delay)
    return () => clearTimeout(timer)   // 다음 변경 시 이전 타이머 취소
  }, [data])
}
```

저장 대상 데이터는 단일 객체로 통합된다.

```typescript
interface SaveData {
  current_row      : number
  ruler_position_y : number        // CRP %
  ruler_height     : number        // CRP %
  ruler_direction  : 'up' | 'down'
  completed_marks  : CompletedMark[]
  crochet_marks    : CrochetMark[]
  knitting_marks   : KnittingMark[]
  notes            : Record<string, string>
  note_positions   : Record<string, {x: number, y: number}>
  sub_patterns     : SubPattern[]
  active_sub_pattern_id : string
  view_scale       : number        // 뷰포트 줌 배율
  view_x           : number        // 뷰포트 X 오프셋 (px)
  view_y           : number        // 뷰포트 Y 오프셋 (px)
}
```

#### 7.2 재진입 시 진행선 자동 이동

패턴 뷰어 초기 진입 시, 이미지 크기가 확정된 직후 진행선 위치로 자동 스크롤한다.

```
handleImageSize(w, h) {
  imgW = w; imgH = h
  if (!initialScrollDone && h > 0) {
    initialScrollDone = true
    // 렌더링 완료 후 두 번의 rAF으로 스크롤 실행
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        viewerRef.current.goToRuler()
      })
    })
  }
}

goToRuler() {
  // 진행선 중앙이 화면 중앙에 오도록 뷰포트 변환 계산
  rulerScreenY = contentToScreenY(rulerY + rulerHeight / 2)
  targetOffset = containerH/2 - rulerScreenY × containerH / 100
  setViewTransform(prev => ({ ...prev, y: prev.y + targetOffset }))
}
```

#### 7.3 저장 오류 처리

null-coalescing 연산자를 사용하여 rulerY = 0인 경우(도안 최상단)를 50(기본값)으로 오인하는 버그를 방지한다.

```
// 잘못된 방식 (0 || 50 → 50으로 평가됨)
const rulerY = progress.ruler_position_y || 50

// 올바른 방식 (0 ?? 50 → 0으로 평가됨)
const rulerY = progress.ruler_position_y ?? 50
```

---

### 제8 실시예: 실행 취소/다시 실행 이력 관리

#### 8.1 스냅샷 구조

```typescript
interface Snapshot {
  subPatterns  : SubPattern[]
  activeSubId  : string
  rulerY       : number
  rulerHeight  : number
  rulerDirection: RulerDirection
  completedMarks: CompletedMark[]
  crochetMarks : CrochetMark[]
  knittingMarks: KnittingMark[]
}
```

#### 8.2 이력 관리 알고리즘

```
captureHistory() {
  snapshot = { ...현재 상태 }
  undoStack.push(snapshot)
  if (undoStack.length > MAX_HISTORY) undoStack.shift()  // 오래된 이력 제거
  redoStack.clear()                                       // 새 변경 시 redo 초기화
}

undo() {
  if (undoStack.empty) return
  redoStack.push({ ...현재 상태 })
  prev = undoStack.pop()
  상태 복원(prev)
}

redo() {
  if (redoStack.empty) return
  undoStack.push({ ...현재 상태 })
  next = redoStack.pop()
  상태 복원(next)
}
```

#### 8.3 단축키 바인딩

| 키 조합 | 동작 |
|---------|------|
| Ctrl+Z / Cmd+Z | 실행 취소 |
| Ctrl+Y / Cmd+Y | 다시 실행 |
| Ctrl+Shift+Z / Cmd+Shift+Z | 다시 실행 |

---

### 제9 실시예: 다국어 번역 시스템

#### 9.1 번역 함수

```typescript
t(key: string, vars?: Record<string, string | number>): string {
  str = translations[lang][key]
       ?? translations['ko'][key]   // 번역 미존재 시 한국어 폴백
       ?? key                        // 키 미존재 시 키 자체 반환

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v))   // 변수 보간
    }
  }
  return str
}
```

지원 언어: 한국어(ko), 영어(en), 일본어(ja), 중국어(zh), 스페인어(es), 프랑스어(fr), 이탈리아어(it), 독일어(de), 포르투갈어(pt), 러시아어(ru), 노르웨이어(no), 네덜란드어(nl) — 총 12개 언어.

#### 9.2 언어 설정 지속성

사용자 언어 설정은 두 곳에 저장된다.

1. **localStorage**: 키 `knitting_in_the_sauna_lang` — 오프라인 접속 시에도 언어 유지.
2. **Supabase Auth 사용자 메타데이터**: `supabase.auth.updateUser({ data: { language } })` — 다기기 동기화 지원.

---

### 제10 실시예: 파일 업로드 파이프라인

#### 10.1 프리사인드 URL 기반 직접 업로드

클라이언트가 파일을 서버 프록시 없이 클라우드 스토리지(R2)에 직접 업로드하는 방식이다.

```
1. 클라이언트 → 엣지 함수: POST /r2-presign
   payload: { path, contentType }

2. 엣지 함수 → 클라이언트: { presignedUrl, fileUrl }
   (presignedUrl: 임시 서명된 PUT URL, 유효 시간 제한)

3. 클라이언트 → R2: PUT presignedUrl
   body: 파일 바이너리

4. 클라이언트 → Supabase DB: UPDATE patterns SET file_url = fileUrl
```

#### 10.2 PDF 썸네일 비동기 생성

```
generatePdfThumbnail(file):
  1. pdfjs-dist 동적 임포트 (지연 로딩)
  2. file.arrayBuffer() → PDF 문서 파싱
  3. 1페이지 가져오기: pdf.getPage(1)
  4. 스케일 1.5x 뷰포트로 canvas 렌더링
  5. canvas.toBlob(jpeg, 0.8) → Blob 반환
  6. 별도 r2-presign 요청으로 썸네일 업로드
  7. 썸네일 업로드 실패 시: 무시하고 계속 진행 (graceful degradation)
```

#### 10.3 트랜잭션 오류 복구

패턴 등록 과정에서 오류 발생 시 다음 순서로 정리한다.

```
on error:
  1. DB 레코드 삭제: DELETE FROM patterns WHERE id = createdPatternId
                     DELETE FROM pattern_progress WHERE pattern_id = createdPatternId
  2. R2 파일 삭제: POST /r2-delete { urls: uploadedUrls }
  3. (fire-and-forget, 실패 무시)
```

---

### 제11 실시예: 인증 및 계정 관리

#### 11.1 인앱 브라우저 감지

소셜 앱(인스타그램, 카카오톡 등) 내 웹뷰에서는 OAuth 리디렉션이 차단되므로 사전 감지하여 대체 흐름을 제공한다.

```typescript
isInAppBrowser(): boolean {
  ua = navigator.userAgent
  return /KAKAOTALK|Instagram|Threads|FBAN|FBAV|Line|Twitter|
          Snapchat|Musical\.ly|TikTok|LinkedInApp|Bytedance/i.test(ua)
      || (/Android/.test(ua) && !/Chrome\//.test(ua) && /Version\//.test(ua))
}
```

인앱 브라우저 감지 시: URL 복사 버튼 및 비회원 로그인 버튼 표시.

#### 11.2 익명 → 정식 계정 전환

```
// 비회원(익명) 로그인
supabase.auth.signInAnonymously()

// 구글 계정 연동 (기존 데이터 보존)
supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: origin } })
```

---

### 제12 실시예: 화면 유지(Wake Lock) 인터페이스

뜨개질 작업 중 기기 화면이 자동으로 꺼지지 않도록 Screen Wake Lock API를 활용한다.

```typescript
useWakeLock() {
  request():
    lock = await navigator.wakeLock.request('screen')

  release():
    lock?.release()
    lock = null
}
```

패턴 뷰어 진입 시 Wake Lock 요청, 이탈 시 해제. 브라우저 미지원 시 graceful degradation.

---

## 【청구범위】

**【청구항 1】**
뜨개질 도안 파일(이미지 또는 PDF)을 웹 브라우저 환경에서 열람하는 뷰어 시스템에 있어서,
모든 인터랙티브 요소의 위치를 도안 이미지 전체 높이 대비 백분율로 표현하는 콘텐츠 상대 좌표(Content-Relative Percentage Coordinate) 저장 수단;
현재 줌 배율, 수평 패닝 오프셋, 수직 패닝 오프셋을 포함하는 뷰포트 변환 상태에 기초하여 상기 콘텐츠 상대 좌표를 화면 Y좌표 백분율로 변환하는 contentToScreenY 변환 함수; 및
사용자 입력에 의한 화면 Y좌표를 상기 콘텐츠 상대 좌표로 역변환하는 screenToContentY 역변환 함수;
를 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 2】**
청구항 1에 있어서,
PDF 도안 파일이 N개 페이지로 구성될 때 N개 페이지의 렌더링 높이를 합산한 총 높이(totalHeight)를 기준으로 좌표를 정규화하여, 모든 마커 및 진행선 위치가 전체 PDF 문서 범위에 걸쳐 단일 좌표계로 관리되도록 하는 PDF 다중 페이지 좌표 정규화 수단을 더 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 3】**
청구항 1에 있어서,
현재 단(Row)의 위치와 높이를 나타내는 메인 밴드;
진행 방향(direction: 'up' 또는 'down')에 따라 현재 메인 밴드로부터 순방향으로 N개(기본값 10)의 다음 단 위치를 산출하고, 각 미리보기 라인의 불투명도를 `max(0.10, 0.85 - i × 0.08)` 수식으로 점감시켜 렌더링하는 미리보기 라인 생성 수단; 및
현재 단 위치 상하에 반투명 그림자 오버레이를 렌더링하는 수단;
을 포함하는 양방향 진행선(Row Ruler) 구성요소를 더 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 4】**
청구항 1에 있어서,
단일 도안 파일 내에 각각 독립적인 단수 카운터, 총 단수 설정, 활성 상태를 갖는 복수의 서브패턴(Sub-Pattern)을 정의하는 수단; 및
메모를 `${서브패턴 식별자}:${단수}` 형식의 복합 키로 저장하여 서브패턴별 단수별 독립 메모를 지원하는 수단;
을 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 5】**
청구항 1에 있어서,
마커에 대한 포인터 다운 이벤트 발생 즉시 포인터 캡처를 설정하는 수단;
400ms 타이머가 경과한 후 드래그 모드를 활성화하는 롱프레스 임계값 수단; 및
상기 롱프레스 타이머 대기 중 포인터 이동 거리가 8픽셀을 초과하면 타이머를 취소하고 포인터 캡처를 해제하여 도안 패닝 동작이 재개되도록 하는 이동 거리 임계값 수단;
을 포함하는 조합형 롱프레스 드래그 마커 인터랙션 처리 수단을 더 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 6】**
청구항 1에 있어서,
단수·진행선·마커 변경 전 상태를 최대 20개 스냅샷 이력 스택에 기록하는 수단;
실행 취소(Undo) 및 다시 실행(Redo) 명령에 따라 상기 스택에서 스냅샷을 꺼내 상태를 복원하는 수단;
500ms 디바운스 자동 저장을 통해 현재 작업 상태 전체를 클라우드 데이터베이스에 단일 레코드로 upsert하는 수단; 및
재진입 시 이미지 크기가 확정된 직후 진행선 위치로 자동 스크롤하는 초기화 수단;
을 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 7】**
청구항 1에 있어서,
줌 수행 시 피벗 지점 P(pivotX, pivotY)에 대해 다음 수식을 적용하여 상기 피벗 지점이 줌 전후 동일한 화면 위치를 유지하도록 하는 피벗 포인트 줌 알고리즘을 포함하는 제스처 처리 수단을 더 포함하며,
```
ratio = newScale / prevScale
newX  = prevX × ratio + pivotX × (1 - ratio)
newY  = prevY × ratio + pivotY × (1 - ratio)
```
상기 피벗 지점은 터치 핀치 제스처 시 두 터치 포인트의 중점으로 설정되는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 8】**
청구항 1에 있어서,
완료 표시 영역이 이미지 상대 좌표로 저장되고,
화면 렌더링 시 contentToScreenY 함수를 통해 현재 뷰포트 기준 화면 좌표로 변환되며,
사용자 드래그 수정 시 화면 좌표가 이미지 상대 좌표로 역변환되어 저장되는
완료 표시 오버레이(Completed Mark Overlay)를 더 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 9】**
청구항 1에 있어서,
클라이언트가 서버 프록시를 경유하지 않고 엣지 함수로부터 임시 서명된 PUT URL(presigned URL)을 발급받아 클라우드 스토리지에 직접 파일을 업로드하는 수단; 및
PDF 파일의 경우 pdfjs-dist 라이브러리를 동적으로 임포트하여 첫 페이지를 1.5배 스케일의 캔버스에 렌더링하고 JPEG 형식(품질 80%)의 썸네일 Blob을 생성하는 비동기 썸네일 생성 수단;
을 더 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 10】**
청구항 1에 있어서,
사용자 에이전트 문자열에서 인스타그램, 카카오톡, 라인, TikTok 등 소셜 앱 내 웹뷰를 감지하는 수단; 및
인앱 브라우저 감지 시 OAuth 로그인 대신 URL 복사 버튼 및 익명 로그인 버튼을 제공하는 대체 인증 흐름 수단;
을 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 11】**
청구항 1에 있어서,
Screen Wake Lock API를 통해 패턴 뷰어 열람 중 기기 화면이 자동으로 꺼지지 않도록 유지하는 화면 유지 수단을 더 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 12】**
청구항 4에 있어서,
복수의 서브패턴 각각의 단수를 합산한 누적 단수와 총 단수를 기반으로 전체 진행률을 산출하는 수단을 더 포함하는 것을 특징으로 하는 뜨개질 도안 진행 관리 시스템.

**【청구항 13】**
청구항 1에 따른 시스템을 구현하는 방법으로서,
도안 파일을 뷰어에 로드하는 단계;
이미지 렌더링 크기가 확정되면 저장된 진행선 위치로 자동 스크롤하는 단계;
사용자 입력을 포인터 이벤트로 수신하여 진행선 이동, 마커 배치, 단수 변경, 완료 표시 추가 중 적어도 하나를 수행하는 단계;
500ms 디바운스 타이머에 의해 현재 작업 상태 전체를 클라우드 데이터베이스에 저장하는 단계; 및
변경 전 상태를 이력 스택에 기록하여 실행 취소 가능하도록 하는 단계;
를 포함하는 뜨개질 도안 진행 관리 방법.

---

## 【요약】

본 발명은 뜨개질 도안 파일(이미지·PDF)을 웹 브라우저에서 열람하면서 진행 상황을 추적·저장하는 시스템 및 방법에 관한 것이다. 핵심 기술로 (1) 모든 인터랙티브 요소 위치를 이미지 전체 높이 대비 백분율로 저장하는 콘텐츠 상대 좌표 체계, (2) PDF 다중 페이지 전 구간을 단일 좌표계로 정규화하는 방법, (3) 단방향이 아닌 상하 양방향 다음 단 미리보기를 제공하는 진행선 렌더링, (4) 단일 도안에 복수의 독립 서브패턴 구간을 관리하는 방법, (5) 롱프레스(400ms)와 이동 거리 임계값(8px)을 조합하여 터치 드래그와 화면 스크롤을 구분하는 마커 인터랙션, (6) 피벗 포인트 기반 핀치 줌 알고리즘, (7) 재진입 시 진행선 자동 복원 및 500ms 디바운스 자동 저장 메커니즘을 포함한다. 이를 통해 디바이스 회전·줌·창 크기 변경에 무관하게 마커 및 진행선 위치가 항상 정확히 유지되며, 복잡한 뜨개질 도안의 진행 상황을 체계적으로 디지털 관리할 수 있다.

---

## 【도면의 간단한 설명】

(도면 제출 시 아래 항목에 대한 도면 첨부 요망)

- **도 1**: 시스템 전체 아키텍처 블록 다이어그램
- **도 2**: 콘텐츠 상대 좌표 변환 파이프라인 (contentToScreenY / screenToContentY)
- **도 3**: PDF 다중 페이지 좌표 정규화 전/후 비교
- **도 4**: 진행선 양방향 미리보기 렌더링 (direction: 'up' / 'down')
- **도 5**: 서브패턴 독립 관리 구조 및 메모 키 체계
- **도 6**: 롱프레스 드래그 상태 머신 전이도
- **도 7**: 피벗 포인트 줌 알고리즘 시각적 설명
- **도 8**: 자동 저장 디바운스 타임라인
- **도 9**: 파일 업로드 파이프라인 시퀀스 다이어그램
- **도 10**: 인증 흐름도 (일반 / 인앱 브라우저 분기)

---

## 【발명자 정보】

| 항목 | 내용 |
|------|------|
| 발명의 명칭 | 뜨개질 도안 진행 관리를 위한 콘텐츠 좌표 기반 인터랙티브 패턴 뷰어 시스템 및 방법 |
| 서비스명 | 니팅인더사우나 (Knitting in the Sauna) |
| 서비스 URL | https://kis.marihoworld.com |
| 작성 기준일 | 2026년 3월 25일 |

---

*본 문서는 특허 출원 전 기술 공개 방지 및 선행 기술 문서화 목적으로 작성되었습니다. 실제 특허 출원 시 변리사 검토 및 도면 첨부가 필요합니다.*
