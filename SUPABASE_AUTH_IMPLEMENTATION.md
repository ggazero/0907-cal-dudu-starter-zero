# Supabase 인증 구현 (로그인/로그아웃)

## 추가된 기능

### 1. 로그인 페이지 (LoginPage.tsx)

Supabase 모드에서 이메일/비밀번호로 로그인할 수 있는 UI:

```
- 이메일 입력 필드
- 비밀번호 입력 필드
- 로그인 버튼
- 회원가입 토글 버튼
- 회원가입 안내 텍스트
```

**기능:**
- 회원가입: `signUp()` RPC 호출
- 로그인: `signIn()` RPC 호출
- 오류 화면 표시 (자동 전환 금지)
- 로그인 성공 후 메인 화면으로 자동 이동

### 2. 로그아웃 기능

Supabase 모드 헤더에 로그아웃 버튼 추가:
- 로그인 상태 메시지 옆에 "로그아웃" 버튼
- 클릭 시 `signOut()` 호출
- 로그아웃 후 로그인 화면으로 돌아감

### 3. Supabase 클라이언트 함수 추가 (supabase.ts)

```typescript
signUp(email, password)        // 회원가입
signIn(email, password)        // 로그인
signOut()                       // 로그아웃
getCurrentUser()               // 현재 로그인한 사용자 정보
```

### 4. App.tsx 인증 흐름

```
Supabase 모드 선택
    ↓
isSupabaseLoggedIn = false인지 확인
    ↓
false → LoginPage 표시
true  → CustomerPage 또는 AdminPage 표시 (권한에 따라)
    ↓
로그아웃 클릭
    ↓
로그인 페이지로 돌아감
```

### 5. 사용자 ID 자동 로드

**CustomerPage (고객 화면):**
- Supabase 모드: `getCurrentUserId()` 자동 호출
- 사용자 ID를 customerId로 설정
- 고객 코드 입력 필드는 비활성화 (표시만)

**AdminPage (관리자 화면):**
- Supabase 모드: `getCurrentUserId()` 자동 호출
- 사용자 ID를 adminId로 설정

### 6. 권한 기반 화면 분기

```
로그인 후
    ↓
app_metadata.role === 'admin'?
    ↓
yes → AdminPage 표시
no  → CustomerPage 표시
```

### 7. 로컬 모드 변경사항

- **로컬 모드는 완전히 유지** (변경 없음)
- 고객 코드 입력은 로컬 모드에만 표시
- 역할 전환 (고객/어드민)은 로컬 모드에만 표시

## 테스트 절차

### 로컬 모드 (기존)
1. "로컬" 모드 선택
2. 역할 선택 (고객/어드민)
3. 고객 코드 입력 (C01, C02 등)
4. 신청, 확정, 재선택 기본 시나리오 실행

### Supabase 모드 (신규)
1. "Supabase" 모드 선택
2. 로그인 페이지 표시됨
3. 이메일/비밀번호로 회원가입
4. 회원가입 후 로그인
5. 고객 신청 화면 표시
6. (관리자라면) 자동으로 관리자 화면으로 이동

## 구현 원칙 준수

✅ **AGENTS.md**
- 고정 슬롯과 판정 함수 재생성 금지 (유지)
- 기존 로컬 모드 유지 (변경 없음)

✅ **PRD.md**
- 고객은 로그인한 자기 신청만 읽고 제출 (auth.uid() 사용)
- 어드민만 전체 요청을 보고 확정 (app_metadata.role 확인)
- 브라우저에는 Anon Key만 사용 (service_role 키 미포함)

✅ **보안**
- DB 직접 쓰기 금지 (RPC만 사용)
- 실패 시 로컬 모드로 자동 전환 금지
- 모든 오류를 화면에 표시

## 파일 변경사항

### 새로 추가
- `src/components/LoginPage.tsx` - 로그인/회원가입 UI
- `SUPABASE_AUTH_IMPLEMENTATION.md` - 이 문서

### 수정됨
- `src/utils/supabase.ts` - signUp, signIn, signOut, getCurrentUser 함수 추가
- `src/pages/App.tsx` - LoginPage 통합, 로그아웃 버튼, 로그인 상태 관리
- `src/components/CustomerPage.tsx` - 모드별 고객 코드 입력 처리
- `src/components/AdminPage.tsx` - 초기화 오류 처리 개선

### 변경 없음
- `src/utils/operations.ts` (RPC 호출)
- `src/utils/decide.ts` (판정 함수)
- `tests/operations.test.ts` (로컬 모드 테스트)

## 사용자 생성 (Supabase 대시보드)

### 고객 계정 생성
1. Supabase 대시보드 → Authentication → Users
2. "Add user" → Email and Password
3. 이메일: customer@example.com
4. 비밀번호: 설정
5. User metadata 또는 App metadata: 설정 안 함 (기본값)

### 관리자 계정 생성
1. 위와 동일하게 계정 생성
2. 해당 사용자 클릭
3. "User metadata" 탭
4. 다음 JSON 추가:
   ```json
   {
     "role": "admin"
   }
   ```
5. Save

또는 SQL Editor에서:
```sql
UPDATE auth.users 
SET app_metadata = jsonb_set(app_metadata, '{role}', '"admin"') 
WHERE email = 'admin@example.com';
```

## 검증 쿼리

```sql
-- 사용자 확인
SELECT id, email, raw_app_metadata FROM auth.users;

-- 고객 신청 확인
SELECT r.customer_id, r.status, count(*) as slots_selected
FROM requests r
LEFT JOIN candidates c ON r.id = c.request_id
GROUP BY r.customer_id, r.status;

-- 실행 로그 확인
SELECT timestamp, action, status, error_message 
FROM operation_logs 
ORDER BY created_at DESC LIMIT 10;
```

## 다음 단계 (사용자)

1. Supabase 대시보드에서 고객 2명, 관리자 1명 생성
2. 앱에서 "Supabase" 모드 선택
3. 고객 계정으로 로그인 → 고객 신청 화면
4. 다른 고객 계정으로 로그인 → 고객 신청 화면
5. 관리자 계정으로 로그인 → 관리자 화면 자동 이동
6. SUPABASE_TEST_GUIDE.md의 6단계 시나리오 실행
