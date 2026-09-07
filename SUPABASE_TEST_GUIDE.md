# Supabase 모드 테스트 가이드

## 전제 조건

1. **Supabase 프로젝트 생성**
   - https://supabase.com에서 새 프로젝트 생성
   - Project URL과 Anon Key를 .env.local에 입력

2. **SQL 스크립트 실행**
   - Supabase SQL Editor에서 `sql/00_supabase.sql` 전체 실행
   - 42개 슬롯, 3개 RPC 함수, RLS 권한 설정됨

3. **테스트 사용자 생성**
   - 고객 1: 일반 사용자 (app_metadata.role 없음)
   - 고객 2: 일반 사용자
   - 어드민: app_metadata.role = 'admin'으로 설정

## 테스트 시나리오

### 1단계: 슬롯 상태 확인
- 앱에서 "Supabase" 모드 선택
- 슬롯 표가 42개 행 × 3열로 표시되는지 확인
- 모든 슬롯이 "가능" 상태

### 2단계: 고객 1 신청
- 고객 1로 로그인
- 2026-09-09 오전, 오후 선택
- 제출
- 상태: "접수됨"

### 3단계: 고객 2 신청
- 고객 2로 로그인
- 2026-09-09 오전만 선택
- 제출
- 상태: "접수됨"

### 4단계: 어드민 확정 1
- 어드민 계정으로 로그인 (또는 "어드민" 역할 선택)
- 신청 목록에서 고객 1 선택
- "2026-09-09 오전" 선택
- 확정 버튼 클릭
- 결과: 슬롯 마감, 고객 2 상태는 "재선택 필요"

### 5단계: 고객 2 재선택
- 고객 2 계정으로 다시 로그인
- "재선택하기" 버튼 클릭
- 2026-09-10 오전 선택
- 제출
- 상태: "접수됨" (새 버전)

### 6단계: 어드민 확정 2
- 어드민으로 신청 목록 새로고침
- 고객 2 선택 (v2)
- "2026-09-10 오전" 선택
- 확정 버튼 클릭
- 결과: 확정 완료

## 예상 결과

| 단계 | 고객 1 | 고객 2 | 2026-09-09:am | 2026-09-10:am |
|------|---------|---------|---|---|
| 2단계 후 | 접수 v1 | - | 가능 | 가능 |
| 3단계 후 | 접수 v1 | 접수 v1 | 가능 | 가능 |
| 4단계 후 | 확정 | 재선택 필요 | 마감 | 가능 |
| 5단계 후 | 확정 | 접수 v2 | 마감 | 가능 |
| 6단계 후 | 확정 | 확정 | 마감 | 마감 |

## Supabase 검증 쿼리

SQL Editor에서 실행:

```sql
-- 슬롯 확인
select count(*) as total_slots, 
       sum(case when status = 'confirmed' then 1 else 0 end) as confirmed_slots
from slots;

-- 요청 확인
select customer_id, status, version from requests order by created_at;

-- 후보 확인
select r.customer_id, r.status, c.slot_id, c.priority, c.version
from requests r
left join candidates c on r.id = c.request_id
order by r.created_at, c.priority;

-- 확정 기록 확인
select * from confirmations;

-- 실행 로그 확인 (최근 20건)
select * from operation_logs order by created_at desc limit 20;
```

## 오류 처리 테스트

1. **연결 오류**: Supabase URL이 잘못된 경우
   - 화면에 오류 메시지 표시
   - 로컬 모드로 자동 전환 없음

2. **인증 오류**: 사용자가 로그인되지 않은 경우
   - 화면에 "Supabase 인증 필요: 로그인해주세요" 메시지

3. **권한 오류**: 고객이 어드민 기능 호출
   - "Not authorized" 에러 표시

4. **중복 확정**: 같은 슬롯을 두 번 확정
   - "Slot already confirmed" 에러

5. **중복 작업**: 같은 operationId로 재제출
   - 캐시된 결과 반환 (중복 확정 없음)

## 현재 구현 상태

✅ Supabase 클라이언트 초기화  
✅ 모드 선택 UI (로컬/Supabase)  
✅ RPC 호출 (submit_request, confirm_request, resubmit_request)  
✅ 관리자 권한 확인 (app_metadata.role)  
✅ 에러 화면 표시 (자동 전환 금지)  
✅ 로컬 모드 유지  
⏳ Supabase DB 설정 및 테스트 사용자 생성 (사용자 책임)

