import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { DatabaseManager } from '../src/utils/database';
import { OperationManager } from '../src/utils/operations';
import { getSupabase } from '../src/utils/supabase';

vi.mock('../src/utils/supabase', () => ({ getSupabase: vi.fn() }));

// 실제 DB 검증과 별개로, PostgREST 응답별 잘못된 성공 처리를 회귀 검사합니다.
describe('Supabase 재선택 저장 결과 검증', () => {
  const requestId = '00000000-0000-4000-8000-000000000001';
  let fetchMock: ReturnType<typeof vi.fn>;
  let om: OperationManager;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.mocked(getSupabase).mockReturnValue(createClient('https://example.supabase.co', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchMock },
    }));
    om = new OperationManager(new DatabaseManager(), 'supabase');
  });

  function respond(body: unknown, status = 200) {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  it('대상 행의 needs_reselection 반환 후에만 성공한다', async () => {
    respond({ id: requestId, status: 'needs_reselection' });
    expect(await om.requestReselection(requestId, 'admin', 'op-1')).toEqual({ success: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get('select')).toBe('id,status');
    expect(new URL(url).searchParams.get('id')).toBe(`eq.${requestId}`);
    expect(options.method).toBe('PATCH');
  });

  it.each([
    ['0건 변경', 'PGRST116', 'Cannot coerce the result to a single JSON object', 406],
    ['권한 거부', '42501', 'permission denied for table requests', 403],
    ['제약조건 위반', '23514', 'violates check constraint requests_status_check', 400],
    ['컬럼 불일치', '42703', 'column status does not exist', 400],
  ])('%s 응답을 성공으로 숨기지 않는다', async (_, code, message, status) => {
    respond({ code, message, details: 'response detail', hint: 'response hint' }, status);
    const result = await om.requestReselection(requestId, 'admin', 'op-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain(code);
    expect(result.error).toContain(message);
    expect(result.error).toContain('response detail');
    expect(result.error).toContain('response hint');
  });

  it.each([
    null,
    { id: requestId, status: 'received' },
    { id: 'different-request', status: 'needs_reselection' },
  ])('HTTP 성공이어도 반환 행이 잘못되면 실패한다: %j', async (row) => {
    respond(row);
    const result = await om.requestReselection(requestId, 'admin', 'op-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('저장 검증 실패');
  });
});
