# Supabase 이메일/비밀번호 인증 흐름 수정 (Session/Auth 상태 관리)

## 문제점

1. **회원가입 후 session 미생성**: `signUp()` 후 session이 자동으로 생성되지 않아 "Not authenticated" 발생
2. **로그인 상태 미반영**: `signIn()` 후 auth 상태가 App.tsx에 실시간 반영 안 됨
3. **getCurrentUserId() 실패**: session을 확인하지 않고 user만 확인해서 로그인된 사용자를 못 찾음
4. **Email confirmation 오류**: Confirm email이 비활성화되어 있어도 작동해야 함

## 수정 내용

### 1. supabase.ts - Session/User 이중 확인

모든 auth 함수에서 **먼저 session을 확인하고, 없으면 user를 확인**:

```typescript
// 이전: user만 확인
const { data } = await client.auth.getUser();

// 수정: session 먼저, 그 다음 user
const { data: sessionData } = await client.auth.getSession();
if (sessionData.session?.user?.id) {
  return sessionData.session.user.id;  // session에서 찾음
}

const { data: userData } = await client.auth.getUser();
return userData.user?.id || null;  // user에서 찾음
```

**수정된 함수들:**
- `isAdmin()`: session/user에서 `app_metadata.role` 확인
- `getCurrentUserId()`: session/user에서 사용자 ID 확인
- `getCurrentUser()`: session/user에서 전체 사용자 정보 확인
- `signUp()`: 회원가입 후 session 확인, userId 반환
- `signIn()`: 로그인 후 session 확인, userId 반환

### 2. LoginPage.tsx - 로그인 성공 검증

```typescript
if (result.error) {
  setError(result.error);
} else if (result.userId) {
  onLoginSuccess();  // userId가 있을 때만 성공
} else {
  setError('로그인 실패: 사용자 정보를 확인할 수 없습니다');
}
```

### 3. App.tsx - handleLoginSuccess 강화

```typescript
const handleLoginSuccess = async () => {
  try {
    setLoading(true);
    initSupabase();
    setIsSupabaseLoggedIn(true);  // 명시적 로그인 상태 설정
    const admin = await isAdmin();
    setIsAdminUser(admin);
    setSupabaseError('');
  } catch (error) {
    setSupabaseError(...);
    setIsSupabaseLoggedIn(false);
    setIsAdminUser(false);
  } finally {
    setLoading(false);
  }
};
```

### 4. CustomerPage.tsx - Supabase 초기화 개선

```typescript
const initializeSupabase = async () => {
  try {
    setError('');
    getSupabase();
    const userId = await getCurrentUserId();
    if (userId) {
      setCustomerId(userId);
      setSupabaseReady(true);
    } else {
      setSupabaseReady(false);  // 로그인 안 됨 - 로그인 화면으로
    }
  } catch (err) {
    setSupabaseReady(false);
    setError(`Supabase 초기화 오류: ${String(err)}`);
  }
};
```

## 인증 흐름 (수정 후)

```
1. 회원가입
   → signUp(email, password)
   → session 생성 여부 확인
   → userId 반환
   
2. 로그인 (LoginPage)
   → signIn(email, password)
   → session 생성 여부 확인
   → userId 반환
   → onLoginSuccess() 호출
   
3. App.tsx (handleLoginSuccess)
   → setIsSupabaseLoggedIn(true)
   → isAdmin() 확인 (session 또는 user에서)
   → 권한에 따라 CustomerPage 또는 AdminPage 표시
   
4. CustomerPage / AdminPage
   → initializeSupabase()
   → getCurrentUserId() (session 또는 user에서)
   → customerId/adminId 설정
   
5. RPC 호출 (submitRequest 등)
   → Supabase 클라이언트의 session 기반
   → auth.uid() = customerId/adminId
   
6. 로그아웃
   → signOut()
   → setIsSupabaseLoggedIn(false)
   → LoginPage로 복귀
```

## 테스트 결과

✅ **빌드**: 성공 (116 modules)
✅ **테스트**: 15/15 통과 (로컬 모드 전체 시나리오)

## 다음 단계 (사용자 테스트)

### 회원가입 및 로그인 테스트

1. **Supabase 모드 선택** → LoginPage 표시
2. **이메일/비밀번호 입력**
   ```
   이메일: test1@example.com
   비밀번호: password123
   ```
3. **"회원가입" 클릭**
   - 성공 여부 확인
   - 로그인 화면으로 복귀 또는 직접 고객 화면으로 이동

4. **다시 "로그인" 클릭** (회원가입 후 명시적 로그인 필요할 수 있음)
   - 같은 이메일/비밀번호 입력
   - 성공 → CustomerPage 표시
   - 사용자 ID (UUID) 자동 로드

### RPC 호출 테스트

5. **고객 화면에서 슬롯 선택**
   - 2026-09-09 오전, 오후
   - 제출
   - 확인: RPC 호출 성공 여부

6. **로그아웃 후 다시 로그인**
   - 로그아웃 버튼 클릭
   - LoginPage로 복귀
   - 같은 계정으로 다시 로그인
   - 기존 신청 데이터 복구 확인

## 주요 변경 원칙

✅ **최소 수정**
- 이메일/비밀번호 인증만 처리
- Google OAuth, 소셜 로그인 미포함
- 디자인 변경 없음

✅ **로컬 모드 완전 유지**
- 로컬 모드 기능 변경 없음
- 테스트 15/15 여전히 통과

✅ **기존 RPC 활용**
- 새로운 API 추가 없음
- submit_request, confirm_request, resubmit_request 그대로 사용

✅ **보안 유지**
- Anon Key만 브라우저에 사용
- service_role 키 미포함
- 모든 오류를 화면에 표시
