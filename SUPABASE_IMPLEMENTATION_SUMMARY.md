# Supabase 모드 구현 요약

## 완료된 작업

### 1. Supabase 클라이언트 통합
**파일:** `src/utils/supabase.ts`

- Supabase JavaScript 클라이언트 초기화
- 환경변수에서 URL과 Anon Key 로드 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- 사용자 인증 확인 함수:
  - `getCurrentUserId()`: 현재 로그인한 사용자의 UUID 반환
  - `isAdmin()`: `auth.jwt().app_metadata.role`에서 'admin' 확인

### 2. 업무 로직 (OperationManager) Supabase 지원
**파일:** `src/utils/operations.ts`

모드 파라미터 추가로 로컬/Supabase 선택 가능:
```typescript
const om = new OperationManager(db, mode); // 'local' | 'supabase'
```

#### 고객 신청 (submit_request RPC)
```typescript
om.submitRequest(customerId, slotIds, operationId)
```
- 1~3개 슬롯 선택 검증
- 중복 신청 방지 (고객당 1개만)
- Supabase: RPC `submit_request` 호출
- 로컬: 메모리에 저장

#### 어드민 확정 (confirm_request RPC)
```typescript
om.confirmRequest(requestId, slotId, adminId, operationId)
```
- 선택한 슬롯이 원래 희망에 포함되는지 검증
- 슬롯 마감 처리
- 영향받은 다른 요청 자동으로 재선택 필요 표시
- Supabase: RPC `confirm_request` 호출

#### 고객 재선택 (resubmit_request RPC)
```typescript
om.resubmitRequest(customerId, requestId, newSlotIds, operationId)
```
- 재선택 필요 상태에서만 가능
- 요청 버전 자동 증가
- Supabase: RPC `resubmit_request` 호출

#### 데이터 조회 (비동기)
```typescript
om.getCustomerStatusSupabase(customerId)  // 고객의 모든 신청 조회
om.getAdminRequestsSupabase()             // 전체 요청 목록 조회
```

### 3. UI 컴포넌트 업데이트

#### App.tsx - 모드 선택 인터페이스
- 로컬/Supabase 모드 전환 버튼
- Supabase 모드에서 관리자 권한 자동 확인
- 권한 확인 중 로딩 상태 표시
- 오류 메시지 표시 (자동 전환 금지)

#### CustomerPage.tsx - 고객 화면
- Supabase 모드: `getCurrentUserId()`로 사용자 ID 자동 로드
- 데이터 소스 자동 선택 (localStorage vs Supabase)
- 슬롯 테이블, 신청 현황, 재선택 화면 동일하게 동작

#### AdminPage.tsx - 어드민 화면
- Supabase 모드: 현재 사용자 ID가 어드민 ID로 설정됨
- 신청 목록, 요청 상세, 실행 기록 모두 Supabase에서 조회
- 로컬 모드와 동일한 UI로 동작

### 4. 에러 처리
- **연결 오류**: "Supabase 연결 오류: [상세]" 표시
- **인증 오류**: "Supabase 인증 필요: 로그인해주세요" 표시
- **저장 오류**: 작업 실패 메시지 표시, 로컬 모드로 자동 전환 금지
- **권한 오류**: RPC가 "Not authorized" 반환 시 표시

### 5. 테스트
- ✅ 로컬 모드: 15개 테스트 모두 통과
- ✅ 빌드: TypeScript + Vite 빌드 성공
- ⏳ Supabase 모드: 사용자가 테스트 사용자 생성 후 테스트

## 로컬 모드 유지
- 환경변수 누락 시 자동으로 로컬 모드 실행
- 역할 전환 버튼은 로컬 모드에만 표시
- localStorage에 모든 데이터 저장 (기존과 동일)

## Supabase 설정 (사용자 책임)

### 필수 단계
1. Supabase 프로젝트 생성 (https://supabase.com)
2. `.env.local`에 URL과 Anon Key 입력
3. SQL Editor에서 `sql/00_supabase.sql` 전체 실행
4. Auth에서 테스트 사용자 생성:
   - 고객 2명: 일반 사용자
   - 어드민 1명: `app_metadata.role` = 'admin'

### 검증 쿼리
```sql
-- 슬롯 확인
select count(*) as slots from public.slots where date >= '2026-09-09';

-- 예상: 42

-- RPC 확인
select proname from pg_proc where proname in ('submit_request', 'confirm_request', 'resubmit_request');
```

## 기본 시나리오 (테스트 절차)

1. **고객 C01**: 2026-09-09 오전, 오후 신청
   - 상태: 접수됨
   - 두 슬롯 모두: 가능

2. **고객 C02**: 2026-09-09 오전 신청
   - 상태: 접수됨
   - 슬롯: 가능

3. **어드민**: C01의 2026-09-09 오전 확정
   - C01: 확정됨
   - C02: 재선택 필요 (모든 희망 소진)
   - 슬롯 상태: 마감

4. **고객 C02**: 2026-09-10 오전 재선택
   - 상태: 접수됨 (v2)
   - 새 버전이지만 같은 요청 ID 유지

5. **어드민**: C02의 2026-09-10 오전 확정
   - C02: 확정됨
   - 슬롯: 마감

## 파일 변경사항

### 새로 추가
- `src/utils/supabase.ts`: Supabase 클라이언트 초기화
- `SUPABASE_TEST_GUIDE.md`: 테스트 가이드
- `SUPABASE_IMPLEMENTATION_SUMMARY.md`: 이 문서

### 수정됨
- `src/pages/App.tsx`: 모드 선택 UI, Supabase 초기화
- `src/components/CustomerPage.tsx`: Supabase 모드 지원
- `src/components/AdminPage.tsx`: Supabase 모드 지원
- `src/utils/operations.ts`: RPC 호출, 비동기 데이터 조회
- `tests/operations.test.ts`: 테스트 기대값 수정 (1개)

### 변경 없음
- SQL 스크립트 (`sql/00_supabase.sql`)
- 판정 함수 (`src/utils/decide.ts`)
- 슬롯 데이터 (`src/fixtures/slots.json`)
- 고정 슬롯 및 RPC 논리

## 다음 단계 (사용자)

1. Supabase 프로젝트 생성 및 SQL 실행
2. 테스트 사용자 생성 (관리자 1명, 고객 2명)
3. `.env.local` 업데이트
4. `npm run dev` 실행
5. http://localhost:5187에서 "Supabase" 모드 선택
6. SUPABASE_TEST_GUIDE.md의 시나리오 실행

## 구현 원칙

✅ **AGENTS.md 준수**
- 고정 슬롯과 판정 함수 재생성 금지
- 기존 로컬 모드 유지
- 명시적 Supabase 모드 추가

✅ **PRD.md 준수**
- 고객은 Supabase Auth 사용
- 관리자는 `app_metadata.role='admin'` 확인
- DB 직접 쓰기 금지 (RPC만 사용)

✅ **보안**
- 서버에서만 `app_metadata` 확인 (클라이언트는 신뢰 안 함)
- 브라우저에는 Anon Key만 사용
- service_role 키와 DB 비밀번호는 .env에 미포함

✅ **오류 처리**
- 실패 시 로컬 모드로 자동 전환 금지
- 모든 오류를 화면에 표시
- operationId로 중복 요청 방지
