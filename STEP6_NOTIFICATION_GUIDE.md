# Step 6 알림 기능 구현 가이드

## 현재 상태

### ✅ 구현된 기능
1. **상태 변경 시 화면 알림**
   - 확정됨: 초록색 테두리 + "✅ 예약이 확정되었습니다" 알림
   - 재선택 필요: 빨간색 테두리 + "⚠️ 신청한 모든 일정이 마감되었습니다" 알림
   - 위치: CustomerPage.tsx - "내 신청 현황" 섹션

2. **상태 표시 개선**
   - 확정됨: "✅ 확정됨"
   - 접수됨: "⏳ 접수됨 (검토 중)"
   - 재선택 필요: "⚠️ 재선택 필요"

### ⏳ 이메일 발송 (구현 준비 단계)

**현재:** Supabase에는 Auth 기능만 있고, 이메일 발송 서비스가 연결되어 있지 않습니다.

**필요한 작업:**

#### 1단계: 이메일 서비스 선택 및 API Key 획득
- **옵션 A: Resend (추천)**
  - Supabase와 통합 용이
  - 가입: https://resend.com
  - API Key 획득

- **옵션 B: SendGrid**
  - 가입: https://sendgrid.com
  - API Key 획득

- **옵션 C: AWS SES**
  - AWS 계정에서 설정
  - SMTP 자격증명 또는 API Key

#### 2단계: 환경변수 설정
```env
# Resend 사용 시
VITE_RESEND_API_KEY=re_xxxxx

# 또는 SendGrid 사용 시
VITE_SENDGRID_API_KEY=SG.xxxxx
```

#### 3단계: 이메일 발송 함수 작성
파일: `src/utils/notifications.ts` (새로 생성)

```typescript
export async function sendConfirmationEmail(
  email: string,
  slotInfo: { date: string; time: string }
): Promise<void> {
  // Resend 예시
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'noreply@cal.dudu-works.com',
      to: email,
      subject: '📋 cal.dudu 예약이 확정되었습니다',
      html: `
        <h2>예약 확정 안내</h2>
        <p>${slotInfo.date} ${slotInfo.time}에 예약이 확정되었습니다.</p>
        <p><a href="http://localhost:5187">앱에서 확인하기</a></p>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email send failed: ${response.statusText}`);
  }
}

export async function sendReselectionNeededEmail(
  email: string
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'noreply@cal.dudu-works.com',
      to: email,
      subject: '📋 cal.dudu 신청 일정을 다시 선택해주세요',
      html: `
        <h2>재선택 필요 안내</h2>
        <p>신청하신 모든 일정이 마감되었습니다.</p>
        <p>다른 일정을 선택해주세요.</p>
        <p><a href="http://localhost:5187">앱에서 재선택하기</a></p>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email send failed: ${response.statusText}`);
  }
}
```

#### 4단계: RPC 함수에 이메일 발송 연결

파일: `sql/01_install.sql` (새 마이그레이션)

```sql
-- 확정 시 이메일 발송을 위한 Edge Function 호출
-- (프로덕션 환경에서 사용)
CREATE OR REPLACE FUNCTION notify_confirmation_email()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.notification_webhook_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'type', 'confirmation',
      'customer_id', NEW.confirmed_by,
      'slot_id', NEW.id
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_confirmation
AFTER UPDATE ON slots
FOR EACH ROW
WHEN (NEW.status = 'confirmed' AND OLD.status = 'available')
EXECUTE FUNCTION notify_confirmation_email();
```

#### 5단계: 고객 이메일 조회
고객의 이메일을 얻기 위해 Supabase Auth에서:

```typescript
import { getCurrentUser } from './supabase';

const user = await getCurrentUser();
const customerEmail = user?.email;
```

#### 6단계: 상태 변경 시점에서 이메일 발송 호출

파일: `src/utils/operations.ts`

```typescript
// confirmRequest 성공 시
if (result.success) {
  try {
    const user = await getCurrentUser();
    if (user?.email) {
      await sendConfirmationEmail(user.email, {
        date: slot.date,
        time: slotTimeLabel,
      });
    }
  } catch (err) {
    console.error('Failed to send email:', err);
    // 이메일 발송 실패는 예약 확정을 실패로 만들지 않음
  }
}

// needsReselection 상태 변경 시
if (statusChanged === 'needs_reselection') {
  try {
    const user = await getCurrentUser();
    if (user?.email) {
      await sendReselectionNeededEmail(user.email);
    }
  } catch (err) {
    console.error('Failed to send email:', err);
  }
}
```

## 이메일 콘텐츠 예시

### 확정 알림
```
제목: 📋 cal.dudu 예약이 확정되었습니다

본문:
예약 확정 안내

2026-09-09 오전에 예약이 확정되었습니다.

[앱에서 확인하기] 링크

추가 문의는 cal.dudu-works.com을 방문해주세요.
```

### 재선택 필요 알림
```
제목: 📋 cal.dudu 신청 일정을 다시 선택해주세요

본문:
재선택 필요 안내

신청하신 모든 일정이 마감되었습니다.
다른 일정을 선택해주세요.

[앱에서 재선택하기] 링크

추가 문의는 cal.dudu-works.com을 방문해주세요.
```

## 주의사항

1. **이메일 발송 실패가 예약 확정을 막지 않아야 함**
   - 네트워크 오류가 예약을 실패로 만들면 안 됨
   - 이메일 발송은 best-effort

2. **Rate Limiting 고려**
   - 대량 발송 시 이메일 서비스의 레이트 제한 확인
   - 재시도 로직 구현

3. **GDPR/개인정보보호**
   - 고객의 이메일은 본인 인증 후에만 사용
   - 이메일 구독 해제 옵션 제공 고려

4. **기존 규칙 유지**
   - 자동 확정 기능 없음
   - 관리자 최종 확정 방식 유지
   - 재신청 데이터 삭제 금지

## 테스트 단계

1. 로컬 개발에서 환경변수 없이 작동 확인
2. Resend API Key 설정 후 테스트
3. 실제 메일 수신 확인
4. 프로덕션 배포 시 웹훅/Edge Function으로 업그레이드
